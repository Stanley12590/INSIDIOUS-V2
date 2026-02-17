const handler = require('../../handler');
const axios = require('axios');

module.exports = {
    name: "pair",
    aliases: ["getcode", "pairbot"],
    ownerOnly: true,
    description: "Generate WhatsApp pairing code for a bot number (requires external API)",
    usage: "<phone_number_with_country_code>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const phoneNumber = args[0]?.replace(/[^0-9]/g, '');
        if (!phoneNumber || phoneNumber.length < 10) {
            return reply("❌ Please provide a valid phone number with country code.\nExample: .pair 255712345678");
        }

        await reply("⏳ Generating pairing code... (this may take a few seconds)");

        try {
            // Replace with your actual backend API URL
            const API_URL = 'https://stany-min-bot.onrender.com/api/pair';
            
            const response = await axios.post(API_URL, {
                phoneNumber: phoneNumber
            }, { timeout: 60000 });

            if (!response.data.success) {
                throw new Error(response.data.error || 'Unknown error');
            }

            const { code, expiresIn, instructions } = response.data;

            const pairText = `╭─── • 🥀 • ───╮\n` +
                `   🤖 *PAIRING CODE*   \n` +
                `╰─── • 🥀 • ───╯\n\n` +
                `📱 *Number:* ${phoneNumber}\n` +
                `🔑 *Code:* \`${code}\`\n` +
                `⏱️ *Expires:* ${expiresIn} seconds\n\n` +
                `*📋 HOW TO PAIR:*\n${instructions.map(i => `• ${i}`).join('\n')}\n\n` +
                `_Click the button below to copy the code._`;

            // Send with copy button
            const buttonMessage = {
                text: fancy(pairText),
                buttons: [
                    {
                        buttonId: `copy_${code}`,
                        buttonText: { displayText: '📋 COPY CODE' },
                        type: 1
                    }
                ],
                headerType: 1
            };

            await conn.sendMessage(from, buttonMessage, { quoted: msg });

        } catch (error) {
            console.error('Pairing error:', error);
            reply(`❌ Failed to generate code: ${error.message}\n\nMake sure your backend API is running.`);
        }
    }
};