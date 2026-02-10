const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const { fancy } = require("./lib/font");

// LOAD YOUR EXISTING FILES
const config = require("./config");
const handler = require("./handler");

const app = express();
const PORT = config.port || 3000;

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WEB ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API ENDPOINTS
app.get('/api/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        version: config.version,
        botName: config.botName,
        developer: config.developerName || "STANY"
    });
});

let globalConn = null;
let connectionStatus = 'disconnected';
let isConnectionReady = false;
let botOwnerJid = null;

// ============================================
// SLEEPING MODE VARIABLES
// ============================================
let sleepingMode = false;
let sleepStartTime = "00:00";
let sleepEndTime = "06:00";
let sleepInterval = null;

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
                text: fancy(`😴 *SLEEPING MODE ACTIVATED*\n\nGroup functions are now paused until ${sleepEndTime}`)
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
                text: fancy(`🌅 *SLEEPING MODE DEACTIVATED*\n\nAll group functions are now active!`)
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
                text: fancy(`📵 *CALL REJECTED*\n\nFrom: ${caller}\nTime: ${new Date().toLocaleString()}\nType: ${callData.isVideo ? 'Video Call' : 'Voice Call'}\n\nCall was automatically rejected.`)
            });
        }
        
        // Send rejection notice to caller if not in group
        if (!caller.endsWith('@g.us')) {
            await conn.sendMessage(caller, {
                text: fancy(`📵 *CALL REJECTED*\n\nSorry, calls are not allowed with this bot.\n\nPlease send a text message instead.`)
            });
        }
        
        console.log(fancy(`📵 Rejected call from: ${caller}`));
        
    } catch (error) {
        console.error("Anti-call error:", error.message);
    }
}

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
            getMessage: async (key) => ({ conversation: "message deleted" })
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

        // HANDLE CONNECTION
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
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
                    const welcomeMsg = `╔═══════════════════╗\n   🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}*\n╚═══════════════════╝\n\n✅ *Bot Online*\n👑 *Owner:* ${botOwnerJid.split('@')[0]}\n👨‍💻 *Developer:* ${config.developerName || "STANY"}\n\n${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ")}`;
                    await conn.sendMessage(botOwnerJid, { text: welcomeMsg });
                    
                    // Start sleeping mode checker
                    if (sleepInterval) clearInterval(sleepInterval);
                    sleepInterval = setInterval(checkSleepingMode, 60000); // Check every minute
                    checkSleepingMode(); // Initial check
                    
                    // Auto-follow owner to channel
                    setTimeout(() => {
                        if (botOwnerJid && config.newsletterJid) {
                            console.log(fancy(`[CHANNEL] ✅ Auto-following owner to channel`));
                            // This will be handled in handler.js initialization
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
                    console.log(fancy("🔄 Reconnecting..."));
                    setTimeout(startInsidious, 3000);
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
                
                try {
                    // Get group description
                    if (metadata.desc) {
                        groupDesc = metadata.desc.substring(0, 100);
                        if (metadata.desc.length > 100) groupDesc += "...";
                    }
                    
                    // Get group picture
                    try {
                        groupPicture = await conn.profilePictureUrl(anu.id, 'image');
                    } catch (picError) {}
                } catch (e) {}
                
                for (let num of anu.participants) {
                    const userNum = num.split("@")[0];
                    
                    if (anu.action == 'add') {
                        // BEAUTIFUL WELCOME MESSAGE
                        const welcomeMsg = `╭─── • 🎉 • ───╮\n   𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗡𝗘𝗪 𝗠𝗘𝗠𝗕𝗘𝗥\n╰─── • 🎉 • ───╯\n\n👋 *Hello* @${userNum}!\n\n📛 *Group:* ${metadata.subject}\n👥 *Members:* ${metadata.participants.length}\n📝 *Description:* ${groupDesc}\n\n⚡ *Enjoy your stay!*\n\n${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developer: STANY")}`;
                        
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
                        
                    } else if (anu.action == 'remove') {
                        // BEAUTIFUL GOODBYE MESSAGE
                        const goodbyeMsg = `╭─── • 👋 • ───╮\n   𝗚𝗢𝗢𝗗𝗕𝗬𝗘\n╰─── • 👋 • ───╯\n\n📛 *Group:* ${metadata.subject}\n👥 *Remaining:* ${metadata.participants.length}\n\n😔 @${userNum} has left the group.\n\n💬 *"Farewell..."*\n\n${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developer: STANY")}`;
                        
                        await conn.sendMessage(anu.id, { 
                            text: goodbyeMsg,
                            mentions: [num] 
                        });
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

// AUTO BIO FUNCTION
async function updateBio(conn) {
    try {
        if (!conn) return;
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"}`;
        
        await conn.updateProfileStatus(bioText);
        console.log(fancy(`📝 Bio updated`));
        
        // Update every minute
        setInterval(async () => {
            try {
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"}`;
                await conn.updateProfileStatus(bioText);
            } catch (e) {}
        }, 60000);
        
    } catch (error) {
        console.error("Bio error:", error.message);
    }
}

// ============================================
// API ROUTES FOR SETTINGS
// ============================================
app.get('/api/sleeping-mode/set', (req, res) => {
    try {
        const { start, end } = req.query;
        
        if (start && end) {
            sleepStartTime = start;
            sleepEndTime = end;
            
            // Validate time format
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(start) || !timeRegex.test(end)) {
                return res.json({ success: false, error: "Invalid time format! Use HH:MM" });
            }
            
            checkSleepingMode(); // Update immediately
            
            res.json({ 
                success: true, 
                message: `Sleeping mode set: ${start} to ${end}`,
                sleepingMode
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

app.get('/api/sleeping-mode/status', (req, res) => {
    res.json({ 
        sleepingMode,
        sleepStartTime,
        sleepEndTime,
        currentTime: new Date().toLocaleTimeString('en-US', { hour12: false })
    });
});

// PAIRING ENDPOINT - 8 DIGIT CODE (WORKING)
app.get('/pair', async (req, res) => {
    try {
        console.log(fancy("🔐 Pairing request"));
        
        let num = req.query.num;
        if (!num) {
            return res.json({ 
                success: false, 
                error: "Number required! Example: /pair?num=255123456789" 
            });
        }
        
        // Clean number
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        if (!cleanNum || cleanNum.length < 9) {
            return res.json({ 
                success: false, 
                error: "Invalid number! Example: 255123456789" 
            });
        }
        
        if (!globalConn || !isConnectionReady) {
            return res.json({ 
                success: false, 
                error: "Bot not ready! Wait for connection.",
                status: connectionStatus
            });
        }
        
        console.log(fancy(`📱 Generating code for: ${cleanNum}`));
        
        try {
            // Get pairing code
            const code = await globalConn.requestPairingCode(cleanNum);
            
            if (!code) {
                return res.json({ 
                    success: false, 
                    error: "Failed to generate code" 
                });
            }
            
            // Format code to 8 digits
            const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
            
            console.log(fancy(`✅ Code: ${formattedCode}`));
            
            res.json({ 
                success: true, 
                code: formattedCode,
                message: `8-digit code: ${formattedCode}`,
                instructions: "Open WhatsApp → Settings → Linked Devices → Link a Device → Enter Code",
                note: "Code expires in 60 seconds"
            });
            
        } catch (pairError) {
            console.error("Pairing error:", pairError.message);
            res.json({ 
                success: false, 
                error: "Pairing failed",
                details: pairError.message 
            });
        }
        
    } catch (err) {
        console.error("Pairing endpoint error:", err.message);
        res.json({ 
            success: false, 
            error: "Server error",
            details: err.message 
        });
    }
});

// STATUS API
app.get('/api/status', (req, res) => {
    res.json({ 
        status: connectionStatus,
        ready: isConnectionReady,
        owner: botOwnerJid ? botOwnerJid.split('@')[0] : "Not connected",
        developer: config.developerName || "STANY",
        botName: config.botName,
        sleepingMode,
        sleepStartTime,
        sleepEndTime,
        features: {
            antiCall: config.anticall || true,
            welcomeGoodbye: config.welcomeGoodbye || true,
            sleepingMode: true,
            autoBio: config.autoBio || true
        }
    });
});

// START BOT
startInsidious();

// START SERVER
app.listen(PORT, () => {
    console.log(fancy("╔══════════════════════════════════════╗"));
    console.log(fancy(`          🥀 ${config.botName || "Insidious"} 🥀          `));
    console.log(fancy("╚══════════════════════════════════════╝"));
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`🔐 Pairing: http://localhost:${PORT}/pair?num=255xxxxxxxx`);
    console.log(fancy(`👑 Owner: (will show after linking)`));
    console.log(fancy(`👨‍💻 Developer: ${config.developerName || "STANY"}`));
    console.log(fancy(`🤖 Handler.js: ✅ Included`));
    console.log(fancy(`🎉 Welcome/Goodbye: ✅ Enabled`));
    console.log(fancy(`📸 Group Picture: ✅ Included`));
    console.log(fancy(`🤖 Auto Bio: ✅ Enabled`));
    console.log(fancy(`😴 Sleeping Mode: ✅ Available`));
    console.log(fancy(`📵 Anti-Call: ✅ Enabled`));
    console.log(fancy(`📢 Auto Channel React: ✅ Enabled`));
    console.log(fancy(`⏳ Connecting to WhatsApp...`));
});

// ERROR HANDLING
process.on('uncaughtException', (error) => {
    console.error(fancy("⚠️ Error:"), error.message);
});

process.on('unhandledRejection', (error) => {
    console.error(fancy("⚠️ Rejection:"), error.message);
});