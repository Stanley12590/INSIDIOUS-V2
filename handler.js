const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');

// LOAD DATABASE MODELS SAFELY
let User, Group, Settings;
try {
    const models = require('./database/models');
    User = models.User || { 
        findOne: async () => null, 
        create: async (data) => ({ ...data, save: async () => null }),
        countDocuments: async () => 0
    };
    Group = models.Group || { 
        findOne: async () => null, 
        create: async (data) => ({ ...data, save: async () => null })
    };
    Settings = models.Settings || { 
        findOne: async () => ({ 
            antilink: true, antiporn: true, antiscam: true, antimedia: false, antitag: true,
            antiviewonce: true, antidelete: true, sleepingMode: false, welcomeGoodbye: true,
            chatbot: true, autoRead: true, autoReact: true, autoBio: true, anticall: true,
            antispam: true, antibug: true, autoStatus: true, autoStatusReply: true,
            autoRecording: true, autoSave: false, downloadStatus: false,
            activeMembers: false, autoblockCountry: false,
            workMode: 'public',
            save: async function() { return this; }
        }) 
    };
} catch (error) {
    console.log("⚠️ Database models not available, using memory storage");
    User = { 
        findOne: async () => null, 
        create: async (data) => ({ ...data, save: async () => null }),
        countDocuments: async () => 0
    };
    Group = { 
        findOne: async () => null, 
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
            workMode: 'public',
            save: async function() { return this; }
        }) 
    };
}

// STORAGE
const messageStore = new Map();
const spamTracker = new Map();
const warningTracker = new Map();
const userActivity = new Map();

// BOT OWNER
let botOwnerJid = null;
let botOwnerNumber = null;

// ============================================
// 1. HELPER FUNCTIONS
// ============================================

function getUsername(jid) {
    if (!jid) return "Unknown";
    try {
        return jid.split('@')[0];
    } catch {
        return "Unknown";
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getContactName(conn, jid) {
    try {
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

async function isUserAdmin(conn, groupJid, userJid) {
    try {
        const metadata = await conn.groupMetadata(groupJid);
        const participant = metadata.participants.find(p => p.id === userJid);
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
// 2. AUTO FEATURES
// ============================================

// AUTO TYPING
async function handleAutoTyping(conn, from, settings) {
    if (!settings.autoTyping) return;
    try {
        await conn.sendPresenceUpdate('composing', from);
        setTimeout(async () => {
            await conn.sendPresenceUpdate('paused', from);
        }, 2000);
    } catch (e) {}
}

// AUTO RECORDING
async function handleAutoRecording(conn, msg, settings) {
    if (!settings.autoRecording) return;
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const timestamp = new Date();
        
        // Store in memory
        if (!userActivity.has(sender)) {
            userActivity.set(sender, []);
        }
        userActivity.get(sender).push({
            timestamp,
            type: msg.message?.imageMessage ? 'image' : 
                  msg.message?.videoMessage ? 'video' : 
                  msg.message?.audioMessage ? 'audio' : 'text'
        });
        
        // Limit storage
        if (userActivity.get(sender).length > 100) {
            userActivity.get(sender).shift();
        }
    } catch (error) {
        console.error("Auto recording error:", error.message);
    }
}

// AUTO BIO
async function handleAutoBio(conn, settings) {
    if (!settings.autoBio || !conn.user?.id) return;
    try {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const bio = `🤖 ${config.botName} | ⏰ ${hours}h ${minutes}m | 👑 ${config.developerName}`;
        await conn.updateProfileStatus(bio);
    } catch (e) {}
}

// ============================================
// 3. ANTI FEATURES (ALL WORKING)
// ============================================

// ANTI VIEW ONCE - SENDS TO OWNER
async function handleViewOnce(conn, msg, settings) {
    if (!settings.antiviewonce) return false;
    
    const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
    if (!viewOnceMsg) return false;
    
    const sender = msg.key.participant || msg.key.remoteJid;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    try {
        const senderName = await getContactName(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            const groupName = await getGroupName(conn, from);
            groupInfo = `🏷️ *Group:* ${groupName}\n`;
        }
        
        let content = "";
        let mediaType = "";
        
        if (viewOnceMsg.message?.conversation) {
            content = viewOnceMsg.message.conversation;
            mediaType = "📝 Text";
        } else if (viewOnceMsg.message?.extendedTextMessage?.text) {
            content = viewOnceMsg.message.extendedTextMessage.text;
            mediaType = "📝 Text";
        } else if (viewOnceMsg.imageMessage) {
            content = "📸 Image";
            mediaType = "🖼️ Image";
        } else if (viewOnceMsg.videoMessage) {
            content = "🎥 Video";
            mediaType = "🎬 Video";
        }
        
        // SEND TO OWNER
        if (botOwnerJid) {
            const message = `
👁️ *VIEW ONCE RECOVERED*

👤 *Sender:* ${senderName}
📞 *Phone:* ${getUsername(sender)}
${groupInfo}📍 *Chat:* ${isGroup ? 'Group' : 'Private'}
🕐 *Time:* ${new Date().toLocaleString()}
📁 *Type:* ${mediaType}

📝 *Content:*
${content}

🔐 *Recovered by INSIDIOUS Security*`;
            
            await conn.sendMessage(botOwnerJid, { text: message });
        }
        return true;
    } catch (error) {
        console.error("View once error:", error.message);
        return false;
    }
}

// ANTI DELETE - SENDS TO OWNER
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
    
    const stored = messageStore.get(messageId);
    if (!stored) return false;
    
    try {
        const senderName = await getContactName(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            const groupName = await getGroupName(conn, from);
            groupInfo = `🏷️ *Group:* ${groupName}\n`;
        }
        
        // SEND TO OWNER
        if (botOwnerJid) {
            const message = `
🗑️ *DELETED MESSAGE RECOVERED*

👤 *Sender:* ${senderName}
📞 *Phone:* ${getUsername(sender)}
${groupInfo}📍 *Chat:* ${isGroup ? 'Group' : 'Private'}
🕐 *Deleted:* ${new Date().toLocaleString()}
⏰ *Original:* ${stored.timestamp?.toLocaleString() || 'Unknown'}

📝 *Content:*
${stored.content}

🔐 *Recovered by INSIDIOUS Security*`;
            
            await conn.sendMessage(botOwnerJid, { text: message });
        }
        
        messageStore.delete(messageId);
        return true;
    } catch (error) {
        console.error("Anti delete error:", error.message);
        return false;
    }
}

// STORE MESSAGES FOR ANTI DELETE
function storeMessage(msg) {
    try {
        if (!msg.key?.id || msg.key.fromMe) return;
        
        let content = "";
        if (msg.message?.conversation) {
            content = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage?.caption) {
            content = msg.message.imageMessage.caption || "";
        } else if (msg.message?.videoMessage?.caption) {
            content = msg.message.videoMessage.caption || "";
        }
        
        if (content) {
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
        }
    } catch (error) {
        // Silent error
    }
}

// ANTI LINK
async function checkAntiLink(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antilink || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const linkPatterns = [/chat\.whatsapp\.com/i, /whatsapp\.com/i, /wa\.me/i, /http:\/\//i, /https:\/\//i];
    const hasLink = linkPatterns.some(pattern => pattern.test(body));
    if (!hasLink) return false;
    
    const senderName = await getContactName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    let warnings = warningTracker.get(sender) || 0;
    warnings++;
    warningTracker.set(sender, warnings);
    
    if (warnings >= 3) {
        try {
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            await reply(`🚫 *USER REMOVED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n❌ Reason: Links (3 warnings)`);
            warningTracker.delete(sender);
        } catch (e) {}
    } else {
        await reply(`⚠️ *LINK DETECTED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n🚫 Warning: ${warnings}/3`);
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
    }
    return true;
}

// ANTI PORNO
async function checkAntiPorn(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antiporn || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const pornWords = config.pornKeywords || ['porn', 'sex', 'xxx', 'ngono', 'nude', 'hentai'];
    const hasPorn = pornWords.some(word => body.toLowerCase().includes(word.toLowerCase()));
    if (!hasPorn) return false;
    
    const senderName = await getContactName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    let warnings = warningTracker.get(sender) || 0;
    warnings++;
    warningTracker.set(sender, warnings);
    
    if (warnings >= 2) {
        try {
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            await reply(`🚫 *USER REMOVED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n❌ Reason: Porn content (2 warnings)`);
            warningTracker.delete(sender);
        } catch (e) {}
    } else {
        await reply(`⚠️ *PORN DETECTED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n🚫 Warning: ${warnings}/2`);
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
    }
    return true;
}

// ANTI SCAM
async function checkAntiScam(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antiscam || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const scamWords = config.scamKeywords || ['investment', 'bitcoin', 'ashinde', 'zawadi', 'gift card', 'pesa haraka'];
    const hasScam = scamWords.some(word => body.toLowerCase().includes(word.toLowerCase()));
    if (!hasScam) return false;
    
    const senderName = await getContactName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    try {
        const metadata = await conn.groupMetadata(from);
        let mentionText = "";
        metadata.participants.forEach(p => {
            if (p.id !== sender) mentionText += `@${getUsername(p.id)} `;
        });
        
        await reply(`🚨 *SCAM ALERT!*\n\n${mentionText}\n\n⚠️ ${senderName} (${getUsername(sender)}) sent scam message!\n🏷️ ${groupName}\n🚫 User removed!`);
        
        await conn.groupParticipantsUpdate(from, [sender], "remove");
        try {
            await conn.sendMessage(from, { delete: msg.key });
        } catch (e) {}
    } catch (e) {}
    return true;
}

// ANTI MEDIA
async function checkAntiMedia(conn, msg, from, sender, reply, settings) {
    if (!settings.antimedia || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const hasMedia = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.stickerMessage;
    if (!hasMedia) return false;
    
    const senderName = await getContactName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    await reply(`⚠️ *MEDIA NOT ALLOWED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n🚫 Media deleted`);
    try {
        await conn.sendMessage(from, { delete: msg.key });
    } catch (e) {}
    return true;
}

// ANTI TAG
async function checkAntiTag(conn, msg, body, from, sender, reply, settings) {
    if (!settings.antitag || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const tagCount = (body.match(/@/g) || []).length;
    if (tagCount < 5) return false;
    
    const senderName = await getContactName(conn, sender);
    const groupName = await getGroupName(conn, from);
    
    await reply(`⚠️ *EXCESSIVE TAGGING*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🏷️ ${groupName}\n🚫 ${tagCount} tags detected\n✅ Max: 4 tags`);
    try {
        await conn.sendMessage(from, { delete: msg.key });
    } catch (e) {}
    return true;
}

// ANTI SPAM
async function checkAntiSpam(conn, msg, from, sender, settings) {
    if (!settings.antispam || !from.endsWith('@g.us')) return false;
    
    const botAdmin = await isBotAdmin(conn, from);
    if (!botAdmin) return false;
    
    const now = Date.now();
    const key = `${from}:${sender}`;
    
    if (!spamTracker.has(key)) {
        spamTracker.set(key, { count: 1, firstMessage: now });
        return false;
    }
    
    const data = spamTracker.get(key);
    data.count++;
    
    if (data.count > 10 && (now - data.firstMessage) < 30000) {
        const reply = createReply(conn, from, msg);
        const senderName = await getContactName(conn, sender);
        
        await reply(`🚫 *SPAM DETECTED*\n\n👤 ${senderName}\n📞 ${getUsername(sender)}\n🚫 Muted for 1 hour\n📝 ${data.count} messages in 30s`);
        
        try {
            await conn.groupParticipantsUpdate(from, [sender], "mute", 3600);
        } catch (e) {}
        
        spamTracker.delete(key);
        return true;
    }
    
    if (now - data.firstMessage > 60000) spamTracker.delete(key);
    return false;
}

// ============================================
// 4. WELCOME & GOODBYE
// ============================================

async function handleWelcome(conn, participant, groupJid, action = 'add') {
    try {
        const settings = await Settings.findOne();
        if (!settings?.welcomeGoodbye) return;
        
        const botAdmin = await isBotAdmin(conn, groupJid);
        if (!botAdmin) return;
        
        const participantName = await getContactName(conn, participant);
        const groupName = await getGroupName(conn, groupJid);
        
        if (action === 'add') {
            const welcomeMsg = `
🎉 *WELCOME TO ${groupName.toUpperCase()}!*

👤 New Member: ${participantName}
📞 Phone: ${getUsername(participant)}
🕐 Joined: ${new Date().toLocaleTimeString()}

💬 "A warm welcome to our community!"
Enjoy your stay! 🥳`;
            
            await conn.sendMessage(groupJid, { text: welcomeMsg });
        } else {
            const goodbyeMsg = `
👋 *GOODBYE!*

👤 Member: ${participantName}
📞 Phone: ${getUsername(participant)}
🕐 Left: ${new Date().toLocaleTimeString()}

😢 We'll miss you!`;
            
            await conn.sendMessage(groupJid, { text: goodbyeMsg });
        }
    } catch (error) {
        console.error("Welcome error:", error.message);
    }
}

// ============================================
// 5. AI CHATBOT (POLLINATIONS.AI)
// ============================================

async function getAIResponse(userMessage) {
    try {
        const encoded = encodeURIComponent(userMessage);
        const response = await axios.get(`https://text.pollinations.ai/${encoded}`, { timeout: 8000 });
        return response.data?.trim() || "Hello! How can I help you? 😊";
    } catch (error) {
        console.error("AI Error:", error.message);
        const responses = [
            "Hello! How can I assist you? 😊",
            "Hey there! What's up?",
            "Hi! I'm here to help!",
            "Hello! What can I do for you?"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
}

// ============================================
// 6. COMMAND HANDLER - FIXED FOR ALL COMMANDS
// ============================================

async function loadCommand(command, conn, from, msg, args, isOwner, sender, pushname, isGroup) {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(cmdPath)) {
            const reply = createReply(conn, from, msg);
            await reply("❌ Commands directory not found!");
            return;
        }

        // Search for command in all categories
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
            await reply(`❌ Command "${command}" not found!\nUse .menu for commands.`);
            return;
        }
        
        // Load command
        delete require.cache[require.resolve(commandFile)];
        const cmdModule = require(commandFile);
        
        const reply = createReply(conn, from, msg);
        
        // Check owner only
        if (cmdModule.ownerOnly && !isOwner) {
            await reply("❌ This command is for bot owner only!");
            return;
        }
        
        // Check admin only
        if (cmdModule.adminOnly && isGroup) {
            const userAdmin = await isUserAdmin(conn, from, sender);
            if (!userAdmin && !isOwner) {
                await reply("❌ This command is for group admins only!");
                return;
            }
        }
        
        // Execute command (support both formats)
        if (typeof cmdModule.execute === 'function') {
            // Try new format first
            try {
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
                    console.error(`Command "${command}" error:`, error2);
                    await reply(`❌ Error: ${error2.message}`);
                }
            }
        } else if (typeof cmdModule === 'function') {
            // Old format
            try {
                await cmdModule(conn, msg, args, { 
                    from, reply, sender, isOwner, pushname, config 
                });
            } catch (error) {
                console.error(`Command "${command}" error:`, error);
                await reply(`❌ Error: ${error.message}`);
            }
        } else {
            await reply(`❌ Invalid command format for "${command}"`);
        }
        
    } catch (error) {
        console.error(`Command "${command}" loading error:`, error);
        try {
            const reply = createReply(conn, from, msg);
            await reply(`❌ Error loading "${command}"`);
        } catch (e) {}
    }
}

// ============================================
// 7. MAIN MESSAGE HANDLER
// ============================================

module.exports = async (conn, m) => {
    try {
        if (!m.messages || !m.messages[0] || !m.messages[0].message) return;
        const msg = m.messages[0];
        
        // FIX: Check if conn.user exists
        if (!conn.user?.id) {
            console.error("Bot not initialized properly");
            return;
        }

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
        
        // SET BOT OWNER ONCE
        if (!botOwnerJid && conn.user.id) {
            botOwnerJid = conn.user.id;
            botOwnerNumber = getUsername(botOwnerJid);
            console.log(`[OWNER] Bot Owner: ${botOwnerNumber}`);
        }
        
        // Check if sender is owner
        const isOwner = botOwnerJid ? (sender === botOwnerJid || sender === botOwnerNumber + '@s.whatsapp.net' || msg.key.fromMe) : false;
        
        // Get settings
        const settings = await Settings.findOne() || {};
        
        // STORE MESSAGE
        storeMessage(msg);
        
        // AUTO TYPING
        await handleAutoTyping(conn, from, settings);
        
        // AUTO RECORDING
        await handleAutoRecording(conn, msg, settings);
        
        // ANTI VIEW ONCE
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
                const reactions = ['❤️', '👍', '🔥', '🎉'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, {
                    react: {
                        text: randomReaction,
                        key: msg.key
                    }
                });
            } catch (e) {}
        }
        
        // Check if it's a command
        let isCmd = false;
        let command = "";
        let args = [];
        
        if (body && typeof body === 'string') {
            // Check with prefix
            if (body.startsWith(config.prefix)) {
                isCmd = true;
                const cmdText = body.slice(config.prefix.length).trim();
                const parts = cmdText.split(/ +/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
            // Check without prefix (for menu, help, ping)
            else if (['menu', 'help', 'ping', 'owner', 'alive'].includes(body.toLowerCase().split(' ')[0])) {
                isCmd = true;
                const parts = body.trim().split(/ +/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        
        // CHECK ANTI FEATURES
        if (isGroup && body && !msg.key.fromMe) {
            const reply = createReply(conn, from, msg);
            
            if (await checkAntiLink(conn, msg, body, from, sender, reply, settings)) return;
            if (await checkAntiPorn(conn, msg, body, from, sender, reply, settings)) return;
            if (await checkAntiScam(conn, msg, body, from, sender, reply, settings)) return;
            if (await checkAntiMedia(conn, msg, from, sender, reply, settings)) return;
            if (await checkAntiTag(conn, msg, body, from, sender, reply, settings)) return;
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
            const isForBot = body.toLowerCase().includes(botName) || 
                            body.endsWith('?') || 
                            ['hi', 'hello', 'hey'].some(word => body.toLowerCase().startsWith(word));
            
            if (isForBot) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                    const aiResponse = await getAIResponse(body);
                    await conn.sendMessage(from, { 
                        text: `💬 ${aiResponse}` 
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
// 8. GROUP UPDATE HANDLER
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
        console.error("Group update error:", error.message);
    }
};

// ============================================
// 9. INITIALIZATION
// ============================================

module.exports.init = async (conn) => {
    try {
        console.log('[SYSTEM] Initializing INSIDIOUS: THE LAST KEY...');
        
        if (conn.user?.id) {
            botOwnerJid = conn.user.id;
            botOwnerNumber = getUsername(botOwnerJid);
            console.log(`[OWNER] Bot Owner: ${botOwnerNumber}`);
            
            // AUTO BIO
            const settings = await Settings.findOne();
            if (settings?.autoBio) {
                await handleAutoBio(conn, settings);
                // Update bio every hour
                setInterval(async () => {
                    await handleAutoBio(conn, settings);
                }, 3600000);
            }
            
            // AUTO SAVE CONTACT
            if (settings?.autoSave) {
                try {
                    await User.create({
                        jid: conn.user.id,
                        name: conn.user.name,
                        deviceId: conn.user.id.split(':')[0],
                        isActive: true,
                        linkedAt: new Date()
                    });
                } catch (e) {}
            }
        }
        
        console.log('[SYSTEM] ✅ Bot initialized with ALL 30+ features');
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};
