// commands/group/tagall.js
const { prepareWAMessageMedia } = require('@whiskeysockets/baileys');

module.exports = {
    name: "tagall",
    description: "Tag all group members with an image",
    usage: "[message]",
    execute: async (conn, msg, args, { from, isOwner, reply, config, fancy, isGroup, sender }) => {
        if (!isGroup) return reply("❌ This command can only be used in groups.");

        // Check if user is admin or owner
        const isAdmin = await isParticipantAdmin(conn, from, sender);
        if (!isAdmin && !isOwner) return reply("❌ Only group admins can use this command.");

        try {
            const groupMeta = await conn.groupMetadata(from);
            const participants = groupMeta.participants.map(p => p.id);

            const text = args.join(' ') || 'No message provided.';

            // Prepare image media
            const imageMedia = await prepareWAMessageMedia(
                { image: { url: config.botImage } },
                { upload: conn.waUploadToServer }
            );

            // Build fancy caption
            const caption = fancy(
                `┏━━━━━━━━━━━━━━┓\n` +
                `┃   🔔 GROUP ANNOUNCEMENT   ┃\n` +
                `┗━━━━━━━━━━━━━━┛\n\n` +
                `👥 *Tagged by:* @${sender.split('@')[0]}\n` +
                `💬 *Message:*\n${text}\n\n` +
                `_You have been mentioned in this group._`
            );

            // Send image with caption mentioning everyone
            await conn.sendMessage(from, {
                image: imageMedia.imageMessage,
                caption: caption,
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