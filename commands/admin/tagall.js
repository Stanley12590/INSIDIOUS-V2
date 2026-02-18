const handler = require('../../handler');

module.exports = {
    name: "tagall",
    aliases: ["everyone"],
    adminOnly: true,
    description: "Tag all group members",
    
    execute: async (conn, msg, args, { from, fancy, isGroupAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isGroupAdmin && !(await handler.isBotAdmin(conn, from))) {
            return reply("❌ I need to be an admin to tag all members.");
        }

        try {
            const groupMeta = await conn.groupMetadata(from);
            const participants = groupMeta.participants.map(p => p.id);
            const customText = args.length ? args.join(' ') : 'Hello everyone!';
            const message = `╭─── • 🥀 • ───╮\n   *TAG ALL*   \n╰─── • 🥀 • ───╯\n\n${customText}`;

            await conn.sendMessage(from, {
                text: fancy(message),
                mentions: participants
            }, { quoted: msg });
        } catch (e) {
            console.error("Tagall error:", e);
            reply("❌ Failed to tag members.");
        }
    }
};