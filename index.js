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
const fs = require("fs-extra");
const { fancy } = require("./lib/font");

// LOAD YOUR EXISTING FILES
const config = require("./config");
const handler = require("./handler");

const app = express();
const PORT = config.port || 3000;

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
        success: true,
        uptime: process.uptime(),
        version: config.version,
        botName: config.botName,
        developer: config.developerName || "STANY",
        connectionStatus: connectionStatus,
        sleepingMode: sleepingMode,
        readyForPairing: isConnectionReady
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
// WAIT FOR CONNECTION FUNCTION - IMPROVED
// ============================================
function waitForConnection(timeout = 45000) {
    return new Promise((resolve, reject) => {
        if (isConnectionReady && globalConn) {
            return resolve(true);
        }
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (isConnectionReady && globalConn) {
                clearInterval(checkInterval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                reject(new Error(`Bot not ready. Status: ${connectionStatus}`));
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
        console.log(fancy("😴 Sleeping Mode Activated"));
        
        if (botOwnerJid) {
            globalConn.sendMessage(botOwnerJid, {
                text: fancy(`😴 *SLEEPING MODE ON*\n\nGroup functions paused until ${sleepEndTime}`)
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
        console.log(fancy("🌅 Sleeping Mode Deactivated"));
        
        if (botOwnerJid) {
            globalConn.sendMessage(botOwnerJid, {
                text: fancy(`🌅 *SLEEPING MODE OFF*\n\nAll functions active!`)
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
        
        if (startTime <= endTime) {
            if (currentTime >= startTime && currentTime <= endTime) {
                if (!sleepingMode) startSleepingMode();
            } else {
                if (sleepingMode) stopSleepingMode();
            }
        } else {
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
        
        await conn.rejectCall(callId, caller);
        
        if (botOwnerJid) {
            await conn.sendMessage(botOwnerJid, {
                text: fancy(`📵 *CALL REJECTED*\n\nFrom: ${caller}\nTime: ${new Date().toLocaleString()}`)
            });
        }
        
        console.log(fancy(`📵 Rejected call from: ${caller.split('@')[0]}`));
        
    } catch (error) {
        console.error("Anti-call error:", error.message);
    }
}

// ============================================
// START BOT FUNCTION
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
            printQRInTerminal: false // NO QR CODE
        });

        globalConn = conn;

        // CALL EVENT HANDLER
        conn.ev.on('call', async (call) => {
            try {
                if (config.anticall) {
                    await handleAntiCall(conn, call);
                }
            } catch (error) {
                console.error("Call event error:", error.message);
            }
        });

        // CONNECTION HANDLER
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy("✅ WhatsApp connected successfully!"));
                connectionStatus = 'connected';
                isConnectionReady = true;
                
                if (conn.user && conn.user.id) {
                    botOwnerJid = conn.user.id;
                    console.log(fancy(`👑 Bot Owner: ${botOwnerJid.split('@')[0]}`));
                    
                    // Send welcome to owner
                    const welcomeMsg = `
╔═══════════════════╗
   🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}*
╚═══════════════════╝

✅ *Bot Online*
👑 *Owner:* ${botOwnerJid.split('@')[0]}
👨‍💻 *Developer:* ${config.developerName || "STANY"}

📢 *Bot is ready for pairing!*
🔗 Use: /pair?num=YOUR_NUMBER

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ")}`;
                    
                    await conn.sendMessage(botOwnerJid, { text: welcomeMsg });
                    
                    // Start sleeping mode
                    if (sleepInterval) clearInterval(sleepInterval);
                    sleepInterval = setInterval(checkSleepingMode, 60000);
                    checkSleepingMode();
                }
                
                // Initialize handler
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
                
                if (sleepInterval) {
                    clearInterval(sleepInterval);
                    sleepInterval = null;
                }
                
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(fancy("🔄 Reconnecting in 3 seconds..."));
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

        // MESSAGE HANDLER
        conn.ev.on('messages.upsert', async (m) => {
            try {
                if (sleepingMode) {
                    const from = m.messages[0]?.key?.remoteJid;
                    if (from && from.endsWith('@g.us')) {
                        console.log(fancy("😴 Sleeping Mode - Skipping group message"));
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

        // GROUP PARTICIPANTS UPDATE
        conn.ev.on('group-participants.update', async (anu) => {
            try {
                if (sleepingMode) {
                    console.log(fancy("😴 Sleeping Mode - Skipping group event"));
                    return;
                }
                
                if (!config.welcomeGoodbye) return;
                
                const metadata = await conn.groupMetadata(anu.id);
                
                for (let num of anu.participants) {
                    const userNum = num.split("@")[0];
                    
                    if (anu.action == 'add') {
                        const welcomeMsg = `
╭─── • 🎉 • ───╮
   𝗪𝗘𝗟𝗖𝗢𝗠𝗘
╰─── • 🎉 • ───╯

👋 *Hello* @${userNum}!
📛 *Group:* ${metadata.subject}
👥 *Members:* ${metadata.participants.length}

⚡ *Enjoy your stay!*

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ")}`;
                        
                        await conn.sendMessage(anu.id, { 
                            text: welcomeMsg,
                            mentions: [num] 
                        });
                        
                    } else if (anu.action == 'remove') {
                        const goodbyeMsg = `
╭─── • 👋 • ───╮
   𝗚𝗢𝗢𝗗𝗕𝗬𝗘
╰─── • 👋 • ───╯

📛 *Group:* ${metadata.subject}
👥 *Remaining:* ${metadata.participants.length}

😔 @${userNum} has left.

${fancy(config.footer || "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ")}`;
                        
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
        
        const bioText = `🤖 ${config.botName} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"}`;
        
        await conn.updateProfileStatus(bioText);
        console.log(fancy(`📝 Bio updated`));
        
        setInterval(async () => {
            try {
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const bioText = `🤖 ${config.botName} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName || "STANY"}`;
                await conn.updateProfileStatus(bioText);
            } catch (e) {}
        }, 60000);
        
    } catch (error) {
        console.error("Bio error:", error.message);
    }
}

// ============================================
// PAIRING ENDPOINT - AUTOMATIC & FAST
// ============================================
app.get('/pair', async (req, res) => {
    try {
        console.log(fancy("🔐 Pairing request"));
        
        let num = req.query.num;
        if (!num) {
            return res.json({ 
                success: false, 
                error: "Enter your WhatsApp number! Example: /pair?num=255618558502" 
            });
        }
        
        // Clean number
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        if (!cleanNum || cleanNum.length < 9) {
            return res.json({ 
                success: false, 
                error: "Invalid number! Use: 255xxxxxxxxx (with country code)" 
            });
        }
        
        // Wait for connection if needed
        if (!isConnectionReady || !globalConn) {
            console.log(fancy("⏳ Waiting for connection..."));
            
            try {
                await waitForConnection(45000);
                console.log(fancy("✅ Connection ready!"));
            } catch (waitError) {
                return res.json({ 
                    success: false, 
                    error: "Bot is starting up. Please wait 30 seconds and try again.",
                    tip: "Bot takes 30-45 seconds to connect to WhatsApp"
                });
            }
        }
        
        console.log(fancy(`📱 Pairing: ${cleanNum}`));
        
        try {
            // Generate pairing code
            const code = await globalConn.requestPairingCode(cleanNum);
            
            if (!code) {
                return res.json({ 
                    success: false, 
                    error: "Failed to generate code. Check number format." 
                });
            }
            
            // Format to 8 digits
            const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
            
            console.log(fancy(`✅ Pairing code: ${formattedCode}`));
            
            // Send success response
            res.json({ 
                success: true, 
                code: formattedCode,
                message: `🎉 Pairing code generated successfully!`,
                instructions: [
                    "1. Open WhatsApp on your phone",
                    "2. Go to Settings → Linked Devices",
                    "3. Tap 'Link a Device'",
                    `4. Enter code: ${formattedCode}`,
                    "5. You're now the bot owner!"
                ],
                note: "Code expires in 60 seconds. First person to link becomes bot owner.",
                botInfo: {
                    name: config.botName,
                    version: config.version,
                    developer: config.developerName || "STANY"
                }
            });
            
        } catch (pairError) {
            console.error("Pairing error:", pairError.message);
            
            let errorMsg = "Pairing failed. ";
            if (pairError.message.includes("not registered")) {
                errorMsg += "Number not registered on WhatsApp.";
            } else if (pairError.message.includes("rate limit")) {
                errorMsg += "Too many attempts. Wait 1 minute.";
            } else {
                errorMsg += "Please check your number and try again.";
            }
            
            res.json({ 
                success: false, 
                error: errorMsg
            });
        }
        
    } catch (err) {
        console.error("Pairing endpoint error:", err.message);
        res.json({ 
            success: false, 
            error: "Server error. Try again.",
            details: err.message 
        });
    }
});

// ============================================
// SIMPLE STATUS CHECK
// ============================================
app.get('/api/status', (req, res) => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    res.json({ 
        success: true,
        status: connectionStatus,
        ready: isConnectionReady,
        owner: botOwnerJid ? botOwnerJid.split('@')[0] : "Not paired yet",
        botName: config.botName,
        version: config.version,
        developer: config.developerName || "STANY",
        uptime: `${days}d ${hours}h ${minutes}m`,
        sleepingMode: sleepingMode,
        pairingReady: isConnectionReady,
        message: isConnectionReady ? "✅ Bot ready for pairing!" : "⏳ Bot connecting..."
    });
});

// ============================================
// TEST CONNECTION
// ============================================
app.get('/api/test', (req, res) => {
    res.json({ 
        ready: isConnectionReady,
        status: connectionStatus,
        message: isConnectionReady ? 
            "✅ Bot is connected! Use /pair?num=YOUR_NUMBER" : 
            "⏳ Bot is connecting... Wait 30 seconds"
    });
});

// ============================================
// SLEEPING MODE CONTROLS
// ============================================
app.get('/api/sleep', (req, res) => {
    const { action, start, end } = req.query;
    
    if (action === 'set' && start && end) {
        sleepStartTime = start;
        sleepEndTime = end;
        checkSleepingMode();
        
        res.json({ 
            success: true, 
            message: `Sleeping mode set: ${start} to ${end}`,
            sleepingMode 
        });
    } else if (action === 'status') {
        res.json({ 
            sleepingMode,
            sleepStartTime,
            sleepEndTime
        });
    } else {
        res.json({ 
            success: false, 
            error: "Use: /api/sleep?action=set&start=22:00&end=06:00"
        });
    }
});

// ============================================
// HEALTH CHECK (FOR DEPLOYMENT)
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        bot: config.botName,
        version: config.version,
        connection: connectionStatus,
        ready: isConnectionReady,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START EVERYTHING
// ============================================
console.log(fancy("╔══════════════════════════════════════╗"));
console.log(fancy(`          🥀 ${config.botName} V${config.version} 🥀          `));
console.log(fancy("╚══════════════════════════════════════╝"));
console.log(fancy(`👨‍💻 Developer: ${config.developerName || "STANY"}`));
console.log(fancy(`🔗 Starting bot...`));

startInsidious();

// Start server
app.listen(PORT, () => {
    console.log(fancy(`🌐 Server: http://localhost:${PORT}`));
    console.log(fancy(`🔐 Pairing: http://localhost:${PORT}/pair?num=255618558502`));
    console.log(fancy(`📊 Status: http://localhost:${PORT}/api/status`));
    console.log(fancy("⏳ Connecting to WhatsApp... (30-45 seconds)"));
    console.log(fancy("💡 TIP: Wait for '✅ WhatsApp connected' then use pairing"));
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error(fancy("⚠️ Error:"), error.message);
});

process.on('unhandledRejection', (error) => {
    console.error(fancy("⚠️ Rejection:"), error.message);
});
