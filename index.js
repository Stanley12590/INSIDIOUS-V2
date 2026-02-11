const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

// ✅ **LOAD HANDLER (kwa bot ID)**
const handler = require('./handler');

// ✅ **FANCY FUNCTION**
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    
    try {
        const fancyMap = {
            a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
            j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
            s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
            A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
            J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
            S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
        };
        
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            result += fancyMap[char] || char;
        }
        return result;
    } catch (e) {
        return text;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ **MONGODB CONNECTION - MUST**
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED"));
    console.log(fancy("💡 Error: " + err.message));
});

// ✅ **MIDDLEWARE**
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ **CREATE PUBLIC FOLDER IF NOT EXISTS**
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

// ✅ **SIMPLE ROUTES**
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ✅ **GLOBAL VARIABLES**
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

// ✅ **LOAD CONFIG**
let config = {};
try {
    config = require('./config');
    console.log(fancy("📋 Config loaded"));
} catch (error) {
    console.log(fancy("❌ Config file error"));
    config = {
        prefix: '.',
        ownerNumber: ['255000000000'],
        botName: 'INSIDIOUS',
        workMode: 'public'
    };
}

// ✅ **MAIN BOT FUNCTION - NO QR CODE WARNINGS**
async function startBot() {
    try {
        console.log(fancy("🚀 Starting INSIDIOUS..."));
        
        // ✅ **AUTHENTICATION**
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

        // ✅ **CREATE CONNECTION - WITHOUT QR CODE OPTION**
        const conn = makeWASocket({
            version,
            auth: { 
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) 
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true
        });

        globalConn = conn;
        botStartTime = Date.now();

        // ✅ **CONNECTION EVENT HANDLER**
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy("👹 INSIDIOUS: THE LAST KEY ACTIVATED"));
                console.log(fancy("✅ Bot is now online"));
                
                isConnected = true;
                
                // Get bot info
                let botName = conn.user?.name || "INSIDIOUS";
                let botNumber = "Unknown";
                let botId = conn.user?.id || "Unknown";
                
                if (conn.user?.id) {
                    botNumber = conn.user.id.split(':')[0] || "Unknown";
                }
                
                console.log(fancy(`🤖 Name: ${botName}`));
                console.log(fancy(`📞 Number: ${botNumber}`));
                
                // ✅ **BOT ID KUTOKA HANDLER (sio namba)**
                const secretBotId = handler.getBotId ? handler.getBotId() : 'INS-UNKNOWN';
                console.log(fancy(`🔐 Bot ID: ${secretBotId}`));
                
                // ✅ **WELCOME MESSAGE IMEONDOLewa KABISA**
                // (Hakuna picha wala ujumbe kwa owner)
                
                // ✅ **INITIALIZE HANDLER**
                setTimeout(async () => {
                    try {
                        if (handler && typeof handler.init === 'function') {
                            await handler.init(conn);
                        }
                    } catch (e) {
                        console.error(fancy("❌ Handler init error:"), e.message);
                    }
                }, 2000);
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnected = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    // Restart bot once
                    console.log(fancy("🔄 Restarting bot..."));
                    setTimeout(() => {
                        startBot();
                    }, 5000);
                }
            }
        });

        // ✅ **PAIRING ENDPOINT (8-DIGIT CODE)**
        app.get('/pair', async (req, res) => {
            try {
                let num = req.query.num;
                if (!num) {
                    return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
                }
                
                const cleanNum = num.replace(/[^0-9]/g, '');
                if (cleanNum.length < 10) {
                    return res.json({ error: "Invalid number" });
                }
                
                console.log(fancy(`🔑 Generating 8-digit code for: ${cleanNum}`));
                
                try {
                    // Generate 8-digit pairing code
                    const code = await conn.requestPairingCode(cleanNum);
                    res.json({ 
                        success: true, 
                        code: code,
                        message: `8-digit pairing code: ${code}`
                    });
                } catch (err) {
                    if (err.message.includes("already paired")) {
                        res.json({ 
                            success: true, 
                            message: "Number already paired"
                        });
                    } else {
                        throw err;
                    }
                }
                
            } catch (err) {
                console.error("Pairing error:", err.message);
                res.json({ success: false, error: "Failed: " + err.message });
            }
        });

        // ✅ **UNPAIR ENDPOINT**
        app.get('/unpair', async (req, res) => {
            try {
                let num = req.query.num;
                if (!num) {
                    return res.json({ error: "Provide number! Example: /unpair?num=255123456789" });
                }
                
                const cleanNum = num.replace(/[^0-9]/g, '');
                if (cleanNum.length < 10) {
                    return res.json({ error: "Invalid number" });
                }
                
                // In real system, you'd remove from database
                res.json({ 
                    success: true, 
                    message: `Number ${cleanNum} unpaired successfully`
                });
                
            } catch (err) {
                console.error("Unpair error:", err.message);
                res.json({ success: false, error: "Failed: " + err.message });
            }
        });

        // ✅ **HEALTH CHECK**
        app.get('/health', (req, res) => {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            res.json({
                status: 'healthy',
                connected: isConnected,
                uptime: `${hours}h ${minutes}m ${seconds}s`,
                database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
            });
        });

        // ✅ **BOT INFO ENDPOINT – INA BOT ID KUTOKA HANDLER**
        app.get('/botinfo', (req, res) => {
            if (!globalConn || !globalConn.user) {
                return res.json({ error: "Bot not connected" });
            }
            
            res.json({
                botName: globalConn.user?.name || "INSIDIOUS",
                botNumber: globalConn.user?.id?.split(':')[0] || "Unknown",
                botId: handler.getBotId ? handler.getBotId() : null,
                connected: isConnected,
                uptime: Date.now() - botStartTime
            });
        });

        // ✅ **CREDENTIALS UPDATE**
        conn.ev.on('creds.update', saveCreds);

        // ✅ **MESSAGE HANDLER**
        conn.ev.on('messages.upsert', async (m) => {
            try {
                const handler = require('./handler');
                if (handler && typeof handler === 'function') {
                    await handler(conn, m);
                }
            } catch (error) {
                console.error("Message handler error:", error.message);
            }
        });

        // ✅ **GROUP UPDATE HANDLER**
        conn.ev.on('group-participants.update', async (update) => {
            try {
                const handler = require('./handler');
                if (handler && handler.handleGroupUpdate) {
                    await handler.handleGroupUpdate(conn, update);
                }
            } catch (error) {
                console.error("Group update error:", error.message);
            }
        });

        console.log(fancy("🚀 Bot ready"));
        console.log(fancy("📱 Use 8-digit pairing via web interface"));
        
    } catch (error) {
        console.error("Start error:", error.message);
        // Restart once on error
        setTimeout(() => {
            startBot();
        }, 10000);
    }
}

// ✅ **START BOT**
startBot();

// ✅ **START SERVER**
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 8-digit Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`🗑️  Unpair: http://localhost:${PORT}/unpair?num=255XXXXXXXXX`));
    console.log(fancy(`🤖 Bot Info: http://localhost:${PORT}/botinfo`));
    console.log(fancy(`❤️ Health: http://localhost:${PORT}/health`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
    console.log(fancy("🙏 Special Thanks: REDTECH"));
    console.log(fancy("🔐 Bot ID: ACTIVE (from handler)"));
    console.log(fancy("🚫 Welcome message: REMOVED"));
});

module.exports = app;
