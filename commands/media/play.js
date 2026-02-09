const axios = require('axios');
const config = require('../../config');

module.exports = {
    name: "play",
    execute: async (conn, msg, args, { from, fancy }) => {
        if (!args[0]) return msg.reply("What song should I find?");
        
        try {
            msg.reply(fancy("🥀 Searching in the further..."));
            // 1. Search for video
            const search = await axios.get(`${config.darlynApi}ytsearch?query=${encodeURIComponent(args.join(' '))}`);
            const videoUrl = search.data.result[0].url;
            
            // 2. Get Download Link
            const download = await axios.get(`${config.darlynApi}ytmp3?url=${videoUrl}`);
            const mp3Url = download.data.result.url;
            
            await conn.sendMessage(from, { 
                audio: { url: mp3Url }, 
                mimetype: 'audio/mp4',
                fileName: args.join(' ') + '.mp3',
                contextInfo: { externalAdReply: { title: search.data.result[0].title, body: "ɪɴꜱɪᴅɪᴏᴜꜱ ᴍᴜꜱɪᴄ", mediaType: 1, thumbnailUrl: search.data.result[0].thumbnail } }
            }, { quoted: msg });
        } catch (e) { msg.reply("Could not retrieve music from the shadows."); }
    }
};
