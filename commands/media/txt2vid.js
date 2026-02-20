const axios = require('axios');

module.exports = {
    name: "txt2vid",
    aliases: ["text2video", "generatevideo"],
    description: "Generate video from text",
    usage: ".txt2vid <prompt>",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide a prompt.\nExample: .txt2vid A cat playing with a ball");
            
            const prompt = encodeURIComponent(args.join(' '));
            await reply("⏳ Generating video (this may take a while)...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/ai/txt2vid?prompt=${prompt}`;
            const response = await axios.get(apiUrl, { timeout: 120000, responseType: 'arraybuffer' });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Video generation failed.");
            }
            
            await conn.sendMessage(from, {
                video: Buffer.from(response.data),
                caption: "✅ AI generated video",
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
            console.error('[TXT2VID] Error:', error);
            reply("❌ Video generation failed. Try a simpler prompt.");
        }
    }
};