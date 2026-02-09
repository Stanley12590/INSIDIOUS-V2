const config = require('./config');
const { fancy } = require('./lib/font');

module.exports = async (conn, m) => {
    try {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "");
        const isOwner = sender.includes(config.ownerNumber) || msg.key.fromMe;
        const isGroup = from.endsWith('@g.us');

        // 1. ANTI-LINK (Kills everything)
        if (isGroup && !isOwner && body.match(/https?:\/\//gi)) {
            await conn.sendMessage(from, { delete: msg.key });
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            return;
        }

        // 2. ANTI-PORN (Keyword based - High Security)
        if (isGroup && !isOwner && config.pornWords.some(word => body.toLowerCase().includes(word))) {
            await conn.sendMessage(from, { delete: msg.key });
            await conn.sendMessage(from, { text: fancy(`🚫 @${sender.split('@')[0]} Pornography is forbidden!`), mentions: [sender] });
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            return;
        }

        // 2. ANTI-SCAM
        if (isGroup && !isOwner && config.scamWords.some(word => body.toLowerCase().includes(word))) {
            await conn.sendMessage(from, { delete: msg.key });
            await conn.sendMessage(from, { text: fancy(`⚠️ SCAM ALERT! @${sender.split('@')[0]} is a potential scammer.`), mentions: [sender] });
            // Tag all members logic could be added here
        }

        // 3. ANTI-MEDIA (If turned on)
        if (isGroup && !isOwner && (msg.message.imageMessage || msg.message.videoMessage || msg.message.stickerMessage)) {
            // If antimedia is on, delete it
            await conn.sendMessage(from, { delete: msg.key });
        }

        // LOAD COMMANDS (Dynamic)
        if (body.startsWith(config.prefix)) {
            const command = body.slice(config.prefix.length).trim().split(' ')[0].toLowerCase();
            const args = body.trim().split(/ +/).slice(1);
            
            const fs = require('fs-extra');
            const categories = fs.readdirSync('./commands');
            for (const cat of categories) {
                const path = `./commands/${cat}/${command}.js`;
                if (fs.existsSync(path)) {
                    return require(path).execute(conn, msg, args, { from, sender, fancy, isOwner });
                }
            }
        }
    } catch (e) { console.error(e); }
};
