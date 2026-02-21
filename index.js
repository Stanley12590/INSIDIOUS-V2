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

// ✅ FANCY FUNCTION
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;
const activeBots = {}; // Holds all live connections

// ✅ MONGODB CONNECTION
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
    restoreSessions(); // 🔥 AUTO-RESTORE ALL SESSIONS ON STARTUP
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED: " + err.message));
    process.exit(1);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== CORE BOT LOGIC ====================

async function startBot(sessionId, isExisting = true) {
    try {
        const sessionPath = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        // If restoring from DB, write the creds file first
        if (isExisting) {
            const sessionData = await Session.findOne({ sessionId });
            if (sessionData && sessionData.creds) {
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(sessionData.creds));
            } else {
                return; // Nothing to restore
            }
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

        activeBots[sessionId] = conn;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy(`✅ Session [${sessionId}] is ONLINE`));
                await Session.findOneAndUpdate({ sessionId }, { isActive: true }, { upsert: true });
                
                // Initialize handler for this connection
                if (handler && typeof handler.init === 'function') {
                    await handler.init(conn);
                }
            }
            
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(fancy(`🔌 Connection closed for [${sessionId}]. Reason: ${reason}`));
                
                // If logged out, delete session permanently
                if (reason === DisconnectReason.loggedOut) {
                    await Session.deleteOne({ sessionId });
                    delete activeBots[sessionId];
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
                } else {
                    // We don't auto-reconnect here to follow your request.
                    // It will stay offline until the server restarts or is manually triggered.
                    delete activeBots[sessionId];
                }
            }
        });

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const creds = JSON.parse(fs.readFileSync(path.join(sessionPath, 'creds.json')));
            await Session.findOneAndUpdate(
                { sessionId }, 
                { creds, lastActive: new Date(), isActive: true }, 
                { upsert: true }
            );
        });

        conn.ev.on('messages.upsert', async (m) => {
            if (handler) await handler(conn, m);
        });

        return conn;

    } catch (error) {
        console.error(`Error starting session ${sessionId}:`, error.message);
    }
}

// ✅ FUNCTION TO RESTORE ALL SAVED SESSIONS FROM DB
async function restoreSessions() {
    console.log(fancy("📂 Restoring all active sessions from Database..."));
    try {
        const sessions = await Session.find({ isActive: true });
        console.log(fancy(`Found ${sessions.length} sessions to restore.`));
        
        for (const session of sessions) {
            await startBot(session.sessionId, true);
            await delay(3000); // Small delay to prevent CPU spike
        }
    } catch (e) {
        console.error("Restore Error:", e);
    }
}

// ==================== HTTP ENDPOINTS ====================

// ✅ PREMIUM PAIRING ENDPOINT (Fixes "Connection Closed" issues)
app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ success: false, error: "Number is required" });
    
    const cleanNum = num.replace(/[^0-9]/g, '');
    const tempId = `temp_${cleanNum}`;

    console.log(fancy(`🔑 Pairing request for: ${cleanNum}`));

    try {
        // Create a dedicated temporary session for pairing
        const sessionPath = path.join(__dirname, 'sessions', tempId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const tempConn = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari")
        });

        // Wait for socket to be ready to request code
        await delay(5000); 
        const code = await tempConn.requestPairingCode(cleanNum);
        
        res.json({ success: true, code });

        // Monitor for successful login
        tempConn.ev.on('creds.update', async () => {
            await saveCreds();
            if (tempConn.authState.creds.me) {
                const finalId = tempConn.authState.creds.me.id.split(':')[0];
                const creds = JSON.parse(fs.readFileSync(path.join(sessionPath, 'creds.json')));
                
                // Save to MongoDB as a permanent session
                await Session.findOneAndUpdate({ sessionId: finalId }, { creds, isActive: true }, { upsert: true });
                
                // Start as a full bot and cleanup temp
                startBot(finalId, true);
                console.log(fancy(`✅ New session paired: ${finalId}`));
            }
        });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ✅ HEALTH & STATUS
app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        active_connections: Object.keys(activeBots).length,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ✅ START SERVER
app.listen(PORT, () => {
    console.log(fancy(`🌐 Server running on http://localhost:${PORT}`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📦 Storage: MongoDB Full-Sync"));
});

module.exports = app;