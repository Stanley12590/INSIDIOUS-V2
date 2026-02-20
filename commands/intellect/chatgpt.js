const axios = require('axios');

module.exports = {
    name: "chatgpt",
    aliases: ["ai", "gpt"],
    description: "Chat with ChatGPT (free model)",
    usage: ".ai <your question>",
    
    execute: async (conn, msg, args, { from, fancy, reply, pushname }) => {
        try {
            if (!args.length) return reply("❌ Please ask a question.\nExample: .ai Hello, how are you?");
            
            const prompt = encodeURIComponent(args.join(' '));
            await reply("⏳ Thinking...");
            
            const apiUrl = `https://ef-prime-md-ultra-apis.vercel.app/ai/chatgptfree?prompt=${prompt}&model=chatgpt4`;
            const response = await axios.get(apiUrl, { timeout: 30000 });
            
            if (response.status !== 200 || !response.data) {
                return reply("❌ AI service error.");
            }
            
            const answer = response.data.reply || response.data.answer || response.data.response || JSON.stringify(response.data);
            
            await conn.sendMessage(from, {
                text: fancy(`💬 *ChatGPT Reply*\n\n${answer}`),
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
            console.error('[CHATGPT] Error:', error);
            reply("❌ ChatGPT failed. Try again later.");
        }
    }
};