const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');
const crypto = require('crypto');
const { Boom } = require('@hapi/boom');

// ✅ **FANCY FUNCTION**
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

// ✅ **MONGODB SESSION SCHEMA**
const SessionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});
const Session = mongoose.model('Session', SessionSchema);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

// ✅ **DATABASE CONNECTION**
mongoose.connect(MONGODB_URI).then(() => console.log(fancy("✅ MongoDB Connected for Always-Online Session")));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let globalConn = null;
let isConnected = false;

// ✅ **LOAD HANDLER**
let handler = null;
try { handler = require('./handler'); } catch (e) {}

// ==================== SESSION SYNC LOGIC ====================

// 1. Kujivuta kutoka DB kwenda kwenye Folder
async function loadSessionFromDB() {
    try {
        const session = await Session.findOne({ id: 'insidious_v2' });
        if (session) {
            const sessionPath = path.join(__dirname, 'insidious_session');
            if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), session.data);
            console.log(fancy("📡 Session restored from MongoDB Atlas"));
        }
    } catch (e) { console.log("Session recovery failed"); }
}

// 2. Kuhifadhi kutoka kwenye Folder kwenda DB
async function saveSessionToDB() {
    try {
        const credsRelPath = path.join(__dirname, 'insidious_session', 'creds.json');
        if (fs.existsSync(credsRelPath)) {
            const data = fs.readFileSync(credsRelPath, 'utf8');
            await Session.findOneAndUpdate(
                { id: 'insidious_v2' },
                { data: data },
                { upsert: true }
            );
        }
    } catch (e) { console.log("DB Session save failed"); }
}

// ==================== MAIN BOT ====================
async function startBot() {
    await loadSessionFromDB(); // Rudisha session kabla ya kuwaka

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
            browser: Browsers.macOS("Desktop"),
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            printQRInTerminal: false
        });

        globalConn = conn;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(fancy("✅ insidious connected & session secured"));
                isConnected = true;
                if (handler && typeof handler.init === 'function') await handler.init(conn);
            }
            if (connection === 'close') {
                isConnected = false;
                let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    setTimeout(startBot, 3000);
                } else {
                    console.log(fancy("❌ Logged out. Clearing session..."));
                    await Session.deleteOne({ id: 'insidious_v2' });
                }
            }
        });

        conn.ev.on('creds.update', async () => {
            await saveCreds(); // Save locally
            await saveSessionToDB(); // Backup to MongoDB for Always-Online
        });

        conn.ev.on('messages.upsert', async (m) => {
            try { if (handler) await handler(conn, m); } catch (e) {}
        });

    } catch (error) {
        setTimeout(startBot, 5000);
    }
}
startBot();

// ==================== PAIRING PROCESS ====================
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
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false
    });

    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            tempConn.end();
            reject(new Error("Timeout"));
        }, 30000);

        try {
            await new Promise(r => setTimeout(r, 4000));
            if (!tempConn.authState.creds.registered) {
                const code = await tempConn.requestPairingCode(number);
                clearTimeout(timeout);
                setTimeout(() => tempConn.end(), 5000);
                resolve(code);
            }
        } catch (err) {
            clearTimeout(timeout);
            tempConn.end();
            reject(err);
        }
    });
}

// ==================== ENDPOINTS ====================
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "No number" });
        const cleanNum = num.replace(/[^0-9]/g, '');
        const code = await requestPairingCode(cleanNum);
        res.json({ success: true, code: code });
    } catch (err) {
        res.status(500).json({ error: "Server Busy" });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: isConnected ? 'online' : 'reconnecting' });
});

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

app.listen(PORT, () => {
    console.log(fancy(`🌐 insidious v2 server live on ${PORT}`));
});