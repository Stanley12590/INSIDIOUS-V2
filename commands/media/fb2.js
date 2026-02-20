const axios = require('axios');

module.exports = {
    name: "fb2",
    aliases: ["fbc2", "fbdlv2"],
    description: "Download Facebook video (v2 - alternative)",
    usage: ".fb2 <video_url>",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide a Facebook video URL.\nExample: .fb2 https://www.facebook.com/watch?v=123456789");
            
            const url = encodeURIComponent(args[0]);
            await reply("⏳ Downloading Facebook video (v2)...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/downloader/fbdlv2?url=${url}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Failed to download. API returned error.");
            }
            
            const data = response.data;
            const videoUrl = data.videoUrl || data.downloadUrl || (data.medias && data.medias[0]?.url);
            
            if (!videoUrl) {
                return reply("❌ No video URL found in response.");
            }
            
            await conn.sendMessage(from, {
                video: { url: videoUrl },
                caption: "✅ Facebook video downloaded (v2)",
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
            console.error('[FACEBOOK2] Error:', error);
            reply("❌ Facebook download failed. Try the v1 command: .fb <url>");
        }
    }
};