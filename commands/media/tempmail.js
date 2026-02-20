const axios = require('axios');

module.exports = {
    name: "tempmail",
    aliases: ["tmpmail", "genmail"],
    description: "Generate a temporary email address",
    usage: ".tempmail",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            await reply("⏳ Generating temporary email...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/tempmail/gen`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Failed to generate email. API error.");
            }
            
            const data = response.data;
            const email = data.email || data.address || (data.data && data.data.email);
            
            if (!email) {
                return reply("❌ No email address in response.");
            }
            
            let token = data.token || (data.data && data.data.token);
            let tokenMsg = token ? `\nToken: ${token}` : '';
            
            await conn.sendMessage(from, {
                text: fancy(`📧 *Temporary Email Generated*\n\nEmail: ${email}${tokenMsg}\n\nUse .tmpinbox <token> to check inbox.`),
                contextInfo: {
                    isForwarded: true,
                    forwardingScore: 999,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363404317544295@newsletter",
                        newsletterName: "INSIDIOUS BOT",
                        serverMessageId: 100
                    }
                }
            }, { quoted: msg });
            
        } catch (error) {
            console.error('[TEMPMAIL] Error:', error);
            reply("❌ Failed to generate temporary email.");
        }
    }
};