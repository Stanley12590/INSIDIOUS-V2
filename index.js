const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const config = require("./config");
const axios = require("axios");
const { fancy } = require("./lib/font");
const app = express();

mongoose.connect(config.mongodb).then(() => console.log("🥀 DB Connected"));

app.get('/', (req, res) => {
    res.send(`<html><body style="background:#000;color:red;text-align:center;padding-top:100px;font-family:sans-serif;">
        <h1>🥀 INSIDIOUS V2 PANEL</h1>
        <input type="text" id="n" placeholder="255..."><button onclick="fetch('/pair?num='+document.getElementById('n').value).then(r=>r.json()).then(d=>document.getElementById('c').innerText=d.code)">GET CODE</button>
        <h2 id="c" style="color:white;letter-spacing:10px;"></h2></body></html>`);
});

async function startInsidious() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const conn = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari")
    });

    app.get('/pair', async (req, res) => {
        let num = req.query.num;
        if(!conn.authState.creds.registered) {
            await delay(3000);
            const code = await conn.requestPairingCode(num);
            res.json({ code });
        }
    });

    conn.ev.on('creds.update', saveCreds);

    // 12. AUTO STATUS (View, Like, AI Reply)
    conn.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (msg.key.remoteJid === 'status@broadcast' && config.autoStatus.view) {
            await conn.readMessages([msg.key]);
            if (config.autoStatus.like) await conn.sendMessage('status@broadcast', { react: { text: '🥀', key: msg.key } }, { statusJidList: [msg.key.participant] });
            if (config.autoStatus.reply) {
                const aiMsg = await axios.get(`https://text.pollinations.ai/Reply to this status mood humanly: ${msg.message?.conversation || 'Cool Status'}`);
                await conn.sendMessage(msg.key.participant, { text: fancy(aiMsg.data) }, { quoted: msg });
            }
        }
        require('./handler')(conn, m);
    });

    conn.ev.on('connection.update', (u) => {
        if (u.connection === 'open') {
            console.log("👹 INSIDIOUS V2 ONLINE");
            conn.sendMessage(conn.user.id, { text: fancy("ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ʟɪɴᴋᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ") });
        }
    });

    // 17. ANTICALL
    conn.ev.on('call', async (c) => {
        if (config.antiCall && c[0].status === 'offer') {
            await conn.rejectCall(c[0].id, c[0].from);
            await conn.sendMessage(c[0].from, { text: fancy("🥀 ɴᴏ ᴄᴀʟʟꜱ ᴀʟʟᴏᴡᴇᴅ.") });
        }
    });
}
startInsidious();
app.listen(3000);
