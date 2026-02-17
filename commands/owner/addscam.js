const handler = require('../../handler');

module.exports = {
    name: "addscam",
    aliases: ["addscamkeyword", "newscam"],
    ownerOnly: true,
    description: "Add a new scam keyword",
    usage: "<keyword>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        if (args.length === 0) return reply("❌ Please provide a keyword.");

        const keyword = args.join(' ').toLowerCase().trim();
        if (!keyword) return reply("❌ Invalid keyword.");

        const settings = await handler.loadGlobalSettings();
        let scamList = settings.scamKeywords || [];

        if (scamList.includes(keyword)) {
            return reply(`❌ "${keyword}" already exists.`);
        }

        scamList.push(keyword);
        settings.scamKeywords = scamList;

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *Scam keyword added!*\n\n📌 Keyword: ${keyword}\n📊 Total: ${scamList.length}`));
    }
};