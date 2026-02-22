const express = require('express');
const {
  default: makeWASocket,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  initAuthCreds,
  BufferJSON
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const handler = require('./handler'); // Ensure this file exists and is properly set up

// ✅ FANCY FUNCTION: Custom text formatting
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
const PORT = process.env.PORT || 3000; // Use env variable or default to port 3000

// ✅ DATABASE Configuration
const AuthSchema = new mongoose.Schema({ sessionId: String, id: String, data: String });
const AuthDB = mongoose.models.AuthDB || mongoose.model('AuthDB', AuthSchema);

// ✅ Replace 'MONGODB_URI' with your environment variable (DO NOT HARD-CODE)
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set.');
  process.exit(1);
}

// Connect to the MongoDB atlas server
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true }).then(async () => {
  console.log(fancy("✅ MongoDB Connected"));
  const savedSessions = await AuthDB.distinct('sessionId');
  for (const session of savedSessions) {
    if (session !== 'temp_pairing') startBot(session); // Start existing sessions
  }
}).catch(err => {
  console.error(fancy("⚠️ Database connection failed:"));
  console.error(err);
  process.exit(1);
});

// Session Manager
async function useMongoDBAuthState(sessionId) {
  const writeData = async (data, id) => {
    const stringified = JSON.stringify(data, BufferJSON.replacer);
    await AuthDB.updateOne({ sessionId, id }, { sessionId, id, data: stringified }, { upsert: true });
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
            const value = await readData(`${type}-${id}`);
            data[id] = type === 'app-state-sync-key' && value
              ? require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value)
              : value;
          }));
          return data;
        },
        set: async (keys) => {
          for (const category in keys) {
            for (const id in keys[category]) {
              const value = keys[category][id];
              if (value) await writeData(value, `${category}-${id}`);
              else await removeData(`${category}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
}

const globalConns = new Map();

// Start the WhatsApp bot using session ID
async function startBot(sessionId) {
  try {
    const { state, saveCreds } = await useMongoDBAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      syncFullHistory: false,
      markOnlineOnConnect: true
    });

    globalConns.set(sessionId, conn);

    conn.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        console.log(fancy(`✅ Bot Online: ${sessionId}`));
        await conn.sendMessage(conn.user.id, { text: fancy("Bot connected successfully!") });
      } else if (connection === 'close' && lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log(fancy('⚠️ Reconnecting...'));
        setTimeout(() => startBot(sessionId), 5000);
      } else {
        console.log(fancy(`🔴 Logged out: ${sessionId}`));
        await AuthDB.deleteMany({ sessionId });
        globalConns.delete(sessionId);
      }
    });

    conn.ev.on('creds.update', saveCreds);
    if (handler) conn.ev.on('messages.upsert', async (msg) => await handler(conn, msg));

  } catch (error) {
    console.error(fancy(`❌ Error starting bot: ${error.message}`));
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// Pairing endpoint
app.get('/pair', async (req, res) => {
  const num = req.query.num;
  if (!num) return res.status(400).json({ error: "No number provided" });

  const cleanNum = num.replace(/[^0-9]/g, '');
  if (cleanNum.length < 10 || cleanNum.length > 15) return res.status(400).json({ error: "Invalid number. Must be 10-15 digits." });

  try {
    await AuthDB.deleteMany({ sessionId: cleanNum });

    const { state, saveCreds } = await useMongoDBAuthState(cleanNum);
    const { version } = await fetchLatestBaileysVersion();

    const tempConn = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
      browser: Browsers.macOS("Safari"),
    });

    let connectionOpen = false;
    const timeout = setTimeout(() => {
      if (!connectionOpen) res.status(408).json({ error: "Pairing timeout, try again" });
      tempConn.end();
    }, 60000);

    tempConn.ev.on('connection.update', async (update) => {
      if (update.connection === "open") {
        connectionOpen = true;
        const qrCode = await tempConn.generateQR(cleanNum); // Ensure `generateQR` is properly implemented
        res.status(200).json({ success: true, qrCode });
        tempConn.end();
      }
    });

    tempConn.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error("⚠️ Error during pairing:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: "running", bots: globalConns.size });
});

// Start the server
const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(fancy("\n🔄 Gracefully shutting down..."));
  for (const [sessionId, conn] of globalConns) {
    try {
      conn.end();
      console.log(fancy(`❌ Closed session ${sessionId}`));
    } catch (err) {
    }
  }
  await mongoose.disconnect();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on('unhandledRejection', (err) => {
  console.error("❌ Unhandled Rejection:", err);
});