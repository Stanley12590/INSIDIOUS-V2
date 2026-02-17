const fs = require('fs-extra');
const path = require('path');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
const { fancy, runtime } = require('../../lib/tools');
const handler = require('../../handler');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            let userName = pushname || sender.split('@')[0];
            const settings = await handler.loadGlobalSettings();
            const prefix = settings.prefix || '.';

            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath).filter(c => fs.statSync(path.join(cmdPath, c)).isDirectory());
            const cards = [];

            let imageMedia = null;
            if (settings.menuImage) {
                try {
                    const imgSrc = settings.menuImage.startsWith('http') ? { url: settings.menuImage } : { url: settings.menuImage };
                    imageMedia = await prepareWAMessageMedia({ image: imgSrc }, { upload: conn.waUploadToServer || conn.upload });
                } catch (e) { console.error("Menu image error:", e); }
            }

            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
                if (!files.length) continue;

                const perPage = 6;
                const pages = [];
                for (let i = 0; i < files.length; i += perPage) pages.push(files.slice(i, i + perPage));

                pages.forEach((pageFiles, idx) => {
                    const buttons = pageFiles.map(cmd => ({
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({ display_text: `${prefix}${cmd}`, id: `${prefix}${cmd}` })
                    }));

                    if (pages.length > 1) {
                        if (idx > 0) buttons.push({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({ display_text: "◀️ Prev", id: `${prefix}menu ${cat} ${idx-1}` })
                        });
                        if (idx < pages.length-1) buttons.push({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({ display_text: "Next ▶️", id: `${prefix}menu ${cat} ${idx+1}` })
                        });
                    }

                    const cardHeader = imageMedia ? { imageMessage: imageMedia.imageMessage } : { title: fancy(cat.toUpperCase()) };
                    const card = {
                        body: { text: fancy(
                            `┏━━━━━━━━━━━━━━━━━━┓\n┃   🥀 ${cat.toUpperCase()}  ${pages.length>1 ? `(${idx+1}/${pages.length})` : ''}\n┗━━━━━━━━━━━━━━━━━━┛\n\n👋 Hello, *${userName}*\nTap a button to execute.`
                        ) },
                        footer: { text: fancy(settings.footer) },
                        header: cardHeader,
                        nativeFlowMessage: { buttons }
                    };
                    cards.push(card);
                });
            }

            const interactiveMsg = {
                body: { text: fancy(`┏━━━━━━━━━━━━━━━━━━┓\n┃   👹 INSIDIOUS   ┃\n┗━━━━━━━━━━━━━━━━━━┛\n\n⏱️ Uptime: ${runtime(process.uptime())}\n👤 User: ${userName}`) },
                footer: { text: fancy("◀️ Swipe for categories ▶️") },
                header: { title: fancy(settings.botName) },
                carouselMessage: { cards }
            };

            const waMsg = generateWAMessageFromContent(from, { interactiveMessage: interactiveMsg }, { userJid: conn.user.id, upload: conn.waUploadToServer });
            await conn.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
        } catch (e) {
            console.error("Menu error:", e);
            await msg.reply("Menu error, check console.");
        }
    }
};