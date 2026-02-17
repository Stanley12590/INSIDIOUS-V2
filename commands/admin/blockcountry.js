const handler = require('../../handler');

module.exports = {
    name: "blockcountry",
    aliases: ["addblockedcountry", "countryblock"],
    ownerOnly: true,
    description: "Add a country code to block (e.g., 255 for Tanzania)",
    usage: "<country_code>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        if (args.length === 0) return reply("❌ Please provide a country code.");

        const code = args[0].replace(/[^0-9]/g, '');
        if (!code || code.length > 4) return reply("❌ Invalid country code. Use numeric code (e.g., 255).");

        const settings = await handler.loadGlobalSettings();
        let blockedList = settings.blockedCountries || [];

        if (blockedList.includes(code)) {
            return reply(`❌ Country code ${code} is already blocked.`);
        }

        blockedList.push(code);
        settings.blockedCountries = blockedList;

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *Country blocked!*\n\n📌 Code: +${code}\n📊 Total blocked: ${blockedList.length}`));
    }
};