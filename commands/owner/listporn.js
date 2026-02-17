const handler = require('../../handler');

module.exports = {
    name: "listporn",
    aliases: ["pornlist", "listpornkeywords"],
    ownerOnly: true,
    description: "List all porn keywords",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, reply }) => {
        if (!isOwner) return;

        const settings = await handler.loadGlobalSettings();
        let pornList = settings.pornKeywords || [];

        if (pornList.length === 0) {
            return reply("📭 No porn keywords found.");
        }

        let text = `╔════════════════════╗\n`;
        text += `║   *PORN KEYWORDS*   ║\n`;
        text += `╚════════════════════╝\n\n`;
        text += `Total: ${pornList.length}\n\n`;
        
        pornList.forEach((kw, i) => {
            text += `${i + 1}. ${kw}\n`;
        });

        reply(fancy(text));
    }
};