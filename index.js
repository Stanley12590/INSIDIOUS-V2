const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    Browsers, 
    makeCacheableSignalKeyStore, 
    fetchLatestBaileysVersion, 
    DisconnectReason, 
    delay 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');
const { Session } = require('./database/models'); 
const handler = require('./handler');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ FANCY FUNCTION (Original)
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', p: 'ᴘ', Q: 'ǫ', R: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
}

// ✅ CONFIG LOAD
let config = {
    prefix: '.',
    ownerNumber: ['255000000000'],
    botName: 'INSIDIOUS',
    botImage: 'https://files.catbox.moe/f3c07u.jpg'
};
try { config = require('./config'); } catch (e) {}

// ✅ MONGODB CONNECTION
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, { 
    serverSelectionTimeoutMS: 60000, 
    socketTimeoutMS: 60000 
})
.then(async () => {
    console.log(fancy("✅ MongoDB Connected"));
    await restoreAllSessions(); // 🔥 AUTO-RESTORE
})
.catch(err => console.log("MongoDB Error: " + err.message));

app.use(express.json());

const activeSockets = {}; 

// ==================== CORE BOT ENGINE ====================

async function startBot(sessionId, savedCreds = null) {
    try {
        const sessionPath = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        // Restore creds to disk for Railway stability
        if (savedCreds) {
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(savedCreds));
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { 
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) 
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome"), // Stable browser for Railway
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0
        });

        activeSockets[sessionId] = conn;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(fancy(`✅ Bot Active: ${sessionId}`));
                await Session.findOneAndUpdate({ sessionId }, { isActive: true }, { upsert: true });
                
                if (handler?.init) await handler.init(conn);

                // Owner Notification
                try {
                    const ownerJid = config.ownerNumber[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    await conn.sendMessage(ownerJid, { 
                        image: { url: config.botImage },
                        caption: fancy(`✅ INSIDIOUS ONLINE\n🤖 Bot: ${conn.user.name || sessionId}\n📞 Number: ${conn.user.id.split(':')[0]}`)
                    });
                } catch (e) {}
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                delete activeSockets[sessionId];
                if (reason === DisconnectReason.loggedOut) {
                    await Session.deleteOne({ sessionId });
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
                }
            }
        });

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const currentCreds = JSON.parse(fs.readFileSync(path.join(sessionPath, 'creds.json')));
            await Session.findOneAndUpdate({ sessionId }, { creds: currentCreds, isActive: true }, { upsert: true });
        });

        conn.ev.on('messages.upsert', async (m) => { if (handler) await handler(conn, m); });
        conn.ev.on('group-participants.update', async (u) => { if (handler?.handleGroupUpdate) await handler.handleGroupUpdate(conn, u); });
        conn.ev.on('call', async (c) => { if (handler?.handleCall) await handler.handleCall(conn, c); });

    } catch (e) { console.log(`Error in session ${sessionId}: ${e.message}`); }
}

// 🔥 RESTORE ALL SESSIONS ON RESTART
async function restoreAllSessions() {
    try {
        const activeSessions = await Session.find({ isActive: true });
        console.log(fancy(`📂 Restoring ${activeSessions.length} active sessions...`));
        for (const s of activeSessions) {
            await startBot(s.sessionId, s.creds);
            await delay(7000); // 7s delay to prevent CPU overload on Railway
        }
    } catch (e) { console.log("Restore error: " + e.message); }
}

// ==================== PAIRING (FIXED "COULDN'T LINK") ====================

app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "Example: /pair?num=255712345678" });

    const cleanNum = num.replace(/[^0-9]/g, '');
    const tempId = `temp_pair_${cleanNum}_${Date.now()}`;
    const tempPath = path.join(__dirname, 'sessions', tempId);
    
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempPath);
        const { version } = await fetchLatestBaileysVersion();

        const tempConn = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome") // Native Chrome user-agent
        });

        // 🔥 CRITICAL FIX: Ensure socket is fully authenticated to the server
        let isResponded = false;
        
        setTimeout(async () => {
            try {
                if (isResponded) return;
                const code = await tempConn.requestPairingCode(cleanNum);
                if (!res.headersSent) {
                    isResponded = true;
                    res.json({ success: true, code });
                }
            } catch (err) {
                console.log("Pairing Code Error:", err.message);
                if (!res.headersSent) res.json({ error: "WhatsApp server is busy. Try again in 10 seconds." });
            }
        }, 12000); // Increased delay for Railway's network speed

        tempConn.ev.on('creds.update', saveCreds);
        tempConn.ev.on('connection.update', async ({ connection }) => {
            if (connection === 'open') {
                const finalId = tempConn.user.id.split(':')[0];
                const creds = JSON.parse(fs.readFileSync(path.join(tempPath, 'creds.json')));
                await Session.findOneAndUpdate({ sessionId: finalId }, { creds, isActive: true }, { upsert: true });
                
                startBot(finalId, creds); // Launch as full bot
                
                // Cleanup temp files
                setTimeout(() => { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { recursive: true }); }, 10000);
            }
        });

    } catch (e) { if (!res.headersSent) res.json({ error: "System busy, please refresh." }); }
});

// ==================== WEB SERVER ====================

app.get('/', (req, res) => res.send("INSIDIOUS MULTI-SESSION BOT IS RUNNING"));

app.listen(PORT, '0.0.0.0', () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy("👑 Developer: STANYTZ"));
});

module.exports = app;