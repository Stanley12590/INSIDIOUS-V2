const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const axios = require("axios");
const cron = require("node-cron");
const config = require("./config");
const { fancy } = require("./lib/font");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE CONNECTION - SILENT MODE
console.log(fancy("🔗 Connecting to database..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 10000,
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

// API ENDPOINTS
app.get('/api/stats', async (req, res) => {
    try {
        const { User, Group, ChannelSubscriber, Settings } = require('./database/models');
        const users = await User.countDocuments();
        const groups = await Group.countDocuments();
        const subscribers = await ChannelSubscriber.countDocuments();
        const settings = await Settings.findOne();
        
        res.json({
            success: true,
            users,
            groups,
            subscribers,
            settings: settings || {},
            uptime: process.uptime(),
            version: config.version || "2.1.1",
            botName: config.botName || "INSIDIOUS"
        });
    } catch (error) {
        console.error("Stats error:", error);
        res.json({ 
            success: false, 
            error: "Database not available", 
            stats: { users: 0, groups: 0, subscribers: 0 } 
        });
    }
});

app.get('/api/features', async (req, res) => {
    try {
        const { Settings } = require('./database/models');
        const settings = await Settings.findOne() || {};
        res.json({
            success: true,
            features: {
                antilink: settings.antilink !== undefined ? settings.antilink : true,
                antiporn: settings.antiporn !== undefined ? settings.antiporn : true,
                antiscam: settings.antiscam !== undefined ? settings.antiscam : true,
                antimedia: settings.antimedia !== undefined ? settings.antimedia : false,
                antitag: settings.antitag !== undefined ? settings.antitag : true,
                antiviewonce: settings.antiviewonce !== undefined ? settings.antiviewonce : true,
                antidelete: settings.antidelete !== undefined ? settings.antidelete : true,
                sleepingMode: settings.sleepingMode !== undefined ? settings.sleepingMode : false,
                welcomeGoodbye: settings.welcomeGoodbye !== undefined ? settings.welcomeGoodbye : true,
                activeMembers: settings.activeMembers !== undefined ? settings.activeMembers : false,
                autoblockCountry: settings.autoblockCountry !== undefined ? settings.autoblockCountry : false,
                chatbot: settings.chatbot !== undefined ? settings.chatbot : true,
                autoStatus: settings.autoStatus !== undefined ? settings.autoStatus : true,
                autoRead: settings.autoRead !== undefined ? settings.autoRead : true,
                autoReact: settings.autoReact !== undefined ? settings.autoReact : true,
                autoSave: settings.autoSave !== undefined ? settings.autoSave : false,
                autoBio: settings.autoBio !== undefined ? settings.autoBio : true,
                anticall: settings.anticall !== undefined ? settings.anticall : true,
                downloadStatus: settings.downloadStatus !== undefined ? settings.downloadStatus : false,
                antispam: settings.antispam !== undefined ? settings.antispam : true,
                antibug: settings.antibug !== undefined ? settings.antibug : true,
                autoStatusReply: settings.autoStatusReply !== undefined ? settings.autoStatusReply : true
            }
        });
    } catch (error) {
        console.error("Features error:", error);
        res.json({ success: false, error: "Settings not available", features: {} });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { feature, value } = req.body;
        const { Settings } = require('./database/models');
        
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings();
        }
        
        // Convert value to boolean if needed
        let finalValue = value;
        if (value === 'true' || value === 'false') {
            finalValue = value === 'true';
        } else if (value === 'on' || value === 'off') {
            finalValue = value === 'on';
        }
        
        if (settings[feature] !== undefined) {
            settings[feature] = finalValue;
            settings.updatedAt = new Date();
            await settings.save();
            res.json({ success: true, message: `${feature} updated to ${value}` });
        } else {
            res.json({ success: false, message: `Feature ${feature} not found` });
        }
    } catch (error) {
        console.error("Settings update error:", error);
        res.json({ success: false, error: error.message });
    }
});

let globalConn = null;
let qrCode = null;

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
            const { connection, qr } = update;
            
            // Handle QR Code
            if (qr) {
                qrCode = qr;
                console.log(fancy("📱 QR Code generated"));
                
                // Display QR in console without using printQRInTerminal
                const qrTerminal = require("qrcode-terminal");
                qrTerminal.generate(qr, { small: true });
            }
            
            if (connection === 'open') {
                console.log(fancy("👹 INSIDIOUS V2.1.1 ACTIVATED"));
                console.log(fancy("✅ Bot is now online"));
                
                // Save session to database
                try {
                    const { User } = require('./database/models');
                    const botUser = await User.findOne({ jid: conn.user.id });
                    if (!botUser) {
                        await new User({
                            jid: conn.user.id,
                            name: conn.user.name,
                            isActive: true,
                            linkedAt: new Date()
                        }).save();
                    }
                } catch (e) {
                    console.log("Session save error:", e.message);
                }
                
                // CONNECTION MESSAGE TO OWNER
                try {
                    const uniqueEmoji = ["👑", "🌟", "✨", "⚡", "🔥", "💫"];
                    const randomEmoji = uniqueEmoji[Math.floor(Math.random() * uniqueEmoji.length)];
                    
                    const connectionMsg = `
╭─── • 🥀 • ───╮
   ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1
╰─── • 🥀 • ───╯

✅ *Bot Connected Successfully!*
${randomEmoji} Session: Active
👤 User: ${conn.user?.name || "Insidious"}
🆔 ID: ${conn.user?.id?.split(':')[0] || "Unknown"}
🕐 Time: ${new Date().toLocaleTimeString()}

⚙️ *Features Ready:*
🤖 AI Chatbot: ✅
👁️ Anti-Viewonce: ✅
🗑️ Anti-Delete: ✅
📱 Status AI: ✅
💕 Human Emotions: ✅

${fancy("Ready with love & feelings... ❤️")}`;
                    
                    // Send to bot owner
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
                const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log(fancy("🔄 Reconnecting in 5 seconds..."));
                    setTimeout(start, 5000);
                }
            }
        });

        // PAIRING ENDPOINT - ALLOWS MULTIPLE PAIRING
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
                
                console.log(fancy(`🔑 Generating pairing code for: ${cleanNum}`));
                const code = await conn.requestPairingCode(cleanNum);
                
                res.json({ 
                    success: true, 
                    code: code,
                    message: `Pairing code: ${code}`,
                    instructions: "Open WhatsApp → Settings → Linked Devices → Link a Device → Enter Code"
                });
                
            } catch (err) {
                console.error("Pairing error:", err.message);
                
                // Check if it's a duplicate pairing error
                if (err.message.includes("already paired") || err.message.includes("duplicate")) {
                    res.json({ 
                        success: true, 
                        message: "Number already paired with bot",
                        alreadyPaired: true 
                    });
                } else {
                    res.json({ success: false, error: "Failed: " + err.message });
                }
            }
        });

        // QR CODE ENDPOINT
        app.get('/qr', async (req, res) => {
            if (qrCode) {
                res.json({ success: true, qr: qrCode });
            } else {
                res.json({ success: false, message: "No QR available. Bot might be connected." });
            }
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

        console.log(fancy("🚀 AI Bot ready for pairing"));
        
    } catch (error) {
        console.error("Start error:", error.message);
        setTimeout(start, 10000);
    }
}

// START BOT
start();

// START SERVER
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 Pairing Endpoint: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
});

// Keep alive for render
const keepAlive = () => {
    const http = require('http');
    setInterval(() => {
        http.get(`http://localhost:${PORT}`);
    }, 300000); // Ping every 5 minutes
};

keepAlive();

module.exports = app;
