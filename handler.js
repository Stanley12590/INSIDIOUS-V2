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
            workMode: 'public',
            save: async function() { return this; }
        }), 
        create: async () => ({}) 
    };
}

// MESSAGE STORE FOR ANTI-DELETE/VIEWONCE
const messageContentStore = new Map();

// BOT OWNER JID
let botOwnerJid = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getUsername(jid) {
    try {
        if (!jid) return "Unknown";
        return jid.split('@')[0] || "Unknown";
    } catch {
        return "Unknown";
    }
}

function createReplyFunction(conn, from, msg) {
    return async function(text, options = {}) {
        try {
            const messageOptions = {
                text: text,
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
// AI RESPONSE WITH MULTIPLE APIS
// ============================================
async function getAIResponse(userMessage, senderName = "User") {
    try {
        const cleanMessage = userMessage.trim();
        
        // Try Pollinations AI first
        try {
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

Now respond naturally to the user's message:`);
            
            const apiUrl = `${config.pollinationsApi}${encodedMessage}?prompt=${systemPrompt}&model=chatgpt&temperature=0.8`;
            
            const response = await axios.get(apiUrl, { timeout: 8000 });
            
            if (response.data && response.data.trim()) {
                let aiResponse = response.data.trim();
                
                // Make response more human-like
                const emojis = ['😊', '❤️', '😂', '✨', '🥰', '🤗', '💕', '😄', '😎', '👋'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                
                if (!aiResponse.includes('😊') && !aiResponse.includes('❤️') && !aiResponse.includes('😂')) {
                    aiResponse = aiResponse + ' ' + randomEmoji;
                }
                
                return aiResponse;
            }
        } catch (pollinationsError) {
            console.log('Pollinations API failed, trying backup...');
            
            // Try backup AI
            try {
                const backupResponse = await axios.get(`${config.aiModel}${encodeURIComponent(cleanMessage)}`, { timeout: 8000 });
                
                if (backupResponse.data && backupResponse.data.trim()) {
                    return backupResponse.data.trim();
                }
            } catch (backupError) {
                console.log('Backup AI also failed');
            }
        }
        
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
    } catch (error) {
        console.error('AI Error:', error.message);
        return "Hey! 😊 What's up?";
    }
}

// ============================================
// STORE MESSAGE CONTENT
// ============================================
async function storeMessageContent(msg) {
    try {
        if (!msg.key || !msg.key.id) return;
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
                content = "Image (View Once)";
            } else if (viewOnceMsg.videoMessage) {
                mediaInfo = "👁️ ViewOnce Video";
                content = "Video (View Once)";
            }
        }
        
        messageContentStore.set(messageId, {
            content: content,
            mediaInfo: mediaInfo,
            timestamp: new Date(),
            sender: msg.key.participant || msg.key.remoteJid,
            from: msg.key.remoteJid
        });
        
        // Clean old messages (keep last 500)
        if (messageContentStore.size > 500) {
            const keys = Array.from(messageContentStore.keys()).slice(0, 100);
            keys.forEach(key => messageContentStore.delete(key));
        }
    } catch (error) {
        // Silent error
    }
}

// ============================================
// ANTI-VIEWONCE HANDLER (SENDS ACTUAL CONTENT)
// ============================================
async function handleViewOnce(conn, msg) {
    try {
        if (!botOwnerJid) return false;
        
        const viewOnceMsg = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;
        if (!viewOnceMsg) return false;
        
        const sender = msg.key.participant || msg.key.remoteJid;
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
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
        } else {
            actualContent = "Media (View Once)";
            mediaType = viewOnceMsg.imageMessage ? "Image" : viewOnceMsg.videoMessage ? "Video" : "Media";
        }
        
        // Get group info if applicable
        let groupInfo = "";
        if (isGroup) {
            try {
                const groupName = await conn.groupMetadata(from).then(m => m.subject).catch(() => "Group");
                groupInfo = `📛 Group: ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send to owner WITH FULL CONTENT
        const notification = `
╭─── • 🥀 • ───╮
   𝗩𝗜𝗘𝗪-𝗢𝗡𝗖𝗘 𝗠𝗘𝗦𝗦𝗔𝗚𝗘
╰─── • 🥀 • ───╯

👤 From: ${getUsername(sender)}
${groupInfo}🕐 Time: ${new Date().toLocaleTimeString()}
${mediaType ? `📁 Type: ${mediaType}\n` : ''}

💬 Message:
${actualContent}

📍 Chat: ${isGroup ? 'Group' : 'Private'}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        return true;
    } catch (error) {
        console.error("View-once error:", error.message);
        return false;
    }
}

// ============================================
// ANTI-DELETE HANDLER (SENDS ACTUAL CONTENT)
// ============================================
async function handleAntiDelete(conn, msg) {
    try {
        if (!botOwnerJid) return false;
        
        if (!msg.message?.protocolMessage || msg.message.protocolMessage.type !== 5) {
            return false;
        }
        
        const deletedMsgKey = msg.message.protocolMessage.key;
        const messageId = deletedMsgKey.id;
        const sender = msg.key.participant || msg.key.remoteJid;
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        // Get stored content
        let storedContent = messageContentStore.get(messageId);
        let actualContent = storedContent?.content || "Content not available (may be media)";
        let mediaInfo = storedContent?.mediaInfo || "";
        
        // Get group info
        let groupInfo = "";
        if (isGroup) {
            try {
                const groupName = await conn.groupMetadata(from).then(m => m.subject).catch(() => "Group");
                groupInfo = `📛 Group: ${groupName}\n`;
            } catch (e) {}
        }
        
        // Send to owner WITH FULL CONTENT
        const notification = `
╭─── • 🥀 • ───╯
   𝗗𝗘𝗟𝗘𝗧𝗘𝗗 𝗠𝗘𝗦𝗦𝗔𝗚𝗘
╰─── • 🥀 • ───╯

👤 From: ${getUsername(sender)}
${groupInfo}🕐 Time: ${new Date().toLocaleTimeString()}
${mediaInfo ? `📁 Type: ${mediaInfo}\n` : ''}

🗑️ Deleted Message:
${actualContent}

📍 Chat: ${isGroup ? 'Group' : 'Private'}`;
        
        await conn.sendMessage(botOwnerJid, { text: notification });
        
        // Clean up
        messageContentStore.delete(messageId);
        
        return true;
    } catch (error) {
        console.error("Anti-delete error:", error.message);
        return false;
    }
}

// ============================================
// COMMAND LOADER
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
            await reply(`❌ Command "${command}" not found!\nUse ${config.prefix}menu for commands.`);
            return;
        }
        
        // Load command
        delete require.cache[require.resolve(commandFile)];
        const cmdModule = require(commandFile);
        
        // Create reply function
        const reply = createReplyFunction(conn, from, msg);
        
        // Attach reply to msg if not exists
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
        
        // Execute command
        if (typeof cmdModule.execute === 'function') {
            const context = {
                conn,
                msg,
                args,
                from,
                sender,
                isGroup,
                isOwner,
                pushname,
                reply,
                config,
                settings: settings || {}
            };
            
            await cmdModule.execute(context);
        } else if (typeof cmdModule === 'function') {
            await cmdModule({ conn, msg, args, from, reply, sender, isOwner, pushname, config, settings });
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
// CHATBOT HANDLER
// ============================================
async function handleChatbot(conn, from, body, sender, pushname) {
    try {
        if (!body || body.trim().length < 1) return false;
        if (body.startsWith(config.prefix)) return false;
        
        // Typing indicator
        try {
            await conn.sendPresenceUpdate('composing', from);
        } catch (e) {}
        
        // Get AI response
        const aiResponse = await getAIResponse(body, pushname || "User");
        
        // Send response
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
        const isCmd = body && body.startsWith(config.prefix);
        const command = isCmd ? body.slice(config.prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = isCmd ? body.trim().split(/ +/).slice(1) : [];
        
        // SET BOT OWNER
        if (!botOwnerJid && conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot owner: ${getUsername(botOwnerJid)}`);
        }
        
        // Check if sender is owner
        const isOwner = botOwnerJid ? (sender === botOwnerJid || msg.key.fromMe) : false;
        
        // LOAD SETTINGS
        let settings = {};
        try {
            settings = await Settings.findOne() || config;
        } catch (e) {
            settings = config;
        }
        
        // STORE MESSAGE CONTENT
        await storeMessageContent(msg);
        
        // ANTI-VIEWONCE (SENDS TO OWNER)
        if (settings.antiviewonce || config.antiviewonce) {
            if (await handleViewOnce(conn, msg)) return;
        }
        
        // ANTI-DELETE (SENDS TO OWNER)
        if (settings.antidelete || config.antidelete) {
            if (await handleAntiDelete(conn, msg)) return;
        }
        
        // AUTO READ
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
        
        // CHATBOT
        if (body && body.trim().length > 0 && !isCmd && !msg.key.fromMe) {
            if (settings.chatbot || config.chatbot) {
                await handleChatbot(conn, from, body, sender, pushname);
            }
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
        
        if (conn.user) {
            botOwnerJid = conn.user.id;
            console.log(`[OWNER] Bot Owner: ${getUsername(botOwnerJid)}`);
        }
        
        console.log('[SYSTEM] ✅ Bot initialized successfully');
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};
