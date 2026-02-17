const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');
const handler = require('../../handler');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, pushname }) => {
        try {
            await conn.sendPresenceUpdate('composing', from);

            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            let totalCmds = 0;

            const settings = await handler.loadGlobalSettings();
            const botName = settings.botName || config.botName;
            const ownerName = settings.ownerName || config.ownerName;
            const workMode = settings.mode || config.mode;
            const prefix = settings.prefix || config.prefix;
            const footer = settings.footer || config.footer;

            let menuTxt = `╭── • 🥀 • ──╮\n  ${fancy(botName)}\n╰── • 🥀 • ──╯\n\n`;
            menuTxt += `│ ◦ ${fancy("ꜱᴏᴜʟ")}: ${pushname}\n`;
            menuTxt += `│ ◦ ${fancy("ᴏᴡɴᴇʀ")}: ${ownerName}\n`;
            menuTxt += `│ ◦ ${fancy("ᴜᴘᴛɪᴍᴇ")}: ${runtime(process.uptime())}\n`;
            menuTxt += `│ ◦ ${fancy("ᴍᴏᴅᴇ")}: ${workMode.toUpperCase()}\n`;
            menuTxt += `│ ◦ ${fancy("ᴘʀᴇꜰɪx")}: ${prefix}\n\n`;

            categories.forEach(cat => {
                const catPath = path.join(cmdPath, cat);
                if (fs.statSync(catPath).isDirectory()) {
                    const files = fs.readdirSync(catPath)
                        .filter(f => f.endsWith('.js'))
                        .map(f => f.replace('.js', ''));
                    
                    if (files.length > 0) {
                        totalCmds += files.length;
                        menuTxt += `🥀 *${fancy(cat.toUpperCase())}*\n`;
                        files.forEach(file => {
                            menuTxt += `│ ◦ ${file}\n`;
                        });
                        menuTxt += `│\n`;
                    }
                }
            });

            menuTxt += `│ ◦ ${fancy("ᴛᴏᴛᴀʟ ᴄᴍᴅꜱ")}: ${totalCmds}\n`;
            menuTxt += `└──────────────\n${fancy(footer)}`;

            await conn.sendMessage(from, { 
                image: { url: settings.menuImage || config.menuImage }, 
                caption: menuTxt,
                contextInfo: { 
                    isForwarded: true, 
                    forwardingScore: 999,
                    forwardedNewsletterMessageInfo: { 
                        newsletterJid: settings.newsletterJid || config.newsletterJid, 
                        newsletterName: botName,
                        serverMessageId: 100
                    }
                } 
            }, { quoted: msg });

        } catch (e) {
            console.error(e);
            msg.reply(fancy("🥀 Shadows failed to summon the menu. Check folder structure."));
        }
    }
};