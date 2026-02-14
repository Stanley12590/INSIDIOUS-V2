module.exports = {
    name: "pair",
    ownerOnly: true,
    description: "Generate 8-digit pairing code for a WhatsApp number",
    usage: "[phone number]",
    
    execute: async (conn, msg, args, { from, isOwner, reply, config, fancy, canPairNumber, pairNumber, getPairedNumbers }) => {
        if (!isOwner) return reply("❌ This command is for owner only!");
        if (!args[0]) return reply(`🔐 Usage: ${config.prefix}pair <number>\nExample: ${config.prefix}pair 255712345678`);

        const number = args[0].replace(/[^0-9]/g, '');
        if (number.length < 10) return reply("❌ Invalid phone number!");

        if (!canPairNumber(number)) {
            const current = getPairedNumbers().filter(n => !config.ownerNumber.includes(n)).length;
            return reply(`❌ Cannot pair – limit reached (${current}/${config.maxCoOwners}) or already paired.`);
        }

        try {
            const code = await conn.requestPairingCode(number);
            await pairNumber(number);
            const co = getPairedNumbers().filter(n => !config.ownerNumber.includes(n)).length;
            await reply(fancy(`✅ *PAIRING CODE GENERATED*\n\n📱 Number: ${number}\n🔐 Code: ${code}\n👥 Co‑owners: ${co}/${config.maxCoOwners}`));
        } catch (e) {
            reply(`❌ Pairing failed: ${e.message}`);
        }
    }
};