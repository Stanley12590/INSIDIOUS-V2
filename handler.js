const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');
const { User, ChannelSubscriber, Group } = require('./database/models');

// ANTI-VIEW ONCE HANDLER (SILENT)
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
                // Send to owner ONLY (silent)
                await conn.sendMessage(
                    config.ownerNumber + '@s.whatsapp.net',
                    {
                        [mimeType.startsWith('image') ? 'image' : 'video']: mediaBuffer,
                        caption: `🥀 VIEW ONCE CAPTURED\nFrom: ${sender}\nTime: ${new Date().toLocaleString()}\nType: ${mimeType}`
                    }
                );
                
                // DON'T alert sender (silent mode)
                return true;
            }
        }
    } catch (e) {
        console.error("View once error:", e);
    }
    return false;
}

// ANTI-DELETE HANDLER (SILENT)
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
                
                // Send to owner ONLY (silent)
                await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', {
                    text: fancy(recoveryText)
                });
                
                // DON'T notify in group (silent mode)
                return true;
            }
        }
    } catch (e) {
        console.error("Anti-delete error:", e);
    }
    return false;
}

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

        // SKIP CHANNEL MESSAGES
        if (from === config.newsletterJid) return;

        // 1. ANTI VIEW ONCE (SILENT)
        if (config.antiviewonce) {
            const handled = await handleViewOnce(conn, msg, sender);
            if (handled) return;
        }

        // 2. ANTI DELETE (SILENT)
        if (config.antidelete) {
            const handled = await handleAntiDelete(conn, msg, from, sender);
            if (handled) return;
        }

        // AUTO READ
        if (config.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (error) {
                console.error("Auto read error:", error);
            }
        }

        // AUTO REACT
        if (config.autoReact && !msg.key.fromMe && !isGroup) {
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
        if (config.autoSave && !isOwner && !isGroup) {
            try {
                let user = await User.findOne({ jid: sender });
                if (!user) {
                    user = new User({
                        jid: sender,
                        name: pushname,
                        lastActive: new Date(),
                        messageCount: 1,
                        joinedAt: new Date()
                    });
                } else {
                    user.messageCount += 1;
                    user.lastActive = new Date();
                }
                await user.save();
                
                console.log(fancy(`[SAVE] ${pushname} (${sender})`));
            } catch (error) {
                console.error("Auto save error:", error);
            }
        }

        // WORK MODE CHECK
        if (config.workMode === 'private' && !isOwner) return;

        // CHANNEL SUBSCRIPTION CHECK
        if (!isOwner) {
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
                            lastActive: new Date()
                        },
                        { upsert: true, new: true }
                    );
                    
                    const userDoc = await User.findOne({ jid: sender });
                    if (!userDoc?.channelNotified) {
                        await conn.sendMessage(from, { 
                            text: fancy(`╭── • 🥀 • ──╮\n  ${fancy("ᴄʜᴀɴɴᴇʟ ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ")}\n╰── • 🥀 • ──╯\n\n✅ Auto-subscribed!\n\n🔗 ${config.channelLink}`) 
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

        // **FIXED ANTI-BUG - IMPROVED DETECTION**
        if (config.antibug && body && !isCmd && !isOwner) {
            // Allow normal text, emojis, and commands
            const safePatterns = [
                prefix, // Bot prefix
                /^[a-zA-Z0-9\s.,!?@#$%^&*()_+\-=\[\]{}|;:'",.<>\/?]+$/, // Normal text
                /[\u{1F600}-\u{1F64F}]/u, // Emojis
                /[\u{1F300}-\u{1F5FF}]/u, // Symbols & pictographs
                /[\u{1F680}-\u{1F6FF}]/u, // Transport & map symbols
            ];
            
            // ONLY detect actual bug characters
            const bugPatterns = [
                /\u200e|\u200f|\u202e|\u202a|\u202b|\u202c|\u202d/, // RTL characters
                /\u2066|\u2067|\u2068|\u2069/, // Invisible formatting
                /[\uFFF0-\uFFFF]/, // Specials
                /\uFEFF|\u200B|\u200C|\u200D/, // Zero-width characters
                /.{100,}/, // Very long messages (possible crash)
            ];
            
            // Check if message contains SAFE patterns (allow these)
            const isSafe = safePatterns.some(pattern => {
                if (typeof pattern === 'string') {
                    return body.includes(pattern);
                } else if (pattern instanceof RegExp) {
                    return pattern.test(body);
                }
                return false;
            });
            
            // Check for actual bug characters
            const hasBug = bugPatterns.some(pattern => pattern.test(body));
            
            // Only act if has bug AND not safe
            if (hasBug && !isSafe) {
                try {
                    await conn.sendMessage(from, { 
                        delete: msg.key 
                    });
                    
                    const warningMsg = `🚫 ʙᴜɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${sender.split('@')[0]} sent malicious content`;
                    
                    await conn.sendMessage(from, { 
                        text: fancy(warningMsg),
                        mentions: [sender]
                    });
                    
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`⚠️ ʙᴜɢ ᴀᴛᴛᴇᴍᴘᴛ\nFrom: ${sender}\nContent: ${body.substring(0, 100)}...`) 
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antibug error:", error);
                }
            }
        }

        // ANTI-SPAM
        if (config.antispam && !isOwner) {
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
                                } catch (groupError) {
                                    console.error("Remove spammer error:", groupError);
                                }
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
        if (config.autoblock && config.autoblock.length > 0 && !isOwner) {
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

        // GROUP SECURITY FEATURES
        if (isGroup) {
            let groupData = await Group.findOne({ jid: from });
            if (!groupData) {
                groupData = new Group({
                    jid: from,
                    settings: {
                        antilink: config.antilink,
                        antiporn: config.antiporn,
                        antiscam: config.antiscam,
                        antimedia: config.antimedia,
                        antitag: config.antitag
                    }
                });
                await groupData.save();
            }

            // ANTI-LINK
            if (groupData.settings.antilink && body && body.match(/(https?:\/\/|www\.|\.com|\.co)/gi) && !isCmd) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    let user = await User.findOne({ jid: sender });
                    const warnings = user?.warnings || 0;
                    
                    const actions = config.antilinkActions || ['warn', 'delete', 'remove'];
                    
                    if (actions.includes('warn')) {
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ᴀɴᴛɪʟɪɴᴋ\n@${sender.split('@')[0]} sent a link\nWarning ${warnings + 1}/3`),
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
            if (groupData.settings.antiscam && body && config.scamWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    const actions = config.antiscamActions || ['warn', 'delete', 'remove'];
                    
                    if (actions.includes('delete')) {
                        await conn.sendMessage(from, { delete: msg.key });
                    }
                    
                    if (actions.includes('warn')) {
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${sender.split('@')[0]} sent suspicious message`),
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
            if (groupData.settings.antiporn && body && config.pornWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    return;
                } catch (error) {
                    console.error("Antiporn error:", error);
                }
            }

            // ANTI-TAG
            if (groupData.settings.antitag) {
                const mentionedCount = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length || 0;
                
                if ((body?.includes('@everyone') || body?.includes('@all') || mentionedCount > 5) && !isOwner) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        return;
                    } catch (error) {
                        console.error("Antitag error:", error);
                    }
                }
            }

            // ANTI-MEDIA
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
        if (config.chatbot && !isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            if (config.autoTyping) {
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

        // COMMAND HANDLING
        if (isCmd) {
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

            if (config.autoTyping) {
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
                            return await cmd.execute(conn, msg, args, { 
                                from, 
                                sender, 
                                fancy, 
                                isOwner, 
                                pushname,
                                config,
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
