const handler = require('../../handler');

module.exports = {
    name: "hidetag",
    aliases: ["htag"],
    adminOnly: true,
    description: "Send a message that tags all members but hides the text",
    
    execute: async (conn, msg, args, { from, fancy, isGroupAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isGroupAdmin && !(await handler.isBotAdmin(conn, from))) {
            return reply("❌ I need to be an admin to use hidetag.");
        }

        try {
            const groupMeta = await conn.groupMetadata(from);
            const participants = groupMeta.participants.map(p => p.id);
            const messageText = args.length ? args.join(' ') : ' '; // space to hide

            await conn.sendMessage(from, {
                text: fancy(messageText),
                mentions: participants,
                contextInfo: { mentionedJid: participants }
            }, { quoted: msg });
        } catch (e) {
            console.error("Hidetag error:", e);
            reply("❌ Failed to send hidetag.");
        }
    }
};