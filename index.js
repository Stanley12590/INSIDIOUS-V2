const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs').promises;
const { existsSync, mkdirSync } = require('fs');
const crypto = require('crypto');

// ✅ **FANCY FUNCTION (USIGUSE)**
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ **MONGODB CONNECTION**
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch(err => console.log(fancy("❌ MongoDB Connection FAILED: " + err.message)));

// ✅ **MIDDLEWARE**
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!existsSync(path.join(__dirname, 'public'))) {
    mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

// ✅ **GLOBAL VARS**
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

// ✅ **LOAD CONFIG**
let config = {};
try { config = require('./config'); } catch {
    config = { prefix: '.', ownerNumber: ['255000000000'], botName: 'INSIDIOUS', workMode: 'public' };
}

// ✅ **LOAD HANDLER**
let handler = null;
try { handler = require('./handler'); } catch (e) { console.log("Handler not found yet"); }

// ==================== MAIN BOT – INFINITE STAY-ALIVE ====================
async function startBot() {
    try {
        console.log(fancy("🚀 Starting INSIDIOUS..."));
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            maxRetryCount: Infinity,
            retryRequestDelayMs: 1000
        });

        globalConn = conn;
        botStartTime = Date.now();

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(fancy("✅ Bot online and secure"));
                isConnected = true;
                if (handler && typeof handler.init === 'function') await handler.init(conn).catch(() => {});
            }
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(fancy(`⚠️ Connection closed. Reconnecting: ${shouldReconnect}`));
                if (shouldReconnect) setTimeout(startBot, 5000);
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => {
            try { if (handler) await handler(conn, m); } catch (e) { console.error("Handler error:", e.message); }
        });
        
        conn.ev.on('group-participants.update', async (up) => {
            try { if (handler && typeof handler.handleGroupUpdate === 'function') await handler.handleGroupUpdate(conn, up); } catch {}
        });

    } catch (error) {
        console.error("Start error:", error.message);
        setTimeout(startBot, 10000);
    }
}
startBot();

// ==================== ROBUST PAIRING – MULTI‑USER SUPPORT ====================
async function requestPairingCode(number) {
    // Unique ID for each pairing attempt to support multiple users simultaneously
    const sessionId = crypto.randomBytes(8).toString('hex');
    const sessionDir = path.join(__dirname, `temp_pair_${sessionId}`);

    try {
        const { state } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        if (!conn.authState.creds.registered) {
            // Give extra time for the socket to stabilize
            await new Promise(r => setTimeout(r, 3000));
            const code = await conn.requestPairingCode(number);
            
            // Auto cleanup after code is generated
            setTimeout(async () => {
                try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
            }, 10000);

            return code;
        }
    } catch (err) {
        try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
        throw err;
    }
}

// ==================== ENDPOINTS (SUPPORTING 24/7 API ACCESS) ====================
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide number! Example: /pair?num=255712345678" });
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        console.log(fancy(`🔑 Generating 8-digit code for: ${cleanNum}`));
        const code = await requestPairingCode(cleanNum);

        res.json({
            success: true,
            code: code,
            formattedCode: code.match(/.{1,4}/g)?.join('-') || code
        });
    } catch (err) {
        console.error("Pairing error:", err.message);
        res.status(500).json({ success: false, error: "Server busy or rate limited. Try again in 1 min." });
    }
});

app.get('/health', (req, res) => {
    const uptime = process.uptime();
    res.json({
        status: 'alive',
        bot_connected: isConnected,
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        db: mongoose.connection.readyState === 1 ? 'connected' : 'error'
    });
});

app.get('/botinfo', (req, res) => {
    if (!globalConn || !globalConn.user) return res.json({ error: "Main bot offline" });
    res.json({
        name: globalConn.user.name,
        jid: globalConn.user.id,
        mode: config.workMode
    });
});

// ==================== CRASH PROTECTION ====================
process.on('uncaughtException', (err) => {
    console.error('Caught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Dashboard: http://localhost:${PORT}`));
    console.log(fancy(`🤖 System: Always Active 24/7`));
});

module.exports = app;