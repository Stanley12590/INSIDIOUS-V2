const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const { fancy } = require("./lib/font");

// Load config with safe fallback
let config;
try {
    config = require("./config");
} catch (err) {
    console.log("⚠️ Config file not found, using defaults");
    config = {
        botName: "Insidious",
        developerName: "STANY",
        ownerNumber: ["255000000000"],
        version: "2.0",
        prefix: ".",
        sessionName: "insidious_session",
        port: 3000,
        host: "0.0.0.0",
        footer: "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ | Developer: STANY",
        autoBio: true,
        welcomeGoodbye: true,
        anticall: false,
        chatbot: true,
        autoRead: true,
        autoReact: true,
        autoSave: true,
        autoTyping: true,
        newsletterJid: "",
        mongodbUri: "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious"
    };
}

// Load handler if exists
let handler;
try {
    handler = require("./handler");
} catch (err) {
    console.log("⚠️ Handler file not found, using basic handler");
    handler = async () => {};
}

const app = express();
const PORT = config.port || 3000;

// MONGODB CONNECTION
let dbConnected = false;

async function initializeDatabase() {
    try {
        // Use clean MongoDB URI
        let mongodbUri = config.mongodbUri || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious";
        
        // Fix URI format
        if (!mongodbUri.includes('retryWrites')) {
            mongodbUri += '?retryWrites=true&w=majority';
        }
        
        console.log(fancy("🔗 Connecting to MongoDB..."));
        
        await mongoose.connect(mongodbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log(fancy("✅ MongoDB Connected Successfully!"));
        dbConnected = true;
        
        // Create simple schemas
        const userSchema = new mongoose.Schema({
            jid: String,
            name: String,
            deviceId: String,
            linkedAt: Date,
            isActive: Boolean,
            lastActive: Date,
            followingChannel: { type: Boolean, default: true }
        });
        
        const channelSubscriberSchema = new mongoose.Schema({
            jid: String,
            name: String,
            subscribedAt: Date,
            isActive: Boolean,
            source: String
        });
        
        mongoose.model('User', userSchema);
        mongoose.model('ChannelSubscriber', channelSubscriberSchema);
        
        return true;
        
    } catch (err) {
        console.error(fancy("❌ MongoDB Error:"), err.message);
        console.log(fancy("📦 Running without database"));
        return false;
    }
}

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WEB ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API ENDPOINTS
app.get('/api/stats', async (req, res) => {
    try {
        res.json({
            users: 0,
            groups: 0,
            subscribers: 0,
            uptime: process.uptime(),
            version: config.version,
            botName: config.botName,
            developer: config.developerName,
            dbConnected: dbConnected
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

let globalConn = null;
let connectionStatus = 'disconnected';
let isConnectionReady = false;
let botOwnerJid = null;

async function startInsidious() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: true,
            getMessage: async (key) => ({ conversation: "message deleted" })
        });

        globalConn = conn;

        // HANDLE CONNECTION WITHOUT QR CODE
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(fancy("👹 Bot connected successfully!"));
                connectionStatus = 'connected';
                isConnectionReady = true;
                
                // Set bot owner (person who linked)
                if (conn.user && conn.user.id) {
                    botOwnerJid = conn.user.id;
                    console.log(fancy(`👑 Bot Owner: ${botOwnerJid.split('@')[0]}`));
                    console.log(fancy(`👨‍💻 Developer: ${config.developerName}`));
                }
                
                try {
                    // Send SHORT welcome to owner
                    if (botOwnerJid) {
                        const welcomeMsg = `╔═══════════════════╗\n   🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}*\n╚═══════════════════╝\n\n✅ *Bot Online*\n⚡ *Fast Response*\n👑 *Owner:* ${botOwnerJid.split('@')[0]}\n👨‍💻 *Developer:* ${config.developerName}\n\n${fancy(config.footer)}`;
                        await conn.sendMessage(botOwnerJid, { text: welcomeMsg });
                    }
                    
                } catch (error) {
                    console.error("Welcome message error:", error.message);
                }
                
                // Start auto bio if enabled
                if (config.autoBio) {
                    setTimeout(() => updateBio(conn), 5000);
                }
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed"));
                isConnectionReady = false;
                connectionStatus = 'disconnected';
                
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(fancy("🔄 Reconnecting in 3 seconds..."));
                    setTimeout(startInsidious, 3000);
                }
            }
            
            if (connection === 'connecting') {
                connectionStatus = 'connecting';
                console.log(fancy("🔗 Connecting to WhatsApp..."));
            }
        });

        // CREDENTIALS UPDATE
        conn.ev.on('creds.update', saveCreds);

        // MESSAGE HANDLER
        conn.ev.on('messages.upsert', async (m) => {
            try {
                if (handler && typeof handler === 'function') {
                    await handler(conn, m);
                }
            } catch (error) {
                console.error("Handler error:", error.message);
            }
        });

        // GROUP PARTICIPANTS UPDATE - IMPROVED WELCOME/GOODBYE
        conn.ev.on('group-participants.update', async (anu) => {
            try {
                if (!config.welcomeGoodbye) return;
                
                const metadata = await conn.groupMetadata(anu.id);
                
                // Get group description and picture
                let groupDesc = "No description available";
                let groupPicture = null;
                
                try {
                    // Get group description
                    if (metadata.desc) {
                        groupDesc = metadata.desc.substring(0, 100);
                        if (metadata.desc.length > 100) groupDesc += "...";
                    }
                    
                    // Get group picture
                    try {
                        groupPicture = await conn.profilePictureUrl(anu.id, 'image');
                    } catch (picError) {
                        console.log("No group picture available");
                    }
                } catch (e) {
                    console.error("Error fetching group info:", e.message);
                }
                
                for (let num of anu.participants) {
                    const userNum = num.split("@")[0];
                    
                    if (anu.action == 'add') {
                        // BEAUTIFUL WELCOME MESSAGE
                        const welcomeMsg = `╭─── • 🎉 • ───╮\n   𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗡𝗘𝗪 𝗠𝗘𝗠𝗕𝗘𝗥\n╰─── • 🎉 • ───╯\n\n👋 *Hello* @${userNum}!\n\n📛 *Group:* ${metadata.subject}\n👥 *Members:* ${metadata.participants.length}\n📝 *Description:* ${groupDesc}\n\n⚡ *Rules:*\n• Respect everyone\n• No spam/advertising\n• Keep conversations clean\n\n🎯 *Enjoy your stay!*\n\n${fancy(config.footer)}`;
                        
                        // Send with group picture if available
                        if (groupPicture) {
                            await conn.sendMessage(anu.id, {
                                image: { url: groupPicture },
                                caption: welcomeMsg,
                                mentions: [num]
                            });
                        } else {
                            await conn.sendMessage(anu.id, { 
                                text: welcomeMsg,
                                mentions: [num] 
                            });
                        }
                        
                    } else if (anu.action == 'remove') {
                        // BEAUTIFUL GOODBYE MESSAGE
                        const goodbyeMsg = `╭─── • 👋 • ───╮\n   𝗚𝗢𝗢𝗗𝗕𝗬𝗘\n╰─── • 👋 • ───╯\n\n📛 *Group:* ${metadata.subject}\n👥 *Remaining:* ${metadata.participants.length}\n📝 *Description:* ${groupDesc}\n\n😔 @${userNum} has left the group.\n\n💬 *"Farewell, until we meet again..."*\n\n${fancy(config.footer)}`;
                        
                        await conn.sendMessage(anu.id, { 
                            text: goodbyeMsg,
                            mentions: [num] 
                        });
                    }
                }
            } catch (e) {
                console.error("Group event error:", e.message);
            }
        });

        // AUTO REACT TO CHANNEL POSTS
        conn.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || !msg.key?.remoteJid) return;
                
                const from = msg.key.remoteJid;
                const channelJid = config.newsletterJid;
                
                // Auto react to channel posts
                if (channelJid && from === channelJid) {
                    const reactions = ['❤️', '🔥', '⭐', '👍', '🎉'];
                    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                    
                    try {
                        await conn.sendMessage(from, {
                            react: {
                                text: randomReaction,
                                key: msg.key
                            }
                        });
                        console.log(fancy(`❤️ Reacted to channel post: ${randomReaction}`));
                    } catch (e) {}
                }
            } catch (error) {
                console.error("Channel auto-react error:", error.message);
            }
        });

        return conn;
        
    } catch (error) {
        console.error("Failed to start bot:", error.message);
        setTimeout(startInsidious, 5000);
    }
}

// AUTO BIO FUNCTION (WORKING)
async function updateBio(conn) {
    try {
        if (!conn || !isConnectionReady) {
            console.log(fancy("⏸️ Bio update paused - Connection not ready"));
            return;
        }
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const bioText = `🤖 ${config.botName} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.developerName}`;
        
        await conn.updateProfileStatus(bioText);
        console.log(fancy(`📝 Bio updated: ${bioText}`));
        
    } catch (error) {
        if (!error.message.includes('Connection Closed')) {
            console.error("Bio update error:", error.message);
        }
    }
}

// START AUTO BIO INTERVAL
function startAutoBioInterval(conn) {
    if (config.autoBio) {
        console.log(fancy("🔄 Auto Bio activated"));
        
        setTimeout(() => updateBio(conn), 5000);
        setInterval(() => updateBio(conn), 60000);
    }
}

// PAIRING ENDPOINT - 8 DIGIT CODE
app.get('/pair', async (req, res) => {
    try {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide number! Example: /pair?num=255123456789" });
        
        if (!globalConn || !isConnectionReady) {
            return res.json({ 
                error: "Bot not ready",
                message: "Wait for bot to connect first"
            });
        }
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        if (!cleanNum || cleanNum.length < 9) {
            return res.json({ 
                error: "Invalid number",
                example: "255123456789 (without + or spaces)"
            });
        }
        
        console.log(fancy(`🔐 Requesting pairing code for: ${cleanNum}`));
        
        let code;
        try {
            code = await globalConn.requestPairingCode(cleanNum);
        } catch (pairError) {
            console.error("Pairing error:", pairError.message);
            return res.json({ 
                error: "Pairing failed",
                details: "Make sure bot is properly connected to WhatsApp"
            });
        }
        
        if (!code) {
            return res.json({ 
                error: "No pairing code received"
            });
        }
        
        const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
        
        console.log(fancy(`✅ Pairing code: ${formattedCode}`));
        
        res.json({ 
            success: true, 
            code: formattedCode,
            message: `8-digit pairing code: ${formattedCode}`,
            instructions: [
                "1. Open WhatsApp on your phone",
                "2. Go to Settings → Linked Devices → Link a Device",
                "3. Enter this code: " + formattedCode
            ],
            note: "Code expires in 60 seconds"
        });
        
    } catch (err) {
        console.error("Pairing error:", err);
        res.json({ 
            error: "Pairing failed",
            details: err.message
        });
    }
});

// STATUS API
app.get('/api/status', (req, res) => {
    res.json({ 
        status: connectionStatus,
        ready: isConnectionReady,
        owner: botOwnerJid ? botOwnerJid.split('@')[0] : "Not connected",
        developer: config.developerName,
        botName: config.botName,
        uptime: process.uptime()
    });
});

// START EVERYTHING
async function startApp() {
    try {
        // Initialize database
        await initializeDatabase();
        
        // Start bot
        startInsidious();
        
        // Start web server
        app.listen(PORT, () => {
            console.log(fancy("╔══════════════════════════════════════╗"));
            console.log(fancy(`          🥀 ${config.botName} 🥀          `));
            console.log(fancy("╚══════════════════════════════════════╝"));
            console.log(`🌐 Dashboard: http://localhost:${PORT}`);
            console.log(`🔐 Pairing: http://localhost:${PORT}/pair?num=255xxxxxxxx`);
            console.log(fancy(`👑 Bot Owner: (Will be set when linked)`));
            console.log(fancy(`👨‍💻 Developer: ${config.developerName}`));
            console.log(fancy(`⚡ Fast Response Mode`));
            console.log(fancy(`🎉 Beautiful Welcome/Goodbye Messages`));
            console.log(fancy(`📸 Group Picture in Welcome`));
            console.log(fancy(`❤️ Auto-react to Channel Posts`));
            console.log(fancy("⏳ Waiting for WhatsApp connection..."));
        });
        
    } catch (error) {
        console.error("Startup error:", error.message);
    }
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error(fancy("⚠️ Error:"), error.message);
});

process.on('unhandledRejection', (error) => {
    console.error(fancy("⚠️ Rejection:"), error.message);
});

// Start
startApp();
