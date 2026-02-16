module.exports = {
    name: "playaudio",
    execute: async (conn, msg, args, { from, fancy, config, reply }) => {
        const category = args[0] || 'menu';
        const audioUrl = config.categoryAudio?.[category] || config.menuAudio;
        
        if (!audioUrl) {
            return reply(fancy("❌ Hakuna sauti iliyopangwa."));
        }
        
        await conn.sendMessage(from, { 
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: msg });
        
        reply(fancy(`🎵 *${category.toUpperCase()} Theme* - Inacheza...`));
    }
};