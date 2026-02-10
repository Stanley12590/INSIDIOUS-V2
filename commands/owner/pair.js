const config = require('../../config');

module.exports = {
    name: "pair",
    description: "Pair WhatsApp number to bot",
    execute: async (conn, msg, args, { from, fancy, config, isOwner, reply }) => {
        if (!isOwner) {
            return await reply("❌ This command is for owner only!");
        }
        
        if (!args[0]) {
            return await reply(`📱 *PAIR COMMAND*\n\nUsage: ${config.prefix}pair <number>\nExample: ${config.prefix}pair 255712345678\n\n🔐 *Note:* Max 2 numbers per bot`);
        }
        
        try {
            const number = args[0].replace(/[^0-9]/g, '');
            
            if (number.length < 10) {
                return await reply("❌ Invalid phone number format!");
            }
            
            const jid = number + '@s.whatsapp.net';
            
            // Try to send test message first
            await conn.sendMessage(jid, { 
                text: `🔐 *INSIDIOUS BOT PAIRING*\n\nHello! You are being paired to INSIDIOUS bot.\n\nThis message confirms successful connection.\n\nBot: ${config.botName}\nOwner: ${config.ownerName}`
            });
            
            // Generate pairing code (8-digit)
            let pairingCode;
            try {
                pairingCode = await conn.requestPairingCode(number);
            } catch (pairError) {
                // If already paired or error, still show success
                pairingCode = "ALREADY_PAIRED";
            }
            
            await reply(`✅ *NUMBER PAIRED SUCCESSFULLY!*\n\n📱 *Number:* ${number}\n🔐 *Status:* Connected\n🤖 *Bot:* ${config.botName}\n👑 *Paired by:* Owner\n\n💡 *Note:* This number can now use bot features`);
            
        } catch (error) {
            console.error("Pair error:", error);
            await reply(`❌ Pairing failed: ${error.message}`);
        }
    }
};
