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

// ============================================
// FEATURE 1: AUTO FOLLOW CHANNEL FOR ALL USERS (SILENT)
// ============================================
async function autoFollowAllUsers(conn) {
    try {
        console.log(fancy('[CHANNEL] ⚡ Auto-following all existing users...'));
        
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
                        lastActive: user.lastActive || new Date(),
                        source: 'auto-follow'
                    });
                    followedCount++;
                }
            } catch (userErr) {
                // Silent fail
            }
        }
        
        console.log(fancy(`[CHANNEL] ✅ Auto-followed ${followedCount} users to channel`));
        
        // Notify owner only
        if (followedCount > 0) {
            await conn.sendMessage(
                config.ownerNumber + '@s.whatsapp.net',
                { text: fancy(`📊 AUTO-FOLLOW COMPLETE\n\nSuccessfully auto-followed ${followedCount} users to channel.`) }
            );
        }
        
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
        console.error('Channel auto-react error:', error.message);
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
        // Get active users (last 30 days)
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
            } catch (err) {
                // Silent fail
            }
        }
        
        if (syncedCount > 0) {
            console.log(fancy(`[SYNC] ✅ Auto-synced ${syncedCount} sessions to channel`));
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
// ANTI-VIEW ONCE HANDLER (COMPLETELY SILENT - OWNER ONLY)
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
                // Send to owner only - SILENT
                await conn.sendMessage(
                    config.ownerNumber + '@s.whatsapp.net',
                    {
                        [mimeType.startsWith('image') ? 'image' : 'video']: mediaBuffer,
                        caption: `👁️ VIEW ONCE CAPTURED\nFrom: ${sender}\nTime: ${new Date().toLocaleString()}`
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
// ANTI-DELETE HANDLER (COMPLETELY SILENT - OWNER ONLY)
// ============================================
async function handleAntiDelete(conn, msg, from, sender) {
    try {
        if (msg.message?.protocolMessage?.type === 5) {
            const deletedMsgKey = msg.message.protocolMessage.key;
            const deletedMsg = conn.store.messages[deletedMsgKey.remoteJid]?.[deletedMsgKey.id];
            
            if (deletedMsg) {
                let recoveryText = "🗑️ DELETED MESSAGE RECOVERED\n";
                recoveryText += `From: ${sender}\n`;
                recoveryText += `Time: ${new Date().toLocaleString()}\n`;
                
                if (deletedMsg.message?.conversation) {
                    recoveryText += `Message: ${deletedMsg.message.conversation}`;
                } else if (deletedMsg.message?.extendedTextMessage?.text) {
                    recoveryText += `Message: ${deletedMsg.message.extendedTextMessage.text}`;
                } else if (deletedMsg.message?.imageMessage?.caption) {
                    recoveryText += `Message: [Image] ${deletedMsg.message.imageMessage.caption || ''}`;
                } else {
                    recoveryText += `Message: [Media/Unknown]`;
                }
                
                // Send to owner only - SILENT
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
            settings = new Settings();
            await settings.save();
        }
        return settings;
    } catch (error) {
        console.error('Load settings error:', error.message);
        return null;
    }
}

// ============================================
// CREATE MSG WITH REPLY METHOD
// ============================================
function createMessageWithReply(originalMsg, conn, from) {
    const msgWithReply = { ...originalMsg };
    
    msgWithReply.reply = async function(text, options = {}) {
        try {
            return await conn.sendMessage(from, {
                text: typeof text === 'string' ? fancy(text) : text,
                ...options
            }, { 
                quoted: originalMsg 
            });
        } catch (error) {
            console.error('Reply error:', error.message);
            return null;
        }
    };
    
    return msgWithReply;
}

// ============================================
// MAIN HANDLER - BALANCED VERSION
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
        const prefix = config.prefix;
        const isCmd = body && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];

        // ============================================
        // LOAD SETTINGS
        // ============================================
        const settings = await loadSettings();
        if (!settings) return;

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
        // OWNER COMMANDS
        // ============================================
        if (command === 'autofollow' && isOwner) {
            const count = await autoFollowAllUsers(conn);
            await conn.sendMessage(from, {
                text: fancy(`✅ Auto-followed ${count} users to channel`)
            }, { quoted: msg });
            return;
        }

        if (command === 'syncstatus' && isOwner) {
            const totalUsers = await User.countDocuments();
            const activeSubs = await ChannelSubscriber.countDocuments({ isActive: true });
            await conn.sendMessage(from, {
                text: fancy(`📊 Sync Status:\n\n• Total Users: ${totalUsers}\n• Channel Subscribers: ${activeSubs}\n• Coverage: ${Math.round((activeSubs/totalUsers)*100) || 0}%`)
            }, { quoted: msg });
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
            } catch (error) {
                console.error("Auto read error:", error.message);
            }
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
            } catch (error) {
                console.error("Auto react error:", error.message);
            }
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
            } catch (error) {
                console.error("Auto save error:", error.message);
            }
        }

        // ============================================
        // WORK MODE CHECK
        // ============================================
        if (settings.workMode === 'private' && !isOwner) {
            return;
        }

        // ============================================
        // CHANNEL SUBSCRIPTION (ONE-TIME NOTIFICATION)
        // ============================================
        if (!isOwner && settings.channelSubscription) {
            try {
                const subscriber = await ChannelSubscriber.findOne({ jid: sender });
                
                if (!subscriber) {
                    // Subscribe user
                    await ChannelSubscriber.create({
                        jid: sender,
                        name: pushname,
                        subscribedAt: new Date(),
                        isActive: true,
                        autoFollow: true,
                        lastActive: new Date(),
                        source: 'auto-subscribe'
                    });
                    
                    // Send ONE-TIME notification
                    const userDoc = await User.findOne({ jid: sender });
                    if (!userDoc?.channelNotified) {
                        await conn.sendMessage(from, { 
                            text: fancy(`╭─── • 📢 • ───╮\n   ᴄʜᴀɴɴᴇʟ ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ\n╰─── • 📢 • ───╯\n\n✅ Automatically subscribed to our channel!\n\n🔗 ${config.channelLink}\n\nYou can now use all bot features.`) 
                        }, { quoted: msg });
                        
                        if (userDoc) {
                            userDoc.channelNotified = true;
                            await userDoc.save();
                        }
                    }
                }
            } catch (error) {
                console.error("Channel subscription error:", error.message);
            }
        }

        // ============================================
        // ANTI-BUG (SHOW WARNING IN GROUPS)
        // ============================================
        if (settings.antibug && body && !isCmd && !isOwner) {
            const bugPatterns = [
                /\u200e|\u200f|\u202e|\u202a|\u202b|\u202c|\u202d/,
                /\u2066|\u2067|\u2068|\u2069/,
                /[\uFFF0-\uFFFF]/,
                /\uFEFF|\u200B|\u200C|\u200D/,
            ];
            
            const hasBug = bugPatterns.some(pattern => pattern.test(body));
            
            if (hasBug) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    if (isGroup) {
                        await conn.sendMessage(from, { 
                            text: fancy(`🚫 ʙᴜɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${sender.split('@')[0]} sent malicious content\nMessage deleted for security.`),
                            mentions: [sender]
                        });
                    }
                    
                    // Still notify owner
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`⚠️ ʙᴜɢ ᴀᴛᴛᴇᴍᴘᴛ\nFrom: ${sender}\nContent: ${body.substring(0, 50)}...`) 
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antibug error:", error.message);
                }
            }
        }

        // ============================================
        // ANTI-SPAM (SHOW WARNING IN GROUPS)
        // ============================================
        if (settings.antispam && !isOwner) {
            try {
                let user = await User.findOne({ jid: sender });
                const now = Date.now();
                
                if (user) {
                    const timeDiff = now - (user.lastMessageTime || 0);
                    if (timeDiff < 2000) {
                        user.spamCount = (user.spamCount || 0) + 1;
                        
                        if (user.spamCount >= 3) {
                            if (isGroup) {
                                // Warn before removing
                                await conn.sendMessage(from, { 
                                    text: fancy(`⚠️ ꜱᴘᴀᴍᴍɪɴɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${sender.split('@')[0]} stop spamming!`),
                                    mentions: [sender]
                                });
                                
                                // Remove after warning
                                setTimeout(async () => {
                                    try {
                                        await conn.groupParticipantsUpdate(from, [sender], "remove");
                                    } catch (groupError) {}
                                }, 3000);
                            } else {
                                await conn.updateBlockStatus(sender, 'block');
                            }
                            user.spamCount = 0;
                        }
                    } else {
                        user.spamCount = 0;
                    }
                    user.lastMessageTime = now;
                    await user.save();
                } else {
                    await User.create({
                        jid: sender,
                        name: pushname,
                        lastMessageTime: now,
                        messageCount: 1,
                        spamCount: 0
                    });
                }
            } catch (error) {
                console.error("Antispam error:", error.message);
            }
        }

        // ============================================
        // AUTO-BLOCK COUNTRY
        // ============================================
        if (settings.autoblockCountry && config.autoblock && config.autoblock.length > 0 && !isOwner) {
            try {
                const countryCode = sender.split('@')[0].substring(0, 3);
                const cleanCode = countryCode.replace('+', '');
                
                if (config.autoblock.includes(cleanCode)) {
                    await conn.updateBlockStatus(sender, 'block');
                    console.log(fancy(`[AUTOBLOCK] Blocked ${countryCode} user`));
                    return;
                }
            } catch (error) {
                console.error("Autoblock error:", error.message);
            }
        }

        // ============================================
        // GROUP SECURITY FEATURES (SHOW WARNINGS)
        // ============================================
        if (isGroup) {
            let groupData = await Group.findOne({ jid: from });
            if (!groupData) {
                groupData = new Group({
                    jid: from,
                    settings: {
                        antilink: settings.antilink,
                        antiporn: settings.antiporn,
                        antiscam: settings.antiscam,
                        antimedia: settings.antimedia,
                        antitag: settings.antitag
                    }
                });
                await groupData.save();
            }

            // ANTI-LINK (SHOW WARNING)
            if (groupData.settings.antilink && body && body.match(/(https?:\/\/|www\.|\.com|\.co)/gi) && !isCmd) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`⚠️ ʟɪɴᴋꜱ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ\n@${sender.split('@')[0]} links are not allowed in this group!`),
                        mentions: [sender]
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antilink error:", error.message);
                }
            }

            // ANTI-SCAM (SHOW WARNING)
            if (groupData.settings.antiscam && body && config.scamWords && config.scamWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`🚫 ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${sender.split('@')[0]} scam messages are not allowed!`),
                        mentions: [sender]
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antiscam error:", error.message);
                }
            }

            // ANTI-PORN (SHOW WARNING + REMOVE)
            if (groupData.settings.antiporn && body && config.pornWords && config.pornWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`🚫 ᴀᴅᴜʟᴛ ᴄᴏɴᴛᴇɴᴛ\n@${sender.split('@')[0]} adult content is strictly prohibited!`),
                        mentions: [sender]
                    });
                    
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    
                    return;
                } catch (error) {
                    console.error("Antiporn error:", error.message);
                }
            }

            // ANTI-TAG (SHOW WARNING)
            if (groupData.settings.antitag) {
                const mentionedCount = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length || 0;
                
                if ((body?.includes('@everyone') || body?.includes('@all') || mentionedCount > 5) && !isOwner) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ᴇxᴄᴇꜱꜱɪᴠᴇ ᴛᴀɢɢɪɴɢ\n@${sender.split('@')[0]} please don't tag everyone!`),
                            mentions: [sender]
                        });
                        
                        return;
                    } catch (error) {
                        console.error("Antitag error:", error.message);
                    }
                }
            }

            // ANTI-MEDIA (SHOW WARNING)
            if (groupData.settings.antimedia !== 'off' && !isOwner) {
                const mediaTypes = {
                    'imageMessage': 'photo',
                    'videoMessage': 'video',
                    'stickerMessage': 'sticker',
                    'audioMessage': 'audio',
                    'documentMessage': 'document'
                };
                
                if (mediaTypes[type] && 
                    (groupData.settings.antimedia === 'all' || groupData.settings.antimedia === mediaTypes[type])) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ᴍᴇᴅɪᴀ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ\n@${sender.split('@')[0]} ${mediaTypes[type]} not allowed in this group!`),
                            mentions: [sender]
                        });
                        
                        return;
                    } catch (error) {
                        console.error("Antimedia error:", error.message);
                    }
                }
            }
        }

        // ============================================
        // AI CHATBOT (WORKS EVERYWHERE)
        // ============================================
        if (settings.chatbot && !isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            // Skip if in group and group has antimedia settings that might block
            if (isGroup) {
                const groupData = await Group.findOne({ jid: from });
                if (groupData?.settings?.antimedia === 'all') {
                    return; // Skip AI in groups with antimedia all
                }
            }
            
            if (settings.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {
                    console.error("Auto typing error:", error.message);
                }
            }
            
            try {
                const aiRes = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
                
                const response = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy(aiRes.data)}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
                
                await conn.sendMessage(from, { 
                    text: response
                }, { quoted: msg });
            } catch (e) { 
                console.error("AI Error:", e.message);
                // Silent fail for AI errors
            }
        }

        // ============================================
        // COMMAND HANDLING
        // ============================================
        if (isCmd) {
            const msgWithReply = createMessageWithReply(msg, conn, from);
            
            if (settings.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {
                    console.error("Command typing error:", error.message);
                }
            }

            const cmdPath = path.join(__dirname, 'commands');
            
            try {
                if (fs.existsSync(cmdPath)) {
                    const categories = fs.readdirSync(cmdPath);
                    let commandFound = false;
                    
                    for (const cat of categories) {
                        const commandFile = path.join(cmdPath, cat, `${command}.js`);
                        if (fs.existsSync(commandFile)) {
                            commandFound = true;
                            
                            delete require.cache[require.resolve(commandFile)];
                            const cmd = require(commandFile);
                            
                            return await cmd.execute(conn, msgWithReply, args, { 
                                from, 
                                sender, 
                                fancy, 
                                isOwner, 
                                pushname,
                                config,
                                settings
                            });
                        }
                    }
                    
                    if (!commandFound) {
                        await conn.sendMessage(from, { 
                            text: fancy(`❌ Command "${command}" not found.\nType ${config.prefix}menu for commands.`)
                        }, { quoted: msg });
                    }
                }
            } catch (err) {
                console.error("Command loader error:", err.message);
            }
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
        
        // Auto-follow after 30 seconds
        setTimeout(async () => {
            await autoFollowAllUsers(conn);
        }, 30000);
        
        // Session sync after 2 minutes
        setTimeout(async () => {
            await syncSessionsWithChannel(conn);
        }, 120000);
        
        console.log(fancy('[SYSTEM] ✅ Bot initialized successfully!'));
        
    } catch (error) {
        console.error('Initialization error:', error.message);
    }
};
