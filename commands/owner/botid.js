const config = require('../../config');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "botid",
    description: "Get bot unique ID",
    execute: async (conn, msg, args, { from, fancy, config, isOwner, reply }) => {
        if (!isOwner) {
            return await reply("❌ This command is for owner only!");
        }
        
        try {
            // Generate or read bot ID
            const botIdFile = path.join(__dirname, '../../.botid');
            let botId;
            
            if (fs.existsSync(botIdFile)) {
                botId = fs.readFileSync(botIdFile, 'utf8').trim();
            } else {
                // Generate new bot ID
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                botId = 'INS';
                for (let i = 0; i < 5; i++) {
                    botId += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                fs.writeFileSync(botIdFile, botId);
            }
            
            const message = `🔐 *INSIDIOUS BOT ID*\n\n` +
                          `*Bot ID:* ${botId}\n` +
                          `*Bot Name:* ${config.botName}\n` +
                          `*Owner:* ${config.ownerName}\n` +
                          `*Prefix:* ${config.prefix}\n\n` +
                          `⚡ *Features:*\n` +
                          `✅ Anti Features\n` +
                          `✅ AI Chatbot\n` +
                          `✅ Auto Commands\n` +
                          `✅ Database\n\n` +
                          `🔒 *Security:*\n` +
                          `• Unique ID per bot\n` +
                          `• Owner controls only\n` +
                          `• Limited access\n\n` +
                          `💡 Share this ID for support`;
            
            await reply(message);
            
        } catch (error) {
            console.error("Bot ID error:", error);
            await reply(`❌ Failed to get bot ID: ${error.message}`);
        }
    }
};
