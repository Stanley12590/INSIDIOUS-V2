const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, pushname }) => {
        try {
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            
            // Tengeneza Slides (Cards) kwa ajili ya kila Category
            let cards = [];

            for (const cat of categories) {
                const files = fs.readdirSync(path.join(cmdPath, cat))
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));

                if (files.length > 0) {
                    // Kutengeneza Buttons za kila command kwenye hiyo slide
                    let buttons = files.map(file => ({
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            "display_text": `${config.prefix}${file}`,
                            "id": `${config.prefix}${file}`
                        })
                    }));

                    cards.push({
                        body: { text: `🥀 *${fancy(cat.toUpperCase())} ᴄᴀᴛᴇɢᴏʀʏ*\n\nʜᴇʟʟᴏ ${pushname},\nꜱᴇʟᴇᴄᴛ ᴀ ᴄᴏᴍᴍᴀɴᴅ ʙᴇʟᴏᴡ ᴛᴏ ᴇxᴇᴄᴜᴛᴇ.\n\nᴅᴇᴠ: ${config.developerName}` },
                        footer: { text: fancy(config.footer) },
                        header: {
                            hasMediaAttachment: true,
                            imageMessage: await prepareWAMessageMedia({ image: { url: config.menuImage } }, { upload: conn.waUploadToServer })
                        },
                        nativeFlowMessage: { buttons: buttons }
                    });
                }
            }

            // Kutuma Carousel Message (Sliding Menu)
            const carouselMsg = Object.assign({}, {
                interactiveMessage: {
                    body: { text: fancy(`👹 ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ᴅᴀꜱʜʙᴏᴀʀᴅ\nᴜᴘᴛɪᴍᴇ: ${runtime(process.uptime())}`) },
                    footer: { text: fancy("ꜱʟɪᴅᴇ ʟᴇꜰᴛ/ʀɪɢʜᴛ ꜰᴏʀ ᴍᴏʀᴇ ᴄᴀᴛᴇɢᴏʀɪᴇꜱ") },
                    header: { title: fancy(config.botName), hasMediaAttachment: false },
                    carouselMessage: { cards: cards }
                }
            });

            await conn.relayMessage(from, { viewOnceMessage: { message: carouselMsg } }, {});

        } catch (e) {
            console.error(e);
            msg.reply("🥀 Sliding menu requires the latest WhatsApp version.");
        }
    }
};