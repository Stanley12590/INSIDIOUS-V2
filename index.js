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
const fs = require("fs").promises;
const { fancy } = require("./lib/font");
const config = require("./config");
const { User, Group, ChannelSubscriber, Settings, Session } = require('./database/models');

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
        const sessions = await Session.countDocuments();
        const settings = await Settings.findOne();
        
        res.json({
            users,
            groups,
            subscribers,
            sessions,
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

// AUTO-CONNECT TO ALL SESSIONS FROM DATABASE
async function loadAllSessions() {
    try {
        const sessions = await Session.find({ isActive: true });
        const activeConnections = [];
        
        for (const session of sessions) {
            try {
                console.log(fancy(`🔄 Connecting session: ${session.sessionId}`));
                const conn = await startBotSession(session.sessionId, session.jid);
                if (conn) {
                    activeConnections.push({
                        sessionId: session.sessionId,
                        jid: session.jid,
                        connection: conn,
                        connectedAt: new Date()
                    });
                }
            } catch (error) {
                console.error(`Failed to connect session ${session.sessionId}:`, error);
            }
        }
        
        return activeConnections;
    } catch (error) {
        console.error("Error loading sessions:", error);
        return [];
    }
}

let globalConnections = new Map();
let qrCodeData = null;

async function startInsidious(sessionId = "default") {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
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

    // HANDLE QR CODE
    conn.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            qrCodeData = { sessionId, qr };
            console.log(fancy(`📱 Scan QR Code for session ${sessionId}:`));
            try {
                const qrcode = require('qrcode-terminal');
                qrcode.generate(qr, { small: true });
            } catch (e) {
                console.log("QR Code:", qr.substring(0, 100) + "...");
            }
        }
        
        if (connection === 'open') {
            console.log(fancy(`👹 Session ${sessionId} is alive and connected.`));
            qrCodeData = null;
            
            try {
                // Save session to database
                const sessionDoc = await Session.findOneAndUpdate(
                    { sessionId },
                    {
                        sessionId,
                        jid: conn.user?.id,
                        isActive: true,
                        lastConnected: new Date(),
                        deviceInfo: {
                            platform: "WhatsApp Web",
                            browser: "Safari"
                        }
                    },
                    { upsert: true, new: true }
                );
                
                // Add to global connections
                globalConnections.set(sessionId, { conn, session: sessionDoc });
                
                // Initialize settings if not exist
                let settings = await Settings.findOne();
                if (!settings) {
                    settings = new Settings();
                    await settings.save();
                }
                
                // Send minimal welcome to owner
                if (config.sendWelcomeToOwner && sessionId === "default") {
                    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
                    const welcomeMsg = `╭─── • 🥀 • ───╮\n   ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ${config.version}\n╰─── • 🥀 • ───╯\n\n✅ Bot is online!\n📊 Dashboard: http://localhost:${PORT}\n\n${fancy(config.footer)}`;
                    await conn.sendMessage(ownerJid, { text: welcomeMsg });
                }
                
            } catch (error) {
                console.error("Connection setup error:", error);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            // Update session status in database
            await Session.findOneAndUpdate(
                { sessionId },
                { 
                    isActive: false,
                    lastDisconnected: new Date(),
                    disconnectReason: update.lastDisconnect?.error?.output?.statusCode || "unknown"
                }
            );
            
            // Remove from global connections
            globalConnections.delete(sessionId);
            
            if (shouldReconnect) {
                console.log(fancy(`🔄 Reconnecting session ${sessionId}...`));
                setTimeout(() => startInsidious(sessionId), 5000);
            }
        }
    });

    conn.ev.on('creds.update', saveCreds);

    // MESSAGE HANDLER
    conn.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // Pass to Master Handler
        require('./handler')(conn, m, sessionId);
    });

    // GROUP PARTICIPANTS UPDATE - IMPROVED WELCOME/GOODBYE
    conn.ev.on('group-participants.update', async (anu) => {
        try {
            const settings = await Settings.findOne();
            if (!settings?.welcomeGoodbye) return;
            
            const metadata = await conn.groupMetadata(anu.id);
            const participants = anu.participants;
            
            // Get group description
            let groupDesc = "No description";
            try {
                const desc = await conn.groupFetchAllParticipating();
                if (desc[anu.id]?.desc) {
                    groupDesc = desc[anu.id].desc.substring(0, 100) + (desc[anu.id].desc.length > 100 ? "..." : "");
                }
            } catch (e) {}
            
            // Get group profile picture
            let groupPicture = null;
            try {
                groupPicture = await conn.profilePictureUrl(anu.id, 'image');
            } catch (e) {}
            
            // Get random quote
            let quote = "Welcome to the Further.";
            try {
                const quoteRes = await axios.get('https://api.quotable.io/random', { timeout: 3000 });
                quote = quoteRes.data.content;
            } catch (e) {}

            for (let num of participants) {
                if (anu.action == 'add') {
                    // WELCOME MESSAGE WITH GROUP IMAGE AND DESCRIPTION
                    const welcomeMsg = `╭── • 🥀 • ──╮\n  ${fancy("ɴᴇᴡ ꜱᴏᴜʟ ᴅᴇᴛᴇᴄᴛᴇᴅ")}\n╰── • 🥀 • ──╯\n\n📛 *Group:* ${metadata.subject}\n👥 *Members:* ${metadata.participants.length}\n📝 *Description:* ${groupDesc}\n\n🎉 Welcome @${num.split("@")[0]}!\n\n💬 *Quote of the Day:*\n"${fancy(quote)}"\n\n${fancy(config.footer)}`;
                    
                    // Send image if available, otherwise text
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
                    
                    // Log to database
                    await Group.findOneAndUpdate(
                        { jid: anu.id },
                        {
                            jid: anu.id,
                            name: metadata.subject,
                            participants: metadata.participants.length,
                            lastActivity: new Date()
                        },
                        { upsert: true }
                    );
                    
                } else if (anu.action == 'remove') {
                    // GOODBYE MESSAGE WITHOUT QR CODE
                    const goodbyeMsg = `╭── • 🥀 • ──╮\n  ${fancy("ꜱᴏᴜʟ ʟᴇꜰᴛ")}\n╰── • 🥀 • ──╯\n\n📛 *Group:* ${metadata.subject}\n👥 *Remaining:* ${metadata.participants.length}\n\n😔 @${num.split('@')[0]} has left the group.\n\n💬 *Farewell Quote:*\n"${fancy(quote)}"`;
                    
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

    // AUTO BIO
    if (config.autoBio) {
        setInterval(async () => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.autoBio) return;
                
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const bio = `🤖 ${config.botName} | ⚡${days}d ${hours}h ${minutes}m | 👑${config.ownerName}`;
                await conn.updateProfileStatus(bio);
            } catch (error) {
                console.error("Auto bio error:", error);
            }
        }, 60000);
    }

    return conn;
}

// QR CODE API
app.get('/api/qr', (req, res) => {
    if (globalConnections.size > 0) {
        const connections = Array.from(globalConnections.values()).map(c => ({
            status: 'connected',
            sessionId: c.session.sessionId,
            user: c.conn.user?.id
        }));
        return res.json({ 
            status: 'connected',
            connections
        });
    }
    
    if (qrCodeData) {
        res.json({ 
            qr: qrCodeData.qr,
            sessionId: qrCodeData.sessionId,
            status: 'waiting'
        });
    } else {
        res.json({ 
            qr: null, 
            status: 'no_qr' 
        });
    }
});

// PAIRING ENDPOINT - Updated to save session properly
app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.json({ error: "Provide a number!" });
    
    try {
        // Use first connection for pairing
        const connEntry = globalConnections.values().next().value;
        if (!connEntry?.conn) {
            return res.json({ error: "No active connection available" });
        }
        
        const conn = connEntry.conn;
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        // Generate pairing code
        const code = await conn.requestPairingCode(cleanNum);
        
        // Create session entry
        const sessionId = `session_${Date.now()}`;
        await Session.create({
            sessionId,
            jid: cleanNum + '@s.whatsapp.net',
            isActive: false,
            pairedAt: new Date(),
            pairingCode: code,
            deviceInfo: {
                platform: "WhatsApp Mobile",
                pairedNumber: cleanNum
            }
        });
        
        res.json({ 
            success: true, 
            code: code,
            sessionId: sessionId,
            message: "Scan code in WhatsApp Linked Devices"
        });
        
    } catch (err) {
        console.error("Pairing error:", err);
        res.json({ 
            error: "Pairing failed. Try again.",
            details: err.message 
        });
    }
});

// SESSION MANAGEMENT ENDPOINTS
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await Session.find().sort({ lastConnected: -1 });
        res.json({ sessions });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.post('/api/sessions/:sessionId/restart', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await Session.findById(sessionId);
        
        if (!session) {
            return res.json({ error: "Session not found" });
        }
        
        // Start the session
        await startInsidious(session.sessionId);
        
        res.json({ success: true, message: "Session restart initiated" });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Remove from active connections
        if (globalConnections.has(sessionId)) {
            const conn = globalConnections.get(sessionId).conn;
            await conn.logout();
            globalConnections.delete(sessionId);
        }
        
        // Delete session from database
        await Session.findOneAndDelete({ sessionId });
        
        // Delete session files
        try {
            await fs.rm(`./sessions/${sessionId}`, { recursive: true, force: true });
        } catch (e) {}
        
        res.json({ success: true, message: "Session deleted" });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Start the main bot and load all sessions
async function initializeBot() {
    try {
        // Start default session
        await startInsidious("default");
        
        // Load all saved sessions from database
        setTimeout(() => {
            loadAllSessions();
        }, 3000);
        
    } catch (error) {
        console.error("Bot initialization error:", error);
    }
}

// Start web server
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on port ${PORT}`);
    console.log(fancy(`🚀 Auto-connecting all sessions from database...`));
    
    // Initialize bot
    initializeBot().catch(console.error);
});

module.exports = { startInsidious, globalConnections };
