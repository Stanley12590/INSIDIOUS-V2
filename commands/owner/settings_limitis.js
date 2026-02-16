const handler = require('../../handler');

module.exports = {
    name: "settings_limits",
    ownerOnly: true,
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const [key, ...valueArgs] = args;
        const newValue = valueArgs.join(' ').trim();

        if (!key) return reply("❌ Specify a setting key.");

        let settings = await handler.loadGlobalSettings();
        if (!(key in settings)) return reply(`❌ Unknown setting: ${key}`);

        const oldVal = settings[key];

        if (!newValue) {
            // Show current value
            return reply(fancy(`📌 *${key}* = ${oldVal}\n\nUsage: ${settings.prefix}settings_limits ${key} <new value>`));
        }

        // Update based on type
        if (key === 'warnLimit' || key === 'maxTags' || key === 'inactiveDays' || key === 'antiSpamLimit' || key === 'maxCoOwners') {
            const num = Number(newValue);
            if (isNaN(num)) return reply("❌ Must be a number.");
            settings[key] = num;
        } else if (key === 'antiSpamInterval') {
            const num = Number(newValue);
            if (isNaN(num)) return reply("❌ Must be a number (ms).");
            settings[key] = num;
        } else if (key === 'sleepingStart' || key === 'sleepingEnd') {
            if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newValue))
                return reply("❌ Invalid time. Use HH:MM (24h).");
            settings[key] = newValue;
        } else {
            return reply(`❌ Unsupported key for this command.`);
        }

        await handler.saveGlobalSettings(settings);
        await handler.refreshConfig();

        reply(fancy(`✅ *${key}* updated to ${settings[key]}`));
    }
};