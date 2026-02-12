module.exports = {
    name: "unpair",
    ownerOnly: true,
    description: "Remove a co‑owner from the bot",
    usage: "[phone number]",
    
    execute: async (conn, msg, args, { from, isOwner, reply, config, unpairNumber, getPairedNumbers }) => {
        if (!isOwner) return reply("❌ This command is for owner only!");
        if (!args[0]) return reply(`🗑️ Usage: ${config.prefix}unpair <number>\nExample: ${config.prefix}unpair 255712345678`);

        const number = args[0].replace(/[^0-9]/g, '');
        if (number.length < 10) return reply("❌ Invalid phone number!");
        if (config.ownerNumber.includes(number)) return reply("❌ Cannot unpair deployer's number!");

        const success = await unpairNumber(number);
        if (success) {
            const co = getPairedNumbers().filter(n => !config.ownerNumber.includes(n)).length;
            reply(`✅ Number ${number} removed from co‑owners.\n👥 Remaining: ${co}/${config.maxCoOwners}`);
        } else {
            reply(`❌ Number ${number} not found in paired list.`);
        }
    }
};