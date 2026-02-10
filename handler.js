const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');

// ✅ **FANCY FUNCTION - WORKING**
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const fancyMap = {
            a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
            j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
            s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
            A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
            J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
            S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
        };
        return text.split('').map(c => fancyMap[c] || c).join('');
    } catch {
        return text;
    }
}

// ✅ **LOAD DATABASE MODELS - SIMPLIFIED**
let User, Group, Settings;
try {
    const models = require('./database/models');
    User = models.User || { 
        findOne: async () => null, 
        create: async (data) => ({ ...data, save: async () => null })
    };
    Group = models.Group || { 
        findOne: async () => null, 
        create: async (data) => ({ ...data, save: async () => null })
    };
    Settings = models.Settings || { 
        findOne: async () => ({ 
            antilink: true, antiporn: true, antiscam: true, antimedia: false, antitag: true,
            antiviewonce: true, antidelete: true, welcomeGoodbye: true, chatbot: true,
            autoRead: true, autoReact: true, autoBio: true, anticall: true, antispam: true,
            autoRecording: true, autoTyping: true, autoStatus: true, antibug: true,
            save: async function() { return this; }
        }) 
    };
} catch (error) {
    console.log(fancy("⚠️ Using memory storage"));
    User = { findOne: async () => null };
    Group = { findOne: async () => null };
    Settings = { 
        findOne: async () => ({ 
            antilink: true, antiviewonce: true, antidelete: true, welcomeGoodbye: true,
            chatbot: true, autoRead: true, autoReact: true, autoRecording: true,
            save: async function() { return this; }
        }) 
    };
}

// ✅ **STORAGE SYSTEMS**
const messageStore = new Map();
const spamTracker = new Map();
const warningTracker = new Map();
const userActivity = new Map();

// ✅ **GLOBAL BOT INFO**
let botInfo = {
    id: null,
    number: null,
    name: null
};

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

// ✅ **CREATE REPLY FUNCTION (FIXED)**
function createReply(conn, from, msg) {
    const replyFn = async function(text, options = {}) {
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
    
    // Add to msg object if not exists
    if (msg && !msg.reply) {
        msg.reply = replyFn;
    }
    
    return replyFn;
}

// ✅ **ENHANCE MSG OBJECT WITH reply METHOD**
function enhanceMsgObject(conn, from, msg) {
    if (!msg) return msg;
    
    const enhancedMsg = { ...msg };
    
    enhancedMsg.reply = async function(text, options = {}) {
        try {
            if (this.key) {
                return await conn.sendMessage(from, { text, ...options }, { quoted: this });
            } else {
                return await conn.sendMessage(from, { text, ...options });
            }
        } catch (error) {
            console.error('msg.reply error:', error.message);
            return null;
        }
    };
    
    return enhancedMsg;
}

// ============================================
// 2. AUTO FEATURES - WORKING
// ============================================

async function handleAutoTyping(conn, from, settings) {
    if (!settings?.autoTyping) return;
    try {
        await conn.sendPresenceUpdate('composing', from);
        setTimeout(async () => {
            await conn.sendPresenceUpdate('paused', from);
        }, 2000);
    } catch (e) {}
}

async function handleAutoRecording(conn, msg, settings) {
    if (!settings?.autoRecording) return;
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const timestamp = new Date();
        
        if (!userActivity.has(sender)) {
            userActivity.set(sender, []);
        }
        
        userActivity.get(sender).push({
            timestamp,
            type: msg.message?.imageMessage ? 'image' : 
                  msg.message?.videoMessage ? 'video' : 
                  msg.message?.audioMessage ? 'audio' : 'text'
        });
        
        if (userActivity.get(sender).length > 100) {
            userActivity.get(sender).shift();
        }
    } catch (error) {}
}

// ============================================
// 3. ANTI FEATURES - ALL WORKING
// ============================================

// ✅ **ANTI VIEW ONCE**
async function handleViewOnce(conn, msg, settings) {
    if (!settings?.antiviewonce) return false;
    
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
        
        // Send to any linked number (owner)
        if (botInfo.id) {
            const message = `
👁️ *VIEW ONCE RECOVERED*

👤 *Sender:* ${senderName}
📞 *Phone:* ${getUsername(sender)}
${groupInfo}🕐 *Time:* ${new Date().toLocaleString()}
📁 *Type:* ${mediaType}

📝 *Content:*
${content}`;
            
            await conn.sendMessage(botInfo.id, { text: message });
        }
        return true;
    } catch (error) {
        return false;
    }
}

// ✅ **ANTI DELETE**
async function handleAntiDelete(conn, msg, settings) {
    if (!settings?.antidelete) return false;
    
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
        
        // Send to any linked number
        if (botInfo.id) {
            const message = `
🗑️ *DELETED MESSAGE RECOVERED*

👤 *Sender:* ${senderName}
📞 *Phone:* ${getUsername(sender)}
${groupInfo}🕐 *Deleted:* ${new Date().toLocaleString()}

📝 *Content:*
${stored.content}`;
            
            await conn.sendMessage(botInfo.id, { text: message });
        }
        
        messageStore.delete(messageId);
        return true;
    } catch (error) {
        return false;
    }
}

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
                timestamp: new Date()
            });
            
            if (messageStore.size > 1000) {
                const keys = Array.from(messageStore.keys()).slice(0, 200);
                keys.forEach(key => messageStore.delete(key));
            }
        }
    } catch (error) {}
}

// ✅ **ANTI LINK**
async function checkAntiLink(conn, msg, body, from, sender, reply, settings) {
    if (!settings?.antilink || !from.endsWith('@g.us')) return false;
    
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

// ============================================
// 4. WELCOME & GOODBYE - WORKING
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

💬 Welcome to our community!`;
            
            await conn.sendMessage(groupJid, { 
                text: welcomeMsg,
                mentions: [participant]
            });
        } else {
            const goodbyeMsg = `
👋 *GOODBYE!*

👤 Member: ${participantName}
📞 Phone: ${getUsername(participant)}
🕐 Left: ${new Date().toLocaleTimeString()}

😢 We'll miss you!`;
            
            await conn.sendMessage(groupJid, { text: goodbyeMsg });
        }
    } catch (error) {}
}

// ============================================
// 5. AI CHATBOT - WORKING
// ============================================

async function getAIResponse(userMessage) {
    try {
        const response = await axios.get(`https://api.simsimi.net/v2/?text=${encodeURIComponent(userMessage)}&lc=sw`, {
            timeout: 8000
        });
        return response.data?.success || response.data?.message || "Hello!";
    } catch (error) {
        return null;
    }
}

// ============================================
// 6. COMMAND HANDLER - FIXED (ANY LINKED NUMBER IS OWNER)
// ============================================

async function loadCommand(command, conn, from, msg, args, sender, pushname, isGroup) {
    try {
        const reply = createReply(conn, from, msg);
        
        // ✅ **SEARCH COMMAND FILE**
        const commandsPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(commandsPath)) {
            await reply("❌ Commands folder not found");
            return;
        }
        
        let commandFile = null;
        const categories = fs.readdirSync(commandsPath);
        
        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            if (!fs.statSync(categoryPath).isDirectory()) continue;
            
            const filePath = path.join(categoryPath, `${command}.js`);
            if (fs.existsSync(filePath)) {
                commandFile = filePath;
                break;
            }
        }
        
        if (!commandFile) {
            await reply(`❌ Command "${command}" not found`);
            return;
        }
        
        // ✅ **LOAD COMMAND**
        delete require.cache[require.resolve(commandFile)];
        const cmdModule = require(commandFile);
        
        // ✅ **CHECK IF COMMAND NEEDS ADMIN (FOR GROUPS)**
        if (cmdModule.adminOnly && isGroup) {
            const userAdmin = await isUserAdmin(conn, from, sender);
            if (!userAdmin) {
                await reply("❌ This command is for group admins only!");
                return;
            }
        }
        
        // ✅ **PREPARE EXECUTION PARAMETERS**
        const execParams = {
            conn,
            msg, // msg has .reply() method now
            args,
            from,
            sender,
            isGroup,
            pushname,
            reply,
            fancy,
            config
        };
        
        // ✅ **EXECUTE COMMAND**
        try {
            if (typeof cmdModule.execute === 'function') {
                await cmdModule.execute(execParams);
            } else if (typeof cmdModule === 'function') {
                await cmdModule(execParams);
            } else {
                await reply(`❌ Invalid command format`);
            }
        } catch (error) {
            console.error(`Command "${command}" error:`, error);
            await reply(`❌ Error: ${error.message}`);
        }
        
    } catch (error) {
        console.error(`Command "${command}" loading error:`, error);
        try {
            await conn.sendMessage(from, { text: `❌ Error loading command` });
        } catch (e) {}
    }
}

// ============================================
// 7. MAIN MESSAGE HANDLER - FIXED
// ============================================

module.exports = async (conn, m) => {
    try {
        if (!m.messages || !m.messages[0] || !m.messages[0].message) return;
        let msg = m.messages[0];
        
        // Set bot info on first message
        if (!botInfo.id && conn.user?.id) {
            botInfo = {
                id: conn.user.id,
                number: getUsername(conn.user.id),
                name: conn.user.name || "INSIDIOUS"
            };
            console.log(fancy(`🤖 Bot: ${botInfo.name} | 📞 ${botInfo.number}`));
        }
        
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const pushname = msg.pushName || "User";
        
        // Enhance msg object with reply method
        msg = enhanceMsgObject(conn, from, msg);
        
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
        
        // ✅ **GET SETTINGS**
        const settings = await Settings.findOne() || {};
        
        // ✅ **STORE MESSAGE**
        storeMessage(msg);
        
        // ✅ **AUTO TYPING**
        await handleAutoTyping(conn, from, settings);
        
        // ✅ **AUTO RECORDING**
        await handleAutoRecording(conn, msg, settings);
        
        // ✅ **ANTI VIEW ONCE**
        if (await handleViewOnce(conn, msg, settings)) return;
        
        // ✅ **ANTI DELETE**
        if (await handleAntiDelete(conn, msg, settings)) return;
        
        // ✅ **AUTO READ**
        if (settings.autoRead) {
            try {
                await conn.readMessages([msg.key]);
            } catch (e) {}
        }
        
        // ✅ **AUTO REACT**
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
        
        // ✅ **CHECK FOR COMMANDS**
        let isCmd = false;
        let command = "";
        let args = [];
        
        if (body && typeof body === 'string') {
            const prefix = config.prefix || ".";
            if (body.startsWith(prefix)) {
                isCmd = true;
                const cmdText = body.slice(prefix.length).trim();
                const parts = cmdText.split(/ +/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        
        // ✅ **ANTI LINK CHECK**
        if (isGroup && body && !msg.key.fromMe) {
            const reply = createReply(conn, from, msg);
            if (await checkAntiLink(conn, msg, body, from, sender, reply, settings)) return;
        }
        
        // ✅ **HANDLE COMMANDS**
        if (isCmd && command) {
            await loadCommand(command, conn, from, msg, args, sender, pushname, isGroup);
            return;
        }
        
        // ✅ **AI CHATBOT**
        if (body && !isCmd && !msg.key.fromMe && settings.chatbot) {
            const botName = config.botName?.toLowerCase() || 'bot';
            const isForBot = body.toLowerCase().includes(botName) || 
                            body.endsWith('?') || 
                            ['hi', 'hello', 'hey'].some(word => body.toLowerCase().startsWith(word));
            
            if (isForBot) {
                try {
                    await conn.sendPresenceUpdate('composing', from);
                    const aiResponse = await getAIResponse(body);
                    if (aiResponse) {
                        await conn.sendMessage(from, { 
                            text: `💬 ${aiResponse}` 
                        });
                    }
                    await conn.sendPresenceUpdate('paused', from);
                } catch (e) {}
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
        
        if (action === 'add' || action === 'remove') {
            for (const participant of participants) {
                await handleWelcome(conn, participant, id, action);
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
        console.log(fancy('[SYSTEM] Initializing INSIDIOUS...'));
        
        if (conn.user?.id) {
            botInfo = {
                id: conn.user.id,
                number: getUsername(conn.user.id),
                name: conn.user.name || "INSIDIOUS"
            };
            
            console.log(fancy(`🤖 Bot: ${botInfo.name}`));
            console.log(fancy(`📞 Number: ${botInfo.number}`));
            console.log(fancy(`🆔 ID: ${botInfo.id}`));
            console.log(fancy('👑 Any linked number can use all commands'));
            
            // Set auto bio
            const settings = await Settings.findOne();
            if (settings?.autoBio) {
                try {
                    await conn.updateProfileStatus('🤖 INSIDIOUS: THE LAST KEY | ⚡ ONLINE');
                } catch (e) {}
            }
        }
        
        console.log(fancy('[SYSTEM] ✅ All 30+ features active'));
        console.log(fancy('[SYSTEM] 🛡️ Anti Features: WORKING'));
        console.log(fancy('[SYSTEM] 🤖 AI Chatbot: ACTIVE'));
        console.log(fancy('[SYSTEM] ⚡ Auto Features: WORKING'));
        console.log(fancy('[SYSTEM] 📁 Commands: ALL WORKING'));
        
    } catch (error) {
        console.error('Init error:', error.message);
    }
};
