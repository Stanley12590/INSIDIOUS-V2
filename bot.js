const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { Session } = require('./database/models');
const handler = require('./handler');

// ✅ MONGODB CONNECTION
console.log("🔗 Connecting to MongoDB...");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => {
    console.log("❌ MongoDB Connection FAILED: " + err.message);
    process.exit(1);
});

// ✅ SESSION HELPERS
async function saveSessionToMongoDB(number, creds, keys = {}) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { sessionId: sanitizedNumber },
            { $set: { creds, keys, number: sanitizedNumber, lastActive: new Date(), isActive: true } },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error("Error saving session:", error.message);
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ sessionId: sanitizedNumber });
        if (session && session.creds) return { creds: session.creds, keys: session.keys || {} };
        return null;
    } catch (error) {
        console.error("Error loading session:", error.message);
        return null;
    }
}

// ✅ MAIN BOT – HAKUNA AUTO-RECONNECT
async function startBot() {
    try {
        console.log("🚀 Starting INSIDIOUS...");
        const botNumber = 'insidious_main';
        const existingSession = await loadSessionFromMongoDB(botNumber);
        const sessionPath = path.join(__dirname, 'insidious_session');
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
        
        if (existingSession) {
            console.log("📦 Loading session from MongoDB...");
            fs.writeFileSync(
                path.join(sessionPath, 'creds.json'),
                JSON.stringify(existingSession.creds, null, 2)
            );
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
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true
        });

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log("✅ Bot is now online");
                
                let botName = conn.user?.name || "INSIDIOUS";
                let botNumber = conn.user?.id?.split(':')[0] || "Unknown";
                console.log(`🤖 Name: ${botName}`);
                console.log(`📞 Number: ${botNumber}`);

                try {
                    if (handler && typeof handler.init === 'function') {
                        await handler.init(conn);
                    }
                } catch (e) {
                    console.error("Handler init error:", e.message);
                }

                if (conn.authState?.creds) {
                    await saveSessionToMongoDB(botNumber, conn.authState.creds, {});
                }
            }
            
            if (connection === 'close') {
                console.log("🔌 Connection closed");
                // 🔥 HAKUNA AUTO-RECONNECT – TUNAACHA TU
            }
        });

        conn.ev.on('creds.update', async () => {
            if (conn.authState?.creds) {
                await saveCreds();
                await saveSessionToMongoDB('insidious_main', conn.authState.creds, {});
            }
        });

        conn.ev.on('messages.upsert', async (m) => {
            try {
                if (handler && typeof handler === 'function') {
                    await handler(conn, m);
                }
            } catch (error) {
                console.error("Message handler error:", error.message);
            }
        });

        conn.ev.on('group-participants.update', async (update) => {
            try {
                if (handler && handler.handleGroupUpdate) {
                    await handler.handleGroupUpdate(conn, update);
                }
            } catch (error) {
                console.error("Group update error:", error.message);
            }
        });

        conn.ev.on('call', async (call) => {
            try {
                if (handler && handler.handleCall) {
                    await handler.handleCall(conn, call);
                }
            } catch (error) {
                console.error("Call handler error:", error.message);
            }
        });

        console.log("🚀 Bot ready – inaendelea 24/7");
        
    } catch (error) {
        console.error("Start error:", error.message);
    }
}

startBot();

// Keep process alive
process.stdin.resume();