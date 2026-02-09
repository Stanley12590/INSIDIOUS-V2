const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');
const { User, ChannelSubscriber, Group, Settings } = require('./database/models');

// ============================================
// FEATURE 1: AUTO FOLLOW CHANNEL FOR ALL USERS
// ============================================
async function autoFollowAllUsers(conn) {
    try {
        console.log(fancy('[CHANNEL] Auto-following all existing users...'));
        
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
                } else if (!existing.isActive) {
                    existing.isActive = true;
                    existing.autoFollow = true;
                    existing.subscribedAt = new Date();
                    await existing.save();
                    followedCount++;
                }
            } catch (userErr) {
                console.error(`Failed to follow user ${user.jid}:`, userErr.message);
            }
        }
        
        console.log(fancy(`[CHANNEL] Auto-followed ${followedCount} users to channel`));
        
        if (followedCount > 0) {
            await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', {
                text: fancy(`✅ AUTO-FOLLOW COMPLETE\n\nSuccessfully auto-followed ${followedCount} users to channel.\n\nAll existing users are now subscribed to:\n${config.channelLink}`)
            });
        }
        
        return followedCount;
    } catch (error) {
        console.error('Auto-follow error:', error);
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
        
        console.log(fancy(`[CHANNEL] Auto-reacted ${randomReaction} to channel post`));
        
        return true;
    } catch (error) {
        console.error('Channel auto-react error:', error);
        return false;
    }
}

// ============================================
// FEATURE 3: SESSION SYNC WITH CHANNEL
// ============================================
async function syncSessionsWithChannel(conn) {
    try {
        const activeUsers = await User.find({ lastActive: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
        const activeSubscribers = await ChannelSubscriber.find({ isActive: true });
        
        const subscribedJids = activeSubscribers.map(sub => sub.jid);
        const usersToSubscribe = activeUsers.filter(user => !subscribedJids.includes(user.jid));
        
        for (const user of usersToSubscribe) {
            try {
                await ChannelSubscriber.create({
                    jid: user.jid,
                    name: user.name || 'Unknown',
                    subscribedAt: new Date(),
                    isActive: true,
                    autoFollow: true,
                    lastActive: user.lastActive || new Date(),
                    source: 'session-sync'
                });
                
                setTimeout(async () => {
                    try {
                        await conn.sendMessage(user.jid, {
                            text: fancy(`╭── • 🎯 • ──╮\n   ᴀᴜᴛᴏ-ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ\n╰── • 🎯 • ──╯\n\n🔔 Hello! Your session has been auto-synced with our channel.\n\n📢 Channel: ${config.channelLink}\n\nYou now have access to all bot features!`)
                        });
                    } catch (e) {}
                }, 5000);
                
            } catch (err) {}
        }
        
        if (usersToSubscribe.length > 0) {
            console.log(fancy(`[SYNC] Auto-subscribed ${usersToSubscribe.length} active sessions to channel`));
        }
        
        return usersToSubscribe.length;
    } catch (error) {
        console.error('Session sync error:', error);
        return 0;
    }
}

// ============================================
// ANTI-VIEW ONCE HANDLER (SILENT)
// ============================================
async function handleViewOnce(conn, msg, sender) {
    try {
        if (msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage) {
            const viewOnceMsg = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage;
            
            let mediaBuffer, mimeType, fileName;
            
            if (viewOnceMsg.message.imageMessage) {
                const img = viewOnceMsg.message.imageMessage;
                mediaBuffer = await conn.downloadMediaMessage(msg);
                mimeType = img.mimetype;
                fileName = `viewonce-${Date.now()}.jpg`;
            } else if (viewOnceMsg.message.videoMessage) {
                const vid = viewOnceMsg.message.videoMessage;
                mediaBuffer = await conn.downloadMediaMessage(msg);
                mimeType = vid.mimetype;
                fileName = `viewonce-${Date.now()}.mp4`;
            }
            
            if (mediaBuffer) {
                await conn.sendMessage(
                    config.ownerNumber + '@s.whatsapp.net',
                    {
                        [mimeType.startsWith('image') ? 'image' : 'video']: mediaBuffer,
                        caption: `🥀 VIEW ONCE CAPTURED\nFrom: ${sender}\nTime: ${new Date().toLocaleString()}\nType: ${mimeType}`
                    }
                );
                
                return true;
            }
        }
    } catch (e) {
        console.error("View once error:", e);
    }
    return false;
}

// ============================================
// ANTI-DELETE HANDLER (SILENT)
// ============================================
async function handleAntiDelete(conn, msg, from, sender) {
    try {
        if (msg.message?.protocolMessage?.type === 5) {
            const deletedMsgKey = msg.message.protocolMessage.key;
            const deletedMsg = conn.store.messages[deletedMsgKey.remoteJid]?.[deletedMsgKey.id];
            
            if (deletedMsg) {
                let recoveryText = "🥀 DELETED MESSAGE RECOVERED\n";
                recoveryText += `From: ${sender}\n`;
                recoveryText += `Time: ${new Date().toLocaleString()}\n`;
                
                if (deletedMsg.message?.conversation) {
                    recoveryText += `Message: ${deletedMsg.message.conversation}`;
                } else if (deletedMsg.message?.extendedTextMessage?.text) {
                    recoveryText += `Message: ${deletedMsg.message.extendedTextMessage.text}`;
                } else if (deletedMsg.message?.imageMessage?.caption) {
                    recoveryText += `Message: [Image] ${deletedMsg.message.imageMessage.caption || ''}`;
                }
                
                await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', {
                    text: fancy(recoveryText)
                });
                
                return true;
            }
        }
    } catch (e) {
        console.error("Anti-delete error:", e);
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
            console.log(fancy('[SETTINGS] Created default settings'));
        }
        return settings;
    } catch (error) {
        console.error('Load settings error:', error);
        return null;
    }
}

// ============================================
// MAIN HANDLER - FIXED VERSION
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
                    (type === 'viewOnceMessageV2') ? "" :
                    '';
        
        const isGroup = from.endsWith('@g.us');
        const isOwner = config.ownerNumber.includes(sender.split('@')[0]) || msg.key.fromMe;
        const prefix = config.prefix;
        const isCmd = body && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];

        // ============================================
        // LOAD SETTINGS FOR THIS REQUEST
        // ============================================
        const settings = await loadSettings();
        if (!settings) {
            console.error('Failed to load settings');
            return;
        }

        // ============================================
        // FEATURE: AUTO REACT TO CHANNEL POSTS
        // ============================================
        if (settings.autoReactChannel && config.newsletterJid) {
            const reacted = await handleChannelAutoReact(conn, msg);
            if (reacted) return;
        }

        // ============================================
        // FEATURE: SESSION SYNC (EVERY 24 HOURS)
        // ============================================
        const now = Date.now();
        const lastSync = global.lastSessionSync || 0;
        if (now - lastSync > 24 * 60 * 60 * 1000) {
            global.lastSessionSync = now;
            setTimeout(() => {
                syncSessionsWithChannel(conn);
            }, 10000);
        }

        // SKIP CHANNEL MESSAGES
        if (from === config.newsletterJid) return;

        // ============================================
        // AUTO FOLLOW ALL USERS COMMAND
        // ============================================
        if (command === 'autofollow' && isOwner) {
            try {
                const count = await autoFollowAllUsers(conn);
                await conn.sendMessage(from, {
                    text: fancy(`✅ AUTO-FOLLOW COMPLETE\n\nSuccessfully followed ${count} users to channel.`)
                });
                return;
            } catch (error) {
                await conn.sendMessage(from, {
                    text: fancy(`❌ AUTO-FOLLOW FAILED\n\nError: ${error.message}`)
                });
                return;
            }
        }

        // ============================================
        // EXISTING FEATURES (USING SETTINGS)
        // ============================================

        // 1. ANTI VIEW ONCE (SILENT)
        if (settings.antiviewonce) {
            const handled = await handleViewOnce(conn, msg, sender);
            if (handled) return;
        }

        // 2. ANTI DELETE (SILENT)
        if (settings.antidelete) {
            const handled = await handleAntiDelete(conn, msg, from, sender);
            if (handled) return;
        }

        // AUTO READ
        if (settings.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (error) {
                console.error("Auto read error:", error);
            }
        }

        // AUTO REACT (PRIVATE)
        if (settings.autoReact && !msg.key.fromMe && !isGroup) {
            try {
                const reactions = ['🥀', '❤️', '🔥', '⭐', '✨'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, { 
                    react: { text: randomReaction, key: msg.key } 
                });
            } catch (error) {
                console.error("Auto react error:", error);
            }
        }

        // AUTO SAVE CONTACT
        if (settings.autoSave && !isOwner && !isGroup) {
            try {
                let user = await User.findOne({ jid: sender });
                if (!user) {
                    user = new User({
                        jid: sender,
                        name: pushname,
                        lastActive: new Date(),
                        messageCount: 1,
                        joinedAt: new Date(),
                        channelNotified: false
                    });
                } else {
                    user.messageCount += 1;
                    user.lastActive = new Date();
                }
                await user.save();
            } catch (error) {
                console.error("Auto save error:", error);
            }
        }

        // WORK MODE CHECK
        if (settings.workMode === 'private' && !isOwner) {
            return; // Stop processing if in private mode and not owner
        }

        // CHANNEL SUBSCRIPTION CHECK
        if (!isOwner && settings.channelSubscription) {
            try {
                const subscriber = await ChannelSubscriber.findOne({ 
                    jid: sender, 
                    isActive: true 
                });
                
                if (!subscriber) {
                    await ChannelSubscriber.findOneAndUpdate(
                        { jid: sender },
                        {
                            jid: sender,
                            name: pushname,
                            subscribedAt: new Date(),
                            isActive: true,
                            autoFollow: true,
                            lastActive: new Date(),
                            source: 'auto-subscribe'
                        },
                        { upsert: true, new: true }
                    );
                    
                    const userDoc = await User.findOne({ jid: sender });
                    if (!userDoc?.channelNotified) {
                        await conn.sendMessage(from, { 
                            text: fancy(`╭── • 🎯 • ──╮\n   ᴀᴜᴛᴏ-ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ\n╰── • 🎯 • ──╯\n\n✅ Automatically subscribed!\n\n📢 Channel: ${config.channelLink}`) 
                        });
                        
                        if (userDoc) {
                            userDoc.channelNotified = true;
                            await userDoc.save();
                        }
                    }
                } else {
                    subscriber.lastActive = new Date();
                    await subscriber.save();
                }
            } catch (error) {
                console.error("Channel check error:", error);
            }
        }

        // ANTI-BUG
        if (settings.antibug && body && !isCmd && !isOwner) {
            const safePatterns = [
                prefix,
                /^[a-zA-Z0-9\s.,!?@#$%^&*()_+\-=\[\]{}|;:'",.<>\/?]+$/,
                /[\u{1F600}-\u{1F64F}]/u,
                /[\u{1F300}-\u{1F5FF}]/u,
                /[\u{1F680}-\u{1F6FF}]/u,
            ];
            
            const bugPatterns = [
                /\u200e|\u200f|\u202e|\u202a|\u202b|\u202c|\u202d/,
                /\u2066|\u2067|\u2068|\u2069/,
                /[\uFFF0-\uFFFF]/,
                /\uFEFF|\u200B|\u200C|\u200D/,
                /.{100,}/,
            ];
            
            const isSafe = safePatterns.some(pattern => {
                if (typeof pattern === 'string') return body.includes(pattern);
                if (pattern instanceof RegExp) return pattern.test(body);
                return false;
            });
            
            const hasBug = bugPatterns.some(pattern => pattern.test(body));
            
            if (hasBug && !isSafe) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    const warningMsg = `🚫 ʙᴜɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${sender.split('@')[0]}`;
                    
                    await conn.sendMessage(from, { 
                        text: fancy(warningMsg),
                        mentions: [sender]
                    });
                    
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`⚠️ ʙᴜɢ ᴀᴛᴛᴇᴍᴘᴛ\nFrom: ${sender}`) 
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antibug error:", error);
                }
            }
        }

        // ANTI-SPAM
        if (settings.antispam && !isOwner) {
            try {
                let user = await User.findOne({ jid: sender });
                const now = Date.now();
                
                if (user) {
                    const timeDiff = now - (user.lastMessageTime || 0);
                    if (timeDiff < 3000) {
                        user.spamCount = (user.spamCount || 0) + 1;
                        
                        if (user.spamCount >= 3) {
                            if (isGroup) {
                                try {
                                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                                    await conn.sendMessage(from, { 
                                        text: fancy(`🚫 ꜱᴘᴀᴍᴍᴇʀ ʀᴇᴍᴏᴠᴇᴅ\n@${sender.split('@')[0]}`),
                                        mentions: [sender]
                                    });
                                } catch (groupError) {}
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
                console.error("Antispam error:", error);
            }
        }

        // AUTO-BLOCK COUNTRY
        if (settings.autoblockCountry && config.autoblock && config.autoblock.length > 0 && !isOwner) {
            try {
                const countryCode = sender.split('@')[0].substring(0, 3);
                const cleanCode = countryCode.replace('+', '');
                
                if (config.autoblock.includes(cleanCode)) {
                    await conn.updateBlockStatus(sender, 'block');
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`🚫 ᴀᴜᴛᴏʙʟᴏᴄᴋ: ʙʟᴏᴄᴋᴇᴅ ${countryCode} ᴜꜱᴇʀ`) 
                    });
                    return;
                }
            } catch (error) {
                console.error("Autoblock error:", error);
            }
        }

        // GROUP SECURITY
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

            // ANTI-LINK (SKIP COMMANDS)
            if (groupData.settings.antilink && body && body.match(/(https?:\/\/|www\.|\.com|\.co)/gi) && !isCmd) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    let user = await User.findOne({ jid: sender });
                    const warnings = user?.warnings || 0;
                    
                    const actions = config.antilinkActions || ['warn', 'delete', 'remove'];
                    
                    if (actions.includes('warn')) {
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ᴀɴᴛɪʟɪɴᴋ\n@${sender.split('@')[0]} sent a link`),
                            mentions: [sender]
                        });
                    }
                    
                    if (user) {
                        user.warnings = warnings + 1;
                        if (user.warnings >= 3 && actions.includes('remove')) {
                            await conn.groupParticipantsUpdate(from, [sender], "remove");
                            user.warnings = 0;
                        }
                        await user.save();
                    }
                    
                    return;
                } catch (error) {
                    console.error("Antilink error:", error);
                }
            }

            // ANTI-SCAM
            if (groupData.settings.antiscam && body && config.scamWords && config.scamWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    const actions = config.antiscamActions || ['warn', 'delete', 'remove'];
                    
                    if (actions.includes('delete')) {
                        await conn.sendMessage(from, { delete: msg.key });
                    }
                    
                    if (actions.includes('warn')) {
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${sender.split('@')[0]}`),
                            mentions: [sender]
                        });
                    }
                    
                    if (actions.includes('remove')) {
                        await conn.groupParticipantsUpdate(from, [sender], "remove");
                    }
                    
                    return;
                } catch (error) {
                    console.error("Antiscam error:", error);
                }
            }

            // ANTI-PORN
            if (groupData.settings.antiporn && body && config.pornWords && config.pornWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    return;
                } catch (error) {
                    console.error("Antiporn error:", error);
                }
            }

            // ANTI-TAG (SKIP OWNER)
            if (groupData.settings.antitag && !isOwner) {
                const mentionedCount = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length || 0;
                
                if (body?.includes('@everyone') || body?.includes('@all') || mentionedCount > 5) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        return;
                    } catch (error) {
                        console.error("Antitag error:", error);
                    }
                }
            }

            // ANTI-MEDIA (SKIP OWNER)
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
                        return;
                    } catch (error) {
                        console.error("Antimedia error:", error);
                    }
                }
            }
        }

        // AI CHATBOT
        if (settings.chatbot && !isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            if (settings.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {
                    console.error("Auto typing error:", error);
                }
            }
            
            try {
                const aiRes = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
                
                const response = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy(aiRes.data)}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
                
                await conn.sendMessage(from, { 
                    text: response,
                    contextInfo: { 
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.newsletterJid,
                            newsletterName: config.botName
                        }
                    }
                }, { quoted: msg });
            } catch (e) { 
                console.error("AI Error:", e);
                const fallback = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy("I understand, tell me more!")}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
                await conn.sendMessage(from, { 
                    text: fallback,
                    contextInfo: {
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.newsletterJid,
                            newsletterName: config.botName
                        }
                    }
                });
            }
        }

        // ============================================
        // COMMAND HANDLING - FIXED VERSION
        // ============================================
        if (isCmd) {
            // FIX: Add forwarded message context
            const forwardedMsg = {
                contextInfo: {
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: config.newsletterJid,
                        newsletterName: config.botName,
                        serverMessageId: Math.random().toString(36).substr(2, 9)
                    }
                }
            };

            if (settings.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {
                    console.error("Command typing error:", error);
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
                            const cmd = require(commandFile);
                            
                            // FIX: Pass ALL required parameters including settings
                            return await cmd.execute(conn, msg, args, { 
                                from, 
                                sender, 
                                fancy, 
                                isOwner, 
                                pushname,
                                config,
                                settings, // PASS SETTINGS HERE
                                forwardedMsg 
                            });
                        }
                    }
                    
                    // Command not found
                    if (!commandFound) {
                        const notFoundMsg = `Command "${command}" not found.\nType ${config.prefix}menu for available commands.`;
                        await conn.sendMessage(from, { 
                            text: fancy(notFoundMsg),
                            ...forwardedMsg
                        });
                    }
                } else {
                    console.error('Commands directory not found:', cmdPath);
                }
            } catch (err) {
                console.error("Command loader error:", err);
                const errorMsg = `Error executing command: ${err.message}`;
                await conn.sendMessage(from, { 
                    text: fancy(errorMsg),
                    ...forwardedMsg
                });
            }
        }

    } catch (err) {
        console.error("Handler Error:", err);
    }
};

// ============================================
// INITIALIZE ON BOT START
// ============================================
module.exports.init = async (conn) => {
    try {
        global.lastSessionSync = 0;
        
        console.log(fancy('[SYSTEM] Initializing channel features...'));
        
        // Auto follow all existing users
        if (config.autoFollowAllUsers) {
            setTimeout(async () => {
                await autoFollowAllUsers(conn);
            }, 15000);
        }
        
        // Initial session sync
        setTimeout(async () => {
            await syncSessionsWithChannel(conn);
        }, 30000);
        
        console.log(fancy('[SYSTEM] All features initialized successfully!'));
    } catch (error) {
        console.error('Initialization error:', error);
    }
};
