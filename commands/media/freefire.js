const axios = require('axios');

module.exports = {
    name: "freefire",
    aliases: ["ff", "ffstats"],
    description: "Get Free Fire player stats",
    usage: ".ff <uid> [server]",
    
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        try {
            if (!args.length) return reply("❌ Please provide a Free Fire UID.\nExample: .ff 1195968597 IND");
            
            const uid = args[0];
            const server = args[1] || 'IND';
            
            await reply("⏳ Fetching Free Fire stats...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/gaming/Freefire?uid=${uid}&server=${server}&gamemode=br&matchmode=RANKED&keyword=Hello&need_gallery_info=false&call_sign_src=7&fetch_type=all`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ Failed to fetch stats. API error.");
            }
            
            const stats = response.data;
            
            // Format stats nicely (customize based on actual response)
            let statsText = `🎮 *Free Fire Stats*\n\nUID: ${uid}\nServer: ${server}\n\n`;
            statsText += JSON.stringify(stats, null, 2);
            
            await conn.sendMessage(from, {
                text: fancy(statsText),
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
            console.error('[FREEFIRE] Error:', error);
            reply("❌ Failed to fetch Free Fire stats.");
        }
    }
};