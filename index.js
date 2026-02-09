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
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const { fancy } = require("./lib/font");

// CONFIGURATION - WITH YOUR MONGODB URI
const config = {
    // DATABASE - USING YOUR PROVIDED URI
    mongodb: "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority",
    
    // BOT SETTINGS
    botName: "Insidious",
    ownerName: "Sila",
    ownerNumber: "255000000000", // Change this to your number
    version: "2.0",
    footer: "Powered by Insidious",
    sessionName: "insidious_session",
    
    // FEATURES
    sendWelcomeToOwner: true,
    autoBio: true,
    welcomeGoodbye: true,
    anticall: false,
    sleepingMode: false,
    sleepStart: "23:00",
    sleepEnd: "06:00",
    
    // OTHER FEATURES DEFAULTS
    antilink: false,
    antiporn: false,
    antiscam: false,
    antimedia: false,
    antitag: false,
    antiviewonce: false,
    antidelete: false,
    activeMembers: false,
    autoblockCountry: false,
    chatbot: false,
    autoStatus: false,
    autoRead: false,
    autoReact: false,
    autoSave: false,
    downloadStatus: false,
    antispam: false,
    antibug: false
};

// TRY TO LOAD MODELS
let User, Group, ChannelSubscriber, Settings, mongoose;
let dbConnected = false;

async function initializeDatabase() {
    try {
        mongoose = require("mongoose");
        
        console.log(fancy("🔗 Connecting to MongoDB..."));
        console.log(fancy("📡 URI: mongodb+srv://sila_md:******@sila.67mxtd7.mongodb.net/insidious"));
        
        await mongoose.connect(config.mongodb, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 45000
        });
        
        console.log(fancy("✅ MongoDB Connected Successfully!"));
        
        // Define simple schemas if models don't exist
        if (!mongoose.models.User) {
            const userSchema = new mongoose.Schema({
                jid: String,
                deviceId: String,
                linkedAt: Date,
                isActive: Boolean,
                mustFollowChannel: Boolean,
                lastPair: Date,
                pairingCode: String
            });
            User = mongoose.model('User', userSchema);
        } else {
            User = mongoose.models.User;
        }
        
        if (!mongoose.models.Group) {
            const groupSchema = new mongoose.Schema({
                jid: String,
                name: String,
                description: String,
                participants: Number,
                lastActivity: Date
            });
            Group = mongoose.model('Group', groupSchema);
        } else {
            Group = mongoose.models.Group;
        }
        
        if (!mongoose.models.ChannelSubscriber) {
            const channelSubscriberSchema = new mongoose.Schema({
                jid: String,
                channelId: String,
                subscribedAt: Date
            });
            ChannelSubscriber = mongoose.model('ChannelSubscriber', channelSubscriberSchema);
        } else {
            ChannelSubscriber = mongoose.models.ChannelSubscriber;
        }
        
        if (!mongoose.models.Settings) {
            const settingsSchema = new mongoose.Schema({
                antilink: { type: Boolean, default: false },
                antiporn: { type: Boolean, default: false },
                antiscam: { type: Boolean, default: false },
                antimedia: { type: Boolean, default: false },
                antitag: { type: Boolean, default: false },
                antiviewonce: { type: Boolean, default: false },
                antidelete: { type: Boolean, default: false },
                sleepingMode: { type: Boolean, default: false },
                welcomeGoodbye: { type: Boolean, default: true },
                activeMembers: { type: Boolean, default: false },
                autoblockCountry: { type: Boolean, default: false },
                chatbot: { type: Boolean, default: false },
                autoStatus: { type: Boolean, default: false },
                autoRead: { type: Boolean, default: false },
                autoReact: { type: Boolean, default: false },
                autoSave: { type: Boolean, default: false },
                autoBio: { type: Boolean, default: true },
                anticall: { type: Boolean, default: false },
                downloadStatus: { type: Boolean, default: false },
                antispam: { type: Boolean, default: false },
                antibug: { type: Boolean, default: false },
                updatedAt: { type: Date, default: Date.now }
            });
            Settings = mongoose.model('Settings', settingsSchema);
        } else {
            Settings = mongoose.models.Settings;
        }
        
        dbConnected = true;
        
        // Create default settings if none exist
        const settingsCount = await Settings.countDocuments();
        if (settingsCount === 0) {
            await Settings.create({});
            console.log(fancy("⚙️  Default settings created in database"));
        }
        
        return true;
        
    } catch (err) {
        console.error(fancy("❌ MongoDB Connection Error:"), err.message);
        console.log(fancy("📦 Running in memory-only mode (no database)"));
        
        // Create mock models for in-memory operation
        createMockModels();
        return false;
    }
}

// CREATE MOCK MODELS FOR IN-MEMORY OPERATION
function createMockModels() {
    console.log(fancy("🧠 Creating in-memory models..."));
    
    User = {
        countDocuments: () => Promise.resolve(0),
        findOneAndUpdate: () => Promise.resolve({})
    };
    
    Group = {
        countDocuments: () => Promise.resolve(0),
        find: () => Promise.resolve([])
    };
    
    ChannelSubscriber = {
        countDocuments: () => Promise.resolve(0)
    };
    
    Settings = {
        findOne: () => Promise.resolve(null),
        findOneAndUpdate: () => Promise.resolve({}),
        countDocuments: () => Promise.resolve(0)
    };
}

const app = express();
const PORT = process.env.PORT || 3000;

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
        const users = dbConnected ? await User.countDocuments() : 0;
        const groups = dbConnected ? await Group.countDocuments() : 0;
        const subscribers = dbConnected ? await ChannelSubscriber.countDocuments() : 0;
        const settings = dbConnected ? (await Settings.findOne() || {}) : {};
        
        res.json({
            users,
            groups,
            subscribers,
            settings,
            uptime: process.uptime(),
            version: config.version,
            botName: config.botName,
            dbConnected: dbConnected
        });
    } catch (error) {
        res.json({ 
            error: error.message,
            dbConnected: false
        });
    }
});

app.get('/api/features', async (req, res) => {
    try {
        let features;
        
        if (dbConnected) {
            const settings = await Settings.findOne();
            features = {
                antilink: settings?.antilink || false,
                antiporn: settings?.antiporn || false,
                antiscam: settings?.antiscam || false,
                antimedia: settings?.antimedia || false,
                antitag: settings?.antitag || false,
                antiviewonce: settings?.antiviewonce || false,
                antidelete: settings?.antidelete || false,
                sleepingMode: settings?.sleepingMode || false,
                welcomeGoodbye: settings?.welcomeGoodbye || true,
                activeMembers: settings?.activeMembers || false,
                autoblockCountry: settings?.autoblockCountry || false,
                chatbot: settings?.chatbot || false,
                autoStatus: settings?.autoStatus || false,
                autoRead: settings?.autoRead || false,
                autoReact: settings?.autoReact || false,
                autoSave: settings?.autoSave || false,
                autoBio: settings?.autoBio || true,
                anticall: settings?.anticall || false,
                downloadStatus: settings?.downloadStatus || false,
                antispam: settings?.antispam || false,
                antibug: settings?.antibug || false
            };
        } else {
            features = {
                antilink: config.antilink || false,
                antiporn: config.antiporn || false,
                antiscam: config.antiscam || false,
                antimedia: config.antimedia || false,
                antitag: config.antitag || false,
                antiviewonce: config.antiviewonce || false,
                antidelete: config.antidelete || false,
                sleepingMode: config.sleepingMode || false,
                welcomeGoodbye: config.welcomeGoodbye || true,
                activeMembers: config.activeMembers || false,
                autoblockCountry: config.autoblockCountry || false,
                chatbot: config.chatbot || false,
                autoStatus: config.autoStatus || false,
                autoRead: config.autoRead || false,
                autoReact: config.autoReact || false,
                autoSave: config.autoSave || false,
                autoBio: config.autoBio || true,
                anticall: config.anticall || false,
                downloadStatus: config.downloadStatus || false,
                antispam: config.antispam || false,
                antibug: config.antibug || false
            };
        }
        
        res.json({
            features,
            dbConnected: dbConnected
        });
    } catch (error) {
        res.json({ 
            error: error.message,
            dbConnected: false,
            features: config
        });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        if (!dbConnected) {
            return res.json({ 
                success: false, 
                message: "Database not connected. Settings cannot be saved."
            });
        }
        
        const { feature, value } = req.body;
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        if (settings[feature] !== undefined) {
            settings[feature] = value;
            settings.updatedAt = new Date();
            await settings.save();
            
            config[feature] = value;
            
            res.json({ 
                success: true, 
                message: `${feature} set to ${value}` 
            });
        } else {
            res.json({ 
                success: false, 
                message: `Feature ${feature} not found` 
            });
        }
    } catch (error) {
        res.json({ error: error.message });
    }
});

let globalConn = null;
let connectionStatus = 'disconnected';
let isConnectionReady = false;

async function startInsidious() {
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
            console.log(fancy("👹 insidious is alive and connected."));
            connectionStatus = 'connected';
            isConnectionReady = true;
            
            try {
                // Send welcome to owner WITHOUT LINK
                if (config.sendWelcomeToOwner) {
                    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
                    const welcomeMsg = `╔═══════════════════╗\n   🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}*\n╚═══════════════════╝\n\n✅ *System Online*\n📊 *Status:* Connected\n👤 *Owner:* ${config.ownerName}\n\n_All systems operational. Awaiting commands..._\n\n${fancy(config.footer)}`;
                    await conn.sendMessage(ownerJid, { text: welcomeMsg });
                }
                
            } catch (error) {
                console.error("Connection setup error:", error);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(fancy(`🔌 Connection closed. Reason: ${lastDisconnect?.error?.output?.statusCode || 'unknown'}`));
            
            isConnectionReady = false;
            connectionStatus = 'disconnected';
            
            if (shouldReconnect) {
                console.log(fancy("🔄 Reconnecting in 5 seconds..."));
                connectionStatus = 'reconnecting';
                setTimeout(startInsidious, 5000);
            } else {
                console.log(fancy("❌ Logged out. Please restart bot."));
            }
        }
        
        if (connection === 'connecting') {
            connectionStatus = 'connecting';
            console.log(fancy("🔗 Connecting to WhatsApp..."));
        }
    });

    // CONNECTION STATUS API
    app.get('/api/status', (req, res) => {
        if (globalConn?.user && isConnectionReady) {
            return res.json({ 
                status: 'connected', 
                user: globalConn.user.id,
                ready: true,
                dbConnected: dbConnected
            });
        }
        
        res.json({ 
            status: connectionStatus,
            ready: isConnectionReady,
            dbConnected: dbConnected,
            message: 'Bot is connecting...'
        });
    });

    // PAIRING ENDPOINT - 8 DIGIT CODE
    app.get('/pair', async (req, res) => {
        try {
            let num = req.query.num;
            if (!num) return res.json({ error: "Provide a number! Example: /pair?num=255123456789" });
            
            // Check if connection is ready
            if (!globalConn || !isConnectionReady) {
                return res.json({ 
                    error: "Bot is not ready yet",
                    status: connectionStatus,
                    message: "Wait for bot to connect first"
                });
            }
            
            const cleanNum = num.replace(/[^0-9]/g, '');
            
            // Validate number format
            if (!cleanNum || cleanNum.length < 9) {
                return res.json({ 
                    error: "Invalid number format",
                    example: "255123456789 (without + or spaces)"
                });
            }
            
            console.log(fancy(`🔐 Requesting pairing code for: ${cleanNum}`));
            
            // Generate 8-digit pairing code
            let code;
            try {
                code = await globalConn.requestPairingCode(cleanNum);
            } catch (pairError) {
                console.error("Pairing code generation failed:", pairError.message);
                return res.json({ 
                    error: "Failed to generate pairing code",
                    details: "Make sure the bot is properly connected to WhatsApp"
                });
            }
            
            if (!code) {
                return res.json({ 
                    error: "No pairing code received",
                    message: "WhatsApp did not return a pairing code"
                });
            }
            
            // Ensure code is 8 digits
            const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
            
            // Save to database if connected
            if (dbConnected) {
                try {
                    await User.findOneAndUpdate(
                        { jid: cleanNum + '@s.whatsapp.net' },
                        {
                            jid: cleanNum + '@s.whatsapp.net',
                            deviceId: Math.random().toString(36).substr(2, 8),
                            linkedAt: new Date(),
                            isActive: true,
                            mustFollowChannel: true,
                            lastPair: new Date(),
                            pairingCode: formattedCode
                        },
                        { upsert: true, new: true }
                    );
                } catch (dbError) {
                    console.warn("Could not save to database:", dbError.message);
                }
            }
            
            console.log(fancy(`✅ Pairing code generated: ${formattedCode} for ${cleanNum}`));
            
            res.json({ 
                success: true, 
                code: formattedCode,
                message: `8-digit pairing code: ${formattedCode}`,
                instructions: [
                    "1. Open WhatsApp on your phone",
                    "2. Go to Settings → Linked Devices → Link a Device",
                    "3. Enter this code: " + formattedCode,
                    "4. Wait for connection confirmation"
                ],
                note: "Code expires in 60 seconds",
                dbSaved: dbConnected
            });
            
        } catch (err) {
            console.error("🔴 Pairing error:", err);
            
            res.json({ 
                error: "Pairing failed",
                details: err.message,
                fix: "Check if bot is connected and number is valid"
            });
        }
    });

    conn.ev.on('creds.update', saveCreds);

    // MESSAGE HANDLER
    conn.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // Pass to Master Handler
        require('./handler')(conn, m);
    });

    // GROUP PARTICIPANTS UPDATE
    conn.ev.on('group-participants.update', async (anu) => {
        try {
            // Check if welcomeGoodbye is enabled
            let welcomeEnabled = config.welcomeGoodbye;
            if (dbConnected) {
                try {
                    const settings = await Settings.findOne();
                    welcomeEnabled = settings?.welcomeGoodbye ?? config.welcomeGoodbye;
                } catch (e) {
                    // Use config value if database error
                }
            }
            
            if (!welcomeEnabled) return;
            
            const metadata = await conn.groupMetadata(anu.id);
            const participants = anu.participants;
            
            // Get group description and profile picture
            let groupDesc = "No description available";
            let groupPicture = null;
            
            try {
                // Try to get group description
                if (metadata.desc) {
                    groupDesc = metadata.desc.substring(0, 120);
                    if (metadata.desc.length > 120) groupDesc += "...";
                }
                
                // Try to get group profile picture
                try {
                    groupPicture = await conn.profilePictureUrl(anu.id, 'image');
                } catch (picError) {
                    // No picture available
                }
            } catch (e) {
                console.error("Error fetching group info:", e);
            }
            
            for (let num of participants) {
                if (anu.action == 'add') {
                    // WELCOME MESSAGE
                    const welcomeMsg = `▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n   ✨ *𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐍𝐄𝐖 𝐌𝐄𝐌𝐁𝐄𝐑* ✨\n▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n\n👋 *Hello* @${num.split("@")[0]}!\n\n📛 *Group:* ${metadata.subject}\n👥 *Total Members:* ${metadata.participants.length}\n📝 *About:* ${groupDesc}\n\n🎯 *Rules:*\n• Respect all members\n• No spam or advertisements\n• Follow group guidelines\n\n💫 *Enjoy your stay!*`;
                    
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
                    // GOODBYE MESSAGE
                    const goodbyeMsg = `▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n   👋 *𝐆𝐎𝐎𝐃𝐁𝐘𝐄* 👋\n▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n\n📛 *Group:* ${metadata.subject}\n👥 *Remaining Members:* ${metadata.participants.length}\n\n😔 @${num.split('@')[0]} has left the group.\n\n💭 *"Every ending is a new beginning..."*`;
                    
                    await conn.sendMessage(anu.id, { 
                        text: goodbyeMsg,
                        mentions: [num] 
                    });
                }
            }
        } catch (e) { 
            console.error("Group event error:", e);
        }
    });

    // ANTICALL
    conn.ev.on('call', async (calls) => {
        try {
            // Check if anticall is enabled
            let anticallEnabled = config.anticall;
            if (dbConnected) {
                try {
                    const settings = await Settings.findOne();
                    anticallEnabled = settings?.anticall ?? config.anticall;
                } catch (e) {
                    // Use config value if database error
                }
            }
            
            if (!anticallEnabled) return;
            
            for (let call of calls) {
                if (call.status === 'offer') {
                    await conn.rejectCall(call.id, call.from);
                    console.log(fancy(`📵 Rejected call from ${call.from}`));
                }
            }
        } catch (error) {
            console.error("Anticall error:", error);
        }
    });

    // SLEEPING MODE
    if (config.sleepStart && config.sleepEnd) {
        const [startH, startM] = config.sleepStart.split(':');
        const [endH, endM] = config.sleepEnd.split(':');

        cron.schedule(`${startM} ${startH} * * *`, async () => {
            try {
                // Check if sleeping mode is enabled
                let sleepingEnabled = config.sleepingMode;
                if (dbConnected) {
                    try {
                        const settings = await Settings.findOne();
                        sleepingEnabled = settings?.sleepingMode ?? config.sleepingMode;
                    } catch (e) {
                        // Use config value if database error
                    }
                }
                
                if (!sleepingEnabled) return;
                
                const groups = dbConnected ? await Group.find().catch(() => []) : [];
                for (let group of groups) {
                    try {
                        await conn.groupSettingUpdate(group.jid, 'announcement');
                    } catch (e) {}
                }
                console.log(fancy("💤 Sleeping mode activated"));
            } catch (error) {
                console.error("Sleep mode error:", error);
            }
        });

        cron.schedule(`${endM} ${endH} * * *`, async () => {
            try {
                // Check if sleeping mode is enabled
                let sleepingEnabled = config.sleepingMode;
                if (dbConnected) {
                    try {
                        const settings = await Settings.findOne();
                        sleepingEnabled = settings?.sleepingMode ?? config.sleepingMode;
                    } catch (e) {
                        // Use config value if database error
                    }
                }
                
                if (!sleepingEnabled) return;
                
                const groups = dbConnected ? await Group.find().catch(() => []) : [];
                for (let group of groups) {
                    try {
                        await conn.groupSettingUpdate(group.jid, 'not_announcement');
                    } catch (e) {}
                }
                console.log(fancy("🌅 Awake mode activated"));
            } catch (error) {
                console.error("Awake mode error:", error);
            }
        });
    }

    // AUTO BIO - WORKING PERFECTLY
    console.log(fancy("🔄 Auto Bio feature activated"));
    
    const updateBio = async () => {
        try {
            // Check if autoBio is enabled
            let autoBioEnabled = config.autoBio;
            if (dbConnected) {
                try {
                    // Quick check without timeout
                    const settings = await Settings.findOne().maxTimeMS(3000);
                    autoBioEnabled = settings?.autoBio ?? config.autoBio;
                } catch (e) {
                    // If database query fails, use config value
                    autoBioEnabled = config.autoBio;
                }
            }
            
            if (!autoBioEnabled) {
                return;
            }
            
            // Get bot uptime
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            
            // Create dynamic bio
            const bioText = `🤖 ${config.botName} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.ownerName}`;
            
            // Update profile status
            await conn.updateProfileStatus(bioText);
            
            console.log(fancy(`📝 Bio updated: ${bioText}`));
            
        } catch (error) {
            console.error("❌ Auto bio error:", error.message);
        }
    };
    
    // Run every 60 seconds
    const bioInterval = setInterval(updateBio, 60000);
    
    // Run first time after 5 seconds
    setTimeout(updateBio, 5000);

    return conn;
}

// START EVERYTHING
async function startApp() {
    try {
        // Initialize database with YOUR MongoDB URI
        await initializeDatabase();
        
        // Start the bot
        startInsidious().catch(console.error);
        
        // Start web server
        app.listen(PORT, () => {
            console.log(fancy("╔════════════════════════╗"));
            console.log(fancy("   🥀 INSIDIOUS BOT 🥀          "));
            console.log(fancy("╚════════════════════════╝"));
            console.log(`🌐 Dashboard: http://localhost:${PORT}`);
            console.log(`🔐 Pairing: http://localhost:${PORT}/pair?num=255xxxxxxxx`);
            console.log(`📊 Status: http://localhost:${PORT}/api/status`);
            console.log(fancy(`Database: ${dbConnected ? '✅ Connected to MongoDB' : '❌ Using Memory Mode'}`));
            console.log(fancy("⏳ Waiting for WhatsApp connection..."));
            
            if (dbConnected) {
                console.log(fancy("💾 Data will be saved to MongoDB Atlas"));
            }
        });
        
    } catch (error) {
        console.error("Failed to start app:", error);
        process.exit(1);
    }
}

// Start the application
startApp();

module.exports = { startInsidious, globalConn };