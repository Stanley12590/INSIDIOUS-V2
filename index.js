const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const { fancy } = require("./lib/font");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE CONNECTION
console.log(fancy("🔗 Connecting to database..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log(fancy("✅ Database Connected"));
})
.catch((err) => {
    console.log(fancy("⚠️ Running without database..."));
});

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SIMPLE ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

let globalConn = null;
let isConnected = false;
let reconnectCount = 0;
const MAX_RECONNECT = 20;

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { 
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) 
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            printQRInTerminal: false
        });

        globalConn = conn;

        // CONNECTION HANDLER
        conn.ev.on('connection.update', async (update) => {
            const { connection } = update;
            
            if (connection === 'open') {
                console.log(fancy("👹 INSIDIOUS: THE LAST KEY ACTIVATED"));
                console.log(fancy("✅ Bot is now online"));
                isConnected = true;
                reconnectCount = 0;
                
                // CONNECTION MESSAGE
                try {
                    const config = require('./config');
                    const connectionMsg = `
╭─── • 🥀 • ───╮
   INSIDIOUS: THE LAST KEY
╰─── • 🥀 • ───╯

✅ *Bot Connected Successfully!*
👤 User: ${conn.user?.name || "Insidious"}
🆔 ID: ${conn.user?.id?.split(':')[0] || "Unknown"}
🕐 Time: ${new Date().toLocaleTimeString()}
🔗 Pairing: 8-digit code

⚙️ *30+ Features Active:*
🛡️ All Anti Features: ✅
🤖 AI Chatbot: ✅
👁️ Anti View Once: ✅
🗑️ Anti Delete: ✅
📼 Auto Recording: ✅
⌨️ Auto Typing: ✅
👀 Auto Read: ✅
❤️ Auto React: ✅
🎉 Welcome/Goodbye: ✅
📞 Anti Call: ✅
🚫 Anti Spam: ✅
🐛 Anti Bug: ✅

${fancy("All systems operational... 🚀")}`;
                    
                    // Send to owner
                    if (config.ownerNumber && config.ownerNumber.length > 0) {
                        const ownerJid = config.ownerNumber[0] + '@s.whatsapp.net';
                        await conn.sendMessage(ownerJid, { text: connectionMsg });
                    }
                    
                } catch (e) {
                    console.log("Connection message error:", e.message);
                }
                
                // INITIALIZE HANDLER
                try {
                    const handler = require('./handler');
                    if (handler.init) {
                        await handler.init(conn);
                    }
                } catch (e) {
                    console.error("Handler init error:", e.message);
                }
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnected = false;
                const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect && reconnectCount < MAX_RECONNECT) {
                    reconnectCount++;
                    const delayTime = Math.min(1500 * reconnectCount, 15000);
                    console.log(fancy(`🔄 Reconnecting in ${delayTime/1000}s... (Attempt ${reconnectCount}/${MAX_RECONNECT})`));
                    setTimeout(start, delayTime);
                }
            }
        });

        // PAIRING ENDPOINT - 8-DIGIT CODE
        app.get('/pair', async (req, res) => {
            try {
                let num = req.query.num;
                if (!num) {
                    return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
                }
                
                const cleanNum = num.replace(/[^0-9]/g, '');
                if (cleanNum.length < 10) {
                    return res.json({ error: "Invalid number" });
                }
                
                console.log(fancy(`🔑 Generating 8-digit code for: ${cleanNum}`));
                
                try {
                    const code = await conn.requestPairingCode(cleanNum);
                    res.json({ 
                        success: true, 
                        code: code,
                        message: `8-digit pairing code: ${code}`,
                        instructions: "Open WhatsApp → Settings → Linked Devices → Link a Device → Enter 8-digit Code"
                    });
                } catch (err) {
                    if (err.message.includes("already paired")) {
                        res.json({ 
                            success: true, 
                            message: "Number already paired",
                            note: "Multiple devices supported"
                        });
                    } else {
                        throw err;
                    }
                }
                
            } catch (err) {
                console.error("Pairing error:", err.message);
                res.json({ success: false, error: "Failed: " + err.message });
            }
        });

        // HEALTH CHECK
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                connected: isConnected,
                uptime: process.uptime()
            });
        });

        // CREDENTIALS UPDATE
        conn.ev.on('creds.update', saveCreds);

        // MESSAGE HANDLER
        conn.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message) return;

            try {
                require('./handler')(conn, m);
            } catch (e) {
                console.error("Handler error:", e.message);
            }
        });

        // GROUP UPDATES
        conn.ev.on('group-participants.update', async (update) => {
            try {
                const handler = require('./handler');
                if (handler.handleGroupUpdate) {
                    await handler.handleGroupUpdate(conn, update);
                }
            } catch (e) {
                console.error("Group update error:", e.message);
            }
        });

        console.log(fancy("🚀 INSIDIOUS ready for 8-digit pairing"));
        
    } catch (error) {
        console.error("Start error:", error.message);
        if (reconnectCount < MAX_RECONNECT) {
            reconnectCount++;
            const delayTime = Math.min(2000 * reconnectCount, 20000);
            console.log(fancy(`🔄 Restarting in ${delayTime/1000}s...`));
            setTimeout(start, delayTime);
        }
    }
}

// START BOT
start();

// START SERVER
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 8-digit Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`❤️ Health: http://localhost:${PORT}/health`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
    console.log(fancy("🙏 Special Thanks: REDTECH"));
});

// KEEP ALIVE
setInterval(() => {
    const http = require('http');
    http.get(`http://localhost:${PORT}/health`, (res) => {
        if (res.statusCode === 200) {
            console.log(fancy(`❤️ Keep-alive ping successful`));
        }
    }).on('error', () => {});
}, 180000); // 3 minutes

// AUTO RECONNECT
setInterval(() => {
    if (!isConnected && reconnectCount < MAX_RECONNECT) {
        console.log(fancy("🔌 Attempting auto-reconnect..."));
        start();
    }
}, 45000000); // 45 seconds

module.exports = app;
