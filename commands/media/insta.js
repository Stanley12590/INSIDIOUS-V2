const axios = require('axios');

module.exports = {
    name: "insta",
    aliases: ["ig", "igdl"],
    description: "Download Instagram video/reel",
    usage: ".ig <post_url>",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide an Instagram URL.\nExample: .ig https://www.instagram.com/reel/ABC123/");
            
            const url = encodeURIComponent(args[0]);
            await reply("⏳ Downloading Instagram video...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/downloader/ig-dl?url=${url}`;
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
                caption: "✅ Instagram video downloaded",
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
            console.error('[INSTAGRAM] Error:', error);
            reply("❌ Instagram download failed.");
        }
    }
};