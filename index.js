const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs-extra");
const { pipeline } = require("stream");
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

let globalConn = null;
let isConnected = false;

// ============================================
// CHECK IF SESSION EXISTS
// ============================================
function sessionExists() {
    const sessionPath = path.join(__dirname, config.sessionName);
    return fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
}

// ============================================
// DOWNLOAD GROUP IMAGE
// ============================================
async function downloadGroupImage(conn, groupId) {
    try {
        const groupMetadata = await conn.groupMetadata(groupId);
        
        if (groupMetadata.picture) {
            const stream = await downloadContentFromMessage(
                groupMetadata.picture, 
                'image'
            );
            
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            
            return buffer;
        }
    } catch (error) {
        console.error('Failed to download group image:', error.message);
    }
    return null;
}

// ============================================
// GET GROUP WELCOME MESSAGE WITH IMAGE
// ============================================
async function getGroupWelcomeMessage(conn, groupId, participant) {
    try {
        const metadata = await conn.groupMetadata(groupId);
        const groupName = metadata.subject || "Unknown Group";
        const groupDesc = metadata.desc || "No description available";
        const memberCount = metadata.participants.length;
        const participantNumber = participant.split('@')[0];
        
        let imageBuffer = null;
        try {
            imageBuffer = await downloadGroupImage(conn, groupId);
        } catch (error) {
            console.error('Error downloading group image:', error.message);
        }
        
        // Truncate description if too long
        const shortDesc = groupDesc.length > 150 
            ? groupDesc.substring(0, 150) + '...' 
            : groupDesc;
        
        const welcomeText = `╭─── • 🎉 • ───╮\n   ᴡᴇʟᴄᴏᴍᴇ 🎊\n╰─── • 🎉 • ───╯\n\n👤 *New Member:* @${participantNumber}\n🏷️ *Group:* ${groupName}\n📝 *Description:* ${shortDesc}\n👥 *Members:* ${memberCount}\n\n💬 *Rules:*\n• Be respectful to everyone\n• No spam or advertising\n• Follow group guidelines\n\nEnjoy your stay! 🎯`;
        
        return {
            text: fancy(welcomeText),
            image: imageBuffer,
            mentions: [participant]
        };
    } catch (error) {
        console.error('Error generating welcome message:', error);
        return {
            text: fancy(`Welcome @${participant.split('@')[0]} to the group! 🎉`),
            image: null,
            mentions: [participant]
        };
    }
}

// ============================================
// GET GROUP GOODBYE MESSAGE
// ============================================
async function getGroupGoodbyeMessage(conn, groupId, participant) {
    try {
        const metadata = await conn.groupMetadata(groupId);
        const groupName = metadata.subject || "Unknown Group";
        const participantNumber = participant.split('@')[0];
        
        const goodbyeText = `╭─── • 👋 • ───╮\n   ɢᴏᴏᴅʙʏᴇ 👋\n╰─── • 👋 • ───╯\n\n👤 *Member Left:* @${participantNumber}\n🏷️ *Group:* ${groupName}\n\nWe'll miss you! 😢\nHope to see you again soon.`;
        
        return {
            text: fancy(goodbyeText),
            mentions: [participant]
        };
    } catch (error) {
        console.error('Error generating goodbye message:', error);
        return {
            text: fancy(`Goodbye @${participant.split('@')[0]}! 👋`),
            mentions: [participant]
        };
    }
}

// ============================================
// AUTO-RESTORE SESSIONS FUNCTION
// ============================================
async function autoRestoreSessions() {
    try {
        console.log(fancy('[SESSION] 🔄 Checking for saved sessions...'));
        
        if (!sessionExists()) {
            console.log(fancy('[SESSION] ❌ No saved session found.'));
            console.log(fancy('[SESSION] ⚠️ Manual pairing required for first time.'));
            return false;
        }
        
        console.log(fancy('[SESSION] ✅ Found saved session. Auto-restoring...'));
        return true;
    } catch (error) {
        console.error('Session check error:', error.message);
        return false;
    }
}

// ============================================
// MAIN BOT START FUNCTION (AUTO-CONNECT)
// ============================================
async function startInsidious() {
    try {
        console.log(fancy('[SYSTEM] 🚀 Starting INSIDIOUS V2...'));
        
        // Check and auto-restore session
        const hasSession = await autoRestoreSessions();
        
        if (!hasSession) {
            console.log(fancy('[SESSION] ⚠️ First time setup required.'));
            console.log(fancy('[SESSION] 📱 Please link device manually using:'));
            console.log(fancy('[SESSION] 🔗 Use command: !pair 2557xxxxxx'));
            console.log(fancy('[SESSION] 💾 Session will auto-save for future.'));
        }
        
        // Use saved auth state or create new
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
        const { version } = await fetchLatestBaileysVersion();

        // Create connection with saved credentials
        const conn = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            getMessage: async (key) => ({ conversation: "message deleted" }),
            printQRInTerminal: false, // NO QR CODE
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: true,
            retryRequestDelayMs: 1000,
            connectTimeoutMs: 60000
        });

        globalConn = conn;

        // ============================================
        // CONNECTION UPDATE HANDLER
        // ============================================
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log(fancy("✅ Bot connected successfully!"));
                console.log(fancy(`👤 User ID: ${conn.user?.id}`));
                console.log(fancy(`📱 Phone: ${conn.user?.phone || 'Unknown'}`));
                
                try {
                    // Initialize settings
                    let settings = await Settings.findOne();
                    if (!settings) {
                        settings = new Settings();
                        await settings.save();
                        console.log(fancy('[SETTINGS] ✅ Default settings created'));
                    }
                    
                    // Initialize handler
                    if (typeof require('./handler').init === 'function') {
                        setTimeout(async () => {
                            try {
                                await require('./handler').init(conn);
                            } catch (error) {
                                console.error("Handler init error:", error);
                            }
                        }, 3000);
                    }
                    
                } catch (error) {
                    console.error("Connection setup error:", error);
                }
            }
            
            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const error = lastDisconnect?.error;
                
                console.log(fancy(`🔌 Connection closed. Status: ${statusCode || 'unknown'}`));
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(fancy("❌ Bot logged out. Cleaning session..."));
                    
                    // Delete session folder
                    const sessionPath = path.join(__dirname, config.sessionName);
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                        console.log(fancy("[SESSION] 🗑️ Deleted old session folder"));
                    }
                    
                    // Wait and restart
                    console.log(fancy("🔄 Restarting in 5 seconds..."));
                    setTimeout(startInsidious, 5000);
                    
                } else {
                    // Auto-reconnect for other disconnects
                    console.log(fancy("🔄 Auto-reconnecting in 3 seconds..."));
                    setTimeout(startInsidious, 3000);
                }
            }
            
            if (connection === 'connecting') {
                console.log(fancy("🔄 Connecting to WhatsApp..."));
            }
        });

        // ============================================
        // CREDENTIALS UPDATE HANDLER
        // ============================================
        conn.ev.on('creds.update', saveCreds);

        // ============================================
        // MESSAGE HANDLER
        // ============================================
        conn.ev.on('messages.upsert', async (m) => {
            try {
                require('./handler')(conn, m);
            } catch (error) {
                console.error("Message handler error:", error);
            }
        });

        // ============================================
        // GROUP PARTICIPANTS UPDATE (ENHANCED)
        // ============================================
        conn.ev.on('group-participants.update', async (anu) => {
            try {
                const settings = await Settings.findOne();
                if (!settings?.welcomeGoodbye) return;
                
                for (let participant of anu.participants) {
                    if (anu.action === 'add') {
                        const welcomeData = await getGroupWelcomeMessage(conn, anu.id, participant);
                        
                        if (welcomeData.image) {
                            // Send with image
                            await conn.sendMessage(anu.id, {
                                image: welcomeData.image,
                                caption: welcomeData.text,
                                mentions: welcomeData.mentions
                            });
                        } else {
                            // Send text only
                            await conn.sendMessage(anu.id, {
                                text: welcomeData.text,
                                mentions: welcomeData.mentions
                            });
                        }
                        
                    } else if (anu.action === 'remove') {
                        const goodbyeData = await getGroupGoodbyeMessage(conn, anu.id, participant);
                        
                        await conn.sendMessage(anu.id, {
                            text: goodbyeData.text,
                            mentions: goodbyeData.mentions
                        });
                    }
                }
            } catch (error) {
                console.error("Group event error:", error);
            }
        });

        // ============================================
        // ANTICALL
        // ============================================
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

        // ============================================
        // SESSION HEALTH CHECK
        // ============================================
        setInterval(async () => {
            if (!isConnected) {
                console.log(fancy("[HEALTH] ⚠️ Connection lost. Reconnecting..."));
                startInsidious();
            }
        }, 5 * 60 * 1000); // Every 5 minutes

        // ============================================
        // AUTO BIO UPDATER
        // ============================================
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
        
    } catch (error) {
        console.error("Failed to start bot:", error);
        
        // Session error handling
        if (error.message.includes("session") || error.message.includes("creds") || error.message.includes("auth")) {
            console.log(fancy("[SESSION] 🗑️ Corrupted session detected. Deleting..."));
            
            const sessionPath = path.join(__dirname, config.sessionName);
            if (fs.existsSync(sessionPath)) {
                fs.removeSync(sessionPath);
            }
            
            console.log(fancy("[SESSION] 🔄 Retrying in 5 seconds..."));
            setTimeout(startInsidious, 5000);
        } else {
            console.log(fancy("🔄 Retrying in 10 seconds..."));
            setTimeout(startInsidious, 10000);
        }
    }
}

// ============================================
// API ENDPOINTS FOR DASHBOARD
// ============================================

// Bot status endpoint
app.get('/api/bot-status', (req, res) => {
    res.json({
        connected: isConnected,
        userId: globalConn?.user?.id || null,
        phone: globalConn?.user?.phone || null,
        name: globalConn?.user?.name || null,
        sessionExists: sessionExists(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Pairing endpoint for first time
app.get('/api/pair', async (req, res) => {
    try {
        if (!globalConn) {
            return res.json({ 
                error: "Bot not initialized. Wait for connection..." 
            });
        }
        
        const num = req.query.num;
        if (!num) {
            return res.json({ error: "Phone number required! Example: ?num=255712345678" });
        }
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        
        if (!globalConn.requestPairingCode) {
            return res.json({ error: "Pairing not available in current state" });
        }
        
        const code = await globalConn.requestPairingCode(cleanNum);
        
        // Save user
        await User.findOneAndUpdate(
            { jid: cleanNum + '@s.whatsapp.net' },
            {
                jid: cleanNum + '@s.whatsapp.net',
                pairingCode: code,
                linkedAt: new Date(),
                isActive: true,
                lastPair: new Date()
            },
            { upsert: true, new: true }
        );
        
        res.json({
            success: true,
            code: code,
            number: cleanNum,
            instructions: [
                `1. Open WhatsApp on phone ${cleanNum}`,
                `2. Go to Settings → Linked Devices`,
                `3. Tap "Link a Device"`,
                `4. Enter this 6-digit code: ${code}`,
                `5. Wait for connection confirmation`
            ].join('\n')
        });
        
    } catch (err) {
        console.error("Pairing error:", err);
        res.json({ 
            error: "Pairing failed",
            details: err.message 
        });
    }
});

// Session management
app.post('/api/session/reset', (req, res) => {
    try {
        const sessionPath = path.join(__dirname, config.sessionName);
        if (fs.existsSync(sessionPath)) {
            fs.removeSync(sessionPath);
        }
        
        console.log(fancy("[API] 🗑️ Session reset by dashboard"));
        res.json({ 
            success: true, 
            message: "Session reset successfully. Bot will restart." 
        });
        
        // Restart bot
        setTimeout(startInsidious, 2000);
        
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get all linked users
app.get('/api/linked-users', async (req, res) => {
    try {
        const users = await User.find({ isActive: true })
            .sort({ lastActive: -1 })
            .limit(50);
        
        res.json({
            success: true,
            count: users.length,
            users: users.map(u => ({
                jid: u.jid,
                name: u.name,
                lastActive: u.lastActive,
                messageCount: u.messageCount,
                linkedAt: u.linkedAt
            }))
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ============================================
// START EVERYTHING
// ============================================
console.log(fancy('╔══════════════════════════════╗'));
console.log(fancy('║     INSIDIOUS V2 BOT        ║'));
console.log(fancy('║    Auto-Connect Edition     ║'));
console.log(fancy('╚══════════════════════════════╝'));
console.log(fancy(''));

startInsidious();

// Start web server
app.listen(PORT, () => {
    console.log(fancy(`🌐 Dashboard: http://localhost:${PORT}`));
    console.log(fancy(`📊 Status: http://localhost:${PORT}/api/bot-status`));
    console.log(fancy(`🔗 Pairing: http://localhost:${PORT}/api/pair?num=YOUR_NUMBER`));
    console.log(fancy('💾 Auto-restore: ENABLED'));
    console.log(fancy('🖼️ Group welcome images: ENABLED'));
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(fancy("👋 Shutting down gracefully..."));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(fancy("👋 Render shutdown signal received..."));
    process.exit(0);
});

// Export
module.exports = { app, startInsidious, globalConn };
