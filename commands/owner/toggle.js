const handler = require('../../handler');

module.exports = {
    name: "toggle",
    aliases: ["tog"],
    ownerOnly: true,
    description: "Toggle global boolean settings (on/off)",
    usage: "<feature>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const feature = args[0];
        if (!feature) return reply("❌ Specify a feature to toggle.\nExample: .toggle antilink");

        const settings = await handler.loadGlobalSettings();
        
        if (!(feature in settings) || typeof settings[feature] !== 'boolean') {
            return reply(`❌ Invalid feature or not a boolean. Use .settings to see all features.`);
        }

        settings[feature] = !settings[feature];
        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        const status = settings[feature] ? 'ON' : 'OFF';
        reply(fancy(`✅ *${feature}* is now *${status}*`));
    }
};