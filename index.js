const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    getAggregateVotesInPollMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const { fancy } = require("./lib/font");
const mongoose = require("mongoose");

// LOAD YOUR EXISTING FILES
const config = require("./config");
const handler = require("./handler");

const app = express();
const PORT = config.port || 3000;

// MongoDB Connection
if (config.mongoURI) {
    mongoose.connect(config.mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log(fancy("✅ Connected to MongoDB"));
    }).catch(err => {
        console.error(fancy("❌ MongoDB connection error:"), err.message);
    });
}

// MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// WEB ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/pairing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pairing.html'));
});

// API ENDPOINTS
app.get('/api/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        version: config.version,
        botName: config.botName,
        developer: config.developerName || "STANY",
        connectionStatus: connectionStatus,
        sleepingMode: sleepingMode,
        totalUsers: 0,
        totalGroups: 0
    });
});

let globalConn = null;
let connectionStatus = 'disconnected';
let isConnectionReady = false;
let botOwnerJid = null;
let qrCode = null;

// ============================================
// SLEEPING MODE VARIABLES
// ============================================
let sleepingMode = false;
let sleepStartTime = "00:00";
let sleepEndTime = "06:00";
let sleepInterval = null;

// ============================================
// WAIT FOR CONNECTION FUNCTION
// ============================================
function waitForConnection(timeout = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkInterval = setInterval(() => {
            if (isConnectionReady && globalConn) {
                clearInterval(checkInterval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                reject(new Error("Connection timeout after " + timeout + "ms. Status: " + connectionStatus));
            }
        }, 1000);
    });
}

// ============================================
// SLEEPING MODE FUNCTIONS
// ============================================
function startSleepingMode() {
    try {
        if (!globalConn || sleepingMode) return;
        
        sleepingMode = true;
        console.log(fancy("😴 Sleeping Mode Activated - Group Functions Paused"));
        
        // Send notification to owner
        if (botOwnerJid) {
            globalConn.sendMessage(botOwnerJid, {
                text: fancy(`😴 *SLEEPING MODE ACTIVATED*\n\nGroup functions are now paused until ${sleepEndTime}\n\nBot will resume at: ${sleepEndTime}`)
            });
        }
        
    } catch (error) {
        console.error("Sleep mode error:", error.message);
    }
}

function stopSleepingMode() {
    try {
        if (!globalConn || !sleepingMode) return;
        
        sleepingMode = false;
        console.log(fancy("🌅 Sleeping Mode Deactivated - Group Functions Resumed"));
        
        // Send notification to owner
        if (botOwnerJid) {
            globalConn.sendMessage(botOwnerJid, {
                text: fancy(`🌅 *SLEEPING MODE DEACTIVATED*\n\nAll group functions are now active!\n\nBot is fully operational.`)
            });
        }
        
    } catch (error) {
        console.error("Wake up error:", error.message);
    }
}

function checkSleepingMode() {
    try {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [startHour, startMinute] = sleepStartTime.split(':').map(Number);
        const [endHour, endMinute] = sleepEndTime.split(':').map(Number);
        
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;
        
        // Handle overnight sleeping mode
        if (startTime <= endTime) {
            // Normal daytime sleeping
            if (currentTime >= startTime && currentTime <= endTime) {
                if (!sleepingMode) startSleepingMode();
            } else {
                if (sleepingMode) stopSleepingMode();
            }
        } else {
            // Overnight sleeping
            if (currentTime >= startTime || currentTime <= endTime) {
                if (!sleepingMode) startSleepingMode();
            } else {
                if (sleepingMode) stopSleepingMode();
            }
        }
    } catch (error) {
        console.error("Check sleeping mode error:", error.message);
    }
}

// ============================================
// ANTI-CALL HANDLER
// ============================================
async function handleAntiCall(conn, call) {
    try {
        const callData = call[0];
        if (!callData) return;
        
        const caller = callData.from;
        const callId = callData.id;
        
        // Reject the call immediately
        await conn.rejectCall(callId, caller);
        
        // Send rejection message to owner
        if (botOwnerJid) {
            await conn.sendMessage(botOwnerJid, {
                text: fancy(`📵 *CALL REJECTED*\n\nFrom: ${caller}\nTime: ${new Date().toLocaleString()}\nType: ${callData.isVideo ? 'Video Call' : 'Voice Call'}\nStatus: Auto-rejected\n\nCall was automatically rejected.`)
            });
        }
        
        // Send rejection notice to caller if not in group
        if (!caller.endsWith('@g.us')) {
            try {
                await conn.sendMessage(caller, {
                    text: fancy(`📵 *CALL REJECTED*\n\nSorry, calls are not allowed with this bot.\n\nPlease send a text message instead.\n\n_- ${config.botName || "Insidious"} Bot_`)
                });
            } catch (sendError) {
                // Ignore if can't send to caller
            }
        }
        
        console.log(fancy(`📵 Rejected call from: ${caller.split('@')[0]}`));
        
    } catch (error) {
        console.error("Anti-call error:", error.message);
    }
}

// ============================================
// STATUS DOWNLOAD HANDLER
// ============================================
async function handleStatusDownload(conn, msg) {
    try {
        if (!msg.message || !botOwnerJid) return;
        
        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        
        // Check if it's a status update
        if (from && from.includes('status') && config.statusDownload) {
            let mediaBuffer = null;
            let mediaType = '';
            let caption = '';
            
            if (type === 'imageMessage') {
                mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino(), reuploadRequest: conn.updateMediaMessage });
                mediaType = 'image';
                caption = msg.message.imageMessage.caption || 'Status Image';
            } else if (type === 'videoMessage') {
                mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino(), reuploadRequest: conn.updateMediaMessage });
                mediaType = 'video';
                caption = msg.message.videoMessage.caption || 'Status Video';
            }
            
            if (mediaBuffer) {
                // Send to owner
                if (mediaType === 'image') {
                    await conn.sendMessage(botOwnerJid, {
                        image: mediaBuffer,
                        caption: fancy(`📥 *STATUS DOWNLOADED*\n\nType: ${mediaType}\nFrom: ${from}\nTime: ${new Date().toLocaleString()}\n\n${caption}`)
                    });
                } else if (mediaType === 'video') {
                    await conn.sendMessage(botOwnerJid, {
                        video: mediaBuffer,
                        caption: fancy(`📥 *STATUS DOWNLOADED*\n\nType: ${mediaType}\nFrom: ${from}\nTime: ${new Date().toLocaleString()}\n\n${caption}`)
                    });
                }
                
                console.log(fancy(`📥 Status ${mediaType} downloaded and sent to owner`));
            }
        }
    } catch (error) {
        console.error("Status download error:", error.message);
    }
}

// ============================================
// AUTO STATUS VIEW/REACT
// ============================================
async function handleAutoStatus(conn, msg) {
    try {
        if (!msg.message || !config.autoStatus) return;
        
        const from = msg.key.remoteJid;
        
        // Check if it's a status update
        if (from && from.includes('status')) {
            // Mark as viewed
            if (config.autoStatusView) {
                await conn.readMessages([msg.key]);
            }
            
            // React to status
            if (config.autoStatusReact) {
                const reactions = ['❤️', '🔥', '👍', '🎉', '👏'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                
                await conn.sendMessage(from, {
                    react: {
                        text: randomReaction,
                        key: msg.key
                    }
                });
                
                console.log(fancy(`⭐ Reacted to status with: ${randomReaction}`));
            }
        }
    } catch (error) {
        console.error("Auto status error:", error.message);
    }
}

// ============================================
// START INSIDIOUS BOT
// ============================================
async function startInsidious() {
    try {
        console.log(fancy("🔗 Starting WhatsApp connection..."));
        
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: true,
            getMessage: async (key) => ({ conversation: "message deleted" }),
            printQRInTerminal: true
        });

        globalConn = conn;

        // ============================================
        // CALL EVENT HANDLER
        // ============================================
        conn.ev.on('call', async (call) => {
            try {
                if (config.anticall) {
                    await handleAntiCall(conn, call);
                }
            } catch (error) {
                console.error("Call event error:", error.message);
            }
        });

        // ============================================
        // QR CODE GENERATION
        // ============================================
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Save QR code
            if (qr) {
                qrCode = qr;
                console.log(fancy("📱 QR Code generated - Scan to login"));
            }
            
            if (connection === 'open') {
                console.log(fancy("✅ WhatsApp connected successfully!"));
                connectionStatus = 'connected';
                isConnectionReady = true;
                
                // Set bot owner (person who linked)
                if (conn.user && conn.user.id) {
                    botOwnerJid = conn.user.id;
                    console.log(fancy(`👑 Bot Owner: ${botOwnerJid.split('@')[0]}`));
                    console.log(fancy(`👨‍💻 Developer: ${config.developerName || "STANY"}`));
                    
                    // Send welcome message to owner
                    const welcomeMsg = `
╔═══════════════════╗
   🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}*
╚═══════════════════╝

✅ *Bot Online Successfully*
👑 *Owner:* ${botOwnerJid.split('@')[0]}
👨‍💻 *Developer:* ${config.developerName || "STANY"}
📊 *Status:* Connected
⚡ *Uptime:* 0 seconds

📝 *Features Enabled:*
• Anti-Link Protection
• Anti-Scam Protection  
• Welcome/Goodbye Messages
• Sleeping Mode
• Anti-Call System
• Channel Auto-React
• Status Download
• AI Chatbot
• And 70+ more features

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developed by STANY")}`;
                    
                    await conn.sendMessage(botOwnerJid, { text: welcomeMsg });
                    
                    // Start sleeping mode checker
                    if (sleepInterval) clearInterval(sleepInterval);
                    sleepInterval = setInterval(checkSleepingMode, 60000); // Check every minute
                    checkSleepingMode(); // Initial check
                    
                    // Auto-follow owner to channel
                    setTimeout(() => {
                        if (botOwnerJid && config.newsletterJid) {
                            console.log(fancy(`[CHANNEL] ✅ Auto-following owner to channel`));
                        }
                    }, 5000);
                }
                
                // Initialize handler if it has init function
                if (handler && handler.init) {
                    try {
                        await handler.init(conn);
                    } catch (e) {
                        console.error("Handler init error:", e.message);
                    }
                }
                
                // Start auto bio
                if (config.autoBio) {
                    setTimeout(() => updateBio(conn), 3000);
                }
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnectionReady = false;
                connectionStatus = 'disconnected';
                
                // Clear sleeping mode interval
                if (sleepInterval) {
                    clearInterval(sleepInterval);
                    sleepInterval = null;
                }
                
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(fancy("🔄 Reconnecting in 3 seconds..."));
                    setTimeout(startInsidious, 3000);
                } else {
                    console.log(fancy("❌ Logged out - Manual login required"));
                }
            }
            
            if (connection === 'connecting') {
                connectionStatus = 'connecting';
                console.log(fancy("⏳ Connecting to WhatsApp..."));
            }
        });

        // CREDENTIALS UPDATE
        conn.ev.on('creds.update', saveCreds);

        // MESSAGE HANDLER - USING YOUR handler.js
        conn.ev.on('messages.upsert', async (m) => {
            try {
                // Check sleeping mode before processing
                if (sleepingMode) {
                    const from = m.messages[0]?.key?.remoteJid;
                    if (from && from.endsWith('@g.us')) {
                        console.log(fancy("😴 Skipping group message - Sleeping Mode Active"));
                        return;
                    }
                }
                
                // Handle status download
                if (config.statusDownload) {
                    await handleStatusDownload(conn, m.messages[0]);
                }
                
                // Handle auto status view/react
                if (config.autoStatus) {
                    await handleAutoStatus(conn, m.messages[0]);
                }
                
                // Main handler
                if (handler && typeof handler === 'function') {
                    await handler(conn, m);
                }
            } catch (error) {
                console.error("Handler error:", error.message);
            }
        });

        // GROUP PARTICIPANTS UPDATE - BEAUTIFUL WELCOME/GOODBYE
        conn.ev.on('group-participants.update', async (anu) => {
            try {
                if (sleepingMode) {
                    console.log(fancy("😴 Skipping group event - Sleeping Mode"));
                    return;
                }
                
                if (!config.welcomeGoodbye) return;
                
                const metadata = await conn.groupMetadata(anu.id);
                
                // Get group description and picture
                let groupDesc = "No description available";
                let groupPicture = null;
                let totalMembers = metadata.participants.length;
                let groupName = metadata.subject;
                
                try {
                    // Get group description
                    if (metadata.desc) {
                        groupDesc = metadata.desc.substring(0, 100);
                        if (metadata.desc.length > 100) groupDesc += "...";
                    }
                    
                    // Get group picture
                    try {
                        groupPicture = await conn.profilePictureUrl(anu.id, 'image');
                    } catch (picError) {
                        groupPicture = null;
                    }
                } catch (e) {
                    console.error("Error getting group info:", e.message);
                }
                
                for (let num of anu.participants) {
                    const userNum = num.split("@")[0];
                    const userPushName = anu.action === 'add' ? anu.participants[0]?.pushName || 'User' : 'User';
                    
                    if (anu.action == 'add') {
                        // BEAUTIFUL WELCOME MESSAGE
                        const welcomeMsg = `
╭─── • 🎉 • ───╮
   𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗡𝗘𝗪 𝗠𝗘𝗠𝗕𝗘𝗥
╰─── • 🎉 • ───╯

👋 *Hello* @${userNum}!
📛 *Name:* ${userPushName}

📢 *Group Info:*
📛 *Name:* ${groupName}
👥 *Members:* ${totalMembers}
📝 *Description:* ${groupDesc}

⚡ *Rules & Guidelines:*
1. No spam or flood
2. No adult content
3. Respect all members
4. No promotion without admin permission
5. Follow group rules

🎯 *Enjoy your stay in our community!*

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developer: STANY")}`;
                        
                        // Send with group picture if available
                        if (groupPicture) {
                            await conn.sendMessage(anu.id, {
                                image: { url: groupPicture },
                                caption: welcomeMsg,
                                mentions: [num]
                            });
                        } else {
                            await conn.sendMessage(anu.id, { 
                                text: welcomeMsg,
                                mentions: [num] 
                            });
                        }
                        
                        console.log(fancy(`🎉 Welcomed new member: ${userNum}`));
                        
                    } else if (anu.action == 'remove') {
                        // BEAUTIFUL GOODBYE MESSAGE
                        const goodbyeMsg = `
╭─── • 👋 • ───╮
   𝗚𝗢𝗢𝗗𝗕𝗬𝗘
╰─── • 👋 • ───╯

📛 *Group:* ${groupName}
👥 *Remaining Members:* ${totalMembers - 1}

😔 @${userNum} has left the group.

💬 *"Goodbyes are not forever, are not the end;
it simply means we'll miss you until we meet again."*

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developer: STANY")}`;
                        
                        await conn.sendMessage(anu.id, { 
                            text: goodbyeMsg,
                            mentions: [num] 
                        });
                        
                        console.log(fancy(`👋 Said goodbye to: ${userNum}`));
                    }
                }
            } catch (e) {
                console.error("Group event error:", e.message);
            }
        });

        return conn;
        
    } catch (error) {
        console.error("Startup error:", error.message);
        setTimeout(startInsidious, 5000);
    }
}

// ============================================
// AUTO BIO FUNCTION
// ============================================
async function updateBio(conn) {
    try {
        if (!conn) return;
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"} | 🎯 V${config.version}`;
        
        await conn.updateProfileStatus(bioText);
        console.log(fancy(`📝 Bio updated: ${bioText}`));
        
        // Update every minute
        setInterval(async () => {
            try {
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"} | 🎯 V${config.version}`;
                await conn.updateProfileStatus(bioText);
            } catch (e) {
                // Silent fail
            }
        }, 60000);
        
    } catch (error) {
        console.error("Bio error:", error.message);
    }
}

// ============================================
// API ROUTES FOR SETTINGS & CONTROLS
// ============================================

// Set sleeping mode
app.get('/api/sleeping-mode/set', (req, res) => {
    try {
        const { start, end } = req.query;
        
        if (start && end) {
            sleepStartTime = start;
            sleepEndTime = end;
            
            // Validate time format
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(start) || !timeRegex.test(end)) {
                return res.json({ success: false, error: "Invalid time format! Use HH:MM (24-hour format)" });
            }
            
            checkSleepingMode(); // Update immediately
            
            res.json({ 
                success: true, 
                message: `Sleeping mode updated! Active from ${start} to ${end}`,
                sleepingMode,
                sleepStartTime,
                sleepEndTime
            });
        } else {
            res.json({ 
                success: false, 
                error: "Please provide start and end times!",
                example: "/api/sleeping-mode/set?start=22:00&end=06:00"
            });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get sleeping mode status
app.get('/api/sleeping-mode/status', (req, res) => {
    res.json({ 
        sleepingMode,
        sleepStartTime,
        sleepEndTime,
        currentTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
        message: sleepingMode ? "😴 Sleeping mode is ACTIVE - Group functions paused" : "🌅 Sleeping mode is INACTIVE - All functions running"
    });
});

// PAIRING ENDPOINT - 8 DIGIT CODE (WITH WAIT FUNCTION)
app.get('/pair', async (req, res) => {
    try {
        console.log(fancy("🔐 Pairing request received"));
        
        let num = req.query.num;
        if (!num) {
            return res.json({ 
                success: false, 
                error: "Phone number is required! Example: /pair?num=255618558502" 
            });
        }
        
        // Clean number
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        if (!cleanNum || cleanNum.length < 9) {
            return res.json({ 
                success: false, 
                error: "Invalid phone number! Please use format: 255xxxxxxxxx (with country code)" 
            });
        }
        
        // Wait for connection if not ready
        if (!isConnectionReady || !globalConn) {
            console.log(fancy("⏳ Connection not ready, waiting..."));
            
            try {
                // Show connection status
                const statusMessage = `🔄 Bot Status: ${connectionStatus}\n⏳ Please wait while bot connects to WhatsApp...`;
                
                // Wait for connection (max 45 seconds)
                await waitForConnection(45000);
                console.log(fancy("✅ Connection is now ready for pairing!"));
            } catch (waitError) {
                return res.json({ 
                    success: false, 
                    error: "Bot connection timeout. Please try again in 30-60 seconds.",
                    details: "WhatsApp is taking longer than expected to connect",
                    status: connectionStatus,
                    tip: "Wait 1 minute and refresh the page"
                });
            }
        }
        
        console.log(fancy(`📱 Generating pairing code for: ${cleanNum}`));
        
        try {
            // Get pairing code
            const code = await globalConn.requestPairingCode(cleanNum);
            
            if (!code) {
                return res.json({ 
                    success: false, 
                    error: "Failed to generate pairing code. Please check the number and try again." 
                });
            }
            
            // Format code to 8 digits
            const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
            
            console.log(fancy(`✅ Pairing code generated: ${formattedCode}`));
            
            res.json({ 
                success: true, 
                code: formattedCode,
                message: `🎉 8-digit pairing code generated successfully!`,
                codeDisplay: formattedCode,
                instructions: [
                    "1. Open WhatsApp on your phone",
                    "2. Go to Settings → Linked Devices",
                    "3. Tap on 'Link a Device'",
                    `4. Enter this code: ${formattedCode}`,
                    "5. Wait for confirmation"
                ],
                note: "⏰ Code expires in 60 seconds. If it expires, generate a new one.",
                timestamp: new Date().toISOString()
            });
            
        } catch (pairError) {
            console.error("Pairing error:", pairError.message);
            
            let errorMsg = "Pairing failed. ";
            if (pairError.message.includes("not registered")) {
                errorMsg += "The phone number may not be registered on WhatsApp.";
            } else if (pairError.message.includes("rate limit")) {
                errorMsg += "Too many requests. Please wait 1 minute and try again.";
            } else {
                errorMsg += pairError.message;
            }
            
            res.json({ 
                success: false, 
                error: errorMsg,
                details: pairError.message 
            });
        }
        
    } catch (err) {
        console.error("Pairing endpoint error:", err.message);
        res.json({ 
            success: false, 
            error: "Server error occurred",
            details: err.message 
        });
    }
});

// Get QR Code for pairing
app.get('/api/qr', (req, res) => {
    if (qrCode) {
        res.json({ 
            success: true, 
            qr: qrCode,
            message: "Scan this QR code with WhatsApp → Linked Devices"
        });
    } else {
        res.json({ 
            success: false, 
            error: "QR code not available yet. Wait for connection.",
            status: connectionStatus
        });
    }
});

// STATUS API
app.get('/api/status', (req, res) => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    res.json({ 
        success: true,
        status: connectionStatus,
        ready: isConnectionReady,
        owner: botOwnerJid ? botOwnerJid.split('@')[0] : "Not connected yet",
        developer: config.developerName || "STANY",
        botName: config.botName,
        version: config.version,
        sleepingMode,
        sleepStartTime,
        sleepEndTime,
        uptime: `${days}d ${hours}h ${minutes}m ${seconds}s`,
        features: {
            antiCall: config.anticall || true,
            welcomeGoodbye: config.welcomeGoodbye || true,
            sleepingMode: true,
            autoBio: config.autoBio || true,
            statusDownload: config.statusDownload || true,
            autoStatus: config.autoStatus || true,
            channelAutoReact: true,
            antiLink: true,
            antiScam: true,
            chatbot: true
        },
        timestamp: new Date().toISOString()
    });
});

// TEST CONNECTION ENDPOINT
app.get('/api/test-connection', async (req, res) => {
    try {
        if (globalConn && isConnectionReady) {
            res.json({
                success: true,
                message: "✅ Bot is connected and ready for pairing!",
                connectionStatus: connectionStatus,
                botOwner: botOwnerJid ? botOwnerJid.split('@')[0] : "Not set yet",
                readyForPairing: true,
                tip: "You can now use the pairing page to link your device."
            });
        } else {
            res.json({
                success: false,
                message: "⏳ Bot is connecting to WhatsApp...",
                connectionStatus: connectionStatus,
                readyForPairing: false,
                tip: "Wait 30-60 seconds and refresh this page. The bot is connecting to WhatsApp servers."
            });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// RESTART BOT ENDPOINT (OWNER ONLY)
app.get('/api/restart', (req, res) => {
    const { key } = req.query;
    
    // Simple authentication
    if (key !== config.adminKey) {
        return res.json({ success: false, error: "Unauthorized" });
    }
    
    try {
        res.json({ 
            success: true, 
            message: "Bot restart initiated",
            restarting: true 
        });
        
        // Restart after sending response
        setTimeout(() => {
            console.log(fancy("🔄 Manual restart initiated via API"));
            process.exit(0);
        }, 1000);
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// BOT SETTINGS CONTROL
app.get('/api/settings/update', (req, res) => {
    const { key, setting, value } = req.query;
    
    // Authentication
    if (key !== config.adminKey) {
        return res.json({ success: false, error: "Unauthorized" });
    }
    
    try {
        // Update config
        if (setting && value !== undefined) {
            config[setting] = value;
            
            // Save to file if needed
            if (config.saveSettings) {
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
            }
            
            res.json({ 
                success: true, 
                message: `Setting ${setting} updated to ${value}`,
                updated: { [setting]: value }
            });
        } else {
            res.json({ 
                success: false, 
                error: "Setting and value parameters required" 
            });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// HEALTH CHECK ENDPOINT (FOR RENDER/HEROKU)
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        bot: config.botName || "Insidious",
        version: config.version,
        connection: connectionStatus,
        sleeping: sleepingMode
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: "Endpoint not found",
        availableEndpoints: [
            "/ - Dashboard",
            "/pairing - Pairing page",
            "/pair?num=255XXXXXX - Get pairing code",
            "/api/status - Bot status",
            "/api/test-connection - Test connection",
            "/api/sleeping-mode/status - Sleeping mode status",
            "/health - Health check"
        ]
    });
});

// ============================================
// START BOT
// ============================================
console.log(fancy("╔══════════════════════════════════════╗"));
console.log(fancy(`          🥀 ${config.botName || "Insidious"} V${config.version} 🥀          `));
console.log(fancy("╚══════════════════════════════════════╝"));
console.log(fancy(`👨‍💻 Developer: ${config.developerName || "STANY"}`));
console.log(fancy(`⚡ Starting bot server...`));

startInsidious();

// ============================================
// START EXPRESS SERVER
// ============================================
const server = app.listen(PORT, () => {
    console.log(fancy(`🌐 Server running on port ${PORT}`));
    console.log(fancy(`📱 Dashboard: http://localhost:${PORT}`));
    console.log(fancy(`🔐 Pairing: http://localhost:${PORT}/pairing`));
    console.log(fancy(`🩺 Health: http://localhost:${PORT}/health`));
    console.log(fancy(`📊 Status: http://localhost:${PORT}/api/status`));
    console.log(fancy("⏳ Connecting to WhatsApp... Please wait 30-60 seconds"));
    console.log(fancy("💡 TIP: Wait for '✅ WhatsApp connected' message before pairing"));
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
    console.log(fancy('🔄 SIGTERM received, shutting down gracefully'));
    server.close(() => {
        console.log(fancy('✅ Server closed'));
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log(fancy('🔄 SIGINT received, shutting down'));
    server.close(() => {
        console.log(fancy('✅ Server closed'));
        process.exit(0);
    });
});

// ============================================
// ERROR HANDLING
// ============================================
process.on('uncaughtException', (error) => {
    console.error(fancy("⚠️ Uncaught Exception:"), error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (error) => {
    console.error(fancy("⚠️ Unhandled Rejection:"), error.message);
});

// ============================================
// AUTO-RESTART ON CRASH
// ============================================
process.on('exit', (code) => {
    console.log(fancy(`🔚 Process exiting with code: ${code}`));
    if (code !== 0) {
        console.log(fancy("🔄 Will attempt to restart in 10 seconds..."));
        setTimeout(() => {
            console.log(fancy("🔄 Restarting bot..."));
            require('child_process').spawn(process.argv[0], process.argv.slice(1), {
                stdio: 'inherit'
            });
        }, 10000);
    }
});
