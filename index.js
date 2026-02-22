const express = require('express');
const { default: makeWASocket, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

const handler = require('./handler');

// ✅ FANCY FUNCTION
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const fancyMap = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
    };
    return text.split('').map(c => fancyMap[c.toLowerCase()] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MONGODB SCHEMA (for multiple sessions)
const AuthSchema = new mongoose.Schema({ sessionId: String, id: String, data: String });
const AuthDB = mongoose.models.AuthDB || mongoose.model('AuthDB', AuthSchema);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI).then(async () => {
    console.log(fancy("✅ MongoDB Connected"));
    // On startup, load all existing sessions (that have valid creds) and start bots
    const sessions = await AuthDB.distinct('sessionId');
    for (const sessionId of sessions) {
        // Skip temporary pairing placeholders if any
        if (sessionId && sessionId !== 'temp_pairing') {
            // Check if this session has 'creds' entry (meaning it's a real session)
            const credsDoc = await AuthDB.findOne({ sessionId, id: 'creds' });
            if (credsDoc) {
                console.log(fancy(`🔄 Restoring session: ${sessionId}`));
                startBot(sessionId);
            }
        }
    }
});

// ✅ SESSION MANAGER (MongoDB) – supports multiple sessions
async function useMongoDBAuthState(sessionId) {
    const writeData = async (data, id) => {
        const stringified = JSON.stringify(data, BufferJSON.replacer);
        await AuthDB.updateOne({ sessionId, id }, { data: stringified }, { upsert: true });
    };
    const readData = async (id) => {
        const doc = await AuthDB.findOne({ sessionId, id });
        return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
    };
    const removeData = async (id) => await AuthDB.deleteOne({ sessionId, id });

    let creds = await readData('creds') || initAuthCreds();
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
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) await writeData(value, `${category}-${id}`);
                            else await removeData(`${category}-${id}`);
                        }
                    }
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

const globalConns = new Map(); // sessionId -> WASocket

// ✅ MAIN BOT STARTER (for a given sessionId)
async function startBot(sessionId) {
    // If already running, close it (avoid duplicates)
    if (globalConns.has(sessionId)) {
        try {
            globalConns.get(sessionId).end();
        } catch (e) {}
        globalConns.delete(sessionId);
    }

    try {
        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome"),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false
        });

        globalConns.set(sessionId, conn);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(fancy(`✅ Bot Online: ${sessionId}`));
                try {
                    if (conn.user && conn.user.id) {
                        await conn.sendMessage(conn.user.id, { text: fancy("insidious bot connected successfully!") });
                    }
                } catch (e) {
                    console.error("Startup message error:", e);
                }
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                if (isLoggedOut) {
                    console.log(fancy(`🔴 Logged out: ${sessionId}`));
                    await AuthDB.deleteMany({ sessionId });
                    globalConns.delete(sessionId);
                } else {
                    // ❌ NO AUTO-RECONNECT – just log and remove from active map
                    console.log(fancy(`🔌 Connection closed for ${sessionId} (no restart)`));
                    globalConns.delete(sessionId);
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => { if (handler) handler(conn, m); });

        return conn;
    } catch (e) {
        console.error(`Error starting bot ${sessionId}:`, e);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// ✅ PAIRING ENDPOINT – creates a new session
app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "No number provided" });

    const cleanNum = num.replace(/[^0-9]/g, '');
    if (cleanNum.length < 10 || cleanNum.length > 15) {
        return res.json({ error: "Invalid number – must be 10-15 digits" });
    }

    const sessionId = cleanNum; // Use the number as session ID

    try {
        // Clear any existing session for this number (start fresh)
        await AuthDB.deleteMany({ sessionId });

        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const tempConn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome"),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false
        });

        let codeSent = false;
        let paired = false;
        let responseSent = false;

        const timeout = setTimeout(() => {
            if (!paired && !responseSent) {
                responseSent = true;
                tempConn.end();
                res.json({ error: "Pairing timeout – please try again." });
            }
        }, 60000);

        tempConn.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open' && !codeSent && !paired) {
                try {
                    const code = await tempConn.requestPairingCode(cleanNum);
                    codeSent = true;

                    if (!responseSent) {
                        responseSent = true;
                        res.json({ success: true, code: code });
                        console.log(`📱 Pairing code sent for ${cleanNum}`);
                    }
                } catch (err) {
                    console.error("Pairing code request failed:", err);
                    if (!responseSent) {
                        responseSent = true;
                        clearTimeout(timeout);
                        res.json({ error: "Failed to get code – please try again." });
                    }
                    tempConn.end();
                }
            }
        });

        tempConn.ev.on('creds.update', async () => {
            if (!paired) {
                paired = true;
                clearTimeout(timeout);

                await saveCreds();
                console.log(`✅ Phone paired successfully for ${cleanNum}`);

                // Start the main bot for this session
                startBot(sessionId);

                setTimeout(() => {
                    tempConn.end();
                    console.log(`🎉 Pairing complete for ${sessionId}`);
                }, 2000);
            }
        });

        tempConn.ev.on('connection.update', (update) => {
            if (update.connection === 'close' && !paired && !responseSent) {
                clearTimeout(timeout);
                responseSent = true;
                res.json({ error: "Connection closed unexpectedly" });
            }
        });

    } catch (e) {
        console.error("Pairing error:", e);
        res.json({ error: "Internal Server Error" });
    }
});

// ✅ OPTIONAL: Unpair endpoint (removes session from DB and stops bot)
app.get('/unpair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "No number provided" });

    const cleanNum = num.replace(/[^0-9]/g, '');
    if (cleanNum.length < 10 || cleanNum.length > 15) {
        return res.json({ error: "Invalid number – must be 10-15 digits" });
    }

    const sessionId = cleanNum;
    try {
        if (globalConns.has(sessionId)) {
            globalConns.get(sessionId).end();
            globalConns.delete(sessionId);
        }
        await AuthDB.deleteMany({ sessionId });
        res.json({ success: true, message: `Session ${sessionId} removed` });
    } catch (e) {
        res.json({ error: e.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'running', 
        bots: globalConns.size,
        sessions: Array.from(globalConns.keys())
    });
});

const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

// Optional graceful shutdown (if you want to close connections properly)
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down...');
    for (const [sessionId, conn] of globalConns.entries()) {
        try {
            conn.end();
            console.log(`❌ Closed: ${sessionId}`);
        } catch (e) {}
    }
    await mongoose.disconnect();
    process.exit(0);
});