module.exports = {
    name: "paired",
    ownerOnly: true,
    description: "Show all paired co‑owners",
    
    execute: async (conn, msg, args, { from, isOwner, reply, config, fancy, getPairedNumbers }) => {
        if (!isOwner) return reply("❌ This command is for owner only!");
        
        const all = getPairedNumbers();
        const co = all.filter(n => !config.ownerNumber.includes(n));
        const deployer = all.filter(n => config.ownerNumber.includes(n));
        
        let text = `📋 *PAIRED NUMBERS*\n\n`;
        text += `👑 *Deployer:*\n`;
        deployer.forEach((num, i) => text += `  ${i+1}. ${num}\n`);
        text += `\n🔐 *Co‑owners:*\n`;
        if (co.length === 0) text += `  None\n`;
        else co.forEach((num, i) => text += `  ${i+1}. ${num}\n`);
        text += `\n📊 Total co‑owners: ${co.length}/${config.maxCoOwners}`;
        
        await reply(fancy(text));
    }
};