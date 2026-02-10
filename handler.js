const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');

// DATABASE MODELS WITH ERROR HANDLING
let User, Group, ChannelSubscriber, Settings;
try {
    const models = require('./database/models');
    User = models.User;
    Group = models.Group;
    ChannelSubscriber = models.ChannelSubscriber;
    Settings = models.Settings;
} catch (error) {
    console.log("⚠️ Using mock database models");
    User = { 
        findOne: async () => null, 
        countDocuments: async () => 0, 
        find: async () => [], 
        create: async () => ({}), 
        findOneAndUpdate: async () => ({}) 
    };
    Group = { 
        findOne: async () => null, 
        countDocuments: async () => 0 
    };
    ChannelSubscriber = { 
        findOne: async () => null, 
        countDocuments: async () => 0, 
        find: async () => [], 
        create: async () => ({}), 
        findOneAndUpdate: async () => ({}) 
    };
    Settings = { 
        findOne: async () => ({ 
            antilink: true, antiporn: true, antiscam: true, antimedia: false, antitag: true,
            antiviewonce: true, antidelete: true, sleepingMode: false, welcomeGoodbye: true,
            activeMembers: false, autoblockCountry: false, chatbot: true, autoStatus: true,
            autoRead: true, autoReact: true, autoSave: true, autoBio: true, anticall: true,
            downloadStatus: false, antispam: true, antibug: true, autoStatusReply: true,
            save: async function() { return this; }
        }), 
        create: async () => ({}) 
    };
}

// MESSAGE STORE FOR ANTI-DELETE/VIEWONCE
const messageStore = new Map();
const messageContentStore = new Map();

// BOT OWNER JID
let botOwnerJid = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

// GET USERNAME FROM JID
function getUsername(jid) {
    try {
        if (!jid) return "Unknown";
        const parts = jid.split('@');
        return parts[0] || "Unknown";
    } catch {
        return "Unknown";
    }
}

// GET DISPLAY NAME
async function getDisplayName(conn, jid) {
    try {
        if (!jid) return "Unknown";
        
        // First try to get from database
        const user = await User.findOne({ jid: jid });
        if (user && user.name) {
            return user.name;
        }
        
        // Return username as fallback
        return getUsername(jid);
    } catch {
        return getUsername(jid);
    }
}

// GET GROUP NAME
async function getGroupName(conn, groupJid) {
    try {
        const metadata = await conn.groupMetadata(groupJid);
        return metadata.subject || "Group Chat";
    } catch {
        return "Group Chat";
    }
}

// CREATE SIMPLE REPLY FUNCTION
function createReplyFunction(conn, from, msg) {
    return async function(text, options = {}) {
        try {
            const messageText = typeof text === 'string' ? text : text;
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
// STORE MESSAGE CONTENT
// ============================================
async function storeMessageContent(msg) {
    try {
        if (!msg.key || !msg.key.id) return;
        
        // Don't store bot's own messages
        if (msg.key.fromMe) return;
        
        const messageId = msg.key.id;
        let content = "";
        let mediaInfo = "";
        
        // Extract text content
        if (msg.message.conversation) {
            content = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
            content = msg.message.imageMessage.caption || "";
            mediaInfo = "🖼️ Image";
        } else if (msg.message.videoMessage?.caption) {
            content = msg.message.videoMessage.caption || "";
            mediaInfo = "🎥 Video";
        } else if (msg.message.audioMessage) {
            mediaInfo = "🎵 Audio";
        } else if (msg.message.stickerMessage) {
            mediaInfo = "😀 Sticker";
        }
        
        // Store viewonce content
        const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
        if (viewOnceMsg) {
            if (viewOnceMsg.message?.conversation) {
                content = viewOnceMsg.message.conversation;
            } else if (viewOnceMsg.message?.extendedTextMessage?.text) {
                content = viewOnceMsg.message.extendedTextMessage.text;
            } else if (viewOnceMsg.imageMessage) {
                mediaInfo = "👁️ ViewOnce Image";
            } else if (viewOnceMsg.videoMessage) {
                mediaInfo = "👁️ ViewOnce Video";
            }
        }
        
        messageContentStore.set(messageId, {
            content: content,
            mediaInfo: mediaInfo,
            timestamp: new Date(),
            sender: msg.key.participant || msg.key.remoteJid,
            from: msg.key.remoteJid
        });
        
    } catch (error) {
        console.error("Store message error:", error.message);
    }
}

// ============================================
// FIXED COMMAND LOADER
// ============================================
async function loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname, isGroup) {
    try {
        const cmdPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(cmdPath)) {
            const reply = createReplyFunction(conn, from, msg);
            await reply("❌ Commands directory not found!");
            return;
        }

        // Find command file
        let commandFile = null;
        const categories = fs.readdirSync(cmdPath);
        
        for (const cat of categories) {
            const categoryPath = path.join(cmdPath, cat);
            if (!fs.statSync(categoryPath).isDirectory()) continue;
            
            const possibleFile = path.join(categoryPath, `${command}.js`);
            if (fs.existsSync(possibleFile)) {
                commandFile = possibleFile;
                break;
            }
        }
        
        if (!commandFile) {
            const reply = createReplyFunction(conn, from, msg);
            await reply(`❌ Command "${command}" not found!\nUse ${config.prefix || '.'}menu for commands.`);
            return;
        }
        
        // Clear cache and load command
        delete require.cache[require.resolve(commandFile)];
        const cmdModule = require(commandFile);
        
        // Create reply function and attach to msg
        const reply = createReplyFunction(conn, from, msg);
        if (!msg.reply) {
            msg.reply = reply;
        }
        
        // Check permissions
        if (cmdModule.ownerOnly && !isOwner) {
            await reply("❌ This command is only for bot owner!");
            return;
        }
        
        if (cmdModule.adminOnly && isGroup && !isOwner) {
            try {
                const metadata = await conn.groupMetadata(from);
                const participant = metadata.participants.find(p => p.id === sender);
                const isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                
                if (!isAdmin) {
                    await reply("❌ This command is only for group admins!");
                    return;
                }
            } catch (e) {
                await reply("❌ Could not verify admin status!");
                return;
            }
        }
        
        // Check command structure and execute
        // FORMAT 1: execute(conn, msg, args, { from, fancy, reply })
        if (cmdModule.execute && cmdModule.execute.length === 4) {
            try {
                const extraParams = { 
                    from: from, 
                    fancy: (text) => text, // Simple fancy function
                    reply: reply,
                    conn: conn,
                    msg: msg,
                    args: args,
                    sender: sender,
                    isOwner: isOwner,
                    pushname: pushname,
                    settings: settings || {},
                    config: config
                };
                
                await cmdModule.execute(conn, msg, args, extraParams);
            } catch (error) {
                console.error(`Command "${command}" execution error:`, error);
                await reply(`❌ Error in "${command}": ${error.message}`);
            }
        } 
        // FORMAT 2: execute(context)
        else if (typeof cmdModule.execute === 'function') {
            try {
                const context = {
                    conn: conn,
                    msg: msg,
                    args: args,
                    from: from,
                    sender: sender,
                    isGroup: isGroup,
                    isOwner: isOwner,
                    pushname: pushname,
                    reply: reply,
                    fancy: (text) => text,
                    config: config,
                    settings: settings || {}
                };
                
                await cmdModule.execute(context);
            } catch (error) {
                console.error(`Command "${command}" execution error:`, error);
                await reply(`❌ Error in "${command}": ${error.message}`);
            }
        } 
        // FORMAT 3: Direct function
        else if (typeof cmdModule === 'function') {
            try {
                await cmdModule({ conn, msg, args, from, reply, sender, isOwner, pushname });
            } catch (error) {
                console.error(`Command "${command}" execution error:`, error);
                await reply(`❌ Error in "${command}": ${error.message}`);
            }
        } 
        else {
            await reply(`❌ Invalid command structure for "${command}"`);
        }
        
    } catch (error) {
        console.error(`Command "${command}" loading error:`, error);
        try {
            const reply = createReplyFunction(conn, from, msg);
            await reply(`❌ Error loading "${command}": ${error.message}`);
        } catch (e) {}
    }
}

// ============================================
// ANTI-VIEWONCE HANDLER (SENDS ACTUAL CONTENT)
// ============================================
async function handleViewOnce(conn, msg, sender, pushname, from, isGroup) {
    try {
        if (!botOwnerJid) return false;
        
        // Get settings
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {}
        
        if (!settings.antiviewonce && !config.antiviewonce) return false;
        
        const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
        if (!viewOnceMsg) return false;
        
        // Get actual content
        let actualContent = "";
        let mediaType = "";
        
        if (viewOnceMsg.message?.conversation) {
            actualContent = viewOnceMsg.message.conversation;
        } else if (viewOnceMsg.message?.extendedTextMessage?.text) {
            actualContent = viewOnceMsg.message.extendedTextMessage.text;
        } else if (viewOnceMsg.imageMessage) {
            actualContent = viewOnceMsg.imageMessage.caption || "";
            mediaType = "🖼️ Image";
        } else if (viewOnceMsg.videoMessage) {
            actualContent = viewOnceMsg.videoMessage.caption || "";
            mediaType = "🎥 Video";
        }
        
        // Get sender info
        let senderInfo = await getDisplayName(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            try {
                const groupName = await getGroupName(conn, from);
                groupInfo = `📛 Group: ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send notification to owner WITH ACTUAL CONTENT
        const notification = `
╭─── • 🥀 • ───╮
   𝗩𝗜𝗘𝗪-𝗢𝗡𝗖𝗘 𝗠𝗘𝗦𝗦𝗔𝗚𝗘
╰─── • 🥀 • ───╯

👤 From: ${senderInfo}
📞 Number: ${getUsername(sender)}
${groupInfo}🕐 Time: ${new Date().toLocaleTimeString()}
${mediaType ? `📁 Type: ${mediaType}\n` : ''}

💬 Message Content:
${actualContent || "Media (no caption)"}

📍 Sent from: ${isGroup ? 'Group' : 'Private Chat'}
${isGroup ? `📌 Chat: ${from}` : ''}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        // Store for anti-delete
        if (msg.key.id) {
            messageContentStore.set(msg.key.id, {
                content: actualContent,
                mediaInfo: mediaType,
                timestamp: new Date(),
                sender: sender,
                from: from,
                isViewOnce: true
            });
        }
        
        return true;
    } catch (error) {
        console.error("View-once error:", error.message);
        return false;
    }
}

// ============================================
// ANTI-DELETE HANDLER (SENDS ACTUAL CONTENT)
// ============================================
async function handleAntiDelete(conn, msg, sender, pushname, from, isGroup) {
    try {
        if (!botOwnerJid) return false;
        
        // Get settings
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {}
        
        if (!settings.antidelete && !config.antidelete) return false;
        
        if (!msg.message?.protocolMessage || msg.message.protocolMessage.type !== 5) {
            return false;
        }
        
        const deletedMsgKey = msg.message.protocolMessage.key;
        const messageId = deletedMsgKey.id;
        
        // Get stored content
        let storedContent = messageContentStore.get(messageId);
        let actualContent = storedContent?.content || "Content not available (may be media)";
        let mediaInfo = storedContent?.mediaInfo || "";
        
        // Get sender info
        let senderInfo = await getDisplayName(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            try {
                const groupName = await getGroupName(conn, from);
                groupInfo = `📛 Group: ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send notification to owner WITH ACTUAL CONTENT
        const notification = `
╭─── • 🥀 • ───╯
   𝗗𝗘𝗟𝗘𝗧𝗘𝗗 𝗠𝗘𝗦𝗦𝗔𝗚𝗘
╰─── • 🥀 • ───╯

👤 From: ${senderInfo}
📞 Number: ${getUsername(sender)}
${groupInfo}🕐 Time: ${new Date().toLocaleTimeString()}
${mediaInfo ? `📁 Type: ${mediaInfo}\n` : ''}

🗑️ Deleted Message:
${actualContent}

📍 Deleted from: ${isGroup ? 'Group' : 'Private Chat'}
${isGroup ? `📌 Chat: ${from}` : ''}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        // Remove from store
        messageContentStore.delete(messageId);
        
        return true;
    } catch (error) {
        console.error("Anti-delete error:", error.message);
        return false;
    }
}

// ============================================
// POLLINATIONS AI CHATBOT (HUMAN-LIKE)
// ============================================
async function getPollinationsAIResponse(userMessage, senderName = "User") {
    try {
        const cleanMessage = userMessage.trim();
        const encodedMessage = encodeURIComponent(cleanMessage);
        
        const systemPrompt = encodeURIComponent(`
You are INSIDIOUS V2, a human-like AI assistant with real emotions and personality.
You are talking to: ${senderName}

IMPORTANT RULES:
1. Detect user's language and reply in EXACTLY the same language
2. If user speaks Swahili, reply in Swahili with natural Tanzanian slang
3. If user speaks English, reply in English with emotions
4. If user speaks Sheng or mixed language, reply in the same mix
5. Be conversational and natural - use emojis sometimes 😊
6. Show emotions: ❤️ for love, 😂 for funny, 😢 for sad, etc.
7. Keep responses medium length (2-4 sentences)
8. Sometimes ask follow-up questions to keep conversation flowing
9. You're not just a bot - you're a friend with feelings
10. Respond as if you're having a real human conversation

Examples:
- User: "Hi" → You: "Hey there! 😊 How's your day going? Hope you're doing amazing!"
- User: "Niaje" → You: "Poaa sana! 😄 Vipi mambo yako leo? Unafanya nini?"
- User: "I'm sad" → You: "Aww, I'm sorry to hear that 😢 Wanna talk about it? I'm here for you ❤️"
- User: "Nimechoka" → You: "Pole sana 😔 Labda ukilala kidogo? Usijali, everything will be okay 💕"
- User: "Uko poa?" → You: "Niko poa sana! 😎 Unasema nini mkuu? Kuna kitu unataka kuongea?"
- User: "I love you" → You: "Aww, that's sweet! 😊❤️ I care about you too! You're an amazing person!"

Now respond naturally to the user's message:
`);
        
        const apiUrl = `https://text.pollinations.ai/${encodedMessage}?prompt=${systemPrompt}&model=chatgpt&temperature=0.8`;
        
        const response = await axios.get(apiUrl, { timeout: 10000 });
        
        if (response.data && response.data.trim()) {
            let aiResponse = response.data.trim();
            
            // Make response more human-like
            const emojis = ['😊', '❤️', '😂', '✨', '🥰', '🤗', '💕', '😄', '😎', '👋'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            
            // Add emoji if not present
            if (!aiResponse.includes('😊') && !aiResponse.includes('❤️') && !aiResponse.includes('😂')) {
                aiResponse = aiResponse + ' ' + randomEmoji;
            }
            
            return aiResponse;
        }
        
        return "Hey there! 😊 I'm here, what's up?";
    } catch (error) {
        console.error('Pollinations AI Error:', error.message);
        
        // Fallback responses
        const fallbackResponses = [
            "Hey there! 😊 How can I help you today?",
            "Sasa! 😄 Niko hapa, una nini?",
            "Hello! I'm here for you ❤️",
            "Poaa! 😎 Unasema nini mkuu?",
            "I'm listening... 👂 Tell me more!",
            "Karibu! 😊 Unaongea nini leo?",
            "Niaje! 😄 Vipi mzima?",
            "Hey! 👋 What's on your mind?"
        ];
        
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
}

// ============================================
// CHATBOT HANDLER (RESPONDS TO EVERYONE)
// ============================================
async function handleChatbot(conn, from, body, sender, pushname) {
    try {
        if (!body || body.trim().length < 1) return false;
        
        // Ignore commands
        if (body.startsWith(config.prefix || '.')) return false;
        
        // Typing indicator
        try {
            await conn.sendPresenceUpdate('composing', from);
        } catch (e) {}
        
        // Get AI response
        const aiResponse = await getPollinationsAIResponse(body, pushname || "User");
        
        // Format response
        const formattedResponse = `
╭─── • 🥀 • ───╮
   ɪɴꜱɪᴅɪᴏᴜꜱ ᴀɪ
╰─── • 🥀 • ───╯

${aiResponse}

💕 Your AI friend`;
        
        await conn.sendMessage(from, { text: formattedResponse });
        
        // Stop typing
        try {
            await conn.sendPresenceUpdate('paused', from);
        } catch (e) {}
        
        return true;
    } catch (error) {
        console.error("Chatbot error:", error.message);
        return false;
    }
}

// ============================================
// MAIN HANDLER (FIXED)
// ============================================
module.exports = async (conn, m) => {
    try {
        if (!m || !m.messages || !m.messages[0]) return;
        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        // SAFE EXTRACTION OF MESSAGE PROPERTIES
        const from = msg.key?.remoteJid;
        const sender = msg.key?.participant || msg.key?.remoteJid;
        const pushname = msg.pushName || "User";
        
        if (!from || !sender) return;
        
        // Extract message body
        let body = "";
        try {
            if (msg.message.conversation) {
                body = msg.message.conversation;
            } else if (msg.message.extendedTextMessage?.text) {
                body = msg.message.extendedTextMessage.text;
            } else if (msg.message.imageMessage?.caption) {
                body = msg.message.imageMessage.caption || "";
            } else if (msg.message.videoMessage?.caption) {
                body = msg.message.videoMessage.caption || "";
            }
        } catch (e) {
            body = "";
        }
        
        const isGroup = from.endsWith('@g.us');
        const isCmd = body && body.startsWith(config.prefix || '.');
        const command = isCmd ? body.slice((config.prefix || '.').length).trim().split(' ')[0].toLowerCase() : '';
        const args = isCmd ? body.trim().split(/ +/).slice(1) : [];
        
        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot owner: ${getUsername(botOwnerJid)}`);
        }
        
        // Check if sender is owner
        const isOwner = botOwnerJid ? (sender === botOwnerJid || msg.key?.fromMe) : false;
        
        // LOAD SETTINGS
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {
            settings = config;
        }
        
        // STORE MESSAGE CONTENT
        await storeMessageContent(msg);
        
        // ANTI-VIEWONCE (SENDS ACTUAL CONTENT TO OWNER)
        if (await handleViewOnce(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // ANTI-DELETE (SENDS ACTUAL CONTENT TO OWNER)
        if (await handleAntiDelete(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // AUTO READ MESSAGES
        if (settings.autoRead || config.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // COMMAND HANDLING
        if (isCmd && command) {
            await loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname, isGroup);
            return;
        }
        
        // CHATBOT (RESPONDS TO EVERYONE)
        if (body && body.trim().length > 0 && !isCmd && !msg.key?.fromMe) {
            await handleChatbot(conn, from, body, sender, pushname);
            return;
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
        console.log('[SYSTEM] Initializing Insidious...');
        
        // Set bot owner
        if (conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`);
        }
        
        console.log('[SYSTEM] ✅ Bot initialized successfully');
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};
