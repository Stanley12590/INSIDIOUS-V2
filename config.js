// config.js - WITHOUT dotenv for now
const fs = require('fs');
const { fancy } = require('./lib/font');

// Try to load .env manually if exists
let env = {};
try {
    if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf8');
        envContent.split('\n').forEach(line => {
            if (line && !line.startsWith('#') && line.includes('=')) {
                const [key, value] = line.split('=');
                env[key.trim()] = value.trim().replace(/"/g, '');
            }
        });
        console.log(fancy('[CONFIG] ✅ Loaded .env file'));
    }
} catch (e) {
    console.log(fancy('[CONFIG] ⚠️ Using default config'));
}

// Helper function to get env variable
function getEnv(key, defaultValue) {
    return env[key] || process.env[key] || defaultValue;
}

module.exports = {
    // ============================================
    // BOT METADATA
    // ============================================
    botName: getEnv('BOT_NAME', "ɪɴꜱɪᴅɪᴏᴜꜱ: ᴛʜᴇ ʟᴀꜱᴛ ᴋᴇʏ"),
    ownerName: getEnv('BOT_OWNER', "ꜱᴛᴀɴʏᴛᴢ"),
    ownerNumber: [getEnv('OWNER_NUMBER', "255618558502")],
    version: "2.1.1",
    year: "2025",
    updated: "2026",
    specialThanks: "ʀᴇᴅᴛᴇᴄʜ",

    // ============================================
    // COMMAND SETTINGS
    // ============================================
    prefix: getEnv('BOT_PREFIX', "."),
    workMode: getEnv('BOT_MODE', "public"),

    // ============================================
    // NEWSLETTER & GROUP BRANDING
    // ============================================
    newsletterJid: getEnv('NEWSLETTER_JID', "120363404317544295@newsletter"),
    groupJid: getEnv('GROUP_JID', "120363406549688641@g.us"),
    channelLink: getEnv('CHANNEL_LINK', "https://chat.whatsapp.com/J19JASXoaK0GVSoRvShr4Y"),
    
    // ============================================
    // DEPLOYMENT & DATABASE
    // ============================================
    mongodbUri: getEnv('MONGODB_URI', "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious"),
    sessionName: getEnv('SESSION_NAME', "insidious_session"),

    // ANTI FEATURES
    antilink: true,
    antiporn: true,
    antiscam: true,
    antimedia: "off",
    antitag: true,
    antispam: true,
    antibug: true,
    anticall: true,

    // RECOVERY FEATURES
    antiviewonce: true,
    antidelete: true,

    // SLEEPING MODE
    sleepStart: "22:00",
    sleepEnd: "06:00",

    // AUTOBLOCK
    autoblock: ['92', '212', '234'],

    // AUTOMATION
    autoStatus: {
        view: true,
        like: true,
        reply: true,
        emoji: "🥀"
    },
    autoRead: true,
    autoReact: true,
    autoSave: true,
    autoBio: true,
    autoTyping: true,

    // AI
    aiModel: getEnv('AI_API_URL', "https://gpt.aliali.dev/api/v1?text="),
    
    // DOWNLOADERS
    darlynApi: "https://api.darlyn.my.id/api/",
    
    // SCAM KEYWORDS
    scamWords: [
        'investment', 'bitcoin', 'crypto', 'ashinde', 'zawadi', 
        'gift card', 'telegram.me', 'pata pesa', 'ajira'
    ],

    // PORNO KEYWORDS
    pornWords: [
        'porn', 'sex', 'xxx', 'ngono', 'video za kikubwa', 
        'hentai', 'malaya', 'pussy', 'dick'
    ],

    // VISUALS
    menuImage: getEnv('MENU_IMAGE', "https://files.catbox.moe/irqrap.jpg"),
    footer: "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ʙʏ ꜱᴛᴀɴʏᴛᴢ",

    // ============================================
    // DEPLOYMENT SETTINGS
    // ============================================
    port: getEnv('PORT', 3000),
    host: getEnv('HOST', "0.0.0.0"),
    nodeEnv: getEnv('NODE_ENV', "development"),
    
    // ============================================
    // CHANNEL SETTINGS
    // ============================================
    channelReactions: ["❤️", "🔥", "⭐"],
    channelSubscription: true,
    autoReactChannel: true,
    chatbot: true,
    
    // ============================================
    // ADMIN NUMBERS
    // ============================================
    adminNumbers: [255618558502]
};
