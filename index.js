const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const mongoose = require("mongoose");
const path = require("path");
const fs = require('fs');

// ==================== HANDLER ====================
const handler = require('./handler');

// ✅ Fancy Function
function fancy(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const fancyMap = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',
                           j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',
                           s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
                           A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',
                           J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ǫ',R:'ʀ',
                           S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'};
        let result = '';
        for (let i=0;i<text.length;i++) result += fancyMap[text[i]]||text[i];
        return result;
    } catch(e){ return text; }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MONGODB ====================
console.log(fancy("🔗 Connecting to MongoDB..."));
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
})
.then(() => console.log(fancy("✅ MongoDB Connected")))
.catch(err => console.log(fancy("❌ MongoDB Connection FAILED: " + err.message)));

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
if(!fs.existsSync(path.join(__dirname,'public'))) fs.mkdirSync(path.join(__dirname,'public'),{recursive:true});

// ==================== ROUTES ====================
app.get('/',(req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/dashboard',(req,res)=> res.sendFile(path.join(__dirname,'public','dashboard.html')));

// ==================== GLOBALS ====================
let globalConn = null;
let isConnected = false;
let botStartTime = Date.now();

// ==================== CONFIG ====================
let config = {};
try { config = require('./config'); console.log(fancy("📋 Config loaded")); }
catch { config = { prefix: '.', ownerNumber: ['255000000000'], botName:'INSIDIOUS', workMode:'public', botImage:'https://files.catbox.moe/f3c07u.jpg' } }

// ==================== BOT FUNCTION ====================
async function startBot() {
    try {
        console.log(fancy("🚀 Starting INSIDIOUS..."));

        const { state, saveCreds } = await useMultiFileAuthState('insidious_session');
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({level:"fatal"})) },
            logger: pino({level:"silent"}),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true
        });

        globalConn = conn;
        botStartTime = Date.now();

        // ==================== CONNECTION UPDATE ====================
        conn.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if(connection==='open'){
                console.log(fancy("👹 INSIDIOUS: THE LAST KEY ACTIVATED"));
                isConnected=true;

                const botName = conn.user?.name||"INSIDIOUS";
                const botNumber = conn.user?.id?.split(':')[0]||"Unknown";
                const botSecret = handler.getBotId ? handler.getBotId():'Unknown';
                const pairedCount = handler.getPairedNumbers ? handler.getPairedNumbers().length:0;

                console.log(fancy(`🤖 Name: ${botName}`));
                console.log(fancy(`📞 Number: ${botNumber}`));
                console.log(fancy(`🆔 Bot ID: ${botSecret}`));
                console.log(fancy(`👥 Paired Owners: ${pairedCount}`));

                // initialize handler
                if(handler && typeof handler.init==='function') await handler.init(conn);

                // welcome owner
                setTimeout(async()=>{
                    if(config.ownerNumber?.length>0){
                        const ownerNum = config.ownerNumber[0].replace(/[^0-9]/g,'');
                        if(ownerNum.length>=10){
                            const ownerJid = ownerNum+'@s.whatsapp.net';
                            const welcomeMsg = `
╭─── • 🥀 • ───╮
   INSIDIOUS: THE LAST KEY
╰─── • 🥀 • ───╯

✅ *Bot Connected Successfully!*
🤖 *Name:* ${botName}
📞 *Number:* ${botNumber}
🆔 *Bot ID:* ${botSecret}
👥 *Paired Owners:* ${pairedCount}

⚡ *Status:* ONLINE & ACTIVE

📊 *ALL FEATURES ACTIVE:*
🛡️ Anti View Once: ✅
🗑️ Anti Delete: ✅
🤖 AI Chatbot: ✅
⚡ Auto Typing: ✅
📼 Auto Recording: ✅
👀 Auto Read: ✅
❤️ Auto React: ✅
🎉 Welcome/Goodbye: ✅

🔧 *Commands:* All working
📁 *Database:* Connected
🚀 *Performance:* Optimal

👑 *Developer:* STANYTZ
💾 *Version:* 2.1.1 | Year: 2025`;

                            await conn.sendMessage(ownerJid,{
                                image:{url:config.botImage},
                                caption:welcomeMsg
                            });
                        }
                    }
                },3000);
            }

            // === IMPORTANT ===
            // remove all 'close' handling => bot never closes
        });

        // ==================== CREDS UPDATE ====================
        conn.ev.on('creds.update', saveCreds);

        // ==================== MESSAGES ====================
        conn.ev.on('messages.upsert', async(m)=>{
            try{ if(handler && typeof handler==='function') await handler(conn,m); }
            catch(e){ console.error("Message handler error:",e.message); }
        });

        // ==================== GROUP UPDATE ====================
        conn.ev.on('group-participants.update', async(u)=>{
            try{ if(handler?.handleGroupUpdate) await handler.handleGroupUpdate(conn,u); }
            catch(e){ console.error("Group update error:",e.message); }
        });

        // ==================== CALL HANDLER ====================
        conn.ev.on('call', async(c)=>{
            try{ if(handler?.handleCall) await handler.handleCall(conn,c); }
            catch(e){ console.error("Call handler error:",e.message); }
        });

        console.log(fancy("🚀 Bot ready for pairing via web interface"));

    } catch(error){
        console.error("Start error:",error.message);
        setTimeout(()=> startBot(),10000);
    }
}

// ==================== START BOT ====================
startBot();

// ==================== HTTP ENDPOINTS ====================

// PAIRING - OFFICIAL HANDLER
app.get('/pair', async(req,res)=>{
    try{
        let num = req.query.num;
        if(!num) return res.json({success:false,error:"Provide number! Example: /pair?num=255123456789"});
        const cleanNum = num.replace(/[^0-9]/g,'');
        if(cleanNum.length<10) return res.json({success:false,error:"Invalid number"});
        if(!globalConn) return res.json({success:false,error:"Bot initializing..."});

        // Official pairing logic from handler
        if(handler?.pairNumber){
            const code = await handler.pairNumber(cleanNum);
            res.json({success:true, code, message:`Number ${cleanNum} paired successfully`});
        } else res.json({success:false,error:"Pair function not available"});
    } catch(e){ res.json({success:false,error:e.message}); }
});

// UNPAIR
app.get('/unpair', async(req,res)=>{
    try{
        const num = req.query.num;
        if(!num) return res.json({success:false,error:"Provide number!"});
        const cleanNum = num.replace(/[^0-9]/g,'');
        if(cleanNum.length<10) return res.json({success:false,error:"Invalid number"});
        if(handler?.unpairNumber){
            const result = await handler.unpairNumber(cleanNum);
            res.json({success:result, message: result?`Number ${cleanNum} unpaired`:`Failed to unpair ${cleanNum}`});
        } else res.json({success:false,error:"Unpair function not available"});
    } catch(e){ res.json({success:false,error:e.message}); }
});

// HEALTH CHECK
app.get('/health',(req,res)=>{
    const uptime = process.uptime();
    const hours = Math.floor(uptime/3600);
    const minutes = Math.floor((uptime%3600)/60);
    const seconds = Math.floor(uptime%60);

    res.json({
        status:'healthy',
        connected:isConnected,
        uptime:`${hours}h ${minutes}m ${seconds}s`,
        database: mongoose.connection.readyState===1?'connected':'disconnected'
    });
});

// BOT INFO
app.get('/botinfo',(req,res)=>{
    if(!globalConn || !globalConn.user) return res.json({success:false,error:"Bot not connected",connected:isConnected});
    const botSecret = handler.getBotId ? handler.getBotId():'Unknown';
    const pairedCount = handler.getPairedNumbers ? handler.getPairedNumbers().length:0;
    res.json({
        success:true,
        botName:globalConn.user?.name||"INSIDIOUS",
        botNumber:globalConn.user?.id?.split(':')[0]||"Unknown",
        botJid:globalConn.user?.id||"Unknown",
        botSecret,
        pairedOwners:pairedCount,
        connected:isConnected,
        uptime:Date.now()-botStartTime
    });
});

// ==================== START SERVER ====================
app.listen(PORT,()=>{
    console.log(fancy(`🌐 Web Interface: http://localhost:${PORT}`));
    console.log(fancy(`🔗 Pair: http://localhost:${PORT}/pair?num=255XXXXXXXXX`));
    console.log(fancy(`🗑️  Unpair: http://localhost:${PORT}/unpair?num=255XXXXXXXXX`));
    console.log(fancy(`🤖 Bot Info: http://localhost:${PORT}/botinfo`));
    console.log(fancy(`❤️ Health: http://localhost:${PORT}/health`));
    console.log(fancy("👑 Developer: STANYTZ"));
    console.log(fancy("📅 Version: 2.1.1 | Year: 2025"));
    console.log(fancy("🙏 Special Thanks: REDTECH"));
});

module.exports = app;