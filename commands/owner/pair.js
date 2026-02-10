const config = require('../../config');

module.exports = {
    name: "pair",
    execute: async (conn, msg, args, { from, fancy, config, isOwner, reply }) => {
        if (!isOwner) {
            return await msg.reply("❌ This command is for owner only!");
        }
        
        if (args.length < 2) {
            return await msg.reply(`🔐 Usage: ${config.prefix}pair <BOT_ID> <number>\nExample: ${config.prefix}pair INSABCD12 255712345678`);
        }
        
        const botId = args[0];
        const number = args[1].replace(/[^0-9]/g, '');
        
        if (number.length < 10) {
            return await msg.reply("❌ Invalid phone number!");
        }
        
        // You can implement your pairing logic here
        // For now, just show example
        await msg.reply(`📱 Pairing Info:
        
🔐 BOT ID: ${botId}
📞 Number: ${number}

🌐 Web Pairing:
https://stany-min-bot.onrender.com/pair?num=${number}&bot_id=${botId}

⚠️ Maximum: 2 numbers per BOT ID
👑 Only deployer can manage pairs`);
    }
};
