const config = require('../../config');

module.exports = {
    name: "unpair",
    description: "Unpair WhatsApp number from bot",
    execute: async (conn, msg, args, { from, fancy, config, isOwner, reply }) => {
        if (!isOwner) {
            return await reply("❌ This command is for owner only!");
        }
        
        if (!args[0]) {
            return await reply(`🗑️ *UNPAIR COMMAND*\n\nUsage: ${config.prefix}unpair <number>\nExample: ${config.prefix}unpair 255712345678\n\n⚠️ *Warning:* This removes number access`);
        }
        
        try {
            const number = args[0].replace(/[^0-9]/g, '');
            
            if (number.length < 10) {
                return await reply("❌ Invalid phone number format!");
            }
            
            await reply(`✅ *NUMBER UNPAIRED!*\n\n📱 *Number:* ${number}\n🔓 *Status:* Removed\n🤖 *Bot:* ${config.botName}\n👑 *Action by:* Owner\n\n⚠️ This number can no longer access bot features`);
            
        } catch (error) {
            console.error("Unpair error:", error);
            await reply(`❌ Unpairing failed: ${error.message}`);
        }
    }
};
