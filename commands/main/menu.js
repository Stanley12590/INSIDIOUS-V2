const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            // Jina la mtumiaji
            let userName = pushname;
            if (!userName) {
                try {
                    const contact = await conn.getContact(sender);
                    userName = contact?.name || contact?.pushname || sender.split('@')[0];
                } catch {
                    userName = sender.split('@')[0];
                }
            }

            // Kategoria zote
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath);
            
            const cards = [];
            const BUTTONS_PER_PAGE = 6;

            // Picha ya menu
            let imageMedia = null;
            if (config.menuImage) {
                try {
                    const imageSource = config.menuImage.startsWith('http') 
                        ? { url: config.menuImage } 
                        : { url: config.menuImage };
                    imageMedia = await prepareWAMessageMedia(
                        { image: imageSource },
                        { upload: conn.waUploadToServer || conn.upload }
                    );
                } catch (e) {
                    console.error("Failed to load menu image:", e);
                }
            }

            // Sauti ya menu
            let audioMedia = null;
            if (config.menuAudio) {
                try {
                    const audioSource = config.menuAudio.startsWith('http')
                        ? { url: config.menuAudio }
                        : { url: config.menuAudio };
                    audioMedia = await prepareWAMessageMedia(
                        { audio: audioSource, mimetype: 'audio/mpeg' },
                        { upload: conn.waUploadToServer || conn.upload }
                    );
                } catch (e) {
                    console.error("Failed to load menu audio:", e);
                }
            }

            // Tengeneza card kwa kila category
            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                const stat = fs.statSync(catPath);
                if (!stat.isDirectory()) continue;
                
                let files = fs.readdirSync(catPath)
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));

                if (files.length === 0) continue;

                // Gawanya kurasa
                const pages = [];
                for (let i = 0; i < files.length; i += BUTTONS_PER_PAGE) {
                    pages.push(files.slice(i, i + BUTTONS_PER_PAGE));
                }

                pages.forEach((pageFiles, pageIndex) => {
                    // Vifungo vya commands
                    const buttons = pageFiles.map(cmd => ({
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: `${config.prefix}${cmd}`,
                            id: `${config.prefix}${cmd}`
                        })
                    }));

                    // Vifungo vya navigation (Prev/Next)
                    if (pages.length > 1) {
                        if (pageIndex > 0) {
                            buttons.push({
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "◀️ Prev",
                                    id: `${config.prefix}menu ${cat} ${pageIndex - 1}`
                                })
                            });
                        }
                        if (pageIndex < pages.length - 1) {
                            buttons.push({
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "Next ▶️",
                                    id: `${config.prefix}menu ${cat} ${pageIndex + 1}`
                                })
                            });
                        }
                    }

                    // Vifungo vya media (kama zipo)
                    if (config.menuAudio) {
                        buttons.push({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: "🎵 Play Music",
                                id: `${config.prefix}playaudio ${cat}`
                            })
                        });
                        buttons.push({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: "⏹️ Stop Music",
                                id: `${config.prefix}stopaudio`
                            })
                        });
                    }

                    // Header ya card (picha au sauti)
                    const cardHeader = {};
                    if (audioMedia) {
                        cardHeader.audioMessage = audioMedia.audioMessage;
                    } else if (imageMedia) {
                        cardHeader.imageMessage = imageMedia.imageMessage;
                    } else {
                        cardHeader.title = fancy(config.botName);
                    }

                    // Unda card
                    const card = {
                        body: { text: fancy(
                            `━━━━━━━━━━━━━━━━━━\n` +
                            `   🥀 *${cat.toUpperCase()} CATEGORY*${pages.length > 1 ? ` (Page ${pageIndex + 1}/${pages.length})` : ''}\n` +
                            `━━━━━━━━━━━━━━━━━━\n\n` +
                            `👋 Hello, *${userName}*!\n` +
                            `Select a command below.\n\n` +
                            `👑 Developer: ${config.developerName || 'STANYTZ'}`
                        ) },
                        footer: { text: fancy(config.footer || 'INSIDIOUS BOT') },
                        header: cardHeader,
                        nativeFlowMessage: {
                            buttons: buttons
                        }
                    };
                    cards.push(card);
                });
            }

            // Ujumbe mkuu wa menu
            const interactiveMessage = {
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   👹 *INSIDIOUS V2.1.1*  \n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `⏱️ Uptime: ${runtime(process.uptime())}\n\n` +
                    `👤 User: *${userName}*`
                ) },
                footer: { text: fancy("◀️ Slide left/right for categories & pages ▶️") },
                header: {
                    title: fancy(config.botName || 'INSIDIOUS'),
                },
                carouselMessage: {
                    cards: cards
                }
            };

            // Tuma
            const messageContent = { interactiveMessage };
            const waMessage = generateWAMessageFromContent(from, messageContent, {
                userJid: conn.user.id,
                upload: conn.waUploadToServer || conn.upload
            });
            await conn.relayMessage(from, waMessage.message, { messageId: waMessage.key.id });

        } catch (e) {
            console.error("Menu error:", e);
            
            // Fallback text menu
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