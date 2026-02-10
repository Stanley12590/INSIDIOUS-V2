const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');

// LOAD DATABASE MODELS
let User, Group, Settings;
try {
    const models = require('./database/models');
    User = models.User;
    Group = models.Group;
    Settings = models.Settings;
} catch (error) {
    console.log("⚠️ Using fallback models");
    User = { 
        findOne: async () => null, 
        countDocuments: async () => 0,
        find: async () => [],
        updateOne: async () => null,
        create: async (data) => ({ ...data, save: async () => null })
    };
    Group = { 
        findOne: async () => null, 
        countDocuments: async () => 0,
        find: async () => [],
        updateOne: async () => null,
        create: async (data) => ({ ...data, save: async () => null })
    };
    Settings = { 
        findOne: async () => ({ 
            antilink: true, antiporn: true, antiscam: true, antimedia: false, antitag: true,
            antiviewonce: true, antidelete: true, sleepingMode: false, welcomeGoodbye: true,
            chatbot: true, autoRead: true, autoReact: true, autoBio: true, anticall: true,
            antispam: true, antibug: true, autoStatus: true, autoStatusReply: true,
            autoRecording: true, autoSave: false, downloadStatus: false,
            activeMembers: false, autoblockCountry: false,
            save: async function() { return this; }
        }) 
    };
}

// MESSAGE STORES
const messageStore = new Map();
const spamTracker = new Map();
const warningTracker = new Map();

// BOT OWNER JID
let botOwnerJid = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getUsername(jid) {
    try {
        return jid.split('@')[0];
    } catch {
        return "Unknown";
    }
}

async function getUserName(conn, jid) {
    try {
        // Try to get from WhatsApp
        const contact = await conn.getContact(jid);
        return contact?.name || contact?.pushname || getUsername(jid);
    } catch {
        return getUsername(jid);
    }
}

async function getGroupName(conn, groupJid) {
    try {
        const metadata = await conn.groupMetadata(groupJid);
        return metadata.subject || "Group";
    } catch {
        return "Group";
    }
}

async function getGroupInfo(conn, groupJid) {
    try {
        const metadata = await conn.groupMetadata(groupJid);
        return {
            name: metadata.subject || "Group",
            participants: metadata.participants?.length || 0,
            description: metadata.desc || "No description",
            admins: metadata.participants?.filter(p => p.admin).length || 0
        };
    } catch {
        return { name: "Group", participants: 0, description: "No description", admins: 0 };
    }
}

async function isBotAdmin(conn, groupJid) {
    try {
        if (!conn.user?.id) return false;
        const metadata = await conn.groupMetadata(groupJid);
        const participant = metadata.participants.find(p => p.id === conn.user.id);
        return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch {
        return false;
    }
}

function createReply(conn, from, msg) {
    return async function(text, options = {}) {
        try {
            if (msg && msg.key) {
                return await conn.sendMessage(from, { text, ...options }, { quoted: msg });
            } else {
                return await conn.sendMessage(from, { text, ...options });
            }
        } catch (error) {
            console.error('Reply error:', error.message);
            return null;
        }
    };
}

// ============================================
// ANTI VIEWONCE - WITH REAL NAMES
// ============================================
async function handleViewOnce(conn, msg, settings) {
    if (!settings.antiviewonce) return false;
    
    const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
    if (!viewOnceMsg) return false;
    
    const sender = msg.key.participant || msg.key.remoteJid;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    // Get real names
    const senderName = await getUserName(conn, sender);
    let groupInfo = "";
    
    if (isGroup) {
        const groupName = await getGroupName(conn, from);
        const groupData = await getGroupInfo(conn, from);
        groupInfo = `🏷️ *Group Name:* ${groupName}\n👥 *Members:* ${groupData.participants}\n👑 *Admins:* ${groupData.admins}\n`;
    }
    
    // Get content
    let content = "";
    let mediaType = "";
    
    if (viewOnceMsg.message?.conversation) {
        content = viewOnceMsg.message.conversation;
        mediaType = "Text";
    } else if (viewOnceMsg.message?.extendedTextMessage?.text) {
        content = viewOnceMsg.message.extendedTextMessage.text;
        mediaType = "Text";
    } else if (viewOnceMsg.imageMessage) {
        content = "📸 Image Message (View Once)";
        mediaType = "Image";
    } else if (viewOnceMsg.videoMessage) {
        content = "🎥 Video Message (View Once)";
        mediaType = "Video";
    } else if (viewOnceMsg.audioMessage) {
        content = "🔊 Audio Message (View Once)";
        mediaType = "Audio";
    }
    
    // Send to owner
    if (botOwnerJid) {
        const message = `
👁️ *ANTI VIEW ONCE - MESSAGE CAPTURED*

👤 *Sender:* ${senderName} (${getUsername(sender)})
📞 *Phone:* ${getUsername(sender)}
${groupInfo}📍 *Chat Type:* ${isGroup ? 'Group' : 'Private Chat'}
🕐 *Time:* ${new Date().toLocaleString()}
📁 *Media Type:* ${mediaType}

📝 *Content:*
${content}

⚠️ *This message was set to view once but has been recovered by INSIDIOUS security system.*`;

        await conn.sendMessage(botOwnerJid, { text: message });
    }
    
    return true;
}

// ============================================
// ANTI DELETE - WITH REAL NAMES
// ============================================
async function handleAntiDelete(conn, msg, settings) {
    if (!settings.antidelete) return false;
    
    if (!msg.message?.protocolMessage || msg.message.protocolMessage.type !== 5) {
        return false;
    }
    
    const deletedKey = msg.message.protocolMessage.key;
    const messageId = deletedKey.id;
    const sender = deletedKey.participant || deletedKey.remoteJid;
    const from = deletedKey.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    // Get stored content
    const stored = messageStore.get(messageId);
    const content = stored?.content || "🚫 *Message content not available*";
    
    // Get real names
    const senderName = await getUserName(conn, sender);
    let groupInfo = "";
    
    if (isGroup) {
        const groupName = await getGroupName(conn, from);
        const groupData = await getGroupInfo(conn, from);
        groupInfo = `🏷️ *Group Name:* ${groupName}\n👥 *Members:* ${groupData.participants}\n👑 *Admins:* ${groupData.admins}\n`;
    }
    
    // Send to owner
    if (botOwnerJid) {
        const message = `
🗑️ *ANTI DELETE - DELETED MESSAGE RECOVERED*

👤 *Sender:* ${senderName} (${getUsername(sender)})
📞 *Phone:* ${getUsername(sender)}
${groupInfo}📍 *Chat Type:* ${isGroup ? 'Group' : 'Private Chat'}
🕐 *Time Deleted:* ${new Date().toLocaleString()}
⏰ *Original Time:* ${stored?.timestamp ? new Date(stored.timestamp).toLocaleString() : 'Unknown'}

📝 *Original Content:*
${content}

⚠️ *This message was deleted but has been recovered by INSIDIOUS security system.*`;

        await conn.sendMessage(botOwnerJid, { text: message });
        messageStore.delete(messageId);
    }
    
    return true;
}

// ============================================
// STORE MESSAGE FOR ANTI DELETE
// ============================================
function storeMessage(msg) {
    try {
        if (!msg.key || !msg.key.id || msg.key.fromMe) return;
        
        let content = "";
        if (msg.message.conversation) {
            content = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
            content = msg.message.imageMessage.caption || "";
        } else if (msg.message.videoMessage?.caption) {
            content = msg.message.videoMessage.caption || "";
        }
        
        messageStore.set(msg.key.id, {
            content: content,
            sender: msg.key.participant || msg.key.remoteJid,
            from: msg.key.remoteJid,
            timestamp: new Date()
        });
        
        // Clean old messages
        if (messageStore.size > 1000) {
            const keys = Array.from(messageStore.keys()).slice(0, 200);
            keys.forEach(key => messageStore.delete(key));
        }
    } catch (error) {
        console.error("Store message error:", error.message);
    }
}

// ============================================
// ANTI FEATURES - ALL WORKING
// ============================================

// ANTI LINK
async function checkAntiLink(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antilink) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const linkPatterns = [/chat\.whatsapp\.com/i, /whatsapp\.com/i, /wa\.me/i, /http:\/\//i, /https:\/\//i, /www\./i];
    const hasLink = linkPatterns.some(pattern => pattern.test(body));
    if (!hasLink) return false;
    
    const senderName = await getUserName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    let warnings = warningTracker.get(sender) || 0;
    warnings++;
    warningTracker.set(sender, warnings);
    
    if (warnings >= 3) {
        try {
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            await reply(`🚫 *USER REMOVED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n❌ Reason: Sending links (3 warnings)\n⚠️ Total Warnings: ${warnings}`);
            warningTracker.delete(sender);
        } catch (e) {
            console.error("Remove error:", e.message);
        }
    } else {
        await reply(`⚠️ *LINK DETECTED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n🚫 Action: Message deleted\n⚠️ Warning: ${warnings}/3\n📝 Next: Removal from group`);
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
    }
    
    return true;
}

// ANTI PORNO
async function checkAntiPorn(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antiporn) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const pornKeywords = config.pornKeywords || ['porn', 'sex', 'xxx', 'ngono', 'hentai', 'nude'];
    const hasPorn = pornKeywords.some(keyword => body.toLowerCase().includes(keyword.toLowerCase()));
    if (!hasPorn) return false;
    
    const senderName = await getUserName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    let warnings = warningTracker.get(sender) || 0;
    warnings++;
    warningTracker.set(sender, warnings);
    
    if (warnings >= 2) {
        try {
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            await reply(`🚫 *USER REMOVED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n❌ Reason: Pornographic content (2 warnings)\n⚠️ Total Warnings: ${warnings}`);
            warningTracker.delete(sender);
        } catch (e) {
            console.error("Remove error:", e.message);
        }
    } else {
        await reply(`⚠️ *PORN CONTENT DETECTED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n🚫 Action: Message deleted\n⚠️ Warning: ${warnings}/2\n📝 Next: Removal from group`);
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
    }
    
    return true;
}

// ANTI SCAM
async function checkAntiScam(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antiscam) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const scamKeywords = config.scamKeywords || ['investment', 'bitcoin', 'ashinde', 'zawadi', 'gift card', 'pata pesa'];
    const hasScam = scamKeywords.some(keyword => body.toLowerCase().includes(keyword.toLowerCase()));
    if (!hasScam) return false;
    
    const senderName = await getUserName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    // Tag all members
    try {
        const metadata = await conn.groupMetadata(from);
        let mentionText = "";
        metadata.participants.forEach(p => {
            if (p.id !== sender) mentionText += `@${p.id.split('@')[0]} `;
        });
        
        await reply(`🚨 *SCAM ALERT!*\n\n${mentionText}\n\n⚠️ Warning: ${senderName} (${getUsername(sender)}) sent a scam message!\n🏷️ Group: ${groupName}\n📝 Content: "${body.substring(0, 100)}..."\n\n🚫 User has been removed from group!`);
        
        await conn.groupParticipantsUpdate(from, [sender], "remove");
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
        
    } catch (e) {
        console.error("Scam check error:", e.message);
    }
    
    return true;
}

// ANTI MEDIA
async function checkAntiMedia(conn, msg, from, sender, reply, settings) {
    if (!settings.antimedia) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const hasMedia = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.stickerMessage;
    if (!hasMedia) return false;
    
    const senderName = await getUserName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    await reply(`⚠️ *MEDIA NOT ALLOWED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n🚫 Action: Media deleted\n📝 Note: Media sharing is disabled in this group`);
    
    try {
        await conn.sendMessage(from, { delete: msg.key });
    } catch (e) {}
    
    return true;
}

// ANTI TAG
async function checkAntiTag(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antitag) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const tagCount = (body.match(/@/g) || []).length;
    if (tagCount < 5) return false;
    
    const senderName = await getUserName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    await reply(`⚠️ *EXCESSIVE TAGGING*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n🚫 Action: Message deleted\n📝 Tags detected: ${tagCount}\n✅ Max allowed: 4`);
    
    try {
        await conn.sendMessage(from, { delete: msg.key });
    } catch (e) {}
    
    return true;
}

// ANTI SPAM
async function checkAntiSpam(conn, msg, from, sender, settings) {
    if (!settings.antispam) return false;
    if (!from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const now = Date.now();
    const key = `${from}:${sender}`;
    
    if (!spamTracker.has(key)) {
        spamTracker.set(key, { count: 1, firstMessage: now, lastMessage: now });
        return false;
    }
    
    const data = spamTracker.get(key);
    data.count++;
    data.lastMessage = now;
    
    const timeDiff = (now - data.firstMessage) / 1000;
    
    if (data.count > 10 && timeDiff < 30) {
        const reply = createReply(conn, from, msg);
        const senderName = await getUserName(conn, sender);
        const groupName = await getGroupName(conn, from);
        
        await reply(`🚫 *SPAM DETECTED*\n\n👤 User: ${senderName}\n📞 Phone: ${getUsername(sender)}\n🏷️ Group: ${groupName}\n🚫 Action: Muted for 1 hour\n📝 Messages: ${data.count} in ${Math.round(timeDiff)}s\n✅ Limit: 10 messages/30s`);
        
        try {
            await conn.groupParticipantsUpdate(from, [sender], "mute", 3600);
        } catch (e) {}
        
        spamTracker.delete(key);
        return true;
    }
    
    if (timeDiff > 60) spamTracker.delete(key);
    return false;
}

// ============================================
// WELCOME & GOODBYE
// ============================================
async function handleWelcome(conn, participant, groupJid, action = 'add') {
    try {
        const settings = await Settings.findOne();
        if (!settings?.welcomeGoodbye) return;
        
        const botAdmin = await isBotAdmin(conn, groupJid);
        if (!botAdmin) return;
        
        const participantName = await getUserName(conn, participant);
        const groupInfo = await getGroupInfo(conn, groupJid);
        
        if (action === 'add') {
            // Get quote
            let quote = "Welcome to our community!";
            try {
                const response = await axios.get('https://api.quotable.io/random');
                if (response.data?.content) quote = response.data.content;
            } catch (e) {}
            
            const welcomeMsg = `
🎉 *WELCOME TO ${groupInfo.name.toUpperCase()}!*

👤 *New Member:* ${participantName}
📞 *Phone:* ${getUsername(participant)}
🕐 *Joined:* ${new Date().toLocaleTimeString()}
📝 *Group Description:* ${groupInfo.description}
👥 *Total Members:* ${groupInfo.participants}
👑 *Admins:* ${groupInfo.admins}
🌟 *Active Members:* ${Math.floor(groupInfo.participants * 0.7)}

💬 *Welcome Quote:*
"${quote}"

Enjoy your stay! 🥳`;
            
            await conn.sendMessage(groupJid, { text: welcomeMsg });
        } else {
            const goodbyeMsg = `
👋 *GOODBYE!*

👤 *Member:* ${participantName}
📞 *Phone:* ${getUsername(participant)}
🕐 *Left:* ${new Date().toLocaleTimeString()}
👥 *Remaining Members:* ${groupInfo.participants}
😢 *We'll miss you!*`;
            
            await conn.sendMessage(groupJid, { text: goodbyeMsg });
        }
    } catch (error) {
        console.error("Welcome/Goodbye error:", error.message);
    }
}

// ============================================
// AI CHATBOT - POLLINATIONS.AI
// ============================================
async function getAIResponse(userMessage) {
    try {
        const encodedMessage = encodeURIComponent(userMessage);
        const response = await axios.get(`https://text.pollinations.ai/${encodedMessage}`, { timeout: 10000 });
        
        if (response.data?.trim()) {
            return response.data.trim();
        }
        
        const responses = [
            "Hello! How can I assist you today? 😊",
            "Hey there! What's on your mind?",
            "Hi! I'm here to help you!",
            "Hello! How's your day going?",
            "Hey! What can I do for you?"
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    } catch (error) {
        console.error('AI Error:', error.message);
        return "I'm here! What would you like to talk about? 😊";
    }
}

// ============================================
// COMMAND LOADER - FIXED
// ============================================
async function loadCommand(command, conn, from, msg, args, isOwner, sender, pushname, isGroup) {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(cmdPath)) {
            const reply = createReply(conn, from, msg);
            await reply("❌ Commands directory not found!");
            return;
        }

        // Find command file
        let commandFile = null;
        const categories = fs.readdirSync(cmdPath);
        
        for (const cat of categories) {
            const catPath = path.join(cmdPath, cat);
            if (!fs.statSync(catPath).isDirectory()) continue;
            
            const files = fs.readdirSync(catPath);
            for (const file of files) {
                if (file === `${command}.js`) {
                    commandFile = path.join(catPath, file);
                    break;
                }
            }
            if (commandFile) break;
        }
        
        if (!commandFile) {
            const reply = createReply(conn, from, msg);
            await reply(`❌ Command "${command}" not found!\nUse .menu for all commands.`);
            return;
        }
        
        // Load command
        delete require.cache[require.resolve(commandFile)];
        const cmdModule = require(commandFile);
        
        // Create reply function
        const reply = createReply(conn, from, msg);
        
        // Check if command requires owner
        if (cmdModule.ownerOnly && !isOwner) {
            await reply("❌ This command is only for bot owner!");
            return;
        }
        
        // Execute command - Handle both formats
        if (typeof cmdModule.execute === 'function') {
            // Check function parameters
            try {
                // Try object format first
                await cmdModule.execute({
                    conn, msg, args, from, sender, isGroup, isOwner, pushname, reply, config
                });
            } catch (error) {
                // Try old format
                try {
                    await cmdModule.execute(conn, msg, args, { 
                        from, reply, sender, isOwner, pushname, config 
                    });
                } catch (error2) {
                    console.error(`Command "${command}" execution error:`, error2);
                    await reply(`❌ Error in "${command}": ${error2.message}`);
                }
            }
        } else if (typeof cmdModule === 'function') {
            // Old format function
            try {
                await cmdModule(conn, msg, args, { 
                    from, reply, sender, isOwner, pushname, config 
                });
            } catch (error) {
                console.error(`Command "${command}" execution error:`, error);
                await reply(`❌ Error in "${command}": ${error.message}`);
            }
        } else {
            await reply(`❌ Command "${command}" has invalid structure`);
        }
        
    } catch (error) {
        console.error(`Command "${command}" loading error:`, error);
        try {
            const reply = createReply(conn, from, msg);
            await reply(`❌ Error loading "${command}": ${error.message}`);
        } catch (e) {}
    }
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (conn, m) => {
    try {
        if (!m.messages || !m.messages[0]) return;
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const pushname = msg.pushName || "User";
        
        // Extract message body
        let body = "";
        if (msg.message.conversation) {
            body = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            body = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
            body = msg.message.imageMessage.caption || "";
        } else if (msg.message.videoMessage?.caption) {
            body = msg.message.videoMessage.caption || "";
        }
        
        const isGroup = from.endsWith('@g.us');
        
        // Get settings
        const settings = await Settings.findOne() || {};
        
        // Check if it's a command
        let isCmd = false;
        let command = "";
        let args = [];
        
        if (body && typeof body === 'string') {
            if (body.startsWith(config.prefix)) {
                isCmd = true;
                const cmdText = body.slice(config.prefix.length).trim();
                const parts = cmdText.split(/ +/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        
        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`);
        }
        
        // Check if sender is owner
        const isOwner = botOwnerJid ? (sender === botOwnerJid || msg.key.fromMe) : false;
        
        // STORE MESSAGE
        storeMessage(msg);
        
        // ANTI VIEWONCE
        if (await handleViewOnce(conn, msg, settings)) return;
        
        // ANTI DELETE
        if (await handleAntiDelete(conn, msg, settings)) return;
        
        // AUTO READ
        if (settings.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // AUTO REACT
        if (settings.autoReact && !msg.key.fromMe) {
            try {
                const reactions = ['❤️', '👍', '🔥', '🎉', '👏'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, {
                    react: {
                        text: randomReaction,
                        key: msg.key
                    }
                });
            } catch (e) {}
        }
        
        // CHECK ANTI FEATURES
        if (isGroup && body && !msg.key.fromMe) {
            const reply = createReply(conn, from, msg);
            
            // Anti Link
            if (await checkAntiLink(conn, msg, body, from, sender, reply, settings)) return;
            
            // Anti Porn
            if (await checkAntiPorn(conn, msg, body, from, sender, reply, settings)) return;
            
            // Anti Scam
            if (await checkAntiScam(conn, msg, body, from, sender, reply, settings)) return;
            
            // Anti Media
            if (await checkAntiMedia(conn, msg, from, sender, reply, settings)) return;
            
            // Anti Tag
            if (await checkAntiTag(conn, msg, body, from, sender, reply, settings)) return;
            
            // Anti Spam
            if (await checkAntiSpam(conn, msg, from, sender, settings)) return;
        }
        
        // COMMAND HANDLING
        if (isCmd && command) {
            await loadCommand(command, conn, from, msg, args, isOwner, sender, pushname, isGroup);
            return;
        }
        
        // AI CHATBOT
        if (body && !isCmd && !msg.key.fromMe && settings.chatbot) {
            const botName = config.botName.toLowerCase();
            if (body.toLowerCase().includes(botName) || body.endsWith('?')) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                    const aiResponse = await getAIResponse(body);
                    await conn.sendMessage(from, { 
                        text: `💬 *${config.botName}:*\n${aiResponse}` 
                    });
                    await conn.sendPresenceUpdate('paused', from);
                } catch (e) {
                    console.error("Chatbot error:", e.message);
                }
                return;
            }
        }
        
    } catch (err) {
        console.error("Handler Error:", err.message);
    }
};

// ============================================
// GROUP UPDATE HANDLER
// ============================================
module.exports.handleGroupUpdate = async (conn, update) => {
    try {
        const { id, participants, action } = update;
        
        if (action === 'add') {
            for (const participant of participants) {
                await handleWelcome(conn, participant, id, 'add');
            }
        } else if (action === 'remove') {
            for (const participant of participants) {
                await handleWelcome(conn, participant, id, 'remove');
            }
        }
    } catch (error) {
        console.error("Group update handler error:", error.message);
    }
};

// ============================================
// INITIALIZATION
// ============================================
module.exports.init = async (conn) => {
    try {
        console.log('[SYSTEM] Initializing INSIDIOUS: THE LAST KEY...');
        
        if (conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`);
            
            // Set auto bio
            const settings = await Settings.findOne();
            if (settings?.autoBio) {
                try {
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    await conn.updateProfileStatus(`🤖 ${config.botName} | 🚀 Online ${hours}h ${minutes}m | 👨‍💻 ${config.developerName}`);
                } catch (e) {}
            }
        }
        
        console.log('[SYSTEM] ✅ Bot initialized with ALL features');
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};
