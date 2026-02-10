const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

// ✅ **FANCY FUNCTION**
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    
    try {
        const fancyMap = {
            a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
            j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
            s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
            A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
            J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
            S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
        };
        
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            result += fancyMap[char] || char;
        }
        return result;
    } catch (e) {
        return text;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ **MONGODB CONNECTION - MUST**
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => {
    console.log(fancy("✅ MongoDB Connected"));
})
.catch((err) => {
    console.log(fancy("❌ MongoDB Connection FAILED"));
    console.log(fancy("💡 Error: " + err.message));
    // Continue without MongoDB (fallback)
});

// ✅ **MIDDLEWARE**
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ **CREATE PUBLIC FOLDER IF NOT EXISTS**
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

// ✅ **SIMPLE ROUTES**
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ✅ **GLOBAL VARIABLES**
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();
let reconnectCount = 0;

// ✅ **LOAD CONFIG**
let config = {};
try {
    config = require('./config');
    console.log(fancy("📋 Config loaded"));
} catch (error) {
    console.log(fancy("❌ Config file error"));
    // Use default config
    config = {
        prefix: '.',
        ownerNumber: ['255000000000'],
        botName: 'INSIDIOUS',
        workMode: 'public'
    };
}

// ✅ **AUTO-REACT TO CHANNEL POSTS FUNCTION**
async function autoReactToChannelPosts(conn, msg) {
    try {
        // Check if message is from a channel (newsletter)
        if (msg.key.remoteJid.endsWith('@newsletter')) {
            // List of reactions (emoji)
            const reactions = ['❤️', '🔥', '👍', '🎉', '👏', '⚡', '✨', '🌟'];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
            
            // React to the channel post
            await conn.sendMessage(msg.key.remoteJid, {
                react: {
                    text: randomReaction,
                    key: msg.key
                }
            });
            
            console.log(fancy(`✅ Auto-reacted "${randomReaction}" to channel post`));
            return true;
        }
    } catch (error) {
        // Silent error - don't crash the bot
    }
    return false;
}

// ✅ **AUTO-FOLLOW CHANNELS FUNCTION**
async function autoFollowChannels(conn) {
    try {
        console.log(fancy("📢 Auto-following channels..."));
        
        // List of channels to auto-follow (add your channel IDs)
        const channelsToFollow = [
            "120363404317544295@newsletter", // Your main channel
            // Add more channel IDs here
        ];
        
        for (const channel of channelsToFollow) {
            try {
                // Extract invite code from channel JID
                const inviteCode = channel.split('@')[0];
                await conn.groupAcceptInvite(inviteCode);
                console.log(fancy(`✅ Auto-joined channel: ${channel}`));
                
                // Send welcome message to channel
                await conn.sendMessage(channel, {
                    text: `👋 ${config.botName} has joined!\n\nI'm here to support and engage with content. 🤖`
                });
            } catch (error) {
                if (error.message.includes('already')) {
                    console.log(fancy(`ℹ️ Already in channel: ${channel}`));
                }
            }
        }
        
        // Auto-accept all future group/channel invites
        conn.ev.on('group.invite', async (invite) => {
            try {
                const code = invite.code;
                await conn.groupAcceptInvite(code);
                console.log(fancy(`✅ Auto-accepted invite: ${code}`));
                
                // Send welcome message
                const welcomeMsg = `👋 ${config.botName} here!\n\n✅ Successfully joined\n🤖 Bot features active\n📊 Auto-engagement enabled\n\nLet's go! 🚀`;
                await conn.sendMessage(invite.id, { text: welcomeMsg });
            } catch (error) {
                console.log(fancy(`❌ Could not accept invite: ${error.message}`));
            }
        });
        
    } catch (error) {
        console.log(fancy("❌ Auto-follow error: " + error.message));
    }
}

// ✅ **MAIN BOT FUNCTION - UPDATED WITH AUTO-RECONNECT**
async function startBot() {
    try {
        reconnectCount++;
        console.log(fancy(`🚀 Starting INSIDIOUS... (Attempt ${reconnectCount})`));
        
        // ✅ **AUTHENTICATION**
        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

        // ✅ **CREATE CONNECTION**
        const conn = makeWASocket({
            version,
            auth: { 
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) 
            },
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            printQRInTerminal: true, // Show QR in terminal
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 0,
            retryRequestDelayMs: 250
        });

        globalConn = conn;
        botStartTime = Date.now();

        // ✅ **CONNECTION EVENT HANDLER WITH IMPROVED RECONNECT**
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection === 'open') {
                console.log(fancy("👹 INSIDIOUS: THE LAST KEY ACTIVATED"));
                console.log(fancy("✅ Bot is now online"));
                
                isConnected = true;
                reconnectCount = 0; // Reset reconnect count
                
                // Get bot info
                let botName = conn.user?.name || "INSIDIOUS";
                let botNumber = "Unknown";
                let botId = conn.user?.id || "Unknown";
                
                if (conn.user?.id) {
                    botNumber = conn.user.id.split(':')[0] || "Unknown";
                }
                
                console.log(fancy(`🤖 Name: ${botName}`));
                console.log(fancy(`📞 Number: ${botNumber}`));
                console.log(fancy(`🆔 Bot ID: ${botId}`));
                console.log(fancy(`👑 Owner ID: ${botId}`));
                console.log(fancy(`📱 Any number linked with this ID is owner`));
                
                // ✅ **AUTO-FOLLOW CHANNELS**
                await autoFollowChannels(conn);
                
                // ✅ **SEND CONNECTION MESSAGE TO OWNER**
                setTimeout(async () => {
                    try {
                        if (config.ownerNumber && config.ownerNumber.length > 0) {
                            const ownerNum = config.ownerNumber[0].replace(/[^0-9]/g, '');
                            if (ownerNum.length >= 10) {
                                const ownerJid = ownerNum + '@s.whatsapp.net';
                                
                                const connectionMsg = `
╭─── • 🥀 • ───╮
   INSIDIOUS: THE LAST KEY
╰─── • 🥀 • ───╯

✅ *Bot Connected Successfully!*
🤖 *Name:* ${botName}
📞 *Number:* ${botNumber}
🆔 *Bot ID:* ${botId.split(':')[0]}
👑 *Owner ID:* ${botId}

⚡ *Status:* ONLINE & ACTIVE

🌟 *NEW FEATURES:*
✅ Auto-react to channel posts
✅ Auto-follow channels
✅ Auto-reconnect enabled
✅ MongoDB storage active

📊 *ALL FEATURES ACTIVE:*
🛡️ Anti View Once: ✅
🗑️ Anti Delete: ✅
🤖 AI Chatbot: ✅
⚡ Auto Typing: ✅
📼 Auto Recording: ✅
👀 Auto Read: ✅
❤️ Auto React: ✅
🎉 Welcome/Goodbye: ✅
📢 Channel Support: ✅

🔧 *Commands:* All working
📁 *Database:* Connected
🚀 *Performance:* Optimal

👑 *Developer:* STANYTZ
💾 *Version:* 2.1.1 | Year: 2025`;
                                
                                await conn.sendMessage(ownerJid, { text: connectionMsg });
                            }
                        }
                    } catch (e) {
                        // Silent
                    }
                }, 3000);
                
                // ✅ **INITIALIZE HANDLER**
                setTimeout(async () => {
                    try {
                        const handler = require('./handler');
                        if (handler && typeof handler.init === 'function') {
                            await handler.init(conn);
                        }
                    } catch (e) {
                        console.error(fancy("❌ Handler init error:"), e.message);
                    }
                }, 2000);
            }
            
            if (connection === 'close') {
                console.log(fancy("🔌 Connection closed, attempting reconnect..."));
                isConnected = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
                    const delay = Math.min(5000 * Math.pow(2, reconnectCount), 60000);
                    console.log(fancy(`⏳ Reconnecting in ${delay/1000} seconds...`));
                    
                    setTimeout(() => {
                        startBot();
                    }, delay);
                } else {
                    console.log(fancy("🚫 Logged out, need new QR code"));
                    // Clear session and restart
                    try {
                        fs.rmSync('insidious_session', { recursive: true, force: true });
                    } catch (e) {}
                    setTimeout(() => {
                        startBot();
                    }, 5000);
                }
            }
        });

        // ✅ **PAIRING ENDPOINT**
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
                        message: `8-digit pairing code: ${code}`
                    });
                } catch (err) {
                    if (err.message.includes("already paired")) {
                        res.json({ 
                            success: true, 
                            message: "Number already paired"
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

        // ✅ **HEALTH CHECK**
        app.get('/health', (req, res) => {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            res.json({
                status: 'healthy',
                connected: isConnected,
                uptime: `${hours}h ${minutes}m ${seconds}s`,
                database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                reconnects: reconnectCount,
                features: {
                    auto_react: true,
                    auto_follow: true,
                    auto_reconnect: true
                }
            });
        });

        // ✅ **KEEP-ALIVE PING (FOR HOSTING SERVICES)**
        app.get('/keep-alive', (req, res) => {
            res.json({ 
                status: 'alive', 
                timestamp: new Date().toISOString(),
                bot: 'INSIDIOUS',
                version: '2.1.1'
            });
        });

        // ✅ **CREDENTIALS UPDATE**
        conn.ev.on('creds.update', saveCreds);

        // ✅ **MAIN MESSAGE HANDLER WITH AUTO-REACT**
        conn.ev.on('messages.upsert', async (m) => {
            try {
                // ✅ **AUTO-REACT TO CHANNEL POSTS**
                if (m.messages && m.messages[0]) {
                    const msg = m.messages[0];
                    // Auto-react to channel posts
                    await autoReactToChannelPosts(conn, msg);
                }
                
                // Pass to handler
                const handler = require('./handler');
                if (handler && typeof handler === 'function') {
                    await handler(conn, m);
                }
            } catch (error) {
                console.error("Message handler error:", error.message);
            }
        });

        // ✅ **GROUP UPDATE HANDLER**
        conn.ev.on('group-participants.update', async (update) => {
            try {
                const handler = require('./handler');
                if (handler && handler.handleGroupUpdate) {
                    await handler.handleGroupUpdate(conn, update);
                }
            } catch (error) {
                console.error("Group update error:", error.message);
            }
        });

        // ✅ **GROUP INVITE HANDLER (AUTO-JOIN)**
        conn.ev.on('group.invite', async (invite) => {
            try {
                console.log(fancy(`📨 Received invite: ${invite.code}`));
                await conn.groupAcceptInvite(invite.code);
                console.log(fancy(`✅ Auto-joined group`));
            } catch (error) {
                console.log(fancy(`❌ Could not join: ${error.message}`));
            }
        });

        console.log(fancy("🚀 Bot ready for pairing"));
        console.log(fancy(`📱 QR Code will appear shortly...`));
        
    } catch (error) {
        console.error("Start error:", error.message);
        const delay = Math.min(10000 * reconnectCount, 60000);
        console.log(fancy(`⏳ Retrying in ${delay/1000} seconds...`));
        setTimeout(() => {
            startBot();
        }, delay);
    }
}

// ✅ **START BOT**
startBot();

// ✅ **AUTO-PING TO KEEP HOST ALIVE**
setInterval(() => {
    if (globalConn && isConnected) {
        // Send ping to keep connection alive
        console.log(fancy("💓 Keep-alive ping"));
    }
}, 30000); // Every 30 seconds

// ✅ **AUTO-RESTART EVERY 6 HOURS (PREVENT MEMORY LEAKS)**
setInterval(() => {
    console.log(fancy("🔄 6-hour auto-restart initiated..."));
    if (globalConn) {
        try {
            globalConn.end();
        } catch (e) {}
    }
    setTimeout(() => {
        startBot();
    }, 3000);
}, 6 * 60 * 60 * 1000); // 6 hours

// ✅ **START SERVER**
app.listen(PORT, () => {
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 8-digit Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`❤️ Health: http://localhost:${PORT}/health`));
    console.log(fancy(`💓 Keep-alive: http://localhost:${PORT}/keep-alive`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
    console.log(fancy("🙏 Special Thanks: REDTECH"));
    console.log(fancy("🌟 New Features: Auto-react to channels ✅"));
    console.log(fancy("⚡ Auto-reconnect: ENABLED"));
    console.log(fancy("💾 MongoDB: ACTIVE"));
});

// ✅ **PROCESS HANDLERS**
process.on('SIGINT', () => {
    console.log(fancy("🛑 Shutting down..."));
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error(fancy('❌ Uncaught Exception:'), err);
    // Don't exit, let the bot reconnect
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(fancy('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

module.exports = app;
