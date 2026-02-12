const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs-extra');

// ==================== LOAD HANDLER (kwa bot ID na pairing) ====================
let handler = {};
try {
    handler = require('./handler');
} catch (e) {
    console.log('❌ Handler not found, some features may be missing');
}

// ==================== FANCY FUNCTION ====================
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const fancyMap = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    };
    return text.split('').map(c => fancyMap[c] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MONGODB (OPTIONAL) ====================
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED"));
    console.log(fancy("💡 Error: " + err.message));
});

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
fs.ensureDirSync(path.join(__dirname, 'public'));

// ==================== WEB ROUTES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ==================== GLOBAL VARIABLES ====================
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

// ==================== LOAD CONFIG ====================
let config = {};
try {
    config = require('./config');
    console.log(fancy("📋 Config loaded"));
} catch (error) {
    console.log(fancy("❌ Config file error, using defaults"));
    config = {
        prefix: '.',
        ownerNumber: ['255000000000'],
        ownerName: 'STANY',
        botName: 'INSIDIOUS',
        workMode: 'public',
        newsletterJid: '120363404317544295@newsletter',
        botImage: 'https://files.catbox.moe/insidious-alive.jpg',
        menuImage: 'https://files.catbox.moe/irqrap.jpg',
        maxCoOwners: 2
    };
}

// ==================== BOT START – NO AUTO-RECONNECT ====================
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
            logger: pino({ level: "silent" }), // HAKUNA QR WARNINGS
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true
        });

        globalConn = conn;
        botStartTime = Date.now();

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy("👹 INSIDIOUS: THE LAST KEY ACTIVATED"));
                console.log(fancy("✅ Bot is now online"));
                isConnected = true;
                
                const botName = conn.user?.name || config.botName;
                const botNumber = conn.user?.id?.split(':')[0] || 'Unknown';
                console.log(fancy(`🤖 Name: ${botName}`));
                console.log(fancy(`📞 Number: ${botNumber}`));
                
                // ✅ INIT HANDLER (WELCOME, AUTO-FOLLOW, PAIRING SYSTEM)
                try {
                    if (handler && typeof handler.init === 'function') {
                        await handler.init(conn);
                    }
                } catch (e) {
                    console.error(fancy("❌ Handler init error:"), e.message);
                }
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnected = false;
                // ✅ HAKUNA AUTO-RECONNECT – HOSTING ITARUDISHA BOT
                console.log(fancy("⚡ Bot stopped – waiting for hosting restart"));
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => {
            try {
                if (handler && typeof handler === 'function') await handler(conn, m);
            } catch (error) {
                console.error("Message handler error:", error.message);
            }
        });
        conn.ev.on('group-participants.update', async (update) => {
            try {
                if (handler && handler.handleGroupUpdate) await handler.handleGroupUpdate(conn, update);
            } catch (error) {
                console.error("Group update error:", error.message);
            }
        });

        console.log(fancy("🚀 Bot ready – Web pairing active"));
    } catch (error) {
        console.error("Start error:", error.message);
        // ✅ HAKUNA AUTO-RECONNECT – TUNAACHA TU
    }
}
startBot();

// ==================== 🌐 WEB PAIRING ENDPOINTS ====================

// ✅ GET 8-DIGIT PAIRING CODE
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) {
            return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
        }
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) {
            return res.json({ error: "Invalid number (min 10 digits)" });
        }
        if (!globalConn) {
            return res.json({ error: "Bot not connected. Please wait." });
        }
        console.log(fancy(`🔑 Web pairing requested for: ${cleanNum}`));
        const code = await globalConn.requestPairingCode(cleanNum);
        
        // Optional: save to handler if available
        if (handler && handler.pairNumber) {
            await handler.pairNumber(cleanNum).catch(() => {});
        }
        
        res.json({
            success: true,
            code: code,
            formattedCode: code.match(/.{1,4}/g)?.join('-') || code,
            message: `8-digit pairing code: ${code}`
        });
    } catch (err) {
        console.error("Pairing error:", err.message);
        res.json({ success: false, error: "Failed: " + err.message });
    }
});

// ✅ UNPAIR ENDPOINT
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
        if (config.ownerNumber?.includes(cleanNum)) {
            return res.json({ error: "Cannot unpair deployer's number" });
        }
        if (handler && handler.unpairNumber) {
            const success = await handler.unpairNumber(cleanNum);
            if (success) {
                res.json({ success: true, message: `Number ${cleanNum} unpaired successfully` });
            } else {
                res.json({ success: false, error: "Number not paired" });
            }
        } else {
            res.json({ success: true, message: `Number ${cleanNum} unpaired successfully (simulated)` });
        }
    } catch (err) {
        console.error("Unpair error:", err.message);
        res.json({ success: false, error: "Failed: " + err.message });
    }
});

// ✅ PAIRED LIST ENDPOINT
app.get('/paired', (req, res) => {
    try {
        let deployer = config.ownerNumber || [];
        let coOwners = [];
        let botId = null;
        let maxCoOwners = config.maxCoOwners || 2;
        
        if (handler && handler.getPairedNumbers) {
            const all = handler.getPairedNumbers();
            coOwners = all.filter(n => !deployer.includes(n));
            botId = handler.getBotId ? handler.getBotId() : null;
        }
        
        res.json({
            botId: botId,
            deployer: deployer,
            coOwners: coOwners,
            count: coOwners.length,
            max: maxCoOwners
        });
    } catch (err) {
        console.error("Paired list error:", err.message);
        res.json({ error: "Failed to get paired list" });
    }
});

// ==================== 🌐 WEB UTILITY ENDPOINTS ====================

// ✅ HEALTH CHECK (KWA HOSTING)
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    res.json({
        status: 'healthy',
        connected: isConnected,
        uptime: `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m ${Math.floor(uptime%60)}s`,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ✅ BOT INFO
app.get('/botinfo', (req, res) => {
    if (!globalConn?.user) {
        return res.json({ 
            botName: config.botName,
            botNumber: 'Unknown',
            botId: handler?.getBotId ? handler.getBotId() : null,
            connected: false,
            uptime: Date.now() - botStartTime
        });
    }
    res.json({
        botName: globalConn.user?.name || config.botName,
        botNumber: globalConn.user?.id?.split(':')[0] || 'Unknown',
        botId: handler?.getBotId ? handler.getBotId() : null,
        connected: isConnected,
        uptime: Date.now() - botStartTime
    });
});

// ✅ KEEP-ALIVE (RENDER/RAILWAY)
app.get('/keep-alive', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        bot: config.botName || 'INSIDIOUS'
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 8-digit Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`🗑️  Unpair: http://localhost:${PORT}/unpair?num=255XXXXXXXXX`));
    console.log(fancy(`📋 Paired: http://localhost:${PORT}/paired`));
    console.log(fancy(`🤖 Bot Info: http://localhost:${PORT}/botinfo`));
    console.log(fancy(`❤️ Health: http://localhost:${PORT}/health`));
    console.log(fancy(`💓 Keep-alive: http://localhost:${PORT}/keep-alive`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
    console.log(fancy("✅ WEB PAIRING ACTIVE (8-digit code)"));
    console.log(fancy("⚡ NO AUTO-RECONNECT – BOT STOPS ON DISCONNECT"));
    console.log(fancy("🤖 HANDLER INTEGRATED"));
});

module.exports = app;