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
    const fancyMap = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
    return text.split('').map(c => fancyMap[c.toLowerCase()] || c).join('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MONGODB SCHEMA
const AuthSchema = new mongoose.Schema({ sessionId: String, id: String, data: String });
const AuthDB = mongoose.models.AuthDB || mongoose.model('AuthDB', AuthSchema);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI).then(async () => {
    console.log(fancy("✅ MongoDB Connected"));
    const savedSessions = await AuthDB.distinct('sessionId');
    for (const sessionId of savedSessions) {
        if (sessionId !== 'temp_pairing') startBot(sessionId);
    }
});

// ✅ SESSION MANAGER
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
                        if (type === 'app-state-sync-key' && value) value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
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

const globalConns = new Map();

async function startBot(sessionId) {
    try {
        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome"), // Browser iwe tofauti kidogo ili isigongane
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0, // Muhimu kwa Railway kuzuia timeout ya haraka
            keepAliveIntervalMs: 10000
        });

        globalConns.set(sessionId, conn);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(fancy(`✅ Bot Online: ${sessionId}`));
                // Ujumbe wa karibu
                try {
                    await conn.sendMessage(conn.user.id, { text: fancy("insidious bot connected successfully!") });
                } catch (e) {}
            }
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    setTimeout(() => startBot(sessionId), 5000);
                } else {
                    await AuthDB.deleteMany({ sessionId });
                    globalConns.delete(sessionId);
                }
            }
        });

        conn.ev.on('creds.update', saveCreds);
        conn.ev.on('messages.upsert', async (m) => { if (handler) handler(conn, m); });

        return conn;
    } catch (e) {
        console.error("Error starting bot:", e);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// ✅ PAIRING ENDPOINT - FIXED
app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "No number provided" });
    const cleanNum = num.replace(/[^0-9]/g, '');

    try {
        // 1. Futa kama kuna session ya zamani ya namba hii ili kuzuia mgongano
        await AuthDB.deleteMany({ sessionId: cleanNum });
        
        // 2. Anzisha socket mpya kwa ajili ya namba hii
        const { state, saveCreds } = await useMongoDBAuthState(cleanNum);
        const sock = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
            logger: pino({ level: "silent" }),
            browser: Browsers.ubuntu("Chrome")
        });

        // 3. Subiri sekunde 3 ili connection itulie kabla ya kuomba code
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(cleanNum);
                res.json({ success: true, code: code });
                
                // Endelea kusikiliza mabadiliko ya creds ili kuokoa session ikifanikiwa
                sock.ev.on('creds.update', saveCreds);
                sock.ev.on('connection.update', (up) => {
                    if (up.connection === 'open') {
                        console.log(fancy(`✅ New Pairing Successful: ${cleanNum}`));
                        globalConns.set(cleanNum, sock);
                    }
                });
            } catch (err) {
                console.log("Pairing error:", err);
                if (!res.headersSent) res.json({ error: "Failed to get code. Try again." });
            }
        }, 3000);

    } catch (e) {
        res.json({ error: "Internal Server Error" });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'running', bots: globalConns.size });
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));