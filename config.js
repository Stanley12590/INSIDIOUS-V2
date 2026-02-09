// config.js
const fs = require('fs');
const { fancy } = require('./lib/font');

// Manually load .env if exists (without dotenv package)
let envConfig = {};
try {
    if (fs.existsSync('.env')) {
        const envFile = fs.readFileSync('.env', 'utf8');
        envFile.split('\n').forEach(line => {
            if (line && !line.startsWith('#') && line.includes('=')) {
                const [key, value] = line.split('=');
                if (key && value) {
                    envConfig[key.trim()] = value.trim().replace(/"/g, '').replace(/'/g, '');
                }
            }
        });
        console.log(fancy('[CONFIG] ✅ Loaded .env file'));
    }
} catch (e) {
    console.log(fancy('[CONFIG] ⚠️ No .env file found, using defaults'));
}

// Helper to get config with fallbacks
function getConfig(key, defaultValue) {
    // First check environment variable
    if (process.env[key]) return process.env[key];
    // Then check manually loaded .env
    if (envConfig[key]) return envConfig[key];
    // Return default
    return defaultValue;
}

module.exports = {
    // ============================================
    // BOT METADATA (FIXED FOR YOUR BOT)
    // ============================================
    botName: getConfig('BOT_NAME', "ɪɴꜱɪᴅɪᴏᴜꜱ: ᴛʜᴇ ʟᴀꜱᴛ ᴋᴇʏ"),
    ownerName: getConfig('BOT_OWNER', "ꜱᴛᴀɴʏᴛᴢ"),
    ownerNumber: [getConfig('OWNER_NUMBER', "255618558502")], // Change this to your number
    version: "2.1.1",
    year: "2025",
    updated: "2026",
    specialThanks: "ʀᴇᴅᴛᴇᴄʜ",

    // ============================================
    // COMMAND SETTINGS (FAST RESPONSE)
    // ============================================
    prefix: getConfig('BOT_PREFIX', "."),
    workMode: getConfig('BOT_MODE', "public"),
    sendWelcomeToOwner: true, // Enable welcome message to owner

    // ============================================
    // NEWSLETTER & GROUP BRANDING
    // ============================================
    newsletterJid: getConfig('NEWSLETTER_JID', "120363404317544295@newsletter"),
    groupJid: getConfig('GROUP_JID', "120363406549688641@g.us"),
    channelLink: getConfig('CHANNEL_LINK', "https://chat.whatsapp.com/J19JASXoaK0GVSoRvShr4Y"),
    
    // ============================================
    // DATABASE (USING YOUR MONGODB URI)
    // ============================================
    mongodbUri: getConfig('MONGODB_URI', "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious"),
    sessionName: getConfig('SESSION_NAME', "insidious_session"),

    // ============================================
    // ANTI FEATURES (DEFAULTS)
    // ============================================
    antilink: true,
    antiporn: true,
    antiscam: true,
    antimedia: "off",
    antitag: true,
    antispam: true,
    antibug: true,
    anticall: false, // Set to true if you want anticall

    // ============================================
    // RECOVERY FEATURES
    // ============================================
    antiviewonce: true,
    antidelete: true,

    // ============================================
    // SLEEPING MODE
    // ============================================
    sleepStart: "22:00",
    sleepEnd: "06:00",
    sleepingMode: false, // Disabled by default

    // ============================================
    // WELCOME/GOODBYE
    // ============================================
    welcomeGoodbye: true,

    // ============================================
    // AUTOBLOCK COUNTRIES (OPTIONAL)
    // ============================================
    autoblock: ['92', '212', '234'],

    // ============================================
    // AUTOMATION (FAST RESPONSE)
    // ============================================
    autoRead: true,
    autoReact: true,
    autoSave: true,
    autoBio: true,
    autoTyping: true,

    // ============================================
    // STATUS AUTO INTERACTION
    // ============================================
    autoStatusView: true,
    autoStatusLike: true,
    autoStatusReply: true,

    // ============================================
    // AI CHATBOT
    // ============================================
    aiModel: getConfig('AI_API_URL', "https://gpt.aliali.dev/api/v1?text="),
    
    // ============================================
    // DOWNLOADERS
    // ============================================
    darlynApi: "https://api.darlyn.my.id/api/",
    
    // ============================================
    // SCAM KEYWORDS
    // ============================================
    scamWords: [
        'investment', 'bitcoin', 'crypto', 'ashinde', 'zawadi', 
        'gift card', 'telegram.me', 'pata pesa', 'ajira'
    ],

    // ============================================
    // PORNO KEYWORDS
    // ============================================
    pornWords: [
        'porn', 'sex', 'xxx', 'ngono', 'video za kikubwa', 
        'hentai', 'malaya', 'pussy', 'dick'
    ],

    // ============================================
    // VISUALS
    // ============================================
    menuImage: getConfig('MENU_IMAGE', "https://files.catbox.moe/irqrap.jpg"),
    footer: "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 ʙʏ ꜱᴛᴀɴʏᴛᴢ",
    
    // ============================================
    // DEPLOYMENT SETTINGS
    // ============================================
    port: parseInt(getConfig('PORT', 3000)),
    host: getConfig('HOST', "0.0.0.0"),
    nodeEnv: getConfig('NODE_ENV', "development"),
    
    // ============================================
    // CHANNEL & SUBSCRIPTION SETTINGS
    // ============================================
    channelReactions: ["❤️", "🔥", "⭐", "👍", "🎉"],
    channelSubscription: true,
    autoReactChannel: true,
    chatbot: true,
    
    // ============================================
    // ADMIN NUMBERS (OPTIONAL)
    // ============================================
    adminNumbers: []
};
