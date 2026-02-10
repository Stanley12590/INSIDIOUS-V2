const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { fancy } = require('./lib/font');

// DATABASE MODELS WITH ERROR HANDLING
let User, Group, ChannelSubscriber, Settings;
try {
    const models = require('./database/models');
    User = models.User;
    Group = models.Group;
    ChannelSubscriber = models.ChannelSubscriber;
    Settings = models.Settings;
} catch (error) {
    console.log(fancy("⚠️ Using mock database models"));
    User = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), find: () => Promise.resolve([]), create: () => Promise.resolve({}), findOneAndUpdate: () => Promise.resolve({}) };
    Group = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0) };
    ChannelSubscriber = { findOne: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), find: () => Promise.resolve([]), create: () => Promise.resolve({}), findOneAndUpdate: () => Promise.resolve({}) };
    Settings = { findOne: () => Promise.resolve(null), create: () => Promise.resolve({}) };
}

// MESSAGE STORE FOR ANTI-DELETE/VIEWONCE
const messageStore = new Map();
const MAX_STORE_SIZE = 1000;

// BOT OWNER JID
let botOwnerJid = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

// GET USERNAME FROM JID
function getUsername(jid) {
    try {
        return jid.split('@')[0];
    } catch {
        return "Unknown";
    }
}

// GET SENDER INFO FOR FORMATTING
async function getSenderInfo(conn, sender) {
    try {
        const user = await User.findOne({ jid: sender });
        if (user && user.name) {
            return user.name;
        }
        return getUsername(sender);
    } catch {
        return getUsername(sender);
    }
}

// GET GROUP NAME
async function getGroupName(conn, groupJid) {
    try {
        const metadata = await conn.groupMetadata(groupJid);
        return metadata.subject || "Unknown Group";
    } catch {
        return "Unknown Group";
    }
}

// CREATE REPLY FUNCTION
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
            console.error('Reply error:', error.message);
            return null;
        }
    };
}

// ============================================
// ANTI-VIEWONCE HANDLER (IMPROVED)
// ============================================
async function handleViewOnce(conn, msg, sender, pushname, from, isGroup) {
    try {
        if (!botOwnerJid) return false;
        
        // Get settings
        let settings = await Settings.findOne();
        if (!settings?.antiviewonce && !config.antiviewonce) return false;
        
        const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
        if (!viewOnceMsg) return false;
        
        // Get sender info
        let senderInfo = await getSenderInfo(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            try {
                const groupName = await getGroupName(conn, from);
                groupInfo = `📛 *Group:* ${groupName}\n`;
            } catch (e) {}
        }
        
        // Store message for tracking
        const storeKey = msg.key.id;
        messageStore.set(storeKey, {
            type: 'viewonce',
            sender: sender,
            senderInfo: senderInfo,
            from: from,
            isGroup: isGroup,
            timestamp: new Date(),
            messageId: msg.key.id
        });
        
        // Clean up old messages
        if (messageStore.size > MAX_STORE_SIZE) {
            const keys = Array.from(messageStore.keys()).slice(0, 100);
            keys.forEach(key => messageStore.delete(key));
        }
        
        // Send notification to owner
        const notification = `
╭─── • 🥀 • ───╮
   𝗩𝗜𝗘𝗪-𝗢𝗡𝗖𝗘 𝗗𝗘𝗧𝗘𝗖𝗧𝗘𝗗
╰─── • 🥀 • ───╯

👤 *Sender:* ${senderInfo}
📞 *Number:* ${getUsername(sender)}
${groupInfo}🕐 *Time:* ${new Date().toLocaleTimeString()}

⚠️ *Type:* ${viewOnceMsg.imageMessage ? 'Image' : viewOnceMsg.videoMessage ? 'Video' : 'Media'}
🔒 *Status:* Message will disappear after viewing

${fancy("View-once message captured by Insidious")}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        return true;
    } catch (error) {
        console.error("View-once error:", error.message);
        return false;
    }
}

// ============================================
// ANTI-DELETE HANDLER (IMPROVED)
// ============================================
async function handleAntiDelete(conn, msg, sender, pushname, from, isGroup) {
    try {
        if (!botOwnerJid) return false;
        
        // Get settings
        let settings = await Settings.findOne();
        if (!settings?.antidelete && !config.antidelete) return false;
        
        if (!msg.message?.protocolMessage || msg.message.protocolMessage.type !== 5) {
            return false;
        }
        
        const deletedMsgKey = msg.message.protocolMessage.key;
        const storeKey = deletedMsgKey.id;
        
        // Get sender info
        let senderInfo = await getSenderInfo(conn, sender);
        let groupInfo = "";
        let originalContent = "Message content not available";
        
        // Check if we have the message stored
        const storedMsg = messageStore.get(storeKey);
        if (storedMsg) {
            senderInfo = storedMsg.senderInfo || senderInfo;
            originalContent = `"${storedMsg.content || "Media/Deleted Content"}"`;
            messageStore.delete(storeKey);
        }
        
        if (isGroup) {
            try {
                const groupName = await getGroupName(conn, from);
                groupInfo = `📛 *Group:* ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send notification to owner
        const notification = `
╭─── • 🥀 • ───╮
   𝗗𝗘𝗟𝗘𝗧𝗘𝗗 𝗠𝗘𝗦𝗦𝗔𝗚𝗘
╰─── • 🥀 • ───╯

👤 *Sender:* ${senderInfo}
📞 *Number:* ${getUsername(sender)}
${groupInfo}🕐 *Time:* ${new Date().toLocaleTimeString()}

📝 *Original Message:*
${originalContent}

🔍 *Message ID:* ${deletedMsgKey.id || "Unknown"}

${fancy("Message deletion captured by Insidious")}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        return true;
    } catch (error) {
        console.error("Anti-delete error:", error.message);
        return false;
    }
}

// ============================================
// STORE MESSAGE FOR TRACKING
// ============================================
async function storeMessage(msg, body, sender, from, isGroup) {
    try {
        const storeKey = msg.key.id;
        
        // Don't store bot's own messages
        if (msg.key.fromMe) return;
        
        // Don't store empty messages
        if (!body && !msg.message?.imageMessage && !msg.message?.videoMessage) return;
        
        messageStore.set(storeKey, {
            content: body || (msg.message?.imageMessage ? "[Image]" : msg.message?.videoMessage ? "[Video]" : "[Media]"),
            sender: sender,
            from: from,
            isGroup: isGroup,
            timestamp: new Date(),
            messageId: msg.key.id
        });
        
        // Clean up old messages
        if (messageStore.size > MAX_STORE_SIZE) {
            const keys = Array.from(messageStore.keys()).slice(0, 100);
            keys.forEach(key => messageStore.delete(key));
        }
    } catch (error) {
        // Silent error
    }
}

// ============================================
// COMMAND PERMISSION CHECK
// ============================================
async function checkCommandPermission(conn, from, sender, command, isOwner, isGroup) {
    try {
        // Owner can always use commands
        if (isOwner) return true;
        
        // Non-owners in private chat cannot use commands
        if (!isGroup && !isOwner) return false;
        
        // For groups, check if user is admin
        if (isGroup) {
            try {
                const metadata = await conn.groupMetadata(from);
                const participant = metadata.participants.find(p => p.id === sender);
                if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
                    return true;
                }
            } catch (e) {
                return false;
            }
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// ============================================
// LOAD COMMAND
// ============================================
async function loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname, isGroup) {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(cmdPath)) {
            const reply = createReplyFunction(conn, from, msg);
            await reply("❌ Commands directory not found!");
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
                    // Clear cache
                    if (require.cache[commandFile]) {
                        delete require.cache[require.resolve(commandFile)];
                    }
                    
                    const cmdModule = require(commandFile);
                    const reply = createReplyFunction(conn, from, msg);
                    
                    // Check if command requires owner
                    if (cmdModule.ownerOnly && !isOwner) {
                        await reply("❌ This command is only for bot owner!");
                        return;
                    }
                    
                    // Check if command requires admin
                    if (cmdModule.adminOnly && isGroup && !isOwner) {
                        const isAdmin = await checkCommandPermission(conn, from, sender, command, isOwner, isGroup);
                        if (!isAdmin) {
                            await reply("❌ This command is only for group admins!");
                            return;
                        }
                    }
                    
                    // Execute command
                    if (typeof cmdModule.execute === 'function') {
                        await cmdModule.execute({
                            conn,
                            msg,
                            args,
                            from,
                            sender,
                            isGroup,
                            isOwner,
                            pushname,
                            reply,
                            fancy,
                            config,
                            settings
                        });
                    }
                    
                } catch (err) {
                    console.error(`Command "${command}" error:`, err);
                    const reply = createReplyFunction(conn, from, msg);
                    await reply(`❌ Error in "${command}": ${err.message}`);
                }
                return;
            }
        }
        
        if (!commandFound) {
            const reply = createReplyFunction(conn, from, msg);
            await reply(`❌ Command "${command}" not found!`);
        }
        
    } catch (error) {
        console.error('Load command error:', error);
    }
}

// ============================================
// CHATBOT HANDLER
// ============================================
async function handleChatbot(conn, from, body, settings, sender, isOwner) {
    try {
        if (!body || body.trim().length < 2) return false;
        if (!settings?.chatbot && !config.chatbot) return false;
        
        // Owner bypass
        if (isOwner && body.toLowerCase().includes('bot stop')) return false;
        
        // Typing indicator
        try {
            await conn.sendPresenceUpdate('composing', from);
        } catch (e) {}
        
        // Simple AI response
        let response = `╭─── • 🥀 • ───╮\n   ɪɴꜱɪᴅɪᴏᴜꜱ ᴀɪ\n╰─── • 🥀 • ───╯\n\n`;
        
        if (body.toLowerCase().includes('hi') || body.toLowerCase().includes('hello')) {
            response += `Hello! I'm Insidious Bot. How can I help you today?`;
        } else if (body.toLowerCase().includes('owner')) {
            response += `My owner is ${config.ownerName || "StanyTZ"}. Contact them for serious matters.`;
        } else if (body.toLowerCase().includes('feature')) {
            response += `I have many features:\n• Anti-delete\n• Anti-viewonce\n• Chatbot\n• Welcome messages\n• And more!`;
        } else {
            response += `I heard: "${body.substring(0, 50)}..."\n\nI'm still learning. My owner is working on my AI.`;
        }
        
        response += `\n\n${fancy("Powered by Insidious V2")}`;
        
        await conn.sendMessage(from, { text: response });
        
        // Stop typing
        try {
            await conn.sendPresenceUpdate('paused', from);
        } catch (e) {}
        
        return true;
    } catch (e) {
        console.error("Chatbot error:", e.message);
        return false;
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
        const type = Object.keys(msg.message)[0];
        const sender = msg.key.participant || msg.key.remoteJid;
        const pushname = msg.pushName || "User";
        
        // Extract message body
        let body = "";
        if (type === 'conversation') {
            body = msg.message.conversation;
        } else if (type === 'extendedTextMessage') {
            body = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage) {
            body = msg.message.imageMessage.caption || "";
        } else if (msg.message.videoMessage) {
            body = msg.message.videoMessage.caption || "";
        }
        
        const isGroup = from.endsWith('@g.us');
        const isCmd = body && body.startsWith(config.prefix || '!');
        const command = isCmd ? body.slice((config.prefix || '!').length).trim().split(' ')[0].toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];
        
        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = conn.user.id;
            console.log(fancy(`[OWNER] Bot owner: ${getUsername(botOwnerJid)}`));
        }
        
        // Check if sender is owner
        const isOwner = botOwnerJid ? (sender === botOwnerJid || msg.key.fromMe) : false;
        
        // LOAD SETTINGS
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {
            settings = config;
        }
        
        // STORE MESSAGE FOR ANTI-DELETE
        await storeMessage(msg, body, sender, from, isGroup);
        
        // ANTI-VIEWONCE (OWNER GETS NOTIFICATION)
        if (await handleViewOnce(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // ANTI-DELETE (OWNER GETS NOTIFICATION)
        if (await handleAntiDelete(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // AUTO READ MESSAGES
        if (settings.autoRead || config.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // AUTO REACT (FOR OWNER'S MESSAGES)
        if (settings.autoReact && isOwner && body && !isCmd) {
            try {
                const reactions = ['🥀', '❤️', '🔥', '⭐'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                await conn.sendMessage(from, { 
                    react: { text: randomReaction, key: msg.key } 
                });
            } catch (e) {}
        }
        
        // COMMAND HANDLING
        if (isCmd && command) {
            // Check permission
            const hasPermission = await checkCommandPermission(conn, from, sender, command, isOwner, isGroup);
            
            if (!hasPermission) {
                const reply = createReplyFunction(conn, from, msg);
                await reply("❌ You don't have permission to use commands!");
                return;
            }
            
            await loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname, isGroup);
            return;
        }
        
        // CHATBOT (FOR EVERYONE)
        if (body && body.trim().length > 1 && !isCmd && !msg.key.fromMe) {
            await handleChatbot(conn, from, body, settings, sender, isOwner);
            return;
        }
        
        // IF MESSAGE IS FROM OWNER AND NOT A COMMAND, SEND TO BOT OWNER FOR LOGGING
        if (isOwner && body && !isCmd) {
            try {
                // Store owner message for reference
                console.log(fancy(`[OWNER MSG] ${body.substring(0, 50)}...`));
            } catch (e) {}
        }
        
    } catch (err) {
        console.error("Handler Error:", err.message);
    }
};

// ============================================
// INITIALIZATION
// ============================================
module.exports.init = async (conn) => {
    try {
        console.log(fancy('[SYSTEM] Initializing Insidious...'));
        
        // Set bot owner
        if (conn.user) {
            botOwnerJid = conn.user.id;
            console.log(fancy(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`));
            
            // Send initialization message to owner
            const initMsg = `
╭─── • 🥀 • ───╮
   ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ɪɴɪᴛɪᴀʟɪᴢᴇᴅ
╰─── • 🥀 • ───╯

✅ *System Initialized*
👤 Bot Owner: ${getUsername(botOwnerJid)}
🕐 Time: ${new Date().toLocaleString()}

⚙️ *Active Features:*
• Anti-delete: ✅
• Anti-viewonce: ✅  
• Chatbot: ✅
• Command System: ✅
• Message Logger: ✅

${fancy("All systems operational. The void is watching...")}`;
            
            await conn.sendMessage(botOwnerJid, { text: initMsg });
        }
        
        console.log(fancy('[SYSTEM] ✅ Bot initialized successfully'));
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};

// ============================================
// EXPORT FUNCTIONS
// ============================================
module.exports.createReplyFunction = createReplyFunction;
module.exports.handleViewOnce = handleViewOnce;
module.exports.handleAntiDelete = handleAntiDelete;