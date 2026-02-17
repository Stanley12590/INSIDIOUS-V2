const handler = require('../../handler');

module.exports = {
    name: "removeblockmedia",
    aliases: ["unblockmedia", "delblockmedia"],
    ownerOnly: true,
    description: "Remove a media type from blocked list",
    usage: "<type>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        if (args.length === 0) return reply("❌ Please provide a media type.");

        const type = args[0].toLowerCase().trim();

        const settings = await handler.loadGlobalSettings();
        let blockedList = settings.blockedMediaTypes || [];

        const index = blockedList.indexOf(type);
        if (index === -1) {
            return reply(`❌ "${type}" is not in blocked list.`);
        }

        blockedList.splice(index, 1);
        settings.blockedMediaTypes = blockedList;

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *Media type unblocked!*\n\n📌 Type: ${type}\n📊 Total blocked: ${blockedList.length}`));
    }
};