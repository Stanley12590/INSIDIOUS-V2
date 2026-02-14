// commands/group/hidetag.js
module.exports = {
    name: "hidetag",
    description: "Send a message that mentions all members without showing tags",
    usage: "[message]",
    execute: async (conn, msg, args, { from, isOwner, reply, config, fancy, isGroup, sender }) => {
        if (!isGroup) return reply("❌ This command can only be used in groups.");

        // Check if user is admin or owner
        const isAdmin = await isParticipantAdmin(conn, from, sender);
        if (!isAdmin && !isOwner) return reply("❌ Only group admins can use this command.");

        try {
            const groupMeta = await conn.groupMetadata(from);
            const participants = groupMeta.participants.map(p => p.id);

            const text = args.join(' ') || '‎'; // invisible character if empty

            // Build fancy message
            const message = fancy(
                `┏━━━━━━━━━━━━━━┓\n` +
                `┃   🤫 SILENT ANNOUNCEMENT   ┃\n` +
                `┗━━━━━━━━━━━━━━┛\n\n` +
                `👥 *Initiated by:* @${sender.split('@')[0]}\n` +
                `💬 *Message:*\n${text}\n\n` +
                `_This is a hidden mention – no visible tags._`
            );

            // Send text message with mentions (hidden)
            await conn.sendMessage(from, {
                text: message,
                mentions: participants,
                contextInfo: {
                    isForwarded: true,
                    forwardingScore: 999,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: config.newsletterJid || '120363404317544295@newsletter',
                        newsletterName: config.botName || 'INSIDIOUS'
                    }
                }
            });

        } catch (e) {
            reply(`❌ Error: ${e.message}`);
        }
    }
};