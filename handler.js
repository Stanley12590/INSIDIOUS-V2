const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');

// DATABASE MODELS (WITH FALLBACK)
let User, Group, ChannelSubscriber, Settings;
try {
    const models = require('./database/models');
    User = models.User;
    Group = models.Group;
    ChannelSubscriber = models.ChannelSubscriber;
    Settings = models.Settings;
} catch (error) {
    console.log(fancy("⚠️  Using mock database models"));
    // Mock models if database not available
    User = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0) };
    Group = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0) };
    ChannelSubscriber = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0) };
    Settings = { findOne: () => Promise.resolve(null) };
}

// ============================================
// GLOBAL VARIABLES
// ============================================
let sessionSyncRunning = false;
let lastSessionSync = 0;
let botOwnerJid = null;

// ============================================
// GET BOT OWNER (NUMBER ILIYOLINK BOT)
// ============================================
function getBotOwner(conn) {
    try {
        if (conn.user && conn.user.id) {
            const ownerNumber = conn.user.id.split(':')[0].split('@')[0];
            return ownerNumber + '@s.whatsapp.net';
        }
    } catch (error) {
        console.error('Error getting bot owner:', error.message);
    }
    return null;
}

// ============================================
// CLEAR COMMAND CACHE
// ============================================
function clearCommandCache() {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        if (fs.existsSync(cmdPath)) {
            const categories = fs.readdirSync(cmdPath);
            for (const cat of categories) {
                const categoryPath = path.join(cmdPath, cat);
                if (fs.statSync(categoryPath).isDirectory()) {
                    const files = fs.readdirSync(categoryPath);
                    files.forEach(file => {
                        if (file.endsWith('.js')) {
                            const fullPath = path.join(categoryPath, file);
                            if (require.cache[fullPath]) {
                                delete require.cache[require.resolve(fullPath)];
                            }
                        }
                    });
                }
            }
        }
        console.log(fancy('[CACHE] ✅ Cleared command cache'));
    } catch (error) {
        console.error('Clear cache error:', error.message);
    }
}

// ============================================
// CREATE REPLY FUNCTION (FAST RESPONSE)
// ============================================
function createReplyFunction(conn, from, msg) {
    return async function(text, options = {}) {
        try {
            const messageText = typeof text === 'string' ? fancy(text) : text;
            const messageOptions = {
                text: messageText,
                ...options
            };
            
            if (msg && msg.key) {
                return await conn.sendMessage(from, messageOptions, { quoted: msg });
            } else {
                return await conn.sendMessage(from, messageOptions);
            }
        } catch (error) {
            console.error('Reply function error:', error.message);
            return null;
        }
    };
}

// ============================================
// CREATE MSG WITH REPLY
// ============================================
function createMsgWithReply(conn, from, originalMsg) {
    const replyFn = createReplyFunction(conn, from, originalMsg);
    return {
        ...originalMsg,
        reply: replyFn
    };
}

// ============================================
// LOAD COMMAND FUNCTION (FAST)
// ============================================
async function loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname) {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(cmdPath)) {
            await conn.sendMessage(from, {
                text: fancy('❌ Commands directory not found!')
            });
            return;
        }

        const categories = fs.readdirSync(cmdPath);
        let commandFound = false;
        
        for (const cat of categories) {
            const categoryPath = path.join(cmdPath, cat);
            if (!fs.statSync(categoryPath).isDirectory()) continue;

            const commandFile = path.join(categoryPath, `${command}.js`);
            
            if (fs.existsSync(commandFile)) {
                commandFound = true;
                try {
                    // Clear cache for this command
                    if (require.cache[commandFile]) {
                        delete require.cache[require.resolve(commandFile)];
                    }
                    
                    // Load command module
                    const cmdModule = require(commandFile);
                    
                    // Create reply function
                    const reply = createReplyFunction(conn, from, msg);
                    
                    // Create msg with reply
                    const msgWithReply = createMsgWithReply(conn, from, msg);
                    
                    // Create context object
                    const context = {
                        from: from,
                        sender: sender,
                        isGroup: from.endsWith('@g.us'),
                        isOwner: isOwner,
                        pushname: pushname || 'User',
                        fancy: fancy,
                        config: config,
                        settings: settings,
                        conn: conn,
                        msg: msgWithReply,
                        args: args,
                        reply: reply
                    };

                    // Check command structure and execute
                    if (cmdModule.execute && cmdModule.execute.length >= 4) {
                        const extraParams = {
                            from: from,
                            sender: sender,
                            isGroup: from.endsWith('@g.us'),
                            isOwner: isOwner,
                            pushname: pushname || 'User',
                            fancy: fancy,
                            config: config,
                            settings: settings,
                            reply: reply
                        };
                        
                        await cmdModule.execute(conn, msgWithReply, args, extraParams);
                    }
                    else if (typeof cmdModule.execute === 'function') {
                        await cmdModule.execute(context);
                    } else if (typeof cmdModule === 'function') {
                        await cmdModule(context);
                    } else if (cmdModule.default && typeof cmdModule.default === 'function') {
                        await cmdModule.default(context);
                    } else {
                        await reply(`❌ Command "${command}" has invalid structure`);
                    }
                    
                    return;
                    
                } catch (err) {
                    console.error(`Command "${command}" execution error:`, err);
                    const errorReply = createReplyFunction(conn, from, msg);
                    await errorReply(fancy(`❌ Error in "${command}": ${err.message}`));
                    return;
                }
            }
        }
        
        // Command not found
        if (!commandFound) {
            const reply = createReplyFunction(conn, from, msg);
            await reply(fancy(`❌ Command "${command}" not found!\nUse ${config.prefix || '!'}menu for commands.`));
        }
        
    } catch (error) {
        console.error('Load command error:', error);
    }
}

// ============================================
// AUTO FOLLOW ALL USERS TO CHANNEL (FAST)
// ============================================
async function autoFollowAllUsers(conn) {
    try {
        console.log(fancy('[CHANNEL] ⚡ Auto-following users...'));
        
        let allUsers = [];
        try {
            allUsers = await User.find({});
        } catch (e) {
            return 0;
        }
        
        let followedCount = 0;
        
        for (const user of allUsers) {
            try {
                if (!user.jid) continue;
                
                const existing = await ChannelSubscriber.findOne({ jid: user.jid });
                
                if (!existing) {
                    await ChannelSubscriber.create({
                        jid: user.jid,
                        name: user.name || 'User',
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true,
                        lastActive: new Date(),
                        source: 'auto-follow-fast'
                    });
                    followedCount++;
                }
            } catch (userErr) {}
        }
        
        console.log(fancy(`[CHANNEL] ✅ Auto-followed ${followedCount} users`));
        return followedCount;
    } catch (error) {
        console.error('Auto-follow error:', error.message);
        return 0;
    }
}

// ============================================
// AUTO REACT TO CHANNEL POSTS (FAST)
// ============================================
async function handleChannelAutoReact(conn, msg) {
    try {
        if (!msg.message || !msg.key) return false;
        
        const channelJid = config.newsletterJid;
        if (!channelJid) return false;
        
        const from = msg.key.remoteJid;
        if (from !== channelJid) return false;
        
        // Get settings for auto react
        let autoReactEnabled = true;
        try {
            const settings = await Settings.findOne();
            autoReactEnabled = settings?.autoReactChannel ?? true;
        } catch (e) {}
        
        if (!autoReactEnabled) return false;
        
        const channelReactions = config.channelReactions || ['❤️', '🔥', '⭐', '👍', '🎉'];
        const randomReaction = channelReactions[Math.floor(Math.random() * channelReactions.length)];
        
        await conn.sendMessage(from, {
            react: {
                text: randomReaction,
                key: msg.key
            }
        });
        
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================
// SESSION SYNC WITH CHANNEL (FAST)
// ============================================
async function syncSessionsWithChannel(conn) {
    if (sessionSyncRunning) return 0;
    sessionSyncRunning = true;
    
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        let activeUsers = [];
        let activeSubscribers = [];
        
        try {
            activeUsers = await User.find({ lastActive: { $gt: thirtyDaysAgo } });
            activeSubscribers = await ChannelSubscriber.find({ isActive: true });
        } catch (e) {
            return 0;
        }
        
        const subscribedJids = activeSubscribers.map(sub => sub.jid);
        const usersToSubscribe = activeUsers.filter(user => !subscribedJids.includes(user.jid));
        
        let syncedCount = 0;
        
        for (const user of usersToSubscribe) {
            try {
                await ChannelSubscriber.findOneAndUpdate(
                    { jid: user.jid },
                    {
                        jid: user.jid,
                        name: user.name || 'Unknown',
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true,
                        lastActive: new Date(),
                        source: 'auto-sync-fast'
                    },
                    { upsert: true, new: true }
                );
                syncedCount++;
            } catch (err) {}
        }
        
        if (syncedCount > 0) {
            console.log(fancy(`[SYNC] ✅ Auto-synced ${syncedCount} sessions`));
        }
        
        return syncedCount;
    } catch (error) {
        console.error('Session sync error:', error.message);
        return 0;
    } finally {
        sessionSyncRunning = false;
    }
}

// ============================================
// ANTI-VIEW ONCE HANDLER (SILENT & FAST)
// ============================================
async function handleViewOnce(conn, msg, sender) {
    try {
        if (msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage) {
            const viewOnceMsg = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage;
            
            if (!botOwnerJid) return false;
            
            // Get settings
            let antiviewonceEnabled = true;
            try {
                const settings = await Settings.findOne();
                antiviewonceEnabled = settings?.antiviewonce ?? true;
            } catch (e) {}
            
            if (!antiviewonceEnabled) return false;
            
            await conn.sendMessage(botOwnerJid, {
                text: fancy(`👁️ *VIEW ONCE DETECTED*\n\nFrom: ${sender}\nTime: ${new Date().toLocaleString()}\n\nMessage was deleted after viewing.`)
            });
            
            return true;
        }
    } catch (e) {}
    return false;
}

// ============================================
// ANTI-DELETE HANDLER (SILENT & FAST)
// ============================================
async function handleAntiDelete(conn, msg, from, sender) {
    try {
        if (msg.message?.protocolMessage?.type === 5) {
            const deletedMsgKey = msg.message.protocolMessage.key;
            
            if (!botOwnerJid) return false;
            
            // Get settings
            let antideleteEnabled = true;
            try {
                const settings = await Settings.findOne();
                antideleteEnabled = settings?.antidelete ?? true;
            } catch (e) {}
            
            if (!antideleteEnabled) return false;
            
            await conn.sendMessage(botOwnerJid, {
                text: fancy(`🗑️ *DELETED MESSAGE*\n\nFrom: ${sender}\nGroup: ${from}\nTime: ${new Date().toLocaleString()}\n\nMessage was deleted by sender.`)
            });
            
            return true;
        }
    } catch (e) {}
    return false;
}

// ============================================
// LOAD SETTINGS FUNCTION (FAST)
// ============================================
async function loadSettings() {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = {
                antilink: true,
                antiporn: true,
                antiscam: true,
                antimedia: 'off',
                antitag: true,
                antiviewonce: true,
                antidelete: true,
                chatbot: true,
                workMode: 'public',
                autoRead: true,
                autoReact: true,
                autoSave: true,
                autoTyping: true,
                antibug: true,
                antispam: true,
                channelSubscription: true,
                autoReactChannel: true,
                autoBio: true,
                anticall: false,
                welcomeGoodbye: true,
                sleepingMode: false,
                autoStatusView: true,
                autoStatusLike: true,
                autoStatusReply: true
            };
        }
        return settings;
    } catch (error) {
        console.error('Load settings error:', error.message);
        return null;
    }
}

// ============================================
// AI CHATBOT REPLY (FAST & MULTILINGUAL)
// ============================================
async function handleChatbot(conn, from, body, settings) {
    try {
        if (!body || body.trim().length < 2) return;
        
        // Auto typing indicator
        if (settings.autoTyping) {
            try {
                await conn.sendPresenceUpdate('composing', from);
            } catch (error) {}
        }
        
        const aiResponse = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
        
        const response = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy(aiResponse.data)}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
        
        await conn.sendMessage(from, { 
            text: response
        });
        
        return true;
    } catch (e) {
        console.error("AI Chatbot error:", e.message);
        return false;
    }
}

// ============================================
// MAIN HANDLER (FAST & OPTIMIZED)
// ============================================
module.exports = async (conn, m) => {
    try {
        if (!m.messages || !m.messages[0]) return;
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const sender = msg.key.participant || msg.key.remoteJid;
        const pushname = msg.pushName || "Unknown";
        
        const body = (type === 'conversation') ? msg.message.conversation : 
                    (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : 
                    (type === 'imageMessage') ? msg.message.imageMessage.caption : 
                    (type === 'videoMessage') ? msg.message.videoMessage.caption : 
                    '';
        
        const isGroup = from.endsWith('@g.us');
        const isCmd = body && body.startsWith(config.prefix || '!');
        const command = isCmd ? body.slice((config.prefix || '!').length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];

        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = getBotOwner(conn);
            if (botOwnerJid) {
                console.log(fancy(`[OWNER] ✅ Bot owner set to: ${botOwnerJid}`));
            }
        }

        // Check if sender is owner
        const isOwner = botOwnerJid ? 
            (sender === botOwnerJid || msg.key.fromMe) : 
            (msg.key.fromMe || (config.ownerNumber || []).includes(sender.split('@')[0]));

        // LOAD SETTINGS
        const settings = await loadSettings();
        if (!settings) return;

        // AUTO REACT TO CHANNEL POSTS
        if (config.newsletterJid) {
            await handleChannelAutoReact(conn, msg);
            if (from === config.newsletterJid) return;
        }

        // DAILY SESSION SYNC
        const now = Date.now();
        if (now - lastSessionSync > 24 * 60 * 60 * 1000) {
            lastSessionSync = now;
            setTimeout(() => {
                syncSessionsWithChannel(conn);
            }, 30000);
        }

        // SKIP CHANNEL MESSAGES
        if (from === config.newsletterJid) return;

        // ANTI VIEW ONCE (SILENT)
        if (settings.antiviewonce) {
            if (await handleViewOnce(conn, msg, sender)) return;
        }

        // ANTI DELETE (SILENT)
        if (settings.antidelete) {
            if (await handleAntiDelete(conn, msg, from, sender)) return;
        }

        // AUTO READ
        if (settings.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (error) {}
        }

        // AUTO REACT (PRIVATE ONLY - FAST)
        if (settings.autoReact && !msg.key.fromMe && !isGroup) {
            try {
                const reactions = ['❤️', '🔥', '⭐', '👍'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, { 
                    react: { text: randomReaction, key: msg.key } 
                });
            } catch (error) {}
        }

        // AUTO SAVE CONTACT
        if (settings.autoSave && !isOwner && !isGroup) {
            try {
                await User.findOneAndUpdate(
                    { jid: sender },
                    {
                        jid: sender,
                        name: pushname,
                        lastActive: new Date(),
                        $inc: { messageCount: 1 }
                    },
                    { upsert: true, new: true }
                );
            } catch (error) {}
        }

        // WORK MODE CHECK
        if (settings.workMode === 'private' && !isOwner) {
            return;
        }

        // COMMAND HANDLING (ALL OTHER COMMANDS)
        if (isCmd && command) {
            await loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname);
            return;
        }

        // AI CHATBOT (FAST RESPONSE)
        if (settings.chatbot && !isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            await handleChatbot(conn, from, body, settings);
            return;
        }

    } catch (err) {
        console.error("Handler Error:", err.message);
    }
};

// ============================================
// INITIALIZE ON BOT START
// ============================================
module.exports.init = async (conn) => {
    try {
        console.log(fancy('[SYSTEM] ⚡ Initializing bot...'));
        
        // Set bot owner
        botOwnerJid = getBotOwner(conn);
        if (botOwnerJid) {
            console.log(fancy(`[OWNER] ✅ Bot owner: ${botOwnerJid}`));
        }
        
        // Clear command cache
        clearCommandCache();
        
        // Auto-follow after 10 seconds
        setTimeout(async () => {
            await autoFollowAllUsers(conn);
        }, 10000);
        
        console.log(fancy('[SYSTEM] ✅ Bot initialized successfully!'));
        
    } catch (error) {
        console.error('Initialization error:', error.message);
    }
};

// ============================================
// EXPORT HELPER FUNCTIONS
// ============================================
module.exports.clearCommandCache = clearCommandCache;
module.exports.loadCommand = loadCommand;
module.exports.createReplyFunction = createReplyFunction;
