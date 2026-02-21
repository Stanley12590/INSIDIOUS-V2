const express = require('express');
const { default: makeWASocket, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

// ==================== HANDLER ====================
const handler = require('./handler');

// ✅ **FANCY FUNCTION**
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const fancyMap = {
            a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
            j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
            s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
            A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
            J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
            S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
        };
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            result += fancyMap[char] || char;
        }
        return result;
    } catch (e) {
        return text;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ **MONGODB AUTH SCHEMA & CONNECTION**
const AuthSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    id: { type: String, required: true },
    data: { type: String, required: true }
});
const AuthDB = mongoose.models.AuthDB || mongoose.model('AuthDB', AuthSchema);

console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(async () => {
    console.log(fancy("✅ MongoDB Connected"));
    
    // 🔥 AUTO-RESTORE SESSIONS (Inawasha bot zote zilizosaviwa ukirestart)
    const savedSessions = await AuthDB.distinct('sessionId');
    if (savedSessions.length > 0) {
        console.log(fancy(`🔄 Found ${savedSessions.length} saved sessions in MongoDB. Restoring...`));
        for (const sessionId of savedSessions) {
            startBot(sessionId);
        }
    }
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED"));
    console.log(fancy("💡 Error: " + err.message));
});

// ✅ **CUSTOM MONGODB AUTH FUNCTION** (Inaokoa Sessions zisipotee)
async function useMongoDBAuthState(sessionId) {
    const writeData = async (data, id) => {
        const stringified = JSON.stringify(data, BufferJSON.replacer);
        await AuthDB.updateOne({ sessionId, id }, { data: stringified }, { upsert: true });
    };
    const readData = async (id) => {
        const doc = await AuthDB.findOne({ sessionId, id });
        return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
    };
    const removeData = async (id) => {
        await AuthDB.deleteOne({ sessionId, id });
    };

    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) tasks.push(writeData(value, key));
                            else tasks.push(removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

// ✅ **MIDDLEWARE & PUBLIC FOLDER**
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

// ✅ **SIMPLE ROUTES**
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ✅ **GLOBAL VARIABLES (Imewekwa kwenye MAP kuruhusu Multi-Bots)**
const globalConns = new Map(); 
let botStartTime = Date.now();

// ✅ **LOAD CONFIG**
let config = {};
try {
    config = require('./config');
    console.log(fancy("📋 Config loaded"));
} catch (error) {
    console.log(fancy("❌ Config file error, using defaults"));
    config = {
        prefix: '.', ownerNumber: ['255000000000'], botName: 'INSIDIOUS',
        workMode: 'public', botImage: 'https://files.catbox.moe/f3c07u.jpg'
    };
}

// ✅ **MAIN BOT FUNCTION (Imeboreshwa kupokea sessionId)**
async function startBot(sessionId = 'default') {
    try {
        console.log(fancy(`🚀 Starting INSIDIOUS for session: ${sessionId}...`));
        
        // Tunatumia MongoDB Auth badala ya File System Auth
        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
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
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true
        });

        // Store connection based on sessionId to support multiple bots
        globalConns.set(sessionId, conn);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy(`👹 INSIDIOUS [${sessionId}]: THE LAST KEY ACTIVATED`));
                
                let botName = conn.user?.name || "INSIDIOUS";
                let botNumber = conn.user?.id ? conn.user.id.split(':')[0] : "Unknown";
                const botSecret = handler.getBotId ? handler.getBotId() : 'Unknown';
                const pairedCount = globalConns.size; // Kuhesabu bots zilizounganishwa
                
                try {
                    if (handler && typeof handler.init === 'function') {
                        await handler.init(conn);
                    }
                } catch (e) {
                    console.error(fancy("❌ Handler init error:"), e.message);
                }
                
                // Welcome Message (Inatuma kwa owner wa bot hiyo)
                setTimeout(async () => {
                    try {
                        let targetJid = `${botNumber}@s.whatsapp.net`; // Default itume kwa aliye-link
                        if (config.ownerNumber && config.ownerNumber.length > 0 && sessionId === 'default') {
                            targetJid = config.ownerNumber[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                        }
                        
                        const welcomeMsg = `╭─── • 🥀 • ───╮\n   INSIDIOUS: THE LAST KEY\n╰─── • 🥀 • ───╯\n\n✅ *Bot Connected Successfully!*\n🤖 *Name:* ${botName}\n📞 *Number:* ${botNumber}\n\n⚡ *Status:* ONLINE & ACTIVE\n👑 *Developer:* STANYTZ`;
                        
                        await conn.sendMessage(targetJid, { 
                            image: { url: config.botImage || "https://files.catbox.moe/f3c07u.jpg" },
                            caption: welcomeMsg
                        });
                        console.log(fancy(`✅ Welcome message sent for ${botNumber}`));
                    } catch (e) {}
                }, 3000);
            }
            
            if (connection === 'close') {
                console.log(fancy(`🔌 Connection closed for [${sessionId}]`));
                globalConns.delete(sessionId);
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log(fancy(`🔄 Restarting bot [${sessionId}] in 5 seconds...`));
                    setTimeout(() => startBot(sessionId), 5000);
                } else {
                    console.log(fancy(`🚫 ${sessionId} Logged out. Data will be removed.`));
                    await AuthDB.deleteMany({ sessionId }); // Delete sessions if logged out
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('messages.upsert', async (m) => {
            try { if (handler && typeof handler === 'function') await handler(conn, m); } catch (e) {}
        });

        conn.ev.on('group-participants.update', async (update) => {
            try { if (handler && handler.handleGroupUpdate) await handler.handleGroupUpdate(conn, update); } catch (e) {}
        });

        conn.ev.on('call', async (call) => {
            try { if (handler && handler.handleCall) await handler.handleCall(conn, call); } catch (e) {}
        });

        return conn; // Return conn ili Pairing Endpoint iweze kuitumia
        
    } catch (error) {
        console.error("Start error:", error.message);
        setTimeout(() => startBot(sessionId), 10000);
    }
}

// Start default bot if needed (optional)
// startBot('default');

// ==================== HTTP ENDPOINTS ====================

// ✅ **PAIRING ENDPOINT (Sasa inatengeneza connection mpya bila kuua ya kwanza)**
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ success: false, error: "Provide number! Example: /pair?num=255123456789" });
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) return res.json({ success: false, error: "Invalid number." });
        
        console.log(fancy(`🔑 Generating 8-digit code for: ${cleanNum}`));
        
        // Tunawasha bot maalumu kwa ajili ya hii namba tu (Session mpya)
        const newConn = await startBot(cleanNum);
        
        // Omba code kwenye hii connection mpya, sio global
        const code = await Promise.race([
            newConn.requestPairingCode(cleanNum),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout - no response')), 30000))
        ]);
        
        res.json({ success: true, code: code, message: `8-digit pairing code: ${code}` });
    } catch (err) {
        console.error("Pairing error:", err.message);
        res.json({ success: false, error: "Failed: " + err.message });
    }
});

// ✅ **UNPAIR ENDPOINT**
app.get('/unpair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ success: false, error: "Provide number!" });
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        await AuthDB.deleteMany({ sessionId: cleanNum }); // Futa data zake MongoDB
        
        // Logout ukiwa online
        if (globalConns.has(cleanNum)) {
            const conn = globalConns.get(cleanNum);
            conn.logout();
            globalConns.delete(cleanNum);
        }
        res.json({ success: true, message: `Number ${cleanNum} unpaired successfully` });
    } catch (err) {
        res.json({ success: false, error: "Failed: " + err.message });
    }
});

// ✅ **HEALTH CHECK**
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    res.json({
        status: 'healthy',
        activeBots: globalConns.size,
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ✅ **BOT INFO ENDPOINT**
app.get('/botinfo', (req, res) => {
    res.json({
        success: true,
        activeBots: globalConns.size,
        connected: globalConns.size > 0,
        uptime: Date.now() - botStartTime
    });
});

// ✅ **START SERVER**
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 8-digit Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
});

module.exports = app;