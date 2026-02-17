const handler = require('../../handler');

module.exports = {
    name: "addpaired",
    aliases: ["addowner"],
    ownerOnly: true,
    description: "Manually add a phone number to paired owners list",
    usage: "<phone_number>",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const number = args[0]?.replace(/[^0-9]/g, '');
        if (!number) return reply("❌ Please provide a phone number.");

        const success = await handler.pairNumber(number);
        if (success) {
            reply(`✅ ${number} has been added as a co-owner.`);
        } else {
            reply(`❌ Failed to add ${number}. It may already be paired or limit reached.`);
        }
    }
};