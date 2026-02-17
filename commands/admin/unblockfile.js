const handler = require('../../handler');

module.exports = {
    name: "unblockcountry",
    aliases: ["removeblockedcountry", "countryunblock"],
    ownerOnly: true,
    description: "Remove a country code from blocked list",
    usage: "<country_code>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        if (args.length === 0) return reply("❌ Please provide a country code.");

        const code = args[0].replace(/[^0-9]/g, '');
        if (!code) return reply("❌ Invalid country code.");

        const settings = await handler.loadGlobalSettings();
        let blockedList = settings.blockedCountries || [];

        const index = blockedList.indexOf(code);
        if (index === -1) {
            return reply(`❌ Country code +${code} is not in blocked list.`);
        }

        blockedList.splice(index, 1);
        settings.blockedCountries = blockedList;

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *Country unblocked!*\n\n📌 Code: +${code}\n📊 Total blocked: ${blockedList.length}`));
    }
};