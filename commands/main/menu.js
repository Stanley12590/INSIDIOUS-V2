const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            // Get user's display name (fix undefined pushname)
            let userName = pushname;
            if (!userName) {
                try {
                    const contact = await conn.getContact(sender);
                    userName = contact?.name || contact?.pushname || sender.split('@')[0];
                } catch {
                    userName = sender.split('@')[0];
                }
            }

            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            
            const cards = [];

            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                const stat = fs.statSync(catPath);
                if (!stat.isDirectory()) continue;
                
                const files = fs.readdirSync(catPath)
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));

                if (files.length === 0) continue;

                // Create buttons for each command
                const buttons = files.map(cmd => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: `${config.prefix}${cmd}`,
                        id: `${config.prefix}${cmd}`
                    })
                }));

                // Prepare image media for this card
                const imageMedia = await prepareWAMessageMedia(
                    { image: { url: config.menuImage } },
                    { upload: conn.waUploadToServer }
                );

                // Build card
                const card = {
                    body: { text: fancy(
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `   🥀 *${cat.toUpperCase()} CATEGORY*\n` +
                        `━━━━━━━━━━━━━━━━━━\n\n` +
                        `👋 Hello, *${userName}*!\n` +
                        `Select a command below.\n\n` +
                        `👑 Developer: ${config.developerName}`
                    ) },
                    footer: { text: fancy(config.footer) },
                    header: {
                        hasMediaAttachment: true,
                        imageMessage: imageMedia.imageMessage
                    },
                    nativeFlowMessage: {
                        buttons: buttons
                    }
                };
                cards.push(card);
            }

            // Main interactive message
            const interactiveMessage = {
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   👹 *INSIDIOUS V2.1.1*  \n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `⏱️ Uptime: ${runtime(process.uptime())}\n\n` +
                    `👤 User: ${userName}`
                ) },
                footer: { text: fancy("◀️ Slide left/right for more categories ▶️") },
                header: {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                carouselMessage: {
                    cards: cards
                }
            };

            // Send as regular interactive message (not view once)
            const waMessage = generateWAMessageFromContent(from, { interactiveMessage }, {
                userJid: conn.user.id,
                upload: conn.waUploadToServer
            });
            await conn.relayMessage(from, waMessage.message, { messageId: waMessage.key.id });

        } catch (e) {
            console.error("Menu error:", e);
            // Fallback plain text menu
            let text = `╭─── • 🥀 • ───╮\n`;
            text += `   *INSIDIOUS MENU*  \n`;
            text += `╰─── • 🥀 • ───╯\n\n`;
            text += `Hello ${pushname || sender.split('@')[0]},\n\n`;
            
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                if (!fs.statSync(catPath).isDirectory()) continue;
                const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
                if (files.length) {
                    text += `*${cat.toUpperCase()}*\n`;
                    text += files.map(cmd => `${config.prefix}${cmd}`).join(', ') + '\n\n';
                }
            }
            text += `\n_Uptime: ${runtime(process.uptime())}_`;
            await conn.sendMessage(from, { text: fancy(text) }, { quoted: msg });
        }
    }
};