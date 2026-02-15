const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy } = require('../../lib/tools');

module.exports = {
    name: "pair",
    ownerOnly: true,
    description: "Generate an 8-digit pairing code",
    usage: "[phone number]",
    execute: async (conn, msg, args, { from, reply }) => {
        let num = args[0]?.replace(/[^0-9]/g, '');

        if (!num || num.length < 10) {
            return reply(fancy("🥀 Please provide a valid number: .pair 2557xxxxxxxx"));
        }

        const waitMsg = await reply(fancy("🥀 Generating pairing code..."));

        const sessionId = crypto.randomBytes(8).toString('hex');
        const sessionPath = path.join(__dirname, `../../temp_pair_${sessionId}`);

        try {
            const { state } = await useMultiFileAuthState(sessionPath);
            const tempConn = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Safari")
            });

            // Wait for connection to open
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Connection timeout")), 30000);
                tempConn.ev.once('connection.update', ({ connection }) => {
                    if (connection === 'open') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });

            // Small extra delay to ensure socket is ready
            await new Promise(r => setTimeout(r, 2000));

            const code = await tempConn.requestPairingCode(num);
            const cleanCode = code.replace(/-/g, ''); // Remove dashes for cleaner ID

            // Build interactive message with copy button
            const interactiveMsg = {
                body: {
                    text: fancy(
                        `╭── • 🥀 • ──╮\n` +
                        `   ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ\n` +
                        `╰── • 🥀 • ──╯\n\n` +
                        `📱 Number: *${num}*\n` +
                        `🔑 Code: *${code}*\n\n` +
                        `🥀 *Instructions:*\n` +
                        `1. Tap the button below.\n` +
                        `2. Copy the code sent by bot.\n` +
                        `3. Link it to your WhatsApp.`
                    )
                },
                footer: { text: fancy(config.footer) },
                header: {
                    title: fancy(config.botName),
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📋 Copy Code",
                            id: `${config.prefix}copycode ${cleanCode}` // Valid command
                        })
                    }]
                }
            };

            const messageContent = { interactiveMessage: interactiveMsg };
            const waMessage = generateWAMessageFromContent(from, messageContent, {
                userJid: conn.user.id,
                upload: conn.waUploadToServer
            });

            await conn.relayMessage(from, waMessage.message, { messageId: waMessage.key.id });

            // Clean up temporary connection and session folder after 15 seconds
            setTimeout(async () => {
                tempConn.end();
                await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => {});
            }, 15000);

        } catch (error) {
            console.error("Pairing error:", error);
            reply("🥀 Failed to generate pairing code.");
            await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => {});
        }
    }
};