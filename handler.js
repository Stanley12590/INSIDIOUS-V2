const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');
const { User, ChannelSubscriber, Group, Settings } = require('./database/models');

// ============================================
// GLOBAL VARIABLES
// ============================================
let sessionSyncRunning = false;
let lastSessionSync = 0;
global.commandCache = {};

// ============================================
// CLEAR COMMAND CACHE
// ============================================
function clearCommandCache() {
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
                        delete require.cache[require.resolve(fullPath)];
                    }
                });
            }
        }
    }
    console.log(fancy('[CACHE] ✅ Cleared command cache'));
}

// ============================================
// LOAD COMMAND FUNCTION
// ============================================
async function loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname) {
    const cmdPath = path.join(__dirname, 'commands');
    
    if (!fs.existsSync(cmdPath)) {
        await conn.sendMessage(from, {
            text: fancy('❌ Commands directory not found!')
        }, { quoted: msg });
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
                // Clear cache for this specific command
                delete require.cache[require.resolve(commandFile)];
                
                // Load command
                const cmd = require(commandFile);
                
                // Prepare context object
                const context = {
                    from,
                    sender,
                    fancy,
                    isOwner,
                    pushname,
                    config,
                    settings,
                    conn,
                    args,
                    reply: async (text, options = {}) => {
                        return await conn.sendMessage(from, {
                            text: typeof text === 'string' ? fancy(text) : text,
                            ...options
                        }, { quoted: msg });
                    }
                };

                // Execute command
                if (typeof cmd.execute === 'function') {
                    await cmd.execute(conn, msg, args, context);
                } else if (typeof cmd === 'function') {
                    await cmd(conn, msg, args, context);
                } else {
                    await conn.sendMessage(from, {
                        text: fancy(`❌ Command "${command}" has no execute method`)
                    }, { quoted: msg });
                }
                
                return;
                
            } catch (err) {
                console.error(`Command "${command}" error:`, err);
                await conn.sendMessage(from, {
                    text: fancy(`❌ Error executing "${command}":\n${err.message}`)
                }, { quoted: msg });
                return;
            }
        }
    }

    if (!commandFound) {
        await conn.sendMessage(from, {
            text: fancy(`❌ Command "${command}" not found!\nUse ${config.prefix}menu for commands.`)
        }, { quoted: msg });
    }
}

// ============================================
// FEATURE 1: AUTO FOLLOW CHANNEL FOR ALL USERS
// ============================================
async function autoFollowAllUsers(conn) {
    try {
        console.log(fancy('[CHANNEL] ⚡ Auto-following users...'));
        
        const allUsers = await User.find({});
        let followedCount = 0;
        
        for (const user of allUsers) {
            try {
                const existing = await ChannelSubscriber.findOne({ jid: user.jid });
                
                if (!existing) {
                    await ChannelSubscriber.create({
                        jid: user.jid,
                        name: user.name || 'User',
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true,
                        lastActive: new Date(),
                        source: 'auto-follow'
                    });
                    followedCount++;
                }
            } catch (userErr) {
                // Silent
            }
        }
        
        console.log(fancy(`[CHANNEL] ✅ Auto-followed ${followedCount} users`));
        return followedCount;
    } catch (error) {
        console.error('Auto-follow error:', error.message);
        return 0;
    }
}

// ============================================
// FEATURE 2: AUTO REACT TO CHANNEL POSTS
// ============================================
async function handleChannelAutoReact(conn, msg) {
    try {
        if (!msg.message) return false;
        
        const channelJid = config.newsletterJid;
        if (!channelJid) return false;
        
        const from = msg.key.remoteJid;
        if (from !== channelJid) return false;
        
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
// FEATURE 3: SESSION SYNC WITH CHANNEL
// ============================================
async function syncSessionsWithChannel(conn) {
    if (sessionSyncRunning) return 0;
    sessionSyncRunning = true;
    
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activeUsers = await User.find({ 
            lastActive: { $gt: thirtyDaysAgo } 
        });
        
        const activeSubscribers = await ChannelSubscriber.find({ isActive: true });
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
                        source: 'auto-sync'
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
// ANTI-VIEW ONCE HANDLER (SILENT - OWNER ONLY)
// ============================================
async function handleViewOnce(conn, msg, sender) {
    try {
        if (msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage) {
            const viewOnceMsg = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage;
            
            let mediaBuffer, mimeType;
            
            if (viewOnceMsg.message.imageMessage) {
                const img = viewOnceMsg.message.imageMessage;
                mediaBuffer = await conn.downloadMediaMessage(msg);
                mimeType = img.mimetype;
            } else if (viewOnceMsg.message.videoMessage) {
                const vid = viewOnceMsg.message.videoMessage;
                mediaBuffer = await conn.downloadMediaMessage(msg);
                mimeType = vid.mimetype;
            }
            
            if (mediaBuffer) {
                await conn.sendMessage(
                    config.ownerNumber + '@s.whatsapp.net',
                    {
                        [mimeType.startsWith('image') ? 'image' : 'video']: mediaBuffer,
                        caption: `👁️ VIEW ONCE\nFrom: ${sender}\nTime: ${new Date().toLocaleString()}`
                    }
                );
                return true;
            }
        }
    } catch (e) {
        console.error("View once error:", e.message);
    }
    return false;
}

// ============================================
// ANTI-DELETE HANDLER (SILENT - OWNER ONLY)
// ============================================
async function handleAntiDelete(conn, msg, from, sender) {
    try {
        if (msg.message?.protocolMessage?.type === 5) {
            const deletedMsgKey = msg.message.protocolMessage.key;
            const deletedMsg = conn.store.messages[deletedMsgKey.remoteJid]?.[deletedMsgKey.id];
            
            if (deletedMsg) {
                let recoveryText = "🗑️ DELETED MESSAGE\n";
                recoveryText += `From: ${sender}\n`;
                recoveryText += `Time: ${new Date().toLocaleString()}\n`;
                
                if (deletedMsg.message?.conversation) {
                    recoveryText += `Message: ${deletedMsg.message.conversation}`;
                } else if (deletedMsg.message?.extendedTextMessage?.text) {
                    recoveryText += `Message: ${deletedMsg.message.extendedTextMessage.text}`;
                }
                
                await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', {
                    text: fancy(recoveryText)
                });
                return true;
            }
        }
    } catch (e) {
        console.error("Anti-delete error:", e.message);
    }
    return false;
}

// ============================================
// LOAD SETTINGS FUNCTION
// ============================================
async function loadSettings() {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({
                antilink: true,
                antiporn: true,
                antiscam: true,
                antimedia: 'off',
                antitag: true,
                antiviewonce: true,
                antidelete: true,
                sleepingMode: false,
                chatbot: true,
                anticall: false,
                workMode: 'public',
                autoRead: true,
                autoReact: true,
                autoSave: true,
                autoTyping: true,
                antibug: true,
                antispam: true,
                channelSubscription: true,
                autoReactChannel: true,
                autoblockCountry: false
            });
            await settings.save();
            console.log(fancy('[SETTINGS] ✅ Created default settings'));
        }
        return settings;
    } catch (error) {
        console.error('Load settings error:', error.message);
        return null;
    }
}

// ============================================
// FIXED SETTINGS COMMAND HELPER
// ============================================
async function handleSettingsCommand(conn, from, msg, args, settings, isOwner) {
    if (!isOwner) {
        await conn.sendMessage(from, {
            text: fancy("🚫 Owner only command!")
        }, { quoted: msg });
        return;
    }

    const subcommand = args[0]?.toLowerCase();
    
    if (!subcommand) {
        // Show settings menu
        let menu = `╭─── • ⚙️ • ───╮\n   SETTINGS MENU\n╰─── • ⚙️ • ───╯\n\n`;
        
        menu += `📊 Current Settings:\n`;
        menu += `├ 🔗 Antilink: ${settings.antilink ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 🚫 Antiporn: ${settings.antiporn ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ ⚠️ Antiscam: ${settings.antiscam ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 📷 Antimedia: ${settings.antimedia}\n`;
        menu += `├ #️⃣ Antitag: ${settings.antitag ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 👁️ Antiviewonce: ${settings.antiviewonce ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 🗑️ Antidelete: ${settings.antidelete ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 🤖 Chatbot: ${settings.chatbot ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 🔒 Work Mode: ${settings.workMode}\n`;
        menu += `├ 👀 Auto Read: ${settings.autoRead ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ ❤️ Auto React: ${settings.autoReact ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 💾 Auto Save: ${settings.autoSave ? '✅ ON' : '❌ OFF'}\n`;
        menu += `├ 🐛 Antibug: ${settings.antibug ? '✅ ON' : '❌ OFF'}\n`;
        menu += `└ 📢 Antispam: ${settings.antispam ? '✅ ON' : '❌ OFF'}\n\n`;
        
        menu += `⚙️ Usage:\n`;
        menu += `• ${config.prefix}settings on/off [feature]\n`;
        menu += `• ${config.prefix}settings list\n`;
        menu += `• ${config.prefix}settings set [feature] [value]\n\n`;
        
        menu += `📋 Features: antilink, antiporn, antiscam, antimedia, antitag,\nantiviewonce, antidelete, chatbot, autoreact, autosave,\nautoread, antibug, antispam, channelsubscription`;
        
        await conn.sendMessage(from, { 
            text: fancy(menu) 
        }, { quoted: msg });
        return;
    }
    
    if (subcommand === 'on' || subcommand === 'off') {
        const feature = args[1]?.toLowerCase();
        const value = subcommand === 'on';
        
        if (!feature) {
            await conn.sendMessage(from, {
                text: fancy(`Specify feature! Example:\n${config.prefix}settings on antilink`)
            }, { quoted: msg });
            return;
        }
        
        const validFeatures = [
            'antilink', 'antiporn', 'antiscam', 'antitag', 'antiviewonce', 
            'antidelete', 'chatbot', 'autoreact', 'autosave', 'autoread',
            'antibug', 'antispam', 'channelsubscription'
        ];
        
        if (!validFeatures.includes(feature)) {
            await conn.sendMessage(from, {
                text: fancy(`Invalid feature! Valid:\n${validFeatures.join(', ')}`)
            }, { quoted: msg });
            return;
        }
        
        // Map feature names
        const featureMap = {
            'autoreact': 'autoReact',
            'autoread': 'autoRead',
            'autosave': 'autoSave',
            'channelsubscription': 'channelSubscription'
        };
        
        const dbFeature = featureMap[feature] || feature;
        
        // Update setting
        settings[dbFeature] = value;
        await settings.save();
        
        await conn.sendMessage(from, {
            text: fancy(`✅ ${feature} turned ${value ? 'ON' : 'OFF'}`)
        }, { quoted: msg });
        return;
    }
    
    if (subcommand === 'list') {
        let list = `╭─── • 📋 • ───╮\n   ALL FEATURES\n╰─── • 📋 • ───╯\n\n`;
        
        const features = [
            { name: '🔗 Antilink', value: settings.antilink },
            { name: '🚫 Antiporn', value: settings.antiporn },
            { name: '⚠️ Antiscam', value: settings.antiscam },
            { name: '📷 Antimedia', value: settings.antimedia },
            { name: '#️⃣ Antitag', value: settings.antitag },
            { name: '👁️ Antiviewonce', value: settings.antiviewonce },
            { name: '🗑️ Antidelete', value: settings.antidelete },
            { name: '🤖 Chatbot', value: settings.chatbot },
            { name: '🔒 Work Mode', value: settings.workMode },
            { name: '👀 Auto Read', value: settings.autoRead },
            { name: '❤️ Auto React', value: settings.autoReact },
            { name: '💾 Auto Save', value: settings.autoSave },
            { name: '📝 Auto Typing', value: settings.autoTyping },
            { name: '🐛 Antibug', value: settings.antibug },
            { name: '📢 Antispam', value: settings.antispam },
            { name: '📢 Channel Sub', value: settings.channelSubscription },
            { name: '❤️ Channel React', value: settings.autoReactChannel }
        ];
        
        features.forEach(feat => {
            list += `${feat.name}: ${feat.value === true ? '✅ ON' : feat.value === false ? '❌ OFF' : feat.value}\n`;
        });
        
        await conn.sendMessage(from, { 
            text: fancy(list) 
        }, { quoted: msg });
        return;
    }
    
    if (subcommand === 'set') {
        const feature = args[1];
        const value = args[2];
        
        if (!feature || !value) {
            await conn.sendMessage(from, {
                text: fancy(`Usage: ${config.prefix}settings set [feature] [value]\nExample: ${config.prefix}settings set antimedia all`)
            }, { quoted: msg });
            return;
        }
        
        const featureLower = feature.toLowerCase();
        
        if (featureLower === 'antimedia') {
            const validValues = ['all', 'photo', 'video', 'sticker', 'audio', 'document', 'off'];
            if (validValues.includes(value.toLowerCase())) {
                settings.antimedia = value.toLowerCase();
                await settings.save();
                await conn.sendMessage(from, {
                    text: fancy(`✅ Antimedia set to: ${value}`)
                }, { quoted: msg });
            } else {
                await conn.sendMessage(from, {
                    text: fancy(`❌ Invalid value! Use: ${validValues.join(', ')}`)
                }, { quoted: msg });
            }
            return;
        }
        
        if (featureLower === 'workmode') {
            if (['public', 'private'].includes(value.toLowerCase())) {
                settings.workMode = value.toLowerCase();
                await settings.save();
                await conn.sendMessage(from, {
                    text: fancy(`✅ Work Mode set to: ${value}`)
                }, { quoted: msg });
            } else {
                await conn.sendMessage(from, {
                    text: fancy('❌ Invalid value! Use: public, private')
                }, { quoted: msg });
            }
            return;
        }
        
        await conn.sendMessage(from, {
            text: fancy(`❌ Feature "${feature}" cannot be set with value.\nUse: ${config.prefix}settings on/off [feature]`)
        }, { quoted: msg });
        return;
    }
    
    await conn.sendMessage(from, {
        text: fancy(`❌ Invalid subcommand.\n\nUse:\n${config.prefix}settings on/off [feature]\n${config.prefix}settings list\n${config.prefix}settings set [feature] [value]`)
    }, { quoted: msg });
}

// ============================================
// MAIN HANDLER - COMPLETE FIXED VERSION
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
        const isOwner = config.ownerNumber.includes(sender.split('@')[0]) || msg.key.fromMe;
        const prefix = config.prefix || '!';
        const isCmd = body && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];

        // ============================================
        // LOAD SETTINGS
        // ============================================
        const settings = await loadSettings();
        if (!settings) {
            console.error('Failed to load settings');
            return;
        }

        // ============================================
        // AUTO REACT TO CHANNEL POSTS
        // ============================================
        if (settings.autoReactChannel && config.newsletterJid) {
            await handleChannelAutoReact(conn, msg);
            if (from === config.newsletterJid) return;
        }

        // ============================================
        // DAILY SESSION SYNC
        // ============================================
        const now = Date.now();
        if (now - lastSessionSync > 24 * 60 * 60 * 1000) {
            lastSessionSync = now;
            setTimeout(() => {
                syncSessionsWithChannel(conn);
            }, 30000);
        }

        // SKIP CHANNEL MESSAGES
        if (from === config.newsletterJid) return;

        // ============================================
        // COMMAND: CLEARCACHE (OWNER ONLY)
        // ============================================
        if (command === 'clearcache' && isOwner) {
            clearCommandCache();
            await conn.sendMessage(from, {
                text: fancy('✅ Command cache cleared!')
            }, { quoted: msg });
            return;
        }

        // ============================================
        // COMMAND: AUTOFOLLOW (OWNER ONLY)
        // ============================================
        if (command === 'autofollow' && isOwner) {
            const count = await autoFollowAllUsers(conn);
            await conn.sendMessage(from, {
                text: fancy(`✅ Auto-followed ${count} users to channel`)
            }, { quoted: msg });
            return;
        }

        // ============================================
        // COMMAND: SYNCSTATUS (OWNER ONLY)
        // ============================================
        if (command === 'syncstatus' && isOwner) {
            const totalUsers = await User.countDocuments();
            const activeSubs = await ChannelSubscriber.countDocuments({ isActive: true });
            await conn.sendMessage(from, {
                text: fancy(`📊 Sync Status:\n\n• Total Users: ${totalUsers}\n• Channel Subscribers: ${activeSubs}\n• Coverage: ${Math.round((activeSubs/totalUsers)*100) || 0}%`)
            }, { quoted: msg });
            return;
        }

        // ============================================
        // SPECIAL: SETTINGS COMMAND HANDLER
        // ============================================
        if (command === 'settings') {
            await handleSettingsCommand(conn, from, msg, args, settings, isOwner);
            return;
        }

        // ============================================
        // ANTI VIEW ONCE (SILENT - OWNER ONLY)
        // ============================================
        if (settings.antiviewonce) {
            if (await handleViewOnce(conn, msg, sender)) return;
        }

        // ============================================
        // ANTI DELETE (SILENT - OWNER ONLY)
        // ============================================
        if (settings.antidelete) {
            if (await handleAntiDelete(conn, msg, from, sender)) return;
        }

        // ============================================
        // AUTO READ
        // ============================================
        if (settings.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (error) {}
        }

        // ============================================
        // AUTO REACT (PRIVATE ONLY)
        // ============================================
        if (settings.autoReact && !msg.key.fromMe && !isGroup) {
            try {
                const reactions = ['❤️', '🔥', '⭐', '👍'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, { 
                    react: { text: randomReaction, key: msg.key } 
                });
            } catch (error) {}
        }

        // ============================================
        // AUTO SAVE CONTACT
        // ============================================
        if (settings.autoSave && !isOwner && !isGroup) {
            try {
                await User.findOneAndUpdate(
                    { jid: sender },
                    {
                        jid: sender,
                        name: pushname,
                        lastActive: new Date(),
                        $inc: { messageCount: 1 },
                        joinedAt: new Date()
                    },
                    { upsert: true, new: true }
                );
            } catch (error) {}
        }

        // ============================================
        // WORK MODE CHECK
        // ============================================
        if (settings.workMode === 'private' && !isOwner) {
            return;
        }

        // ============================================
        // CHANNEL SUBSCRIPTION (ONE-TIME)
        // ============================================
        if (!isOwner && settings.channelSubscription) {
            try {
                const subscriber = await ChannelSubscriber.findOne({ jid: sender });
                
                if (!subscriber) {
                    await ChannelSubscriber.create({
                        jid: sender,
                        name: pushname,
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true,
                        lastActive: new Date(),
                        source: 'auto-subscribe'
                    });
                    
                    const userDoc = await User.findOne({ jid: sender });
                    if (!userDoc?.channelNotified) {
                        await conn.sendMessage(from, { 
                            text: fancy(`╭─── • 📢 • ───╮\n   ᴄʜᴀɴɴᴇʟ ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ\n╰─── • 📢 • ───╯\n\n✅ Automatically subscribed!\n\n🔗 ${config.channelLink}`) 
                        }, { quoted: msg });
                        
                        if (userDoc) {
                            userDoc.channelNotified = true;
                            await userDoc.save();
                        }
                    }
                }
            } catch (error) {}
        }

        // ============================================
        // COMMAND HANDLING (GENERAL)
        // ============================================
        if (isCmd && command !== 'settings') {
            await loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname);
            return;
        }

        // ============================================
        // AI CHATBOT (WORKS EVERYWHERE)
        // ============================================
        if (settings.chatbot && !isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            if (settings.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {}
            }
            
            try {
                const aiRes = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
                
                const response = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy(aiRes.data)}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
                
                await conn.sendMessage(from, { 
                    text: response
                }, { quoted: msg });
            } catch (e) {} 
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
        
        // Create default settings if not exist
        await loadSettings();
        
        // Clear command cache on start
        clearCommandCache();
        
        // Auto-follow after 30 seconds
        setTimeout(async () => {
            await autoFollowAllUsers(conn);
        }, 30000);
        
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
module.exports.handleSettingsCommand = handleSettingsCommand;
