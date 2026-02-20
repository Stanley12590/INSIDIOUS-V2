const axios = require('axios');

module.exports = {
    name: "movie",
    aliases: ["moviedl", "film"],
    description: "Download movie details",
    usage: ".movie <movie_id>",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide a movie ID.\nExample: .movie 8906247916759695608");
            
            const movieId = args[0];
            await reply("⏳ Fetching movie details...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/downloader/Moviedl?id=${movieId}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Failed to fetch movie details. API error.");
            }
            
            const movie = response.data;
            
            // Send movie info (customize based on actual API response)
            await conn.sendMessage(from, {
                text: fancy(`🎬 *Movie Details*\n\n${JSON.stringify(movie, null, 2)}`),
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
            console.error('[MOVIE] Error:', error);
            reply("❌ Movie download failed. The API might be temporarily unavailable.");
        }
    }
};