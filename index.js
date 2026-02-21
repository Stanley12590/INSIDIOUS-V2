const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');
const { Session } = require('./database/models'); // 🔥 Session model

const handler = require('./handler');

// ✅ FANCY FUNCTION (KEPT ORIGINAL)
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', L: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MONGODB CONNECTION
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
    restoreSessions(); // 🔥 NEW: RESTORE ALL SESSIONS ON STARTUP
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED: " + err.message));
    process.exit(1);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

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
        workMode: 'public',
        botImage: 'https://files.catbox.moe/f3c07u.jpg',
        newsletterJid: '120363404317544295@newsletter'
    };
}

// ==================== SESSION HELPERS ====================
async function saveSessionToMongoDB(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { sessionId: sanitizedNumber },
            { $set: { creds, number: sanitizedNumber, lastActive: new Date(), isActive: true } },
            { upsert: true }
        );
    } catch (error) { console.error("Save Error:", error.message); }
}

// 🔥 NEW: FUNCTION TO WAKE UP ALL SAVED SESSIONS
async function restoreSessions() {
    try {
        const sessions = await Session.find({ isActive: true });
        console.log(fancy(`🔄 Restoring ${sessions.length} sessions...`));
        for (const session of sessions) {
            startBot(session.sessionId, session.creds);
            await delay(5000); // 5 sec gap to avoid crash
        }
    } catch (e) { console.error("Restore error:", e.message); }
}

// ==================== MAIN BOT ENGINE ====================
async function startBot(sessionId = 'insidious_main', savedCreds = null) {
    try {
        const sessionPath = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        // Restore creds from DB to Disk for Railway stability
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
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        globalConn = conn;
        botStartTime = Date.now();

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy(`✅ Bot Online: ${sessionId}`));
                isConnected = true;

                let botName = conn.user?.name || "INSIDIOUS";
                let botNumber = conn.user?.id?.split(':')[0] || "Unknown";
                const botSecret = handler.getBotId ? handler.getBotId() : 'Unknown';
                const pairedCount = handler.getPairedNumbers ? handler.getPairedNumbers().length : 0;

                if (handler && typeof handler.init === 'function') {
                    await handler.init(conn);
                }

                await saveSessionToMongoDB(sessionId, state.creds);

                // Owner welcome message
                setTimeout(async () => {
                    try {
                        const ownerNum = config.ownerNumber[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                        const welcomeMsg = `╭─── • 🥀 • ───╮\n   INSIDIOUS: THE LAST KEY\n╰─── • 🥀 • ───╯\n\n✅ *Bot Connected!*\n🤖 *Name:* ${botName}\n📞 *Number:* ${botNumber}\n⚡ *Status:* ONLINE`;
                        await conn.sendMessage(ownerNum, { image: { url: config.botImage }, caption: welcomeMsg });
                    } catch (e) {}
                }, 3000);
            }
            
            if (connection === 'close') {
                console.log(fancy(`🔌 Connection closed for ${sessionId}`));
                isConnected = false;
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    await Session.deleteOne({ sessionId });
                }
            }
        });

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const creds = JSON.parse(fs.readFileSync(path.join(sessionPath, 'creds.json')));
            await saveSessionToMongoDB(sessionId, creds);
        });

        conn.ev.on('messages.upsert', async (m) => {
            if (handler) await handler(conn, m);
        });

        conn.ev.on('group-participants.update', async (u) => {
            if (handler?.handleGroupUpdate) await handler.handleGroupUpdate(conn, u);
        });

        conn.ev.on('call', async (c) => {
            if (handler?.handleCall) await handler.handleCall(conn, c);
        });

    } catch (error) { console.error("Start error:", error.message); }
}

// ==================== HTTP ENDPOINTS ====================

// ✅ FIXED PAIRING ENDPOINT (STABILIZED)
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide number!" });
        const cleanNum = num.replace(/[^0-9]/g, '');

        // Create isolated pairing session to prevent "Connection Closed"
        const pairId = `pair_${cleanNum}`;
        const pairPath = path.join(__dirname, 'sessions', pairId);
        if (!fs.existsSync(pairPath)) fs.mkdirSync(pairPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(pairPath);
        const tempConn = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari")
        });

        // 🔥 FIX: Delay code request until socket is fully ready
        setTimeout(async () => {
            try {
                const code = await tempConn.requestPairingCode(cleanNum);
                if (!res.headersSent) res.json({ success: true, code });
            } catch (err) {
                if (!res.headersSent) res.json({ error: "Try again in 10 seconds" });
            }
        }, 10000); // 10 second stabilization

        tempConn.ev.on('creds.update', saveCreds);
        tempConn.ev.on('connection.update', async ({ connection }) => {
            if (connection === 'open') {
                const botId = tempConn.user.id.split(':')[0];
                const creds = JSON.parse(fs.readFileSync(path.join(pairPath, 'creds.json')));
                await saveSessionToMongoDB(botId, creds);
                startBot(botId, creds);
            }
        });

    } catch (err) { res.json({ error: err.message }); }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(fancy(`🌐 Server running on Port ${PORT}`));
});

module.exports = app;