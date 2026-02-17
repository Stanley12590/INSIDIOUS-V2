const handler = require('../../handler');

module.exports = {
    name: "settings",
    aliases: ["setting", "config"],
    ownerOnly: true,
    description: "Manage all bot settings (global & arrays)",
    usage: "[subcommand] [args]",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const settings = await handler.loadGlobalSettings();
        const prefix = settings.prefix || '.';

        if (args.length === 0) {
            // Show summary
            let text = `╭─── • 🥀 • ───╮\n`;
            text += `   *BOT SETTINGS*   \n`;
            text += `╰─── • 🥀 • ───╯\n\n`;
            text += `🔧 *ANTI*\n`;
            text += `antilink: ${settings.antilink ? '✅' : '❌'}\n`;
            text += `antiporn: ${settings.antiporn ? '✅' : '❌'}\n`;
            text += `antiscam: ${settings.antiscam ? '✅' : '❌'}\n`;
            text += `antimedia: ${settings.antimedia ? '✅' : '❌'}\n`;
            text += `antitag: ${settings.antitag ? '✅' : '❌'}\n`;
            text += `antiviewonce: ${settings.antiviewonce ? '✅' : '❌'}\n`;
            text += `antidelete: ${settings.antidelete ? '✅' : '❌'}\n`;
            text += `antibugs: ${settings.antibugs ? '✅' : '❌'}\n`;
            text += `antispam: ${settings.antispam ? '✅' : '❌'}\n`;
            text += `anticall: ${settings.anticall ? '✅' : '❌'}\n\n`;
            text += `⚡ *AUTO*\n`;
            text += `autoRead: ${settings.autoRead ? '✅' : '❌'} (scope: ${settings.autoReadScope})\n`;
            text += `autoReact: ${settings.autoReact ? '✅' : '❌'} (scope: ${settings.autoReactScope})\n`;
            text += `autoTyping: ${settings.autoTyping ? '✅' : '❌'}\n`;
            text += `autoRecording: ${settings.autoRecording ? '✅' : '❌'}\n`;
            text += `autoBio: ${settings.autoBio ? '✅' : '❌'}\n`;
            text += `autostatus: ${settings.autostatus ? '✅' : '❌'} (limit: ${settings.autoStatusLimit}/day)\n`;
            text += `chatbot: ${settings.chatbot ? '✅' : '❌'}\n\n`;
            text += `👥 *GROUP*\n`;
            text += `welcomeGoodbye: ${settings.welcomeGoodbye ? '✅' : '❌'}\n`;
            text += `activemembers: ${settings.activemembers ? '✅' : '❌'}\n`;
            text += `autoblockCountry: ${settings.autoblockCountry ? '✅' : '❌'}\n\n`;
            text += `⚙️ *LIMITS*\n`;
            text += `warnLimit: ${settings.warnLimit}\n`;
            text += `maxTags: ${settings.maxTags}\n`;
            text += `inactiveDays: ${settings.inactiveDays}\n`;
            text += `antiSpamLimit: ${settings.antiSpamLimit}\n`;
            text += `antiSpamInterval: ${settings.antiSpamInterval}ms\n`;
            text += `sleepingStart: ${settings.sleepingStart}\n`;
            text += `sleepingEnd: ${settings.sleepingEnd}\n`;
            text += `maxCoOwners: ${settings.maxCoOwners}\n\n`;
            text += `🔐 *MODE*\n`;
            text += `mode: ${settings.mode}\n`;
            text += `prefix: ${settings.prefix}\n`;
            text += `alwaysOnline: ${settings.alwaysOnline ? '✅' : '❌'}\n\n`;
            text += `📋 *ARRAYS*\n`;
            text += `scamKeywords: ${settings.scamKeywords?.length || 0} items\n`;
            text += `pornKeywords: ${settings.pornKeywords?.length || 0} items\n`;
            text += `blockedMediaTypes: ${settings.blockedMediaTypes?.length || 0} items\n`;
            text += `autoReactEmojis: ${settings.autoReactEmojis?.length || 0} items\n`;
            text += `blockedCountries: ${settings.blockedCountries?.length || 0} items\n\n`;
            text += `💡 *USAGE*\n`;
            text += `${prefix}settings toggle <feature>          # toggle boolean\n`;
            text += `${prefix}settings set <feature> <value>     # set number/string\n`;
            text += `${prefix}settings list <array>              # list array items\n`;
            text += `${prefix}settings add <array> <item>        # add to array\n`;
            text += `${prefix}settings remove <array> <item>     # remove from array\n`;
            text += `Examples:\n`;
            text += `${prefix}settings toggle antilink\n`;
            text += `${prefix}settings set warnLimit 5\n`;
            text += `${prefix}settings add scam win\n`;
            text += `${prefix}settings list scam\n`;
            return reply(fancy(text));
        }

        const sub = args[0].toLowerCase();

        // ========== TOGGLE BOOLEAN ==========
        if (sub === 'toggle') {
            const feature = args[1];
            if (!feature) return reply("❌ Specify feature to toggle.");
            if (!(feature in settings) || typeof settings[feature] !== 'boolean') {
                return reply("❌ Invalid boolean feature.");
            }
            settings[feature] = !settings[feature];
            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(fancy(`✅ ${feature} is now ${settings[feature] ? 'ON' : 'OFF'}`));
        }

        // ========== SET VALUE (number/string) ==========
        if (sub === 'set') {
            const feature = args[1];
            const value = args.slice(2).join(' ');
            if (!feature || !value) return reply("❌ Usage: .settings set <feature> <value>");

            if (!(feature in settings)) return reply("❌ Feature not found.");

            // Type handling
            if (typeof settings[feature] === 'number') {
                const num = Number(value);
                if (isNaN(num)) return reply("❌ Must be a number.");
                settings[feature] = num;
            } else if (typeof settings[feature] === 'string') {
                settings[feature] = value;
            } else {
                return reply("❌ Cannot set this feature with 'set'. Use toggle/add/remove.");
            }

            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(fancy(`✅ ${feature} set to ${settings[feature]}`));
        }

        // ========== LIST ARRAY ==========
        if (sub === 'list') {
            const arrayName = args[1];
            const validArrays = ['scam', 'porn', 'blockmedia', 'emoji', 'country'];
            const map = {
                scam: 'scamKeywords',
                porn: 'pornKeywords',
                blockmedia: 'blockedMediaTypes',
                emoji: 'autoReactEmojis',
                country: 'blockedCountries'
            };
            if (!validArrays.includes(arrayName)) return reply(`❌ Valid arrays: ${validArrays.join(', ')}`);

            const key = map[arrayName];
            const list = settings[key] || [];
            let text = `╭─── • 🥀 • ───╮\n`;
            text += `   *${key.toUpperCase()}*   \n`;
            text += `╰─── • 🥀 • ───╯\n\n`;
            text += `Total: ${list.length}\n\n`;
            list.forEach((item, i) => { text += `${i+1}. ${item}\n`; });
            return reply(fancy(text));
        }

        // ========== ADD TO ARRAY ==========
        if (sub === 'add') {
            const arrayName = args[1];
            const item = args.slice(2).join(' ').trim();
            const validArrays = ['scam', 'porn', 'blockmedia', 'emoji', 'country'];
            const map = {
                scam: 'scamKeywords',
                porn: 'pornKeywords',
                blockmedia: 'blockedMediaTypes',
                emoji: 'autoReactEmojis',
                country: 'blockedCountries'
            };
            if (!validArrays.includes(arrayName)) return reply(`❌ Valid arrays: ${validArrays.join(', ')}`);
            if (!item) return reply("❌ Provide item to add.");

            const key = map[arrayName];
            let list = settings[key] || [];
            if (list.includes(item)) return reply("❌ Item already exists.");
            list.push(item);
            settings[key] = list;
            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(fancy(`✅ Added to ${key}: ${item}`));
        }

        // ========== REMOVE FROM ARRAY ==========
        if (sub === 'remove') {
            const arrayName = args[1];
            const item = args.slice(2).join(' ').trim();
            const validArrays = ['scam', 'porn', 'blockmedia', 'emoji', 'country'];
            const map = {
                scam: 'scamKeywords',
                porn: 'pornKeywords',
                blockmedia: 'blockedMediaTypes',
                emoji: 'autoReactEmojis',
                country: 'blockedCountries'
            };
            if (!validArrays.includes(arrayName)) return reply(`❌ Valid arrays: ${validArrays.join(', ')}`);
            if (!item) return reply("❌ Provide item to remove.");

            const key = map[arrayName];
            let list = settings[key] || [];
            const index = list.indexOf(item);
            if (index === -1) return reply("❌ Item not found.");
            list.splice(index, 1);
            settings[key] = list;
            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(fancy(`✅ Removed from ${key}: ${item}`));
        }

        // ========== HELP ==========
        reply("❌ Unknown subcommand. Use .settings with no arguments for help.");
    }
};