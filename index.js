const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    delay
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs-extra");
const { fancy } = require("./lib/font");
const config = require("./config");
const { User, Group, ChannelSubscriber, Settings } = require('./database/models');

const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE CONNECTION
mongoose.connect(config.mongodb, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log(fancy("🥀 database connected: insidious is eternal.")))
    .catch(err => console.error("DB Connection Error:", err));

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
app.get('/api/stats', async (req, res) => {
    try {
        const users = await User.countDocuments();
        const groups = await Group.countDocuments();
        const subscribers = await ChannelSubscriber.countDocuments();
        const settings = await Settings.findOne();
        
        res.json({
            users,
            groups,
            subscribers,
            settings: settings || {},
            uptime: process.uptime(),
            version: config.version,
            botName: config.botName
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

let globalConn = null;
let isConnected = false;

// ============================================
// CHECK IF SESSION EXISTS
// ============================================
function sessionExists() {
    const sessionPath = path.join(__dirname, config.sessionName);
    return fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
}

// ============================================
// AUTO-RESTORE ALL SESSIONS FUNCTION
// ============================================
async function autoRestoreSessions() {
    try {
        console.log(fancy('[SESSION] 🔄 Checking for saved sessions...'));
        
        if (!sessionExists()) {
            console.log(fancy('[SESSION] ❌ No saved session found. First time setup needed.'));
            return false;
        }
        
        console.log(fancy('[SESSION] ✅ Found saved session. Auto-restoring...'));
        return true;
    } catch (error) {
        console.error('Session check error:', error.message);
        return false;
    }
}

// ============================================
// MAIN BOT START FUNCTION (AUTO-RESTORE)
// ============================================
async function startInsidious() {
    try {
        console.log(fancy('[SYSTEM] 🚀 Starting INSIDIOUS V2...'));
        
        // Check and auto-restore session
        const hasSession = await autoRestoreSessions();
        
        if (!hasSession) {
            console.log(fancy('[SESSION] ⚠️ First time setup required.'));
            console.log(fancy('[SESSION] 📱 Please link a device manually once.'));
            console.log(fancy('[SESSION] 🔗 Use: !pair 2557xxxxxx (in bot DM)'));
            console.log(fancy('[SESSION] 💾 Session will auto-save for future restarts.'));
        }
        
        // Use saved auth state or create new
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
        const { version } = await fetchLatestBaileysVersion();

        // Create connection with saved credentials
        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            getMessage: async (key) => ({ conversation: "message deleted" }),
            printQRInTerminal: false, // No QR code
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: true
        });

        globalConn = conn;

        // ============================================
        // CONNECTION UPDATE HANDLER
        // ============================================
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log(fancy("✅ Bot connected successfully!"));
                console.log(fancy(`👤 User ID: ${conn.user?.id}`));
                console.log(fancy(`📱 Phone: ${conn.user?.phone}`));
                
                try {
                    // Initialize settings if not exist
                    let settings = await Settings.findOne();
                    if (!settings) {
                        settings = new Settings();
                        await settings.save();
                    }
                    
                    // Initialize handler if exists
                    if (typeof require('./handler').init === 'function') {
                        setTimeout(async () => {
                            try {
                                await require('./handler').init(conn);
                            } catch (error) {
                                console.error("Handler init error:", error);
                            }
                        }, 5000);
                    }
                    
                } catch (error) {
                    console.error("Connection setup error:", error);
                }
            }
            
            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const error = lastDisconnect?.error;
                
                console.log(fancy(`🔌 Connection closed. Status: ${statusCode || 'unknown'}`));
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(fancy("❌ Bot logged out. Cleaning session..."));
                    
                    // Delete session folder
                    const sessionPath = path.join(__dirname, config.sessionName);
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                        console.log(fancy("[SESSION] 🗑️ Deleted old session folder"));
                    }
                    
                    // Wait 5 seconds and restart
                    console.log(fancy("🔄 Restarting in 5 seconds..."));
                    setTimeout(startInsidious, 5000);
                    
                } else {
                    // Auto-reconnect for other disconnects
                    console.log(fancy("🔄 Auto-reconnecting in 3 seconds..."));
                    setTimeout(startInsidious, 3000);
                }
            }
            
            if (connection === 'connecting') {
                console.log(fancy("🔄 Connecting to WhatsApp..."));
            }
        });

        // ============================================
        // CREDENTIALS UPDATE HANDLER
        // ============================================
        conn.ev.on('creds.update', saveCreds);

        // ============================================
        // MESSAGE HANDLER
        // ============================================
        conn.ev.on('messages.upsert', async (m) => {
            try {
                require('./handler')(conn, m);
            } catch (error) {
                console.error("Message handler error:", error);
            }
        });

        // ============================================
        // GROUP PARTICIPANTS UPDATE
        // ============================================
        conn.ev.on('group-participants.update', async (anu) => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.welcomeGoodbye) return;
                
                const metadata = await conn.groupMetadata(anu.id);
                const participants = anu.participants;
                
                for (let num of participants) {
                    if (anu.action == 'add') {
                        const welcomeMsg = `╭── • 🥀 • ──╮\n  ${fancy("ɴᴇᴡ ꜱᴏᴜʟ ᴅᴇᴛᴇᴄᴛᴇᴅ")}\n╰── • 🥀 • ──╯\n\n│ ◦ Welcome @${num.split("@")[0]}\n│ ◦ Group: ${metadata.subject}\n\n${fancy(config.footer)}`;
                        
                        await conn.sendMessage(anu.id, { 
                            text: welcomeMsg,
                            mentions: [num] 
                        });
                        
                    } else if (anu.action == 'remove') {
                        const goodbyeMsg = `╭── • 🥀 • ──╮\n  ${fancy("ꜱᴏᴜʟ ʟᴇꜰᴛ")}\n╰── • 🥀 • ──╯\n\n│ ◦ @${num.split('@')[0]} ʜᴀꜱ ᴇxɪᴛᴇᴅ.`;
                        await conn.sendMessage(anu.id, { 
                            text: goodbyeMsg,
                            mentions: [num] 
                        });
                    }
                }
            } catch (e) { 
                console.error("Group event error:", e);
            }
        });

        // ============================================
        // ANTICALL
        // ============================================
        conn.ev.on('call', async (calls) => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.anticall) return;
                
                for (let call of calls) {
                    if (call.status === 'offer') {
                        await conn.rejectCall(call.id, call.from);
                        console.log(fancy(`📵 Rejected call from ${call.from}`));
                    }
                }
            } catch (error) {
                console.error("Anticall error:", error);
            }
        });

        // ============================================
        // SESSION HEALTH CHECK (EVERY 10 MINUTES)
        // ============================================
        setInterval(async () => {
            if (!isConnected) {
                console.log(fancy("[HEALTH] ⚠️ Connection lost. Reconnecting..."));
                startInsidious();
            }
        }, 10 * 60 * 1000);

        return conn;
        
    } catch (error) {
        console.error("Failed to start bot:", error);
        
        // If it's a session error, delete and retry
        if (error.message.includes("session") || error.message.includes("creds")) {
            console.log(fancy("[SESSION] 🗑️ Corrupted session detected. Deleting..."));
            
            const sessionPath = path.join(__dirname, config.sessionName);
            if (fs.existsSync(sessionPath)) {
                fs.removeSync(sessionPath);
            }
            
            console.log(fancy("[SESSION] 🔄 Retrying in 5 seconds..."));
            setTimeout(startInsidious, 5000);
        } else {
            // Other errors, retry after 10 seconds
            console.log(fancy("🔄 Retrying in 10 seconds..."));
            setTimeout(startInsidious, 10000);
        }
    }
}

// ============================================
// API ENDPOINTS FOR DASHBOARD
// ============================================

// Bot status endpoint
app.get('/api/bot-status', (req, res) => {
    res.json({
        connected: isConnected,
        userId: globalConn?.user?.id || null,
        phone: globalConn?.user?.phone || null,
        name: globalConn?.user?.name || null,
        sessionExists: sessionExists(),
        uptime: process.uptime()
    });
});

// Pairing endpoint (manual pairing for first time)
app.get('/api/pair', async (req, res) => {
    try {
        if (!globalConn || !globalConn.requestPairingCode) {
            return res.json({ error: "Bot not connected yet" });
        }
        
        const num = req.query.num;
        if (!num) {
            return res.json({ error: "Phone number required!" });
        }
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        const code = await globalConn.requestPairingCode(cleanNum);
        
        res.json({
            success: true,
            code: code,
            instructions: `1. Open WhatsApp on ${cleanNum}\n2. Go to Settings → Linked Devices\n3. Tap "Link a Device"\n4. Enter code: ${code}`
        });
        
    } catch (err) {
        console.error("Pairing error:", err);
        res.json({ 
            error: "Pairing failed",
            details: err.message 
        });
    }
});

// Session management endpoint
app.post('/api/session/reset', (req, res) => {
    try {
        const sessionPath = path.join(__dirname, config.sessionName);
        if (fs.existsSync(sessionPath)) {
            fs.removeSync(sessionPath);
        }
        
        console.log(fancy("[API] 🗑️ Session reset by dashboard"));
        res.json({ success: true, message: "Session reset. Bot will restart." });
        
        // Restart bot after 2 seconds
        setTimeout(startInsidious, 2000);
        
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ============================================
// START EVERYTHING
// ============================================
startInsidious();

// Start web server
app.listen(PORT, () => {
    console.log(fancy(`🌐 Dashboard: http://localhost:${PORT}`));
    console.log(fancy(`📊 Status API: http://localhost:${PORT}/api/bot-status`));
    console.log(fancy("💾 Session auto-restore: ENABLED"));
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(fancy("👋 Shutting down bot..."));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(fancy("👋 Render shutdown signal received..."));
    process.exit(0);
});

// Export for testing
module.exports = { app, startInsidious };
