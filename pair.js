const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 4000; // Tumia port tofauti (4000) au weka variable ya mazingira

// ✅ FANCY FUNCTION (rahisi)
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
        j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
        s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
        A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
        J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
        S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hakikisha folder ya public ipo
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ PAIRING ENDPOINT – INATUMIA SOCKET YAKE MWENYEWE
app.get('/pair', async (req, res) => {
    const tempDir = path.join(__dirname, 'temp_pair_' + Date.now());
    let tempConn = null;
    
    try {
        let num = req.query.num;
        if (!num) return res.json({ success: false, error: "Provide number! Example: /pair?num=255123456789" });
        
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length < 10) return res.json({ success: false, error: "Invalid number. Must be at least 10 digits." });

        console.log(fancy(`🔑 Generating code for: ${cleanNum}`));

        await fs.ensureDir(tempDir);
        const { state } = await useMultiFileAuthState(tempDir);
        const { version } = await fetchLatestBaileysVersion();

        tempConn = makeWASocket({
            version,
            auth: { 
                creds: state.creds, 
                keys: state.keys 
            },
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: false
        });

        // Subiri socket iwe tayari (sekunde 10)
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket timeout')), 10000);
            tempConn.ev.on('connection.update', (update) => {
                if (update.connection === 'open') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        const code = await Promise.race([
            tempConn.requestPairingCode(cleanNum),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
        ]);

        if (tempConn?.ws) tempConn.ws.close();
        await fs.remove(tempDir).catch(() => {});

        res.json({ success: true, code, message: `8-digit code: ${code}` });
        
    } catch (err) {
        console.error("Pairing error:", err.message);
        if (tempConn?.ws) tempConn.ws.close();
        await fs.remove(tempDir).catch(() => {});
        
        if (err.message.includes("already paired")) {
            res.json({ success: true, message: "Number already paired" });
        } else {
            res.json({ success: false, error: "Failed: " + err.message });
        }
    }
});

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
    console.log(fancy(`🌐 Pairing Server running on port ${PORT}`));
    console.log(fancy(`🔗 Pairing: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy("👑 Developer: STANYTZ"));
});

module.exports = app;