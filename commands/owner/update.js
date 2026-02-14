const { exec } = require('child_process');

module.exports = {
    name: "update",
    aliases: ["pull"],
    ownerOnly: true,
    description: "Pull latest updates from GitHub",
    usage: "",
    execute: async (conn, msg, args, { from, reply, fancy }) => {
        try {
            await reply("🔄 Pulling updates...");
            
            exec('git pull', (error, stdout, stderr) => {
                if (error) {
                    return reply(`❌ Update failed:\n${error.message}`);
                }
                if (stderr) {
                    console.error(stderr);
                }
                const output = stdout.trim();
                if (output.includes('Already up to date.')) {
                    reply("✅ Bot is already up to date.");
                } else {
                    reply(`✅ Update successful:\n${output}`);
                }
            });
        } catch (e) {
            reply(`❌ Error: ${e.message}`);
        }
    }
};