const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const { fancy } = require("./lib/font");
const config = require("./config");
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * INSIDIOUS: THE LAST KEY V2.1.1
 * ENTRY POINT & CONNECTION ENGINE
 */

// 1. DATABASE CONNECTION (Always Online Logic)
mongoose.connect(config.mongodb, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log(fancy("🥀 database connected: insidious is eternal.")))
    .catch(err => console.error("DB Connection Error:", err));

// 2. WEB PAIRING DASHBOARD (Feature 27)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // Hakikisha unayo folder la public na index.html uliyopewa mwanzo
});

async function startInsidious() {
    // 27. SESSION MANAGEMENT (MongoDB Based)
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"), // 27. Browsers for pairing
        syncFullHistory: true
    });

    // PAIRING CODE ENDPOINT
    app.get('/pair', async (req, res) => {
        let num = req.query.num;
        if (!num) return res.json({ error: "Provide a number!" });
        if (!conn.authState.creds.registered) {
            try {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const code = await conn.requestPairingCode(num.replace(/[^0-9]/g, ''));
                res.json({ code: code });
            } catch (err) {
                res.json({ error: "Pairing failed. Try again." });
            }
        } else {
            res.json({ error: "Already registered!" });
        }
    });

    conn.ev.on('creds.update', saveCreds);

    // 12. AUTO STATUS & 13. AUTO READ
    conn.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // Auto Status logic
        if (msg.key.remoteJid === 'status@broadcast' && config.autoStatus.view) {
            await conn.readMessages([msg.key]);
            if (config.autoStatus.like) {
                await conn.sendMessage('status@broadcast', { react: { text: config.autoStatus.emoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
            if (config.autoStatus.reply) {
                const aiResponse = await axios.get(`${config.aiModel}Humanly reply to this WhatsApp status: "${msg.message.conversation || 'Cool content'}"`);
                await conn.sendMessage(msg.key.participant, { text: fancy(aiResponse.data) }, { quoted: msg });
            }
        }

        // Pass to Master Handler
        require('./handler')(conn, m);
    });

    // 8. WELCOME & GOODBYE (Group Events)
    conn.ev.on('group-participants.update', async (anu) => {
        try {
            const metadata = await conn.groupMetadata(anu.id);
            const participants = anu.participants;
            for (let num of participants) {
                let pp = await conn.profilePictureUrl(num, 'image').catch(() => config.menuImage);
                let quote = await axios.get('https://api.quotable.io/random').then(res => res.data.content).catch(() => "Welcome to the Further.");

                if (anu.action == 'add') {
                    let welcome = `╭── • 🥀 • ──╮\n  ${fancy("ɴᴇᴡ ꜱᴏᴜʟ ᴅᴇᴛᴇᴄᴛᴇᴅ")}\n╰── • 🥀 • ──╯\n\n│ ◦ ᴜꜱᴇʀ: @${num.split("@")[0]}\n│ ◦ ɢʀᴏᴜᴘ: ${metadata.subject}\n│ ◦ ᴍᴇᴍʙᴇʀꜱ: ${metadata.participants.length}\n\n🥀 "${fancy(quote)}"\n\n${fancy(config.footer)}`;
                    await conn.sendMessage(anu.id, { image: { url: pp }, caption: welcome, mentions: [num] });
                } else if (anu.action == 'remove') {
                    let goodbye = `╭── • 🥀 • ──╮\n  ${fancy("ꜱᴏᴜʟ ʟᴇꜰᴛ")}\n╰── • 🥀 • ──╯\n\n│ ◦ @${num.split("@")[0]} ʜᴀꜱ ᴇxɪᴛᴇᴅ.\n🥀 "${fancy(quote)}"`;
                    await conn.sendMessage(anu.id, { image: { url: pp }, caption: goodbye, mentions: [num] });
                }
            }
        } catch (e) { console.error("Event Error"); }
    });

    // 17. ANTICALL (Reject Calls)
    conn.ev.on('call', async (calls) => {
        if (config.anticall) {
            for (let call of calls) {
                if (call.status === 'offer') {
                    await conn.rejectCall(call.id, call.from);
                    await conn.sendMessage(call.from, { text: fancy("🥀 ɪɴꜱɪᴅɪᴏᴜꜱ: ɴᴏ ᴄᴀʟʟꜱ ᴀʟʟᴏᴡᴇᴅ. ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ʀᴇᴘᴏʀᴛᴇᴅ.") });
                }
            }
        }
    });

    // 7. SLEEPING MODE (Cron Jobs)
    const [startH, startM] = config.sleepStart.split(':');
    const [endH, endM] = config.sleepEnd.split(':');

    cron.schedule(`${startM} ${startH} * * *`, async () => {
        // Hapa bot inafunga group JID uliyoiweka kwenye config
        await conn.groupSettingUpdate(config.groupJid, 'announcement');
        await conn.sendMessage(config.groupJid, { text: fancy("🥀 ꜱʟᴇᴇᴘɪɴɢ ᴍᴏᴅᴇ ᴀᴄᴛɪᴠᴀᴛᴇᴅ: ɢʀᴏᴜᴘ ᴄʟᴏꜱᴇᴅ.") });
    });

    cron.schedule(`${endM} ${endH} * * *`, async () => {
        await conn.groupSettingUpdate(config.groupJid, 'not_announcement');
        await conn.sendMessage(config.groupJid, { text: fancy("🥀 ᴀᴡᴀᴋᴇ ᴍᴏᴅᴇ: ɢʀᴏᴜᴘ ᴏᴘᴇɴᴇᴅ.") });
    });

    // 16. AUTO BIO & UPTIME UPDATE
    setInterval(() => {
        const uptime = process.uptime();
        const bio = `INSIDIOUS V2.1.1 | DEV: STANYTZ | UPTIME: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
        conn.updateProfileStatus(bio).catch(() => null);
    }, 60000);

    // CONNECTION UPDATES
    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startInsidious();
        } else if (connection === 'open') {
            console.log(fancy("👹 insidious is alive and connected."));
            conn.sendMessage(conn.user.id, { text: fancy("ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ᴀᴄᴛɪᴠᴀᴛᴇᴅ. ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ ᴠɪᴀ ᴍᴏɴɢᴏᴅʙ.") });
        }
    });

    return conn;
}

startInsidious();
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
