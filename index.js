const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs').promises;
const { existsSync, mkdirSync } = require('fs');
const crypto = require('crypto');
const { Boom } = require('@hapi/boom');

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
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000 })
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch(err => console.log(fancy("❌ MongoDB Error")));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let globalConn = null;
let isConnected = false;

// ✅ **LOAD HANDLER**
let handler = null;
try { handler = require('./handler'); } catch (e) {}

// ==================== MAIN BOT – STABLE CONNECTION ====================
async function startBot() {
    try {
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
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 20000,
            printQRInTerminal: false
        });

        globalConn = conn;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(fancy("✅ insidious is online and active"));
                isConnected = true;
                if (handler && typeof handler.init === 'function') await handler.init(conn);
            }
            if (connection === 'close') {
                isConnected = false;
                let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                
                if (reason === DisconnectReason.loggedOut) {
                    console.log(fancy("❌ Logged out. Delete session and pair again."));
                } else {
                    // Kwa makosa mengine yote, reconnect mara moja
                    setTimeout(startBot, 3000);
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => {
            try { if (handler) await handler(conn, m); } catch (e) {}
        });

    } catch (error) {
        setTimeout(startBot, 5000);
    }
}
startBot();

// ==================== PAIRING – FIXED MULTI-USER LEAK ====================
async function requestPairingCode(number) {
    const sessionId = crypto.randomBytes(4).toString('hex');
    const sessionDir = path.join(__dirname, `temp_pair_${sessionId}`);

    const { state } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const tempConn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
        },
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari")
    });

    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(async () => {
            tempConn.end();
            try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
            reject(new Error("Timeout"));
        }, 40000);

        try {
            // Wait for socket to be ready
            await new Promise(r => setTimeout(r, 4000));
            if (!tempConn.authState.creds.registered) {
                const code = await tempConn.requestPairingCode(number);
                clearTimeout(timeout);
                // Fungua socket ya muda haraka baada ya kupata kodi ili kuzuia mgongano
                setTimeout(() => tempConn.end(), 2000);
                setTimeout(async () => {
                    try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
                }, 5000);
                resolve(code);
            }
        } catch (err) {
            clearTimeout(timeout);
            tempConn.end();
            try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
            reject(err);
        }
    });
}

// ==================== ENDPOINTS ====================
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "No number provided" });
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        const code = await requestPairingCode(cleanNum);
        res.json({ success: true, code: code });
    } catch (err) {
        res.status(500).json({ success: false, error: "System Busy. Try again in 30 seconds." });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: isConnected ? 'active' : 'reconnecting', uptime: process.uptime() });
});

// ==================== CRASH PROTECTION ====================
process.on('uncaughtException', (err) => { console.log('Fixed error:', err.message); });
process.on('unhandledRejection', (reason) => { console.log('Fixed rejection'); });

app.listen(PORT, () => {
    console.log(fancy(`🌐 server live on port ${PORT}`));
});