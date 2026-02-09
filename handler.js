const fs = require('fs-extra');
const axios = require('axios');
const config = require('./config');
const { fancy, runtime } = require('./lib/tools');

module.exports = async (conn, m) => {
    try {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : '';
        const isOwner = sender.includes(config.ownerNumber) || msg.key.fromMe;

        // 1. BROAD ANTI-LINK (Kicks for all link types)
        const linkRegex = /(https?:\/\/|www\.|t\.me|bit\.ly|wa\.me|\.com|\.net|\.org|\.me)/gi;
        if (from.endsWith('@g.us') && linkRegex.test(body) && !isOwner) {
            await conn.sendMessage(from, { delete: msg.key });
            await conn.groupParticipantsUpdate(from, [sender], "remove");
            return;
        }

        // 11. LANGUAGE MIRROR AI (Automatic Reply in same language)
        if (!body.startsWith(config.prefix) && !msg.key.fromMe && !from.endsWith('@g.us')) {
            const aiPrompt = `Your name is INSIDIOUS V2. Reply in the EXACT same language as the user. If they use Swahili, use Swahili. Message: ${body}`;
            const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(aiPrompt)}`);
            return conn.sendMessage(from, { 
                text: fancy(res.data), 
                contextInfo: { isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: config.botName } } 
            }, { quoted: msg });
        }

        const isCmd = body.startsWith(config.prefix);
        const command = isCmd ? body.slice(config.prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);

        if (isCmd) {
            // DYNAMIC MENU LOADER
            if (command === "menu") {
                const categories = fs.readdirSync('./commands');
                let total = 0;
                categories.forEach(c => total += fs.readdirSync(`./commands/${c}`).length);

                let menu = `╭── • 🥀 • ──╮\n  ${fancy(config.botName)}\n╰── • 🥀 • ──╯\n\n`;
                menu += `│ ◦ ${fancy("ᴜᴘᴛɪᴍᴇ")}: ${runtime(process.uptime())}\n│ ◦ ${fancy("ᴍᴏᴅᴇ")}: ${config.workMode.toUpperCase()}\n│ ◦ ${fancy("ᴄᴍᴅꜱ")}: ${total}\n\n`;
                
                categories.forEach(cat => {
                    const files = fs.readdirSync(`./commands/${cat}`).map(f => f.replace('.js', ''));
                    menu += `🥀 *${fancy(cat.toUpperCase())}*\n│ ◦ ${files.join(', ')}\n\n`;
                });

                return conn.sendMessage(from, { 
                    text: menu + `└──────────────\n${fancy(config.footer)}`,
                    contextInfo: { isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid, newsletterName: config.botName } }
                }, { quoted: msg });
            }

            // LOAD COMMANDS FROM SUBFOLDERS
            const categories = fs.readdirSync('./commands');
            for (const cat of categories) {
                const path = `./commands/${cat}/${command}.js`;
                if (fs.existsSync(path)) {
                    return require(path).execute(conn, msg, args, { from, sender, fancy, isOwner });
                }
            }
        }
    } catch (e) { console.log(e); }
};
