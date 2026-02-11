const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, pushname }) => {
        try {
            // 1. Ionekane bot inaandika (Typing...)
            await conn.sendPresenceUpdate('composing', from);

            // 2. Njia ya kuelekea kwenye folder la commands
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            let totalCmds = 0;
            
            // 3. Header ya Menu (Premium Horror Style)
            let menuTxt = `╭── • 🥀 • ──╮\n  ${fancy(config.botName)}\n╰── • 🥀 • ──╯\n\n`;
            menuTxt += `│ ◦ ${fancy("ꜱᴏᴜʟ")}: ${pushname}\n`;
            menuTxt += `│ ◦ ${fancy("ᴏᴡɴᴇʀ")}: ${config.ownerName}\n`;
            menuTxt += `│ ◦ ${fancy("ᴜᴘᴛɪᴍᴇ")}: ${runtime(process.uptime())}\n`;
            menuTxt += `│ ◦ ${fancy("ᴍᴏᴅᴇ")}: ${config.workMode.toUpperCase()}\n`;
            menuTxt += `│ ◦ ${fancy("ᴘʀᴇꜰɪx")}: ${config.prefix}\n\n`;

            // 4. Kupitia kila sub-folder na kupanga commands KWA WIMA
            categories.forEach(cat => {
                const files = fs.readdirSync(path.join(cmdPath, cat))
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));
                
                if (files.length > 0) {
                    totalCmds += files.length;
                    menuTxt += `🥀 *${fancy(cat.toUpperCase())}*\n`;
                    
                    // Logic ya kupanga commands kwa wima (Kila moja na mstari wake)
                    files.forEach(file => {
                        menuTxt += `│ ◦ ${file}\n`;
                    });
                    menuTxt += `│\n`; // Nafasi kidogo baada ya kila category
                }
            });

            menuTxt += `│ ◦ ${fancy("ᴛᴏᴛᴀʟ ᴄᴍᴅꜱ")}: ${totalCmds}\n`;
            menuTxt += `└──────────────\n${fancy(config.footer)}`;

            // 5. Tuma Menu kwa kutumia picha kutoka config.menuImage
            await conn.sendMessage(from, { 
                image: { url: config.menuImage }, // Hapa inavuta: https://files.catbox.moe/irqrap.jpg
                caption: menuTxt,
                contextInfo: { 
                    isForwarded: true, 
                    forwardingScore: 999,
                    forwardedNewsletterMessageInfo: { 
                        newsletterJid: config.newsletterJid, 
                        newsletterName: config.botName,
                        serverMessageId: 100
                    },
                    // Feature 30: Branding link ya Group/Channel
                    externalAdReply: {
                        title: "🥀 ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 🥀",
                        body: "ᴛʜᴇ ʟᴀꜱᴛ ᴋᴇʏ ᴀᴜᴛᴏᴍᴀᴛɪᴏɴ",
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        thumbnailUrl: config.menuImage,
                        sourceUrl: config.channelLink
                    }
                } 
            }, { quoted: msg });

        } catch (e) {
            console.error(e);
            msg.reply(fancy("🥀 Shadows failed to manifest the menu..."));
        }
    }
};
