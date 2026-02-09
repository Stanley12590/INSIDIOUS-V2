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
const config = require("./config");
const { User, Group, ChannelSubscriber, Settings } = require('./database/models');

const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE CONNECTION
mongoose.connect(config.mongodb, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log(fancy("🥀 database connected: insidious is eternal.")))
    .catch(err => console.error("DB Connection Error:", err));

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
        const users = await User.countDocuments();
        const groups = await Group.countDocuments();
        const subscribers = await ChannelSubscriber.countDocuments();
        const settings = await Settings.findOne();
        
        res.json({
            users,
            groups,
            subscribers,
            settings: settings || {},
            uptime: process.uptime(),
            version: config.version,
            botName: config.botName
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/features', async (req, res) => {
    try {
        const settings = await Settings.findOne() || new Settings();
        res.json({
            features: {
                antilink: settings.antilink,
                antiporn: settings.antiporn,
                antiscam: settings.antiscam,
                antimedia: settings.antimedia,
                antitag: settings.antitag,
                antiviewonce: settings.antiviewonce,
                antidelete: settings.antidelete,
                sleepingMode: settings.sleepingMode,
                welcomeGoodbye: settings.welcomeGoodbye,
                activeMembers: settings.activeMembers,
                autoblockCountry: settings.autoblockCountry,
                chatbot: settings.chatbot,
                autoStatus: settings.autoStatus,
                autoRead: settings.autoRead,
                autoReact: settings.autoReact,
                autoSave: settings.autoSave,
                autoBio: settings.autoBio,
                anticall: settings.anticall,
                downloadStatus: settings.downloadStatus,
                antispam: settings.antispam,
                antibug: settings.antibug
            }
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { feature, value } = req.body;
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        if (settings[feature] !== undefined) {
            settings[feature] = value;
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
        const { connection } = update;
        
        if (connection === 'open') {
            console.log(fancy("👹 insidious is alive and connected."));
            connectionStatus = 'connected';
            
            try {
                // Initialize settings if not exist
                let settings = await Settings.findOne();
                if (!settings) {
                    settings = new Settings();
                    await settings.save();
                }
                
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
            const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log(fancy("🔄 Reconnecting..."));
                connectionStatus = 'reconnecting';
                setTimeout(startInsidious, 5000);
            }
        }
        
        if (connection === 'connecting') {
            connectionStatus = 'connecting';
            console.log(fancy("🔗 Connecting to WhatsApp..."));
        }
    });

    // CONNECTION STATUS API
    app.get('/api/status', (req, res) => {
        if (globalConn?.user) {
            return res.json({ 
                status: 'connected', 
                user: globalConn.user.id 
            });
        }
        
        res.json({ 
            status: connectionStatus,
            message: 'Use /pair?num=255xxxxxxxx to get pairing code'
        });
    });

    // PAIRING ENDPOINT - 8 DIGIT CODE ONLY
    app.get('/pair', async (req, res) => {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide a number!" });
        
        try {
            const cleanNum = num.replace(/[^0-9]/g, '');
            
            // Generate 8-digit pairing code
            const code = await conn.requestPairingCode(cleanNum);
            
            // Ensure code is 8 digits
            const formattedCode = code.toString().padStart(8, '0').slice(0, 8);
            
            // Save/Update user
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
            
            console.log(fancy(`🔐 Pairing code generated for ${cleanNum}: ${formattedCode}`));
            
            res.json({ 
                success: true, 
                code: formattedCode,
                message: `Use this 8-digit code in WhatsApp: ${formattedCode}`,
                instructions: "Open WhatsApp > Settings > Linked Devices > Link a Device > Enter Code"
            });
            
        } catch (err) {
            console.error("Pairing error:", err);
            res.json({ 
                error: "Pairing failed. Make sure bot is connected.",
                details: err.message 
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

    // GROUP PARTICIPANTS UPDATE - IMPROVED WELCOME
    conn.ev.on('group-participants.update', async (anu) => {
        try {
            const settings = await Settings.findOne();
            if (!settings?.welcomeGoodbye) return;
            
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
                    console.log("No group picture available for:", metadata.subject);
                }
            } catch (e) {
                console.error("Error fetching group info:", e);
            }
            
            for (let num of participants) {
                if (anu.action == 'add') {
                    // BETTER WELCOME MESSAGE WITHOUT LINKS
                    const welcomeMsg = `▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n   ✨ *𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐍𝐄𝐖 𝐌𝐄𝐌𝐁𝐄𝐑* ✨\n▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃\n\n👋 *Hello* @${num.split("@")[0]}!\n\n📛 *Group:* ${metadata.subject}\n👥 *Total Members:* ${metadata.participants.length}\n📝 *About:* ${groupDesc}\n\n🎯 *Rules:*\n• Respect all members\n• No spam or advertisements\n• Follow group guidelines\n\n💫 *Enjoy your stay!*`;
                    
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
            const settings = await Settings.findOne();
            if (!settings?.anticall) return;
            
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
                const settings = await Settings.findOne();
                if (!settings?.sleepingMode) return;
                
                const groups = await Group.find({});
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
                const settings = await Settings.findOne();
                if (!settings?.sleepingMode) return;
                
                const groups = await Group.find({});
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

    // AUTO BIO - WORKING
    if (config.autoBio) {
        console.log(fancy("🔄 Auto Bio feature activated"));
        
        setInterval(async () => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.autoBio) {
                    return;
                }
                
                // Get bot uptime
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                // Create dynamic bio
                const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.ownerName || "Owner"}`;
                
                // Update profile status
                await conn.updateProfileStatus(bioText);
                
                console.log(fancy(`📝 Bio updated: ${bioText}`));
                
            } catch (error) {
                console.error("❌ Auto bio error:", error);
            }
        }, 60000); // Update every 60 seconds
        
        // Run immediately on start
        setTimeout(async () => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.autoBio) return;
                
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const bioText = `🤖 ${config.botName || "Insidious"} | ⚡ ${days}d ${hours}h ${minutes}m | 👑 ${config.ownerName || "Owner"}`;
                
                await conn.updateProfileStatus(bioText);
                console.log(fancy(`📝 Initial bio set: ${bioText}`));
            } catch (error) {
                console.error("❌ Initial auto bio error:", error);
            }
        }, 10000);
    }

    return conn;
}

// Start the bot
startInsidious().catch(console.error);

// Start web server
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on port ${PORT}`);
    console.log(fancy("🔐 Bot using 8-digit pairing code only"));
    console.log(fancy(`📞 Use: http://localhost:${PORT}/pair?num=255xxxxxxxx`));
});

module.exports = { startInsidious, globalConn };
