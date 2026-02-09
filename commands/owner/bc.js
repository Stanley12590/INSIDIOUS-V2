module.exports = {
    name: "bc",
    execute: async (conn, msg, args, { from, fancy, isOwner }) => {
        if (!isOwner) return;
        if (!args[0]) return msg.reply(fancy("ᴇɴᴛᴇʀ ᴛᴇxᴛ ᴛᴏ ʙʀᴏᴀᴅᴄᴀꜱᴛ."));
        let groups = Object.keys(await conn.groupFetchAllParticipating());
        for (let jid of groups) {
            await conn.sendMessage(jid, { text: `🥀 *ɪɴꜱɪᴅɪᴏᴜꜱ ᴀɴɴᴏᴜɴᴄᴇᴍᴇɴᴛ*\n\n${args.join(' ')}` });
        }
        msg.reply(fancy("ʙʀᴏᴀᴅᴄᴀꜱᴛ ᴅᴇᴘʟᴏʏᴇᴅ."));
    }
};
