const axios = require('axios');

module.exports = {
    name: "tiktok",
    description: "Download TikTok video (no watermark)",
    usage: "[URL]",
    execute: async (conn, msg, args, { reply, fancy }) => {
        const url = args[0];
        if (!url) return reply("❌ Please provide a TikTok URL.");

        try {
            const api = `https://api.tikmate.cc/?url=${encodeURIComponent(url)}`;
            const res = await axios.get(api);
            const videoUrl = `https://tikmate.cc/download/${res.data.token}/${res.data.id}.mp4`;
            const videoBuffer = await axios.get(videoUrl, { responseType: 'arraybuffer' });

            await conn.sendMessage(msg.key.remoteJid, {
                video: Buffer.from(videoBuffer.data),
                caption: fancy("✅ TikTok video downloaded")
            }, { quoted: msg });
        } catch {
            reply("❌ Download failed.");
        }
    }
};