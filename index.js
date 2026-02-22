const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs-extra');
const crypto = require('crypto');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ FANCY FONT ENGINE
function fancy(text) {
    const map = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
    return text.split('').map(c => map[c.toLowerCase()] || c).join('');
}

// ✅ MONGODB SESSION SCHEMA (Persistence)
const SessionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // 'main_session'
    data: { type: String, required: true } // JSON String of creds
});
const SessionModel = mongoose.model('Session', SessionSchema);

const MONGODB_URI = process.env.MONGODB_URI || "WEKA_MONGODB_URL_HAPA";

// ✅ DATABASE CONNECTION
mongoose.connect(MONGODB_URI).then(() => console.log(fancy("✅ Database Secured"))).catch(e => console.log("DB Error"));

app.use(express.static(path.join(__dirname, 'public')));

// ==================== SYNC DB & LOCAL ====================
async function loadSessionFromDB() {
    try {
        const doc = await SessionModel.findOne({ id: 'main_session' });
        if (doc) {
            const sessionPath = path.join(__dirname, 'session');
            if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), doc.data);
            console.log(fancy("📡 Session Restored from MongoDB"));
        }
    } catch (e) { console.log("Session Load Error"); }
}

async function saveSessionToDB() {
    try {
        const credsPath = path.join(__dirname, 'session', 'creds.json');
        if (fs.existsSync(credsPath)) {
            const data = fs.readFileSync(credsPath, 'utf8');
            await SessionModel.findOneAndUpdate({ id: 'main_session' }, { data }, { upsert: true });
        }
    } catch (e) { console.log("Session Save Error"); }
}

// ==================== MAIN BOT ENGINE ====================
async function startInsidious() {
    await loadSessionFromDB(); // Kabla ya kuwaka, vuta kodi kutoka DB

    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
        },
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false, // Zima history kuzuia kuloadi sana
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    conn.ev.on('creds.update', async () => {
        await saveCreds();
        await saveSessionToDB(); // Kila creds zikibadilika, backup kwenye DB
    });

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(fancy("✅ Insidious V2 is Online and Secure"));
        }
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(fancy("⚠️ Connection lost. Reconnecting..."));
                startInsidious(); // Reconnect automatically
            } else {
                console.log(fancy("❌ Logged out. Delete session in DB."));
                await SessionModel.deleteOne({ id: 'main_session' });
            }
        }
    });

    conn.ev.on('messages.upsert', async (m) => {
        // Hapa ndipo unapo-link handler.js yako
        require('./handler')(conn, m);
    });

    return conn;
}

// ==================== PAIRING ENDPOINT (MULTI-USER) ====================
app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "Provide Number" });
    num = num.replace(/[^0-9]/g, '');

    // Kila ombi la pairing linatengeneza 'temp' session yake ya kipekee
    const tempId = crypto.randomBytes(4).toString('hex');
    const tempDir = path.join(__dirname, `temp_${tempId}`);

    try {
        const { state } = await useMultiFileAuthState(tempDir);
        const tempConn = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false
        });

        setTimeout(async () => {
            if (!tempConn.authState.creds.registered) {
                const code = await tempConn.requestPairingCode(num);
                res.json({ code: code });
                
                // Baada ya sekunde 30, futa folder la muda kuzuia uchafu
                setTimeout(() => {
                    tempConn.end();
                    fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
                }, 30000);
            }
        }, 3000);

    } catch (err) {
        res.status(500).json({ error: "Pairing Busy. Try in 1 minute." });
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Server Live on ${PORT}`));
    startInsidious(); // Washa main bot yenyewe
});