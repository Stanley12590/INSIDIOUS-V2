const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const config = require('./config');
const { fancy } = require('./lib/font');

// IMPORT DATABASE MODELS
const { User, Group, ChannelSubscriber, MessageLog } = require('./database/models');

/**
 * INSIDIOUS: THE LAST KEY V2.1.1
 * COMPLETE MASTER HANDLER WITH ALL FEATURES
 */

module.exports = async (conn, m) => {
    try {
        if (!m.messages || !m.messages[0]) return;
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const sender = msg.key.participant || msg.key.remoteJid;
        const pushname = msg.pushName || "Unknown Soul";
        
        const body = (type === 'conversation') ? msg.message.conversation : 
                    (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : 
                    (type === 'imageMessage') ? msg.message.imageMessage.caption : 
                    (type === 'videoMessage') ? msg.message.videoMessage.caption : '';
        
        const isGroup = from.endsWith('@g.us');
        const isOwner = config.ownerNumber.includes(sender.split('@')[0]) || msg.key.fromMe;
        const prefix = config.prefix;
        const isCmd = body && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];

        // 13. AUTO READ
        if (config.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (error) {
                console.error("Auto read error:", error);
            }
        }

        // 14. AUTO REACT
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

        // 15. AUTO SAVE CONTACT
        if (config.autoSave && !isOwner && !isGroup) {
            try {
                // Save user to database
                let user = await User.findOne({ jid: sender });
                if (!user) {
                    user = new User({
                        jid: sender,
                        name: pushname,
                        lastActive: new Date(),
                        messageCount: 1
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

        // 24. WORK MODE CHECK
        if (config.workMode === 'private' && !isOwner) return;

        // 30. FORCE CHANNEL SUBSCRIPTION CHECK
        if ((isCmd || (!isCmd && !isGroup)) && !isOwner) {
            const isSubscribed = await ChannelSubscriber.findOne({ 
                jid: sender, 
                isActive: true 
            });
            
            if (!isSubscribed) {
                await conn.sendMessage(from, { 
                    text: fancy(`╭── • 🥀 • ──╮\n  ${fancy("ᴄʜᴀɴɴᴇʟ ꜱᴜʙꜱᴄʀɪᴘᴛɪᴏɴ ʀᴇǫᴜɪʀᴇᴅ")}\n╰── • 🥀 • ──╯\n\n⚠️ You must subscribe to our channel first!\n\n🔗 ${config.channelLink}\n\nJoin then try again.`) 
                });
                return;
            }
        }

        // 20. ANTI-BUGS FEATURE
        if (config.antibug && body) {
            const hasBug = config.bugPatterns.some(pattern => {
                if (typeof pattern === 'string') {
                    return body.includes(pattern);
                } else if (pattern instanceof RegExp) {
                    return pattern.test(body);
                }
                return false;
            });
            
            if (hasBug) {
                try {
                    // Delete bug message
                    await conn.sendMessage(from, { 
                        delete: msg.key 
                    });
                    
                    // Warn user
                    await conn.sendMessage(from, { 
                        text: fancy(`🚫 ʙᴜɢ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${sender.split('@')[0]} sent malicious content\nAction: Message deleted & user warned`),
                        mentions: [sender]
                    });
                    
                    // Report to owner
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`⚠️ ʙᴜɢ ᴀᴛᴛᴇᴍᴘᴛ\nFrom: ${sender}\nContent: ${body.substring(0, 50)}...\nAction taken: Deleted & Warned`) 
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antibug error:", error);
                }
            }
        }

        // 19. ANTI-SPAM FEATURE
        if (config.antispam && !isOwner) {
            try {
                let user = await User.findOne({ jid: sender });
                const now = Date.now();
                
                if (user) {
                    const timeDiff = now - user.lastMessageTime;
                    if (timeDiff < config.spamSettings.cooldown) {
                        user.spamCount = (user.spamCount || 0) + 1;
                        
                        if (user.spamCount >= config.spamSettings.maxMessages) {
                            if (isGroup) {
                                await conn.groupParticipantsUpdate(from, [sender], "remove");
                                await conn.sendMessage(from, { 
                                    text: fancy(`🚫 ꜱᴘᴀᴍᴍᴇʀ ʀᴇᴍᴏᴠᴇᴅ\n@${sender.split('@')[0]} has been removed for spamming`),
                                    mentions: [sender]
                                });
                            } else {
                                await conn.updateBlockStatus(sender, 'block');
                                await conn.sendMessage(from, { 
                                    text: fancy(`🚫 ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ʙʟᴏᴄᴋᴇᴅ ꜰᴏʀ ꜱᴘᴀᴍᴍɪɴɢ`) 
                                });
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
                        messageCount: 1
                    });
                }
            } catch (error) {
                console.error("Antispam error:", error);
            }
        }

        // 10. AUTO-BLOCK COUNTRY
        if (config.autoblock.length > 0) {
            const countryCode = sender.split('@')[0].substring(0, 3);
            const cleanCode = countryCode.replace('+', '');
            
            if (config.autoblock.includes(cleanCode)) {
                try {
                    await conn.updateBlockStatus(sender, 'block');
                    await conn.sendMessage(config.ownerNumber + '@s.whatsapp.net', { 
                        text: fancy(`🚫 ᴀᴜᴛᴏʙʟᴏᴄᴋ: ʙʟᴏᴄᴋᴇᴅ ${countryCode} ᴜꜱᴇʀ\nJID: ${sender}`) 
                    });
                    return;
                } catch (error) {
                    console.error("Autoblock error:", error);
                }
            }
        }

        // --- GROUP SECURITY FEATURES ---
        if (isGroup && !isOwner) {
            // 1. ANTI-LINK
            if (config.antilink && body && body.match(/https?:\/\//gi)) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    if (config.actions.warn) {
                        await conn.sendMessage(from, { 
                            text: fancy(`⚠️ ᴀɴᴛɪʟɪɴᴋ ᴡᴀʀɴɪɴɢ\n@${sender.split('@')[0]} sent a link\nWarning 1/3`),
                            mentions: [sender]
                        });
                    }
                    
                    // Update user warnings
                    let user = await User.findOne({ jid: sender });
                    if (user) {
                        user.warnings = (user.warnings || 0) + 1;
                        if (user.warnings >= 3 && config.actions.remove) {
                            await conn.groupParticipantsUpdate(from, [sender], "remove");
                            await conn.sendMessage(from, { 
                                text: fancy(`🚫 ᴜꜱᴇʀ ʀᴇᴍᴏᴠᴇᴅ\n@${sender.split('@')[0]} has been removed for 3 warnings`),
                                mentions: [sender]
                            });
                            user.warnings = 0;
                        }
                        await user.save();
                    }
                    
                    return;
                } catch (error) {
                    console.error("Antilink error:", error);
                }
            }

            // 2. ANTI-SCAM
            if (config.antiscam && body && config.scamWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    // Tag all members warning
                    const metadata = await conn.groupMetadata(from);
                    const mentions = metadata.participants.map(p => p.id);
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`⚠️ ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${sender.split('@')[0]} ꜱᴇɴᴛ ᴀ ꜱᴄᴀᴍ ᴍᴇꜱꜱᴀɢᴇ\nᴡᴀʀɴɪɴɢ ꜰᴏʀ ᴀʟʟ ꜱᴏᴜʟꜱ!`),
                        mentions: mentions
                    });
                    
                    if (config.actions.remove) {
                        await conn.groupParticipantsUpdate(from, [sender], "remove");
                    }
                    
                    return;
                } catch (error) {
                    console.error("Antiscam error:", error);
                }
            }

            // 2. ANTI-PORN
            if (config.antiporn && body && config.pornWords.some(w => body.toLowerCase().includes(w))) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`🚫 ᴀɴᴛɪᴘᴏʀɴ\n@${sender.split('@')[0]} sent adult content\nMessage deleted`),
                        mentions: [sender]
                    });
                    
                    if (config.actions.remove) {
                        await conn.groupParticipantsUpdate(from, [sender], "remove");
                    }
                    
                    return;
                } catch (error) {
                    console.error("Antiporn error:", error);
                }
            }

            // 4. ANTI-TAGS
            if (config.antitag && (body?.includes('@everyone') || 
                msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 10)) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    
                    await conn.sendMessage(from, { 
                        text: fancy(`⚠️ ᴀɴᴛɪᴛᴀɢ\n@${sender.split('@')[0]} excessive tagging detected`),
                        mentions: [sender]
                    });
                    
                    return;
                } catch (error) {
                    console.error("Antitag error:", error);
                }
            }

            // 4. ANTI-MEDIA
            if (config.antimedia !== 'off') {
                const mediaTypes = {
                    'imageMessage': 'photo',
                    'videoMessage': 'video',
                    'stickerMessage': 'sticker'
                };
                
                if (mediaTypes[type] && 
                    (config.antimedia === 'all' || config.antimedia === mediaTypes[type])) {
                    try {
                        await conn.sendMessage(from, { delete: msg.key });
                        
                        await conn.sendMessage(from, { 
                            text: fancy(`🚫 ᴀɴᴛɪᴍᴇᴅɪᴀ\n@${sender.split('@')[0]} ${mediaTypes[type]} not allowed`),
                            mentions: [sender]
                        });
                        
                        return;
                    } catch (error) {
                        console.error("Antimedia error:", error);
                    }
                }
            }
        }

        // --- RECOVERY FEATURES ---
        
        // 5. ANTI-VIEWONCE
        if ((msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage) && config.antiviewonce) {
            try {
                let quoted = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage;
                
                await conn.sendMessage(config.ownerNumber + "@s.whatsapp.net", { 
                    forward: msg,
                    caption: fancy(`📸 ᴠɪᴇᴡᴏɴᴄᴇ ᴄᴀᴜɢʜᴛ\nFrom: @${sender.split('@')[0]}\nChat: ${from}`)
                });
                
                // Log to database
                await MessageLog.create({
                    type: 'VIEW_ONCE',
                    from: sender,
                    chat: from,
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error("Antiviewonce error:", error);
            }
        }

        // 6. ANTI-DELETE
        if (msg.message.protocolMessage?.type === 0 && config.antidelete) {
            try {
                const deletedKey = msg.message.protocolMessage.key;
                
                await conn.sendMessage(config.ownerNumber + "@s.whatsapp.net", { 
                    text: fancy(`🗑️ ᴅᴇʟᴇᴛᴇᴅ ᴍᴇꜱꜱᴀɢᴇ\nFrom: ${deletedKey.remoteJid}\nSender: ${deletedKey.participant}\nTime: ${new Date().toLocaleString()}`)
                });
                
                await MessageLog.create({
                    type: 'DELETED',
                    from: deletedKey.participant,
                    chat: deletedKey.remoteJid,
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error("Antidelete error:", error);
            }
        }

        // 21. BUGS FEATURE (Educational/Ethical Only)
        if (config.bugsEnabled && isCmd && command === 'bug' && isOwner) {
            const target = args[0];
            if (!target) {
                await conn.sendMessage(from, { 
                    text: fancy("Usage: .bug [number]\n⚠️ For educational purposes only!") 
                });
                return;
            }
            
            // Simulate bug effects (not real)
            const targetJid = target + '@s.whatsapp.net';
            
            await conn.sendMessage(targetJid, { 
                text: fancy(`╭─── • 🥀 • ───╮\n   ꜱᴇᴄᴜʀɪᴛʏ ᴛᴇꜱᴛ\n╰─── • 🥀 • ───╯\n\n⚠️ This is a simulated security test.\nYour WhatsApp might experience:\n• Message delays\n• App lag\n• Temporary issues\n\nThis is for educational purposes only.`)
            });
            
            setTimeout(async () => {
                await conn.sendMessage(targetJid, { 
                    text: fancy(`✅ Security test completed.\nThis was a simulated attack.\n\n💡 Always keep your WhatsApp updated!`) 
                });
            }, 5000);
            
            return;
        }

        // 9. ACTIVE MEMBERS FEATURE
        if (isCmd && command === 'activemembers' && isGroup) {
            try {
                const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                
                const activeUsers = await User.countDocuments({
                    lastActive: { $gte: oneWeekAgo },
                    messageCount: { $gt: 5 }
                });
                
                const inactiveUsers = await User.countDocuments({
                    lastActive: { $lt: oneWeekAgo }
                });
                
                const topUsers = await User.find()
                    .sort({ messageCount: -1 })
                    .limit(5);
                
                let topList = '';
                topUsers.forEach((user, i) => {
                    topList += `${i+1}. ${user.jid.split('@')[0]} - ${user.messageCount} msgs\n`;
                });
                
                const report = fancy(`╭─── • 🥀 • ───╮\n   ᴀᴄᴛɪᴠᴇ ᴍᴇᴍʙᴇʀꜱ\n╰─── • 🥀 • ───╯\n\n✅ Active: ${activeUsers}\n❌ Inactive: ${inactiveUsers}\n\n🏆 Top Members:\n${topList}\n\n${config.activeMembers.autoRemove ? '⚠️ Auto-remove enabled for 7+ days inactive' : ''}`);
                
                await conn.sendMessage(from, { text: report });
                
                // Auto remove inactive if enabled
                if (config.activeMembers.autoRemove && inactiveUsers > 0) {
                    const veryOld = new Date(Date.now() - config.activeMembers.daysInactive * 24 * 60 * 60 * 1000);
                    const toRemove = await User.find({
                        lastActive: { $lt: veryOld },
                        messageCount: { $lt: 3 }
                    });
                    
                    if (toRemove.length > 0) {
                        for (const user of toRemove) {
                            try {
                                await conn.groupParticipantsUpdate(from, [user.jid], "remove");
                            } catch (e) {}
                        }
                        await conn.sendMessage(from, { 
                            text: fancy(`🧹 ᴀᴜᴛᴏ-ʀᴇᴍᴏᴠᴇᴅ ${toRemove.length} ɪɴᴀᴄᴛɪᴠᴇ ᴍᴇᴍʙᴇʀꜱ`) 
                        });
                    }
                }
                
                return;
            } catch (error) {
                console.error("Active members error:", error);
            }
        }

        // 18. DOWNLOAD STATUS FEATURE
        if (isCmd && command === 'downloadstatus') {
            // Note: This requires listening to status updates which Baileys doesn't support directly
            await conn.sendMessage(from, { 
                text: fancy(`📥 Status download requires WhatsApp Business API\n\nTry using: .download [url] for other media`) 
            });
            return;
        }

        // 11. HUMAN CHATBOT (AI MIRRORING)
        if (!isCmd && !msg.key.fromMe && body && body.trim().length > 1) {
            // 32. Show Typing
            if (config.autoTyping) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                } catch (error) {
                    console.error("Auto typing error:", error);
                }
            }
            
            try {
                const aiRes = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
                
                // Format response with forex style
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
                // Fallback response
                const fallback = `╭─── • 🥀 • ───╮\n   ʀ ᴇ ᴘ ʟ ʏ\n╰─── • 🥀 • ───╯\n\n${fancy("I understand, tell me more!")}\n\n_ᴅᴇᴠᴇʟᴏᴘᴇʀ: ꜱᴛᴀɴʏᴛᴢ_`;
                await conn.sendMessage(from, { text: fallback });
            }
        }

        // --- 22. DYNAMIC COMMAND LOADER ---
        if (isCmd) {
            // 32. Auto Typing for Commands
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
                    
                    for (const cat of categories) {
                        const commandFile = path.join(cmdPath, cat, `${command}.js`);
                        if (fs.existsSync(commandFile)) {
                            const cmd = require(commandFile);
                            return await cmd.execute(conn, msg, args, { 
                                from, 
                                sender, 
                                fancy, 
                                isOwner, 
                                pushname,
                                config 
                            });
                        }
                    }
                    
                    // Command not found
                    await conn.sendMessage(from, { 
                        text: fancy(`Command "${command}" not found.\nType .menu for available commands.`) 
                    });
                }
            } catch (err) {
                console.error("Command loader error:", err);
                await conn.sendMessage(from, { 
                    text: fancy(`Error executing command: ${err.message}`) 
                });
            }
        }

    } catch (err) {
        console.error("Handler Error:", err);
    }
};
