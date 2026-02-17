const handler = require('../../handler');

module.exports = {
    name: "groupsettings",
    aliases: ["gsettings", "groupconfig"],
    adminOnly: true,
    description: "View or change settings for this specific group",
    usage: "[feature] [on/off]",
    
    execute: async (conn, msg, args, { from, fancy, isOwner, isGroupAdmin, reply }) => {
        if (!from.endsWith('@g.us')) {
            return reply("❌ This command only works in groups.");
        }
        
        if (!isOwner && !isGroupAdmin) {
            return reply("❌ Only group admins can change group settings.");
        }

        const groupJid = from;
        
        if (args.length === 0) {
            const features = [
                'antilink', 'antiporn', 'antiscam', 'antimedia', 
                'antitag', 'sleepingmode', 'antispam', 'chatbot'
            ];
            
            let text = `╔════════════════════╗\n`;
            text += `║   *GROUP SETTINGS*   ║\n`;
            text += `╚════════════════════╝\n\n`;
            
            for (const feat of features) {
                const value = handler.getGroupSetting(groupJid, feat);
                text += `▸ ${feat} : ${value ? '✅ ON' : '❌ OFF'}\n`;
            }
            
            text += `\nUsage: .gsettings <feature> on/off\n`;
            text += `Example: .gsettings antilink on`;
            
            return reply(fancy(text));
        }

        const feature = args[0].toLowerCase();
        const action = args[1]?.toLowerCase();

        const validFeatures = [
            'antilink', 'antiporn', 'antiscam', 'antimedia', 
            'antitag', 'sleepingmode', 'antispam', 'chatbot'
        ];
        
        if (!validFeatures.includes(feature)) {
            return reply(`❌ Invalid feature. Valid: ${validFeatures.join(', ')}`);
        }

        if (!action || !['on', 'off'].includes(action)) {
            return reply(`❌ Please specify on or off.`);
        }

        const newValue = action === 'on';
        await handler.setGroupSetting(groupJid, feature, newValue);

        reply(fancy(`✅ *Group setting updated!*\n\n📌 Feature: ${feature}\n📊 Status: ${action.toUpperCase()}\n\n_This affects ONLY this group._`));
    }
};