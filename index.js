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
const activeSockets = {}; 

// ✅ FANCY FUNCTION
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
    };
    return text.split('').map(c => map[c.toLowerCase()] || c).join('');
}

// ✅ MONGODB CONNECTION
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
    restoreSessions(); // 🔥 STEP 1: RESTORE SESSIONS ON STARTUP
})
.catch(err => console.log("MongoDB Error: " + err.message));

app.use(express.json());

// ==================== SESSION MANAGEMENT ====================

async function startBot(sessionId, savedCreds = null) {
    const sessionDir = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // 🔥 Essential for Railway: Restore creds from DB to Disk
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
        browser: Browsers.ubuntu("Chrome"), // Stable for Railway
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    activeSockets[sessionId] = conn;

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(fancy(`✅ Connected: ${sessionId}`));
            await Session.findOneAndUpdate({ sessionId }, { isActive: true }, { upsert: true });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            delete activeSockets[sessionId];
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(fancy(`❌ Logged out: ${sessionId}`));
                await Session.deleteOne({ sessionId });
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
            }
        }
    });

    conn.ev.on('creds.update', async () => {
        await saveCreds();
        const creds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json')));
        await Session.findOneAndUpdate({ sessionId }, { creds, isActive: true }, { upsert: true });
    });

    conn.ev.on('messages.upsert', async (m) => {
        if (handler) await handler(conn, m);
    });
}

// 🔥 FUNCTION TO RESTORE ALL BOTS WHEN SERVER REBOOTS
async function restoreSessions() {
    try {
        const savedSessions = await Session.find({ isActive: true });
        console.log(fancy(`🔄 Restoring ${savedSessions.length} sessions...`));
        for (const s of savedSessions) {
            await startBot(s.sessionId, s.creds);
            await delay(5000); // Prevent Railway from crashing due to high CPU
        }
    } catch (e) {
        console.log("Restore error: " + e.message);
    }
}

// ==================== PAIRING ROUTE (FIXED) ====================

app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "Example: /pair?num=255xxxx" });

    const cleanNum = num.replace(/[^0-9]/g, '');
    // Unique ID to prevent "Connection Closed" conflicts
    const pairId = `pair_${Date.now()}`; 
    const pairPath = path.join(__dirname, 'sessions', pairId);
    
    if (!fs.existsSync(pairPath)) fs.mkdirSync(pairPath, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(pairPath);
        const { version } = await fetchLatestBaileysVersion();

        const tempConn = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome")
        });

        // 🔥 FIX: Wait for the socket to stabilize before asking for code
        setTimeout(async () => {
            try {
                const code = await tempConn.requestPairingCode(cleanNum);
                if (!res.headersSent) res.json({ success: true, code });
            } catch (err) {
                if (!res.headersSent) res.json({ error: "Failed to generate code. Try again." });
            }
        }, 8000); // 8 seconds delay ensures connection is ready

        tempConn.ev.on('creds.update', saveCreds);
        tempConn.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                const botId = tempConn.user.id.split(':')[0];
                const creds = JSON.parse(fs.readFileSync(path.join(pairPath, 'creds.json')));
                
                // Save to permanent DB
                await Session.findOneAndUpdate({ sessionId: botId }, { creds, isActive: true }, { upsert: true });
                
                // Start the actual bot
                startBot(botId, creds);
                
                // Cleanup temp pairing files
                setTimeout(() => fs.rmSync(pairPath, { recursive: true }), 5000);
            }
        });

    } catch (e) {
        if (!res.headersSent) res.json({ error: "Server busy" });
    }
});

// ==================== START SERVER ====================

app.get('/', (req, res) => res.send("Insidious Bot Manager Running"));

app.listen(PORT, '0.0.0.0', () => {
    console.log(fancy(`🌐 Server Online on Port ${PORT}`));
});