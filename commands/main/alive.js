const config = require('../../config');
const { fancy, runtime } = require('../../lib/tools');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

module.exports = {
    name: "status",
    aliases: ["ping", "alive", "runtime"],
    description: "Show bot status with sliding cards and music",
    
    execute: async (conn, msg, args, { from, sender, pushname }) => {
        try {
            // Get user's original WhatsApp name
            let userName = pushname;
            if (!userName) {
                try {
                    const contact = await conn.getContact(sender);
                    userName = contact?.name || contact?.pushname || sender.split('@')[0];
                } catch {
                    userName = sender.split('@')[0];
                }
            }

            // Prepare audio media (same audio for all cards)
            const audioUrl = config.menuAudio || 'https://eliteprotech-url.zone.id/1771163123472g2ktsd.mp3'; // fallback
            let audioMedia;
            try {
                audioMedia = await prepareWAMessageMedia(
                    { audio: { url: audioUrl }, mimetype: 'audio/mpeg' },
                    { upload: conn.waUploadToServer }
                );
            } catch (e) {
                console.error('Failed to load audio:', e);
                audioMedia = null;
            }

            // Calculate ping
            const messageTimestamp = msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now();
            const ping = Date.now() - messageTimestamp;

            // Uptime
            const uptime = runtime(process.uptime());

            // Create cards
            const cards = [];

            // Card 1: Ping
            cards.push({
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   🏓 *PING*\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `📶 Response Time: *${ping}ms*\n\n` +
                    `🤖 Bot is responsive.`
                ) },
                footer: { text: fancy(config.footer) },
                header: audioMedia ? {
                    hasMediaAttachment: true,
                    audioMessage: audioMedia.audioMessage
                } : {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔄 Refresh",
                            id: `${config.prefix}status`
                        })
                    }]
                }
            });

            // Card 2: Alive
            cards.push({
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   🤖 *ALIVE*\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `✨ Bot Name: ${config.botName}\n` +
                    `👑 Developer: ${config.developerName}\n` +
                    `📦 Version: ${config.version}\n\n` +
                    `✅ I'm alive and ready!`
                ) },
                footer: { text: fancy(config.footer) },
                header: audioMedia ? {
                    hasMediaAttachment: true,
                    audioMessage: audioMedia.audioMessage
                } : {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔄 Refresh",
                            id: `${config.prefix}status`
                        })
                    }]
                }
            });

            // Card 3: Runtime
            cards.push({
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   ⏱️ *RUNTIME*\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `🕐 Uptime: *${uptime}*\n\n` +
                    `Bot has been running for ${uptime}.`
                ) },
                footer: { text: fancy(config.footer) },
                header: audioMedia ? {
                    hasMediaAttachment: true,
                    audioMessage: audioMedia.audioMessage
                } : {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔄 Refresh",
                            id: `${config.prefix}status`
                        })
                    }]
                }
            });

            // Build interactive message
            const interactiveMessage = {
                body: { text: fancy(
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `   📊 *BOT STATUS DASHBOARD*\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `👋 Hello, *${userName}*!\n` +
                    `Swipe to view details.`
                ) },
                footer: { text: fancy("◀️ Slide left/right for more info ▶️") },
                header: {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                carouselMessage: {
                    cards: cards
                }
            };

            // Send as regular interactive message
            const messageContent = { interactiveMessage };
            const waMessage = generateWAMessageFromContent(from, messageContent, {
                userJid: conn.user.id,
                upload: conn.waUploadToServer
            });
            await conn.relayMessage(from, waMessage.message, { messageId: waMessage.key.id });

        } catch (e) {
            console.error("Status error:", e);
            // Fallback plain text
            const uptime = runtime(process.uptime());
            const text = `🏓 *PING:* Response time ...\n🤖 *ALIVE:* Bot is online\n⏱️ *RUNTIME:* ${uptime}`;
            await conn.sendMessage(from, { text: fancy(text) }, { quoted: msg });
        }
    }
};