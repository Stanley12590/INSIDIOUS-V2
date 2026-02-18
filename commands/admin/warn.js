const handler = require('../../handler');

module.exports = {
    name: "warn",
    aliases: ["warning"],
    adminOnly: true,
    description: "Warn a member (increments warning count)",
    
    execute: async (conn, msg, args, { from, fancy, isGroupAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isGroupAdmin && !(await handler.isBotAdmin(conn, from))) {
            return reply("❌ I need to be an admin to warn members.");
        }

        let userJid;
        let reason = args.join(' ') || 'No reason provided';
        if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            userJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            // Remove mention from reason
            reason = args.filter(a => !a.startsWith('@')).join(' ') || 'No reason provided';
        } else if (args[0] && args[0].match(/^\d+$/)) {
            const number = args[0].replace(/[^0-9]/g, '');
            if (!number || number.length < 10) return reply("❌ Invalid number.");
            userJid = number + '@s.whatsapp.net';
            reason = args.slice(1).join(' ') || 'No reason provided';
        } else {
            return reply("❌ Tag the user or provide their number.");
        }

        try {
            // Check if user is in group
            const groupMeta = await conn.groupMetadata(from);
            if (!groupMeta.participants.some(p => p.id === userJid)) {
                return reply("❌ User not in this group.");
            }

            await handler.applyWarning(conn, from, userJid, reason, 1);
            // applyWarning sends its own messages, so we don't need to reply here
        } catch (e) {
            console.error("Warn error:", e);
            reply("❌ Failed to warn user.");
        }
    }
};