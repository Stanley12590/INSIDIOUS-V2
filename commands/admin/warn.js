// commands/group/warn.js
module.exports = {
    name: "warn",
    description: "Warn a member",
    usage: "@mention or reply to their message [reason]",
    execute: async (conn, msg, args, { from, isOwner, reply, config, fancy, isGroup, sender, isParticipantAdmin, isBotAdmin }) => {
        if (!isGroup) return reply("❌ This command can only be used in groups.");

        const isAdmin = await isParticipantAdmin(conn, from, sender);
        if (!isAdmin && !isOwner) return reply("❌ Only group admins can use this command.");

        // Bot doesn't need to be admin to warn, but we'll allow it.

        let target = null;
        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            target = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else {
            return reply("❌ Please mention the user or reply to their message.");
        }

        // Reason: remaining args
        let reason = args.join(' ') || "No reason provided.";

        try {
            // Use the handler's applyAction if available, otherwise simulate
            // We'll need access to handler's functions. In command params, we have access to the handler exports via the provided object? Not directly.
            // But we can import handler again, but careful with circular deps.
            // For simplicity, we'll just send a warning message and increment our own tracker? But handler's tracker won't be updated.
            // To be consistent, we should use handler's warning system. Since the handler is already loaded, we can require it.
            const handler = require('../../handler');
            
            // Apply a warning (custom message)
            const customMsg = `⚠️ @${target.split('@')[0]} – You have been warned by @${sender.split('@')[0]}. Reason: ${reason}`;
            await handler.applyAction(conn, from, target, 'warn', reason, 1, customMsg);
            
            // No need to send extra message; applyAction already sends it.
        } catch (e) {
            reply(`❌ Failed to warn: ${e.message}`);
        }
    }
};