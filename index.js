const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

// ========== GLOBAL ERROR HANDLERS ==========
process.on('uncaughtException', (err) => {
    console.log("⚠️ Uncaught Exception:", err.message);
});
process.on('unhandledRejection', (err) => {
    console.log("⚠️ Unhandled Rejection:", err.message);
});

// ========== FANCY FUNCTION ==========
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

// ========== MONGODB CONNECTION ==========
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch((err) => console.log(fancy("❌ MongoDB Connection FAILED: " + err.message)));

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== LOAD CONFIG ==========
let config = {};
try {
    config = require('./config');
    console.log(fancy("📋 Config loaded"));
} catch (error) {
    console.log(fancy("❌ Config file error, using defaults"));
    config = {
        prefix: '.',
        ownerNumber: ['255000000000'],
        botName: 'INSIDIOUS',
        workMode: 'public'
    };
}

// ========== GLOBAL VARIABLES ==========
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();
let reconnectAttempts = 0;

// ========== MAIN BOT FUNCTION ==========
async function startBot() {
    try {
        console.log(fancy("🚀 Starting INSIDIOUS..."));
        
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

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
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            shouldIgnoreJid: () => false
        });

        globalConn = conn;
        botStartTime = Date.now();

        // CONNECTION EVENT HANDLER
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR Code received (ignore, using pairing)');
            }
            
            if (connection === 'open') {
                console.log(fancy("✅ INSIDIOUS IS NOW ONLINE"));
                isConnected = true;
                reconnectAttempts = 0;
                
                // Send welcome to owner
                setTimeout(async () => {
                    try {
                        if (config.ownerNumber && config.ownerNumber.length > 0) {
                            const ownerNum = config.ownerNumber[0].replace(/[^0-9]/g, '');
                            if (ownerNum.length >= 10) {
                                const ownerJid = ownerNum + '@s.whatsapp.net';
                                await conn.sendMessage(ownerJid, { 
                                    text: "✅ *INSIDIOUS BOT CONNECTED SUCCESSFULLY!*\n\n" +
                                          "🤖 Status: ONLINE\n" +
                                          "⚡ Ready to serve!\n" +
                                          "📅 " + new Date().toLocaleString()
                                });
                            }
                        }
                    } catch (e) {}
                }, 3000);
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnected = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    reconnectAttempts++;
                    const delay = Math.min(5000 * reconnectAttempts, 30000);
                    console.log(fancy(`🔄 Reconnecting in ${delay/1000}s... (Attempt ${reconnectAttempts})`));
                    setTimeout(() => {
                        if (!isConnected) startBot();
                    }, delay);
                } else {
                    console.log(fancy("🚫 Logged out. Please delete session folder and restart."));
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);

        // Message handler
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

        console.log(fancy("🚀 Bot initialized"));
        
    } catch (error) {
        console.error("Start error:", error.message);
        setTimeout(() => startBot(), 10000);
    }
}

// Anzisha bot
startBot();

// ========== FUNCTION KUSUBIRI CONNECTION ==========
async function waitForConnection(timeout = 30000) {
    const startTime = Date.now();
    while (!isConnected) {
        if (Date.now() - startTime > timeout) {
            throw new Error("Timeout waiting for WhatsApp connection");
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return globalConn;
}

// ========== ENDPOINT: /pair – Inatumika na HTML yako ==========
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) {
            return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
        }
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) {
            return res.json({ error: "Invalid number. Use country code + number" });
        }
        
        console.log(fancy(`⏳ Waiting for connection to pair ${cleanNum}...`));
        
        // Subiri connection iwe tayari (max 45 seconds)
        let waited = 0;
        while (!isConnected && waited < 45) {
            await new Promise(r => setTimeout(r, 1000));
            waited++;
        }
        
        if (!isConnected) {
            return res.json({ error: "Bot is still connecting. Please wait 45 seconds and try again." });
        }
        
        // Omba pairing code
        console.log(fancy(`🔑 Generating 8-digit code for: ${cleanNum}`));
        const code = await globalConn.requestPairingCode(cleanNum);
        
        // Rudisha code – HTML yako inatarajia hii
        res.json({ 
            code: code
        });
        
    } catch (err) {
        console.error("Pairing error:", err.message);
        res.json({ error: "Failed to generate code: " + err.message });
    }
});

// ========== ENDPOINT: /api/stats – HTML yako inaitafuta ==========
app.get('/api/stats', (req, res) => {
    res.json({
        uptime: Date.now() - botStartTime,
        connected: isConnected,
        status: isConnected ? 'online' : 'connecting'
    });
});

// ========== ENDPOINT: /status – Kwa ajili ya kuangalia ==========
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        uptime: Date.now() - botStartTime
    });
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        connected: isConnected,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ========== KEEP ALIVE PING ==========
setInterval(() => {
    fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, 5 * 60 * 1000);

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`📊 Status: http://localhost:${PORT}/status`));
    console.log(fancy(`👑 Developer: STANYTZ`));
    console.log(fancy(`✅ Bot is starting... Please wait 30-60 seconds for connection`));
});

module.exports = app;