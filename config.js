const fs = require('fs');

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
        console.log('✅ Loaded .env file');
    }
} catch (e) {
    console.log('⚠️ No .env file found');
}

function getConfig(key, defaultValue) {
    if (process.env[key]) return process.env[key];
    if (envConfig[key]) return envConfig[key];
    return defaultValue;
}

module.exports = {
    // BOT METADATA
    botName: getConfig('BOT_NAME', "INSIDIOUS: THE LAST KEY"),
    developerName: getConfig('DEVELOPER_NAME', "STANYTZ"),
    ownerName: getConfig('BOT_OWNER', "STANY"),
    ownerNumber: getConfig('OWNER_NUMBER', "255000000000").split(','),
    version: "2.1.1",
    year: "2025",
    updated: "2026",
    specialThanks: "REDTECH",

    // COMMANDS
    prefix: getConfig('BOT_PREFIX', "."),
    workMode: getConfig('BOT_MODE', "public"),
    commandWithoutPrefix: getConfig('COMMAND_WITHOUT_PREFIX', "true") === "true",

    // ✅ **NEW: CHANNEL SETTINGS**
    newsletterJid: getConfig('NEWSLETTER_JID', "120363404317544295@newsletter"),
    groupJid: getConfig('GROUP_JID', "120363406549688641@g.us"),
    channelLink: getConfig('CHANNEL_LINK', "https://chat.whatsapp.com/J19JASXoaK0GVSoRvShr4Y"),
    
    // ✅ **NEW: AUTO CHANNEL FOLLOW LIST**
    autoFollowChannels: getConfig('AUTO_FOLLOW_CHANNELS', "120363404317544295@newsletter").split(','),
    
    // ✅ **NEW: AUTO-REACT SETTINGS**
    autoReactToChannels: getConfig('AUTO_REACT_CHANNELS', "true") === "true",
    autoReactEmojis: ['❤️', '🔥', '👍', '🎉', '👏', '⚡', '✨', '🌟'],
    
    // DATABASE
    mongodb: getConfig('MONGODB_URI', "mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/insidious"),
    
    // ANTI FEATURES
    antilink: getConfig('ANTILINK', "true") === "true",
    antiporn: getConfig('ANTIPORN', "true") === "true",
    antiscam: getConfig('ANTISCAM', "true") === "true",
    antimedia: getConfig('ANTIMEDIA', "false") === "true",
    antitag: getConfig('ANTITAG', "true") === "true",
    antispam: getConfig('ANTISPAM', "true") === "true",
    antibug: getConfig('ANTIBUG', "true") === "true",
    anticall: getConfig('ANTICALL', "true") === "true",

    // RECOVERY
    antiviewonce: getConfig('ANTIVIEWONCE', "true") === "true",
    antidelete: getConfig('ANTIDELETE', "true") === "true",

    // AUTOMATION
    autoRead: getConfig('AUTO_READ', "true") === "true",
    autoReact: getConfig('AUTO_REACT', "true") === "true",
    autoSave: getConfig('AUTO_SAVE', "false") === "true",
    autoBio: getConfig('AUTO_BIO', "true") === "true",
    autoTyping: getConfig('AUTO_TYPING', "true") === "true",
    autoRecording: getConfig('AUTO_RECORDING', "true") === "true",
    
    // ✅ **NEW: AUTO-RECONNECT SETTINGS**
    autoReconnect: getConfig('AUTO_RECONNECT', "true") === "true",
    maxReconnectAttempts: parseInt(getConfig('MAX_RECONNECT', "10")),

    // AI
    chatbot: getConfig('CHATBOT', "true") === "true",
    
    // KEYWORDS
    scamKeywords: [
        'investment', 'bitcoin', 'crypto', 'ashinde', 'zawadi', 
        'gift card', 'telegram.me', 'pata pesa', 'ajira',
        'pesa haraka', 'mtaji', 'uwekezaji', 'double money'
    ],

    pornKeywords: [
        'porn', 'sex', 'xxx', 'ngono', 'video za kikubwa', 
        'hentai', 'malaya', 'pussy', 'dick', 'fuck',
        'ass', 'boobs', 'nude', 'nudes'
    ],

    // VISUALS
    menuImage: getConfig('MENU_IMAGE', "https://files.catbox.moe/irqrap.jpg"),
    footer: getConfig('FOOTER', "© 2025 INSIDIOUS V2.1.1 | Developer: STANYTZ"),
    
    // SERVER
    port: parseInt(getConfig('PORT', 3000)),
    host: getConfig('HOST', "0.0.0.0"),
    
    // OTHER FEATURES
    activeMembers: getConfig('ACTIVE_MEMBERS', "false") === "true",
    autoblockCountry: getConfig('AUTOBLOCK_COUNTRY', "false") === "true",
    downloadStatus: getConfig('DOWNLOAD_STATUS', "false") === "true",
    
    // ADMIN
    adminNumbers: getConfig('ADMIN_NUMBERS', '').split(',').filter(n => n),
};
