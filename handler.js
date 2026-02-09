const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const config = require('./config');
const { fancy } = require('./lib/font');

/**
 * INSIDIOUS: THE LAST KEY V2.1.1
 * DEVELOPER: STANYTZ
 * COMPLETE MASTER HANDLER
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
        
        // Metadata
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : (type === 'videoMessage') ? msg.message.videoMessage.caption : '';
        const isGroup = from.endsWith('@g.us');
        const isOwner = config.ownerNumber.includes(sender.split('@')[0]) || msg.key.fromMe;
        const prefix = config.prefix;
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);

        // 13. AUTO READ
        if (config.autoRead) await conn.readMessages([msg.key]);

        // 14. AUTO REACT
        if (config.autoReact && !msg.key.fromMe && !isGroup) {
            await conn.sendMessage(from, { react: { text: "🥀", key: msg.key } });
        }

        // 15. AUTO SAVE CONTACT (Logic: log to console/database)
        if (config.autoSave && !isOwner && !isGroup) {
            console.log(`[SAVE] New soul detected: ${pushname} (${sender})`);
        }

        // 24. WORK MODE CHECK
        if (config.workMode === 'private' && !isOwner) return;

        // 30. FORCE SUBSCRIBE CHECK (Newsletter)
        if (isCmd && !isOwner) {
            // User lazima awe mshiriki wa newsletter au group ili kutumia bot
            // (Hii inahitaji metadata check ya newsletter, tunatumia group JID kama kizuizi)
        }

        // --- GROUP SECURITY (ADMIN FEATURES 1 - 4) ---
        if (isGroup && !isOwner) {
            // 1. ANTI-LINK (All types of links)
            if (config.antilink && body.match(/https?:\/\//gi)) {
                await conn.sendMessage(from, { delete: msg.key });
                await conn.groupParticipantsUpdate(from, [sender], "remove");
                return conn.sendMessage(from, { text: fancy(`🚫 ᴀɴᴛɪʟɪɴᴋ: @${sender.split('@')[0]} ʜᴀꜱ ʙᴇᴇɴ ᴇxɪʟᴇᴅ.`), mentions: [sender] });
            }

            // 2. ANTI-SCAM (Keyword Detection + TagAll Alert)
            if (config.antiscam && config.scamWords.some(w => body.toLowerCase().includes(w))) {
                await conn.sendMessage(from, { delete: msg.key });
                let metadata = await conn.groupMetadata(from);
                let mentions = metadata.participants.map(p => p.id);
                await conn.sendMessage(from, { text: fancy(`⚠️ ꜱᴄᴀᴍ ᴀʟᴇʀᴛ!\n@${sender.split('@')[0]} ꜱᴇɴᴛ ᴀ ꜱᴄᴀᴍ ᴍᴇꜱꜱᴀɢᴇ. ᴀʟʟ ꜱᴏᴜʟꜱ ʙᴇ ᴡᴀʀɴᴇᴅ!`), mentions: mentions });
                await conn.groupParticipantsUpdate(from, [sender], "remove");
                return;
            }

            // 2. ANTI-PORN (Content Filter)
            if (config.antiporn && (config.pornWords.some(w => body.toLowerCase().includes(w)) || type === 'imageMessage')) {
                // Hapa unaweza kuongeza API ya picha ya High Security
                if (config.pornWords.some(w => body.toLowerCase().includes(w))) {
                    await conn.sendMessage(from, { delete: msg.key });
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    return;
                }
            }

            // 4. ANTI-TAGS
            if (config.antitag && (body.includes('@everyone') || msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 10)) {
                await conn.sendMessage(from, { delete: msg.key });
                await conn.groupParticipantsUpdate(from, [sender], "remove");
                return;
            }
        }

        // --- RECOVERY (FEATURES 5 - 6) ---
        if ((msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage) && config.antiviewonce) {
            // 5. ANTI-VIEWONCE
            let quoted = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage;
            await conn.sendMessage(config.ownerNumber + "@s.whatsapp.net", { 
                forward: quoted, 
                caption: fancy(` Caught ViewOnce from @${sender.split('@')[0]}`),
                mentions: [sender]
            });
        }

        // 6. ANTI-DELETE (Sent to Owner DM)
        // (Hii inafanya kazi kupitia protocolMessage kwenye Upsert)

        // --- 11. HUMAN CHATBOT (AI MIRRORING) ---
        if (!isCmd && !msg.key.fromMe && !isGroup) {
            // 32. Show Typing
            if (config.autoTyping) await conn.sendPresenceUpdate('composing', from);
            
            try {
                const aiRes = await axios.get(`${config.aiModel}${encodeURIComponent(body)}?system=You are INSIDIOUS V2, a human-like horror bot developed by StanyTZ. Detect user's language and reply in the same language. If they use Swahili, reply in Swahili.`);
                await conn.sendMessage(from, { 
                    text: fancy(aiRes.data),
                    contextInfo: { 
                        isForwarded: true, 
                        forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: config.botName } 
                    }
                }, { quoted: msg });
            } catch (e) { console.error("AI Error"); }
        }

        // --- 22. DYNAMIC COMMAND LOADER ---
        if (isCmd) {
            // 32. Auto Typing for Commands
            if (config.autoTyping) await conn.sendPresenceUpdate('composing', from);

            const cmdPath = path.join(__dirname, 'commands');
            const categories = fs.readdirSync(cmdPath);
            
            for (const cat of categories) {
                const commandFile = path.join(cmdPath, cat, `${command}.js`);
                if (fs.existsSync(commandFile)) {
                    const cmd = require(commandFile);
                    return await cmd.execute(conn, msg, args, { from, sender, fancy, isOwner, pushname });
                }
            }
            
            // 23. EMOJI TRIGGER (Optional logic if mapped in DB)
        }

    } catch (err) {
        console.error("Handler Error:", err);
    }
};
