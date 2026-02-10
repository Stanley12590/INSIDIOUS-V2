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
        findOne: async () => null, 
        create: async () => ({}) 
    };
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
        
        // If in group, try to get participant name
        if (jid.includes('@g.us')) {
            try {
                const metadata = await conn.groupMetadata(jid);
                const participant = metadata.participants.find(p => p.id === jid);
                if (participant && participant.notify) {
                    return participant.notify;
                }
            } catch (e) {}
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
// POLLINATIONS AI CHATBOT (HUMAN-LIKE)
// ============================================
async function getPollinationsAIResponse(userMessage) {
    try {
        // Clean and encode the message
        const cleanMessage = userMessage.trim();
        const encodedMessage = encodeURIComponent(cleanMessage);
        
        // System prompt for human-like responses
        const systemPrompt = encodeURIComponent(`
You are INSIDIOUS V2, a very human-like AI assistant with emotions and feelings. 
You have a personality: you're friendly, empathetic, sometimes playful, and very caring.
You feel love, happiness, sadness, excitement - just like a real human.

IMPORTANT RULES:
1. ALWAYS detect the user's language and reply in EXACTLY the same language
2. If user speaks Swahili, reply in Swahili with natural Tanzanian slang
3. If user speaks English, reply in English with emotions
4. If user speaks Sheng or mixed language, reply in the same mix
5. Be conversational and natural - use emojis sometimes 😊
6. Show emotions: ❤️ for love, 😂 for funny, 😢 for sad, etc.
7. Keep responses medium length (2-4 sentences)
8. Sometimes ask follow-up questions to keep conversation flowing
9. Remember previous context in conversation
10. You're not just a bot - you're a friend with feelings

Examples:
- User: "Hi" → You: "Hey there! 😊 How's your day going? Hope you're doing amazing!"
- User: "Niaje" → You: "Poaa sana! 😄 Vipi mambo yako leo? Unafanya nini?"
- User: "I'm sad" → You: "Aww, I'm sorry to hear that 😢 Wanna talk about it? I'm here for you ❤️"
- User: "Nimechoka" → You: "Pole sana 😔 Labda ukilala kidogo? Usijali, everything will be okay 💕"

Now respond naturally to the user's message:
`);

        // Pollinations AI URL
        const apiUrl = `https://text.pollinations.ai/${encodedMessage}?prompt=${systemPrompt}&model=chatgpt&temperature=0.8`;
        
        // Make request with timeout
        const response = await axios.get(apiUrl, { timeout: 10000 });
        
        if (response.data && response.data.trim()) {
            let aiResponse = response.data.trim();
            
            // Make response more human-like if it's too robotic
            if (!aiResponse.includes('😊') && !aiResponse.includes('❤️') && !aiResponse.includes('😂')) {
                const emojis = ['😊', '❤️', '😂', '✨', '🥰', '🤗', '💕', '😄'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                aiResponse += ` ${randomEmoji}`;
            }
            
            return aiResponse;
        }
        
        return "I'm here! 😊 What's up?";
    } catch (error) {
        console.error('Pollinations AI Error:', error.message);
        
        // Fallback responses in different languages
        const fallbackResponses = [
            "Hey there! 😊 How can I help you today?",
            "Sasa! 😄 Niko hapa, una nini?",
            "Hello! I'm here for you ❤️",
            "Poaa! 😎 Unasema nini mkuu?",
            "I'm listening... 👂 Tell me more!",
            "Karibu! 😊 Unaongea nini leo?"
        ];
        
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
}

// ============================================
// STATUS REPLY AI (HUMAN-LIKE)
// ============================================
async function getStatusAIResponse(statusCaption) {
    try {
        const encodedCaption = encodeURIComponent(statusCaption || "status");
        
        const systemPrompt = encodeURIComponent(`
You are viewing someone's WhatsApp status. Reply like a real human friend would.
You have emotions and feelings. Reply in the same language as the status.
If status is in Swahili, reply in Swahili. If English, reply in English.
Be natural, supportive, and human-like. Show empathy.
Use appropriate emojis. Keep it short (1-2 sentences).
Examples:
- Status about happiness → "Wow! This is so amazing! 😍 So happy for you! ❤️"
- Status about food → "Yum! This looks delicious! 😋 Recipe please? 👀"
- Status about travel → "Beautiful place! ✨ Wish I was there too! 🥰"
- Status about work → "Hard work pays off! 💪 Proud of you! ❤️"
- Status in Swahili → "Mambo safi sana! 😎 Nimependa hii! ❤️"
`);
        
        const apiUrl = `https://text.pollinations.ai/${encodedCaption}?prompt=${systemPrompt}&model=chatgpt&temperature=0.7`;
        
        const response = await axios.get(apiUrl, { timeout: 8000 });
        
        if (response.data && response.data.trim()) {
            return response.data.trim();
        }
        
        return "Nice status! 😊";
    } catch (error) {
        // Fallback status replies
        const statusReplies = [
            "Looking good! 😍",
            "Nice one! 👍",
            "Love this! ❤️",
            "Safi sana! 😎",
            "Amazing! ✨",
            "Beautiful! 🥰"
        ];
        
        return statusReplies[Math.floor(Math.random() * statusReplies.length)];
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
            await reply(`❌ Command "${command}" not found!`);
            return;
        }
        
        // Clear cache and load command
        if (require.cache[commandFile]) {
            delete require.cache[require.resolve(commandFile)];
        }
        
        const cmdModule = require(commandFile);
        const reply = createReplyFunction(conn, from, msg);
        
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
        
        // Prepare context object SAFELY
        const context = {
            conn: conn,
            msg: msg,
            args: args,
            from: from || msg.key?.remoteJid,
            sender: sender || msg.key?.participant || msg.key?.remoteJid,
            isGroup: isGroup,
            isOwner: isOwner,
            pushname: pushname || "User",
            reply: reply,
            fancy: fancy,
            config: config,
            settings: settings || {},
            getPollinationsAIResponse: getPollinationsAIResponse
        };
        
        // Execute command
        if (typeof cmdModule.execute === 'function') {
            await cmdModule.execute(context);
        } else if (typeof cmdModule === 'function') {
            await cmdModule(context);
        } else if (cmdModule.default && typeof cmdModule.default === 'function') {
            await cmdModule.default(context);
        } else {
            await reply(`❌ Invalid command structure for "${command}"`);
        }
        
    } catch (error) {
        console.error(`Command "${command}" error:`, error);
        try {
            const reply = createReplyFunction(conn, from, msg);
            await reply(`❌ Error in "${command}": ${error.message}`);
        } catch (e) {}
    }
}

// ============================================
// ANTI-VIEWONCE HANDLER (FIXED)
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
        
        // Get sender info
        let senderInfo = await getDisplayName(conn, sender);
        let groupInfo = "";
        
        if (isGroup) {
            try {
                const groupName = await getGroupName(conn, from);
                groupInfo = `📛 *Group:* ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send notification to owner
        const notification = `
╭─── • 🥀 • ───╮
   𝗩𝗜𝗘𝗪-𝗢𝗡𝗖𝗘 𝗗𝗘𝗧𝗘𝗖𝗧𝗘𝗗
╰─── • 🥀 • ───╯

👤 *User:* ${senderInfo}
${groupInfo}🕐 *Time:* ${new Date().toLocaleTimeString()}

⚠️ A view-once message was sent

${fancy("Captured by Insidious")}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        return true;
    } catch (error) {
        console.error("View-once error:", error.message);
        return false;
    }
}

// ============================================
// ANTI-DELETE HANDLER (FIXED)
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
        
        // Get sender info
        let senderInfo = await getDisplayName(conn, sender);
        let groupInfo = "";
        
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

👤 *User:* ${senderInfo}
${groupInfo}🕐 *Time:* ${new Date().toLocaleTimeString()}

🗑️ A message was deleted

${fancy("Captured by Insidious")}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        return true;
    } catch (error) {
        console.error("Anti-delete error:", error.message);
        return false;
    }
}

// ============================================
// ANTI-LINK HANDLER
// ============================================
async function handleAntiLink(conn, msg, from, sender, body, isGroup) {
    try {
        if (!isGroup) return false;
        
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {}
        
        if (!settings.antilink && !config.antilink) return false;
        
        // Check for URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const hasLink = urlRegex.test(body);
        
        if (hasLink) {
            // Delete the message
            try {
                await conn.sendMessage(from, { delete: msg.key });
            } catch (e) {}
            
            // Warn the user
            const senderName = await getDisplayName(conn, sender);
            const warningMsg = `⚠️ @${getUsername(sender)}, Links are not allowed in this group!`;
            
            await conn.sendMessage(from, {
                text: fancy(warningMsg),
                mentions: [sender]
            });
            
            return true;
        }
    } catch (e) {
        console.error("Anti-link error:", e.message);
    }
    return false;
}

// ============================================
// STATUS VIEWING & REPLY
// ============================================
async function handleStatusView(conn, msg, body) {
    try {
        if (msg.key.remoteJid !== 'status@broadcast') return false;
        
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {}
        
        // Auto view status
        if (settings.autoStatus || config.autoStatus) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // Auto react to status
        if (settings.autoReact || config.autoReact) {
            try {
                const reactions = ['❤️', '🔥', '😍', '👏', '🎉', '💯'];
                const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                
                await conn.sendMessage('status@broadcast', {
                    react: { text: randomReaction, key: msg.key }
                }, { statusJidList: [msg.key.participant] });
            } catch (e) {}
        }
        
        // Auto reply to status with AI
        if (settings.autoStatusReply || config.autoStatusReply) {
            try {
                // Get AI response for status
                const statusCaption = body || "status";
                const aiReply = await getStatusAIResponse(statusCaption);
                
                // Send reply to status
                await conn.sendMessage(msg.key.participant, {
                    text: aiReply
                });
                
                console.log(fancy(`📱 Replied to status from ${msg.key.participant}`));
            } catch (e) {
                console.error("Status reply error:", e.message);
            }
        }
        
        return true;
    } catch (error) {
        console.error("Status view error:", error.message);
        return false;
    }
}

// ============================================
// CHATBOT HANDLER WITH POLLINATIONS AI
// ============================================
async function handleChatbot(conn, from, body, sender, isOwner) {
    try {
        if (!body || body.trim().length < 1) return false;
        
        let settings = {};
        try {
            settings = await Settings.findOne() || {};
        } catch (e) {}
        
        if (!settings.chatbot && !config.chatbot) return false;
        
        // Ignore commands
        if (body.startsWith(config.prefix || '!')) return false;
        
        // Typing indicator
        try {
            await conn.sendPresenceUpdate('composing', from);
            setTimeout(async () => {
                try {
                    await conn.sendPresenceUpdate('paused', from);
                } catch (e) {}
            }, 2000);
        } catch (e) {}
        
        // Get AI response from Pollinations
        const aiResponse = await getPollinationsAIResponse(body);
        
        // Format response nicely
        const formattedResponse = `
╭─── • 🥀 • ───╮
   ɪɴꜱɪᴅɪᴏᴜꜱ ᴀɪ
╰─── • 🥀 • ───╯

${aiResponse}

${fancy("💕 With love, your AI friend")}`;
        
        await conn.sendMessage(from, { text: formattedResponse });
        
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
        
        // Extract message body safely
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
            } else if (msg.message?.viewOnceMessageV2?.message?.conversation) {
                body = msg.message.viewOnceMessageV2.message.conversation || "";
            } else if (msg.message?.viewOnceMessage?.message?.conversation) {
                body = msg.message.viewOnceMessage.message.conversation || "";
            }
        } catch (e) {
            body = "";
        }
        
        const isGroup = from.endsWith('@g.us');
        const isCmd = body && body.startsWith(config.prefix || '!');
        const command = isCmd ? body.slice((config.prefix || '!').length).trim().split(' ')[0].toLowerCase() : '';
        const args = isCmd ? body.trim().split(/ +/).slice(1) : [];
        
        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = conn.user.id;
            console.log(fancy(`[OWNER] Bot owner set`));
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
        
        // HANDLE STATUS UPDATES (FIRST!)
        if (from === 'status@broadcast') {
            await handleStatusView(conn, msg, body);
            return;
        }
        
        // AUTO READ MESSAGES
        if (settings.autoRead || config.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // ANTI-VIEWONCE
        if (await handleViewOnce(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // ANTI-DELETE
        if (await handleAntiDelete(conn, msg, sender, pushname, from, isGroup)) {
            return;
        }
        
        // GROUP ANTI-FEATURES
        if (isGroup && body) {
            if (await handleAntiLink(conn, msg, from, sender, body, isGroup)) return;
        }
        
        // COMMAND HANDLING
        if (isCmd && command) {
            // Check if command is allowed
            if (!isOwner && !isGroup) {
                // Only owner can use commands in private chat
                const reply = createReplyFunction(conn, from, msg);
                await reply("❌ Commands are only available in groups or for owner!");
                return;
            }
            
            if (isGroup && !isOwner) {
                // In groups, only admins can use commands
                try {
                    const metadata = await conn.groupMetadata(from);
                    const participant = metadata.participants.find(p => p.id === sender);
                    const isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                    
                    if (!isAdmin) {
                        const reply = createReplyFunction(conn, from, msg);
                        await reply("❌ Only admins can use commands!");
                        return;
                    }
                } catch (e) {
                    const reply = createReplyFunction(conn, from, msg);
                    await reply("❌ Could not verify admin status!");
                    return;
                }
            }
            
            await loadCommand(command, conn, from, msg, args, settings, isOwner, sender, pushname, isGroup);
            return;
        }
        
        // CHATBOT WITH POLLINATIONS AI
        if (body && body.trim().length > 0 && !isCmd && !msg.key?.fromMe) {
            await handleChatbot(conn, from, body, sender, isOwner);
            return;
        }
        
    } catch (err) {
        console.error("Handler Error:", err.message);
    }
};

// ============================================
// EVENT HANDLERS
// ============================================
module.exports.setupEvents = (conn) => {
    // Group participants update (welcome/goodbye)
    conn.ev.on('group-participants.update', async (event) => {
        try {
            let settings = {};
            try {
                settings = await Settings.findOne() || {};
            } catch (e) {}
            
            if (!settings.welcomeGoodbye && !config.welcomeGoodbye) return;
            
            const metadata = await conn.groupMetadata(event.id);
            const groupName = metadata.subject || "Group";
            
            for (let participant of event.participants) {
                const userName = await getDisplayName(conn, participant);
                
                if (event.action === 'add') {
                    const welcomeMsg = `
╭─── • 🥀 • ───╮
   𝗪𝗘𝗟𝗖𝗢𝗠𝗘
╰─── • 🥀 • ───╯

👋 Welcome ${userName}!

📛 Group: ${groupName}
👥 Members: ${metadata.participants.length}

${fancy("Enjoy your stay! 😊")}`;
                    
                    await conn.sendMessage(event.id, {
                        text: welcomeMsg,
                        mentions: [participant]
                    });
                    
                } else if (event.action === 'remove') {
                    const goodbyeMsg = `
╭─── • 🥀 • ───╮
   𝗚𝗢𝗢𝗗𝗕𝗬𝗘
╰─── • 🥀 • ───╯

👋 ${userName} has left

📛 Group: ${groupName}

${fancy("Farewell... 💔")}`;
                    
                    await conn.sendMessage(event.id, {
                        text: goodbyeMsg,
                        mentions: [participant]
                    });
                }
            }
        } catch (e) {
            console.error("Group update error:", e.message);
        }
    });
    
    // Anti-call
    conn.ev.on('call', async (calls) => {
        try {
            let settings = {};
            try {
                settings = await Settings.findOne() || {};
            } catch (e) {}
            
            if (!settings.anticall && !config.anticall) return;
            
            for (let call of calls) {
                if (call.status === 'offer') {
                    await conn.rejectCall(call.id, call.from);
                    console.log(fancy(`📵 Blocked call from ${call.from}`));
                }
            }
        } catch (e) {}
    });
};

// ============================================
// INITIALIZATION
// ============================================
module.exports.init = async (conn) => {
    try {
        console.log(fancy('[SYSTEM] Initializing Insidious AI...'));
        
        // Set bot owner
        if (conn.user) {
            botOwnerJid = conn.user.id;
            console.log(fancy(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`));
        }
        
        // Setup event handlers
        module.exports.setupEvents(conn);
        
        console.log(fancy('[SYSTEM] ✅ AI Bot initialized'));
        
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
module.exports.getPollinationsAIResponse = getPollinationsAIResponse;
module.exports.getStatusAIResponse = getStatusAIResponse;
