const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/font');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from }) => {
        try {
            await conn.sendPresenceUpdate('composing', from);

            // 1. Hesabu ya Commands
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            let totalCmds = 0;
            categories.forEach(cat => {
                totalCmds += fs.readdirSync(path.join(cmdPath, cat)).filter(f => f.endsWith('.js')).length;
            });

            // 2. Header ya Menu
            let menu = `╭── • 🥀 • ──╮\n  ${fancy(config.botName)}\n╰── • 🥀 • ──╯\n\n`;
            menu += `│ ◦ ${fancy("ᴏᴡɴᴇʀ")}: ${config.ownerName}\n`;
            menu += `│ ◦ ${fancy("ᴜᴘᴛɪᴍᴇ")}: ${runtime(process.uptime())}\n`;
            menu += `│ ◦ ${fancy("ᴍᴏᴅᴇ")}: ${config.workMode.toUpperCase()}\n`;
            menu += `│ ◦ ${fancy("ᴄᴍᴅꜱ")}: ${totalCmds}\n\n`;

            // 3. Loop ya Categories - COMMANDS WIMA
            categories.forEach(cat => {
                const files = fs.readdirSync(path.join(cmdPath, cat))
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));
                
                menu += `🥀 *${fancy(cat.toUpperCase())}*\n`;
                
                // COMMANDS WIMA - Kila command kwa line yake
                files.forEach(file => {
                    menu += `│ ◦ ${file}\n`;
                });
                menu += `\n`;
            });

            menu += `└──────────────\n${fancy(config.footer)}`;

            // 4. Tuma kwa Branding ya Newsletter
            await conn.sendMessage(from, { 
                image: { url: config.menuImage }, 
                caption: menu,
                contextInfo: { 
                    isForwarded: true, 
                    forwardedNewsletterMessageInfo: { 
                        newsletterJid: config.newsletterJid, 
                        newsletterName: config.botName 
                    } 
                }
            }, { quoted: msg });

        } catch (e) {
            msg.reply(fancy("Error summoning the menu..."));
        }
    }
};
