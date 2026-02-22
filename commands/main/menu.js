const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

module.exports = {
    name: "menu",
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            // ========== USER TAGGING + REAL NAME ==========
            const userNumber = sender.split('@')[0];
            let userName = pushname || '';
            if (!userName) {
                try {
                    const contact = await conn.getContact(sender);
                    userName = contact?.name || contact?.pushname || userNumber;
                } catch {
                    userName = userNumber;
                }
            }
            const mentionText = `@${userNumber}`;
            const mentions = [sender];
            // Display both name and mention
            const userDisplay = `${userName} (${mentionText})`;

            // ========== SCAN COMMANDS FOLDER ==========
            const cmdPath = path.join(__dirname, '../../commands');
            const allCategories = fs.readdirSync(cmdPath).filter(cat => 
                fs.statSync(path.join(cmdPath, cat)).isDirectory()
            );

            // Determine if this is a navigation call (via .nav command)
            let targetCategory = null;
            let targetPage = 0;
            if (args[0] === 'nav' && args[1] && args[2]) {
                targetCategory = args[1];
                targetPage = parseInt(args[2]) || 0;
            }

            const categories = targetCategory 
                ? [targetCategory] 
                : allCategories;

            const cards = [];
            const BUTTONS_PER_PAGE = 6; // Good medium size

            // Optional image header
            let imageMedia = null;
            if (config.menuImage) {
                try {
                    imageMedia = await prepareWAMessageMedia(
                        { image: { url: config.menuImage } },
                        { upload: conn.waUploadToServer }
                    );
                } catch (e) {
                    console.error("Menu image failed:", e);
                }
            }

            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                let files = fs.readdirSync(catPath)
                    .filter(f => f.endsWith('.js'))
                    .map(f => f.replace('.js', ''));

                if (files.length === 0) continue;

                // Pagination
                const pages = [];
                for (let i = 0; i < files.length; i += BUTTONS_PER_PAGE) {
                    pages.push(files.slice(i, i + BUTTONS_PER_PAGE));
                }

                // If target page is out of range, default to 0
                const startPage = targetCategory === cat ? targetPage : 0;

                pages.forEach((pageFiles, pageIndex) => {
                    // Only include the target page if navigation was requested
                    if (targetCategory === cat && pageIndex !== targetPage) return;

                    // Command buttons – clean, stylish
                    const buttons = pageFiles.map(cmd => ({
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: `▸ ${config.prefix}${cmd}`,
                            id: `${config.prefix}${cmd}`
                        })
                    }));

                    // Navigation buttons (only if multiple pages)
                    if (pages.length > 1) {
                        if (pageIndex > 0) {
                            buttons.push({
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "◀ Prev",
                                    id: `${config.prefix}nav ${cat} ${pageIndex - 1}`
                                })
                            });
                        }
                        if (pageIndex < pages.length - 1) {
                            buttons.push({
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "Next ▶",
                                    id: `${config.prefix}nav ${cat} ${pageIndex + 1}`
                                })
                            });
                        }
                    }

                    // Card header (image or title)
                    const cardHeader = imageMedia ? {
                        hasMediaAttachment: true,
                        imageMessage: imageMedia.imageMessage
                    } : {
                        hasMediaAttachment: false,
                        title: fancy(config.botName)
                    };

                    // Category title with page indicator (compact if single page)
                    const categoryTitle = pages.length > 1
                        ? `${cat.toUpperCase()} — ${pageIndex + 1}/${pages.length}`
                        : cat.toUpperCase();

                    // Card body – shows real username + mention
                    const cardBody = `╭━━━━━━━━━━━━━━╮
   ✦ ${categoryTitle}
╰━━━━━━━━━━━━━━╯
👤 ${userDisplay}
Select a command:`;

                    const card = {
                        body: { text: fancy(cardBody) },
                        footer: { text: fancy(`━━━━━━━━━━━━━━\n👑 Developer: ${config.developerName}`) },
                        header: cardHeader,
                        nativeFlowMessage: {
                            buttons: buttons
                        }
                    };
                    cards.push(card);
                });
            }

            // Main dashboard header (clean, centered)
            const mainHeader = `╭━━━━━━━━━━━━━━╮
   👁 INSIDIOUS V2.1.1
╰━━━━━━━━━━━━━━╯`;

            const interactiveMessage = {
                body: { text: fancy(mainHeader + `\n\n⏱️ Uptime: ${runtime(process.uptime())}`) },
                footer: { text: fancy("◀ Swipe for more categories  ▶") },
                header: {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                carouselMessage: {
                    cards: cards
                }
            };

            const messageContent = { interactiveMessage };
            const waMessage = generateWAMessageFromContent(from, messageContent, {
                userJid: conn.user.id,
                upload: conn.waUploadToServer
            });
            await conn.relayMessage(from, waMessage.message, { messageId: waMessage.key.id, mentions });

        } catch (e) {
            console.error("Menu error:", e);
            // Fallback text menu with real username
            const userNumber = sender.split('@')[0];
            let userName = pushname || userNumber;
            if (!pushname) {
                try {
                    const contact = await conn.getContact(sender);
                    userName = contact?.name || contact?.pushname || userNumber;
                } catch {}
            }
            let text = `╭━━━━━━━━━━━━━━╮\n   *INSIDIOUS MENU*\n╰━━━━━━━━━━━━━━╯\n\n👤 ${userName} (@${userNumber})\n\n`;
            
            const cmdPath = path.join(__dirname, '../../commands');
            const categories = fs.readdirSync(cmdPath).filter(cat => 
                fs.statSync(path.join(cmdPath, cat)).isDirectory()
            );
            for (const cat of categories) {
                const catPath = path.join(cmdPath, cat);
                const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
                if (files.length) {
                    text += `✦ ${cat.toUpperCase()}\n`;
                    text += files.map(cmd => `${config.prefix}${cmd}`).join(' · ') + '\n\n';
                }
            }
            text += `━━━━━━━━━━━━━━\n👑 Developer: ${config.developerName}\n⏱️ Uptime: ${runtime(process.uptime())}`;
            await conn.sendMessage(from, { text: fancy(text), mentions: [sender] }, { quoted: msg });
        }
    }
};