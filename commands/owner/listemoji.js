const handler = require('../../handler');

module.exports = {
    name: "listemoji",
    aliases: ["listreactemojis", "emojilist"],
    ownerOnly: true,
    description: "List all auto-react emojis",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const settings = await handler.loadGlobalSettings();
        let emojiList = settings.autoReactEmojis || [];

        if (emojiList.length === 0) {
            return reply("📭 No auto-react emojis found.");
        }

        let text = `╔════════════════════╗\n`;
        text += `║   *AUTO-REACT EMOJIS*   ║\n`;
        text += `╚════════════════════╝\n\n`;
        text += `Total: ${emojiList.length}\n\n`;
        
        emojiList.forEach((emoji, i) => {
            text += `${i + 1}. ${emoji}\n`;
        });

        reply(fancy(text));
    }
};