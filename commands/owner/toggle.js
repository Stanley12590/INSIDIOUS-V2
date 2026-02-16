const handler = require('../../handler');

module.exports = {
    name: "toggle",
    ownerOnly: true,
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const feature = args[0];
        if (!feature) return reply("❌ Specify feature to toggle.");

        let settings = await handler.loadGlobalSettings();
        if (!(feature in settings) || typeof settings[feature] !== 'boolean') {
            return reply(`❌ Invalid boolean feature: ${feature}`);
        }

        settings[feature] = !settings[feature];
        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *${feature}* is now ${settings[feature] ? 'ON' : 'OFF'}`));
    }
};