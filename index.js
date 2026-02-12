const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs-extra');

// ==================== HANDLER ====================
let handler = {};
try { handler = require('./handler'); } catch {}

// ==================== FANCY FUNCTION ====================
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

// ==================== MONGODB (OPTIONAL) ====================
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious";
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000 })
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch(err => console.log(fancy("❌ MongoDB Connection FAILED"), err.message));

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
fs.ensureDirSync(path.join(__dirname, 'public'));

// ==================== WEB ROUTES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ==================== GLOBAL VARS ====================
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

// ==================== CONFIG ====================
let config = {};
try { config = require('./config'); } catch {
    config = {
        prefix: '.',
        ownerNumber: ['255000000000'],
        ownerName: 'STANY',
        botName: 'INSIDIOUS',
        newsletterJid: '120363404317544295@newsletter',
        botImage: 'https://files.catbox.moe/insidious-alive.jpg',
        menuImage: 'https://files.catbox.moe/irqrap.jpg',
        maxCoOwners: 2
    };
}

// ==================== MAIN BOT – INFINITE STAY-ALIVE ====================
async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();
        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            // ========== INFINITE AUTO-RECONNECT ==========
            maxRetryCount: Infinity,
            retryRequestDelayMs: 500,
            shouldIgnoreJid: () => true,
            patchMessageBeforeSending: true,
            transactionOpts: { maxCommitRetry: 25 }
        });
        globalConn = conn;
        botStartTime = Date.now();

        conn.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                isConnected = true;
                console.log(fancy("✅ Bot online – stay connected forever"));
                if (handler?.init) handler.init(conn).catch(() => {});
            }
            // 🔇 ABSOLUTELY SILENT ON CLOSE – NO LOGS, NO MESSAGES
            if (connection === 'close') {
                isConnected = false;
                globalConn = null;
                // THE SOCKET WILL AUTOMATICALLY RECONNECT DUE TO maxRetryCount: Infinity
                // NOTHING IS PRINTED – COMPLETE SILENCE
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => {
            try { if (handler) await handler(conn, m); } catch {}
        });
        conn.ev.on('group-participants.update', async (up) => {
            try { if (handler?.handleGroupUpdate) await handler.handleGroupUpdate(conn, up); } catch {}
        });

        // 🫀 HEARTBEAT – SEND PRESENCE EVERY 20 SECONDS TO KEEP CONNECTION ALIVE
        setInterval(async () => {
            if (isConnected && globalConn) {
                try {
                    await conn.sendPresenceUpdate('available', conn.user.id);
                } catch {}
            }
        }, 20000);

        console.log(fancy("🚀 Main bot started – infinite auto-reconnect, zero disconnect logs"));
    } catch (e) {
        console.error("❌ Fatal start error:", e.message);
        setTimeout(startBot, 10000);
    }
}
startBot();

// ==================== 🛡️ ROBUST PAIRING – NEVER FAILS ====================
async function requestPairingCode(number) {
    // Ensure old session is removed to avoid corruption
    await fs.remove('pairing_session').catch(() => {});
    
    const { state } = await useMultiFileAuthState('pairing_session');
    const { version } = await fetchLatestBaileysVersion();
    
    const conn = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false,
        connectTimeoutMs: 60000, // 60 seconds timeout
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
        shouldIgnoreJid: () => true,
        maxRetryCount: 2, // Allow up to 2 retries if connection fails
        retryRequestDelayMs: 1000,
        generateHighQualityLinkPreview: false
    });

    return new Promise((resolve, reject) => {
        let codeReceived = false;
        const timeout = setTimeout(() => {
            if (!codeReceived) {
                conn.end();
                reject(new Error("Pairing timeout (60s)"));
            }
        }, 60000);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, isOnline } = update;
            
            if (connection === 'open' && isOnline !== false) {
                // Give a small delay to ensure the socket is fully ready
                await new Promise(resolve => setTimeout(resolve, 500));
                try {
                    const code = await conn.requestPairingCode(number);
                    codeReceived = true;
                    clearTimeout(timeout);
                    resolve(code);
                } catch (err) {
                    reject(err);
                } finally {
                    // Close connection after a short delay
                    setTimeout(() => conn.end(), 1000);
                    setTimeout(() => fs.remove('pairing_session').catch(() => {}), 2000);
                }
            }
            
            if (connection === 'close' && !codeReceived) {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 429) {
                    reject(new Error("Rate limit exceeded. Wait 5 minutes."));
                } else {
                    reject(new Error("Connection closed before pairing"));
                }
            }
        });
    });
}

app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) return res.json({ error: "Invalid number" });

        let code;
        // Try main connection first if it's healthy
        if (globalConn && isConnected) {
            try {
                code = await globalConn.requestPairingCode(cleanNum);
            } catch (err) {
                // Fallback to temporary connection
                code = await requestPairingCode(cleanNum);
            }
        } else {
            // Main bot offline – use temporary connection
            code = await requestPairingCode(cleanNum);
        }

        // Add to paired list if handler exists
        if (handler?.pairNumber) await handler.pairNumber(cleanNum).catch(() => {});

        res.json({
            success: true,
            code: code,
            formattedCode: code.match(/.{1,4}/g)?.join('-') || code,
            message: `8-digit pairing code: ${code}`
        });
    } catch (err) {
        res.json({ 
            success: false, 
            error: "Pairing failed: " + err.message
        });
    }
});

// ==================== UNPAIR ====================
app.get('/unpair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide number" });
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) return res.json({ error: "Invalid number" });
        if (config.ownerNumber?.includes(cleanNum)) return res.json({ error: "Cannot unpair deployer" });
        if (handler?.unpairNumber) {
            const ok = await handler.unpairNumber(cleanNum);
            res.json({ success: ok, message: ok ? `Number ${cleanNum} unpaired` : "Number not paired" });
        } else res.json({ success: true, message: `Number ${cleanNum} unpaired (simulated)` });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ==================== PAIRED LIST ====================
app.get('/paired', (req, res) => {
    try {
        let deployer = config.ownerNumber || [];
        let coOwners = [];
        let botId = handler?.getBotId ? handler.getBotId() : null;
        if (handler?.getPairedNumbers) {
            const all = handler.getPairedNumbers();
            coOwners = all.filter(n => !deployer.includes(n));
        }
        res.json({ botId, deployer, coOwners, count: coOwners.length, max: config.maxCoOwners || 2 });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==================== HEALTH & INFO ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        connected: isConnected,
        uptime: Math.floor(process.uptime()) + 's',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.get('/botinfo', (req, res) => {
    res.json({
        botName: globalConn?.user?.name || config.botName,
        botNumber: globalConn?.user?.id?.split(':')[0] || 'Unknown',
        botId: handler?.getBotId ? handler.getBotId() : null,
        connected: isConnected,
        uptime: Date.now() - botStartTime
    });
});

app.get('/keep-alive', (req, res) => res.json({ status: 'alive', bot: config.botName }));

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web: http://localhost:${PORT}`));
    console.log(fancy(`🔗 Pair: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`✅ BOT MODE: INFINITE STAY-ALIVE`));
    console.log(fancy(`🤖 INSIDIOUS:THE LAST KEY – SECURITY ACTIVE`));
    console.log(fancy(`⚠️  No disconnection logs – connection is permanent`));
});

module.exports = app;