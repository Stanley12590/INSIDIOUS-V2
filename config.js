// config.js
const fs = require('fs');
const { fancy } = require('./lib/font');

// Load .env file manually
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
    console.log(fancy('[CONFIG] ⚠️ No .env file found'));
}

// Helper to get config with fallbacks
function getConfig(key, defaultValue) {
    if (process.env[key]) return process.env[key];
    if (envConfig[key]) return envConfig[key];
    return defaultValue;
}

module.exports = {
    // ============================================
    // BOT METADATA - UPDATED
    // ============================================
    botName: getConfig('BOT_NAME', "ɪɴꜱɪᴅɪᴏᴜꜱ"),
    developerName: getConfig('DEVELOPER_NAME', "STANY"), // NEW: Developer is STANY
    ownerName: getConfig('BOT_OWNER', "STANY"), // Bot owner name
    ownerNumber: [getConfig('OWNER_NUMBER', "255000000000")], // Your number here
    version: "2.1.1",
    year: "2025",
    updated: "2026",
    specialThanks: "ʀᴇᴅᴛᴇᴄʜ",

    // ============================================
    // COMMAND SETTINGS
    // ============================================
    prefix: getConfig('BOT_PREFIX', "."),
    workMode: getConfig('BOT_MODE', "public"),

    // ============================================
    // NEWSLETTER & GROUP BRANDING
    // ============================================
    newsletterJid: getConfig('NEWSLETTER_JID', "120363404317544295@newsletter"),
    groupJid: getConfig('GROUP_JID', "120363406549688641@g.us"),
    channelLink: getConfig('CHANNEL_LINK', "https://chat.whatsapp.com/J19JASXoaK0GVSoRvShr4Y"),
    
    // ============================================
    // DATABASE
    // ============================================
    mongodbUri: getConfig('MONGODB_URI', "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious"),
    sessionName: getConfig('SESSION_NAME', "insidious_session"),

    // ============================================
    // ANTI FEATURES
    // ============================================
    antilink: getConfig('ANTILINK', true),
    antiporn: getConfig('ANTIPORN', true),
    antiscam: getConfig('ANTISCAM', true),
    antimedia: getConfig('ANTIMEDIA', "off"),
    antitag: getConfig('ANTITAG', true),
    antispam: getConfig('ANTISPAM', true),
    antibug: getConfig('ANTIBUG', true),
    anticall: getConfig('ANTICALL', false),

    // ============================================
    // RECOVERY FEATURES
    // ============================================
    antiviewonce: getConfig('ANTIVIEWONCE', true),
    antidelete: getConfig('ANTIDELETE', true),

    // ============================================
    // SLEEPING MODE
    // ============================================
    sleepStart: getConfig('SLEEP_START', "22:00"),
    sleepEnd: getConfig('SLEEP_END', "06:00"),
    sleepingMode: getConfig('SLEEPING_MODE', false),

    // ============================================
    // WELCOME/GOODBYE SETTINGS
    // ============================================
    welcomeGoodbye: getConfig('WELCOME_GOODBYE', true),

    // ============================================
    // AUTOBLOCK COUNTRIES (OPTIONAL)
    // ============================================
    autoblock: ['92', '212', '234'],

    // ============================================
    // AUTOMATION SETTINGS
    // ============================================
    autoRead: getConfig('AUTO_READ', true),
    autoReact: getConfig('AUTO_REACT', true),
    autoSave: getConfig('AUTO_SAVE', true),
    autoBio: getConfig('AUTO_BIO', true),
    autoTyping: getConfig('AUTO_TYPING', true),

    // ============================================
    // STATUS AUTO INTERACTION
    // ============================================
    autoStatusView: getConfig('AUTO_STATUS_VIEW', true),
    autoStatusLike: getConfig('AUTO_STATUS_LIKE', true),
    autoStatusReply: getConfig('AUTO_STATUS_REPLY', true),

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
    footer: getConfig('FOOTER', "© 2025 ɪɴꜱɪᴅɪᴏᴜꜱ ᴠ2.1.1 | Developer: STANY"),
    
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
    channelSubscription: getConfig('CHANNEL_SUBSCRIPTION', true),
    autoReactChannel: getConfig('AUTO_REACT_CHANNEL', true),
    chatbot: getConfig('CHATBOT', true),
    
    // ============================================
    // ADMIN NUMBERS (OPTIONAL)
    // ============================================
    adminNumbers: []
};
