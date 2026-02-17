const handler = require('../../handler');

module.exports = {
    name: "removeemoji",
    aliases: ["delreactemoji", "unreactemoji"],
    ownerOnly: true,
    description: "Remove an emoji from auto-react list",
    usage: "<emoji>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        if (args.length === 0) return reply("❌ Please provide an emoji.");

        const emoji = args.join(' ').trim();
        if (!emoji) return reply("❌ Invalid emoji.");

        const settings = await handler.loadGlobalSettings();
        let emojiList = settings.autoReactEmojis || [];

        const index = emojiList.indexOf(emoji);
        if (index === -1) {
            return reply(`❌ "${emoji}" not found.`);
        }

        emojiList.splice(index, 1);
        settings.autoReactEmojis = emojiList;

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *Auto-react emoji removed!*\n\n📌 Emoji: ${emoji}\n📊 Total: ${emojiList.length}`));
    }
};