const { makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');

module.exports = {
    name: "pair",
    aliases: ["getcode", "pairbot"],
    ownerOnly: true,
    description: "Generate WhatsApp pairing code directly (no web)",
    usage: ".pair <phone_number_with_country_code>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const phoneNumber = args[0]?.replace(/[^0-9]/g, '');
        if (!phoneNumber || phoneNumber.length < 10) {
            return reply("❌ Please provide a valid phone number with country code.\nExample: .pair 255712345678");
        }

        // Notify user that we're starting
        await reply("⏳ Generating pairing code... (please wait a few seconds)");

        try {
            // Use a temporary folder for this session (so it doesn't interfere with main bot)
            const tempAuthDir = path.join(__dirname, '../../temp_pair_session');
            await fs.ensureDir(tempAuthDir);

            const { state, saveCreds } = await useMultiFileAuthState(tempAuthDir);
            const { version } = await fetchLatestBaileysVersion();

            // Create a new socket just for pairing
            const pairingConn = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Safari'),
                syncFullHistory: false,
                connectTimeoutMs: 60000,
                generateHighQualityLink: true,
                getMessage: async () => null
            });

            // Wait for the pairing code
            let pairingCode = null;
            let error = null;

            // Use a promise to wait for the code
            const codePromise = new Promise((resolve, reject) => {
                // Listen for connection updates
                pairingConn.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    if (qr) {
                        reject(new Error('QR code received, but we need pairing code'));
                    }
                    if (connection === 'close') {
                        reject(new Error('Connection closed before receiving code'));
                    }
                });

                // Request the pairing code after a short delay
                setTimeout(async () => {
                    try {
                        const code = await pairingConn.requestPairingCode(phoneNumber);
                        resolve(code);
                    } catch (err) {
                        reject(err);
                    }
                }, 2000); // Wait 2 seconds for the socket to initialize
            });

            // Set a timeout of 30 seconds
            pairingCode = await Promise.race([
                codePromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
            ]);

            // Close the temporary socket and clean up the folder
            pairingConn.ws.close();
            await fs.remove(tempAuthDir);

            // Send the code to the user
            const message = `
╭─── • 🥀 • ───╮
   *PAIRING CODE*
╰─── • 🥀 • ───╯

📱 *Number:* ${phoneNumber}
🔑 *Code:* \`${pairingCode}\`
⏱️ *Expires in:* 60 seconds

📋 *HOW TO PAIR:*
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Select "Link with Phone Number"
5. Enter this 8-digit code
6. Wait for connection

_Code expires after 60 seconds._
`;

            await conn.sendMessage(from, {
                text: fancy(message),
                contextInfo: {
                    isForwarded: true,
                    forwardingScore: 999,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363404317544295@newsletter",
                        newsletterName: "INSIDIOUS BOT"
                    }
                }
            }, { quoted: msg });

        } catch (err) {
            console.error("Pairing error:", err);
            reply(`❌ Failed to get code: ${err.message}`);
        }
    }
};
