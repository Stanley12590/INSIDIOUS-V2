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
const { Session } = require('./database/models'); // Your Session model
const handler = require('./handler');

// ✅ FANCY TEXT FUNCTION
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
const activeSockets = {}; // Tracks live bots

// ✅ MONGODB CONNECTION
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
    restoreAllSessions(); // 🔥 Auto-restore all sessions on server start
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED: " + err.message));
});

app.use(express.json());

// ==================== CORE BOT ENGINE ====================

async function startBot(sessionId, savedCreds = null) {
    try {
        const sessionDir = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        // If restoring from DB, write creds to file
        if (savedCreds) {
            fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(savedCreds));
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
            syncFullHistory: false
        });

        activeSockets[sessionId] = conn;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(fancy(`✅ Bot Online: ${sessionId}`));
                await Session.findOneAndUpdate({ sessionId }, { isActive: true }, { upsert: true });
                
                if (handler && typeof handler.init === 'function') {
                    await handler.init(conn);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(fancy(`🔌 Connection closed for ${sessionId}. Reason: ${reason}`));
                
                delete activeSockets[sessionId];

                if (reason === DisconnectReason.loggedOut) {
                    await Session.deleteOne({ sessionId });
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
                }
                // Note: No auto-reconnect loop here. 
                // It will restore only when the server restarts or re-paired.
            }
        });

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const latestCreds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json')));
            await Session.findOneAndUpdate({ sessionId }, { creds: latestCreds, isActive: true }, { upsert: true });
        });

        conn.ev.on('messages.upsert', async (m) => {
            if (handler) await handler(conn, m);
        });

    } catch (e) {
        console.error(`Error starting session ${sessionId}:`, e.message);
    }
}

// ✅ RESTORE ALL SESSIONS FROM DATABASE
async function restoreAllSessions() {
    console.log(fancy("📂 Restoring active sessions from MongoDB..."));
    try {
        const sessions = await Session.find({ isActive: true });
        for (const s of sessions) {
            await startBot(s.sessionId, s.creds);
            await delay(3000); // Prevent startup overload
        }
        console.log(fancy(`✅ Restored ${sessions.length} sessions.`));
    } catch (e) {
        console.error("Restore failed:", e.message);
    }
}

// ==================== HTTP ENDPOINTS ====================

// ✅ FIXED PAIRING ENDPOINT (No more "Connection Closed")
app.get('/pair', async (req, res) => {
    const number = req.query.num;
    if (!number) return res.json({ error: "Please provide a phone number." });

    const cleanNum = number.replace(/[^0-9]/g, '');
    
    // Create a totally unique ID for this pairing attempt to avoid conflicts
    const tempSessionId = `pair_${cleanNum}_${Date.now()}`;
    const tempPath = path.join(__dirname, 'sessions', tempSessionId);
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempPath);
        const { version } = await fetchLatestBaileysVersion();

        const tempConn = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari")
        });

        // Use a timeout to ensure socket is ready before asking for code
        let codeSent = false;
        
        tempConn.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (!codeSent) {
                await delay(5000); // Wait for socket to stabilize
                try {
                    const code = await tempConn.requestPairingCode(cleanNum);
                    codeSent = true;
                    res.json({ success: true, code });
                } catch (pairErr) {
                    if (!res.headersSent) res.json({ error: "Pairing failed: " + pairErr.message });
                }
            }

            if (connection === 'open') {
                const finalId = tempConn.user.id.split(':')[0];
                console.log(fancy(`✅ New Pairing Successful: ${finalId}`));

                // Move temp creds to permanent DB
                const creds = JSON.parse(fs.readFileSync(path.join(tempPath, 'creds.json')));
                await Session.findOneAndUpdate({ sessionId: finalId }, { creds, isActive: true }, { upsert: true });

                // Start the actual bot session
                startBot(finalId, creds);

                // Cleanup temp folder
                setTimeout(() => {
                    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { recursive: true });
                }, 10000);
            }
        });

        tempConn.ev.on('creds.update', saveCreds);

    } catch (e) {
        if (!res.headersSent) res.json({ error: "System Error: " + e.message });
    }
});

// ✅ STATUS CHECK
app.get('/status', (req, res) => {
    res.json({
        uptime: process.uptime(),
        online_bots: Object.keys(activeSockets).length,
        mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
    });
});

// START SERVER
app.listen(PORT, () => {
    console.log(fancy(`🌐 Server running on http://localhost:${PORT}`));
    console.log(fancy(`🔗 Link Account: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
});

module.exports = app;