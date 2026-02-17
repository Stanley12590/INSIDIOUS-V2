const handler = require('../../handler');

module.exports = {
    name: "settings",
    aliases: ["setting", "config"],
    ownerOnly: true,
    description: "Manage bot settings (group/private/all)",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const settings = await handler.loadGlobalSettings();
        const prefix = settings.prefix || '.';

        // ========== SHOW ALL SETTINGS ==========
        if (args.length === 0) {
            let text = `╭─── • 🥀 • ───╮\n`;
            text += `   *BOT SETTINGS*   \n`;
            text += `╰─── • 🥀 • ───╯\n\n`;

            // ANTI FEATURES (zote ni group only – haziwezi kuwa private)
            text += `🔧 *ANTI FEATURES* (group only)\n`;
            text += `┌─────────────────────\n`;
            text += `│ antilink    : ${settings.antilink ? '✅' : '❌'}\n`;
            text += `│ antiporn    : ${settings.antiporn ? '✅' : '❌'}\n`;
            text += `│ antiscam    : ${settings.antiscam ? '✅' : '❌'}\n`;
            text += `│ antimedia   : ${settings.antimedia ? '✅' : '❌'}\n`;
            text += `│ antitag     : ${settings.antitag ? '✅' : '❌'}\n`;
            text += `│ antibugs    : ${settings.antibugs ? '✅' : '❌'}\n`;
            text += `│ antispam    : ${settings.antispam ? '✅' : '❌'}\n`;
            text += `│ sleepingmode: ${settings.sleepingmode ? '✅' : '❌'}\n`;
            text += `└─────────────────────\n\n`;

            // AUTO FEATURES (zinaweza kuwa group/private/all)
            text += `⚡ *AUTO FEATURES*\n`;
            text += `┌─────────────────────\n`;
            text += `│ autoRead    : ${settings.autoReadScope || 'all'} (${settings.autoRead ? '✅' : '❌'})\n`;
            text += `│ autoReact   : ${settings.autoReactScope || 'all'} (${settings.autoReact ? '✅' : '❌'})\n`;
            text += `│ autoTyping  : ${settings.autoTyping ? '✅' : '❌'}\n`;
            text += `│ autoRecording: ${settings.autoRecording ? '✅' : '❌'}\n`;
            text += `│ autoBio     : ${settings.autoBio ? '✅' : '❌'}\n`;
            text += `│ autostatus  : ${settings.autostatus ? '✅' : '❌'} (limit: ${settings.autoStatusLimit})\n`;
            text += `└─────────────────────\n\n`;

            // CHATBOT (inaweza kuwa group/private/all)
            text += `🤖 *CHATBOT*\n`;
            text += `┌─────────────────────\n`;
            text += `│ chatbot     : ${settings.chatbotScope || 'all'} (${settings.chatbot ? '✅' : '❌'})\n`;
            text += `└─────────────────────\n\n`;

            // GROUP MANAGEMENT
            text += `👥 *GROUP MANAGEMENT*\n`;
            text += `┌─────────────────────\n`;
            text += `│ welcomeGoodbye: ${settings.welcomeGoodbye ? '✅' : '❌'}\n`;
            text += `│ activemembers : ${settings.activemembers ? '✅' : '❌'}\n`;
            text += `│ autoblockCountry: ${settings.autoblockCountry ? '✅' : '❌'}\n`;
            text += `└─────────────────────\n\n`;

            // LIMITS
            text += `⚙️ *LIMITS*\n`;
            text += `┌─────────────────────\n`;
            text += `│ warnLimit      : ${settings.warnLimit}\n`;
            text += `│ maxTags        : ${settings.maxTags}\n`;
            text += `│ inactiveDays   : ${settings.inactiveDays}\n`;
            text += `│ antiSpamLimit  : ${settings.antiSpamLimit}\n`;
            text += `│ antiSpamInterval: ${settings.antiSpamInterval}ms\n`;
            text += `│ sleepingStart  : ${settings.sleepingStart}\n`;
            text += `│ sleepingEnd    : ${settings.sleepingEnd}\n`;
            text += `│ maxCoOwners    : ${settings.maxCoOwners}\n`;
            text += `│ autoStatusLimit: ${settings.autoStatusLimit}\n`;
            text += `└─────────────────────\n\n`;

            // MODE & PREFIX
            text += `🔐 *MODE & PREFIX*\n`;
            text += `┌─────────────────────\n`;
            text += `│ mode         : ${settings.mode}\n`;
            text += `│ prefix       : ${settings.prefix}\n`;
            text += `│ alwaysOnline : ${settings.alwaysOnline ? '✅' : '❌'}\n`;
            text += `└─────────────────────\n\n`;

            // ARRAYS
            text += `📋 *ARRAY SETTINGS*\n`;
            text += `┌─────────────────────\n`;
            text += `│ scamKeywords   : ${settings.scamKeywords?.length || 0} items\n`;
            text += `│ pornKeywords   : ${settings.pornKeywords?.length || 0} items\n`;
            text += `│ blockedMedia   : ${settings.blockedMediaTypes?.length || 0} items\n`;
            text += `│ reactEmojis    : ${settings.autoReactEmojis?.length || 0} items\n`;
            text += `│ blockedCountries: ${settings.blockedCountries?.length || 0} items\n`;
            text += `└─────────────────────\n\n`;

            text += `💡 *USAGE*\n`;
            text += `• ${prefix}settings anti <feature> on/off\n`;
            text += `• ${prefix}settings auto <feature> <group/private/all> [on/off]\n`;
            text += `• ${prefix}settings set <feature> <value>\n`;
            text += `• ${prefix}settings list <array>\n`;
            text += `• ${prefix}settings add <array> <item>\n`;
            text += `• ${prefix}settings remove <array> <item>\n\n`;
            text += `_Examples:_\n`;
            text += `${prefix}settings anti antilink on\n`;
            text += `${prefix}settings auto autoRead all on\n`;
            text += `${prefix}settings set warnLimit 5\n`;

            // Send with image
            await conn.sendMessage(from, {
                image: { url: settings.botImage || 'https://files.catbox.moe/mfngio.png' },
                caption: fancy(text),
                contextInfo: { isForwarded: true }
            }, { quoted: msg });
            return;
        }

        // ========== SUBCOMMANDS ==========
        const sub = args[0].toLowerCase();

        // ----- ANTI FEATURES (group only, simple on/off) -----
        if (sub === 'anti') {
            const feature = args[1];
            const action = args[2]?.toLowerCase();

            const antiFeatures = ['antilink', 'antiporn', 'antiscam', 'antimedia', 'antitag', 'antibugs', 'antispam', 'sleepingmode'];
            if (!antiFeatures.includes(feature)) {
                return reply(`❌ Invalid anti feature. Valid: ${antiFeatures.join(', ')}`);
            }
            if (!action || !['on', 'off'].includes(action)) {
                return reply("❌ Specify on or off.");
            }

            settings[feature] = action === 'on';
            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(`✅ ${feature} is now ${action.toUpperCase()}`);
        }

        // ----- AUTO FEATURES (with scope) -----
        if (sub === 'auto') {
            const feature = args[1];
            const scope = args[2]?.toLowerCase();
            const action = args[3]?.toLowerCase();

            const autoFeatures = ['autoRead', 'autoReact', 'autoTyping', 'autoRecording', 'autoBio', 'autostatus', 'chatbot'];
            if (!autoFeatures.includes(feature)) {
                return reply(`❌ Invalid auto feature. Valid: ${autoFeatures.join(', ')}`);
            }

            // For features that don't need scope (like autoTyping, autoBio)
            const noScopeFeatures = ['autoTyping', 'autoRecording', 'autoBio'];
            if (noScopeFeatures.includes(feature)) {
                if (!action || !['on', 'off'].includes(action)) {
                    return reply("❌ Specify on or off.");
                }
                settings[feature] = action === 'on';
                await handler.saveGlobalSettings(settings);
                await handler.refreshConfig();
                return reply(`✅ ${feature} is now ${action.toUpperCase()}`);
            }

            // Features with scope
            if (!scope || !['group', 'private', 'all'].includes(scope)) {
                return reply("❌ Specify scope: group/private/all");
            }
            if (!action || !['on', 'off'].includes(action)) {
                return reply("❌ Specify on or off.");
            }

            // Set both the boolean and the scope
            settings[feature] = action === 'on';
            const scopeKey = feature === 'chatbot' ? 'chatbotScope' : feature + 'Scope';
            settings[scopeKey] = scope;

            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(`✅ ${feature} is now ${action.toUpperCase()} (scope: ${scope})`);
        }

        // ----- SET (number/string) -----
        if (sub === 'set') {
            const feature = args[1];
            const value = args.slice(2).join(' ');
            if (!feature || !value) return reply("❌ Usage: .settings set <feature> <value>");
            if (!(feature in settings)) return reply("❌ Feature not found.");

            if (typeof settings[feature] === 'number') {
                const num = Number(value);
                if (isNaN(num)) return reply("❌ Must be a number.");
                settings[feature] = num;
            } else if (typeof settings[feature] === 'string') {
                settings[feature] = value;
            } else {
                return reply("❌ Cannot set this feature. Use anti/auto/add/remove.");
            }
            await handler.saveGlobalSettings(settings);
            await handler.refreshConfig();
            return reply(`✅ ${feature} set to ${settings[feature]}`);
        }

        // ----- LIST ARRAY -----
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
            return reply(text);
        }

        // ----- ADD TO ARRAY -----
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
            return reply(`✅ Added to ${key}: ${item}`);
        }

        // ----- REMOVE FROM ARRAY -----
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
            return reply(`✅ Removed from ${key}: ${item}`);
        }

        reply("❌ Unknown subcommand. Use .settings with no arguments for help.");
    }
};