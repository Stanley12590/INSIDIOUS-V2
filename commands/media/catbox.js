const axios = require('axios');

module.exports = {
    name: "catbox",
    aliases: ["upload", "catboxupload"],
    description: "Upload image to Catbox",
    usage: ".catbox <image_url>",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide an image URL.\nExample: .catbox https://example.com/image.jpg");
            
            const imageUrl = encodeURIComponent(args[0]);
            await reply("⏳ Uploading to Catbox...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/tools/catbox?image=${imageUrl}&type=url`;
            const response = await axios.get(apiUrl, { timeout: 30000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Upload failed. API error.");
            }
            
            const result = response.data;
            const uploadedUrl = result.url || result.link || result.fileUrl;
            
            if (!uploadedUrl) {
                return reply("❌ No URL in response.");
            }
            
            await conn.sendMessage(from, {
                text: fancy(`✅ *Image uploaded to Catbox*\n\nURL: ${uploadedUrl}`),
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
            console.error('[CATBOX] Error:', error);
            reply("❌ Upload failed.");
        }
    }
};