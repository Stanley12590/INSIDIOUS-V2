const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    name: String,
    pushname: String,
    deviceId: String,
    linkedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    messageCount: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    mustFollowChannel: { type: Boolean, default: true },
    channelNotified: { type: Boolean, default: false },
    lastPair: Date,
    joinedGroups: [String],
    spamCount: { type: Number, default: 0 },
    lastMessageTime: Number
}, { timestamps: true });

// Group Schema
const GroupSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    name: String,
    subject: String,
    description: String,
    created: Date,
    owner: String,
    participants: [{
        jid: String,
        isAdmin: Boolean,
        isSuperAdmin: Boolean
    }],
    settings: {
        antilink: { type: Boolean, default: true },
        antiporn: { type: Boolean, default: true },
        antiscam: { type: Boolean, default: true },
        antimedia: { type: String, default: 'off' }, // 'all', 'photo', 'video', 'sticker', 'off'
        antitag: { type: Boolean, default: true },
        antiviewonce: { type: Boolean, default: true },
        antidelete: { type: Boolean, default: true },
        sleeping: { type: Boolean, default: false }
    },
    sleeping: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Channel Subscriber Schema
const ChannelSubscriberSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    name: String,
    subscribedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    autoFollow: { type: Boolean, default: true },
    messagesReceived: { type: Number, default: 0 }
}, { timestamps: true });

// Settings Schema (For Bot Owner)
const SettingsSchema = new mongoose.Schema({
    // Security Features
    antilink: { type: Boolean, default: true },
    antiporn: { type: Boolean, default: true },
    antiscam: { type: Boolean, default: true },
    antimedia: { type: String, default: 'off' }, // 'all', 'photo', 'video', 'sticker', 'audio', 'off'
    antitag: { type: Boolean, default: true },
    antiviewonce: { type: Boolean, default: true },
    antidelete: { type: Boolean, default: true },
    
    // Group Features
    sleepingMode: { type: Boolean, default: false },
    welcomeGoodbye: { type: Boolean, default: true },
    activeMembers: { type: Boolean, default: true },
    
    // User Features
    autoblockCountry: { type: Boolean, default: false },
    blockedCountries: [{ type: String }],
    chatbot: { type: Boolean, default: true },
    autoStatus: { 
        view: { type: Boolean, default: true },
        like: { type: Boolean, default: false },
        reply: { type: Boolean, default: false }
    },
    
    // Automation
    autoRead: { type: Boolean, default: true },
    autoReact: { type: Boolean, default: false },
    autoSave: { type: Boolean, default: false },
    autoBio: { type: Boolean, default: true },
    autoTyping: { type: Boolean, default: false },
    
    // Protection
    anticall: { type: Boolean, default: true },
    downloadStatus: { type: Boolean, default: false },
    antispam: { type: Boolean, default: true },
    antibug: { type: Boolean, default: true },
    
    // Special Features
    enableBugs: { type: Boolean, default: false },
    bugsTargets: [{ type: String }],
    
    // Configuration
    workMode: { type: String, default: 'public' }, // 'public', 'private'
    commandPrefix: { type: String, default: '.' },
    allowEmojiPrefix: { type: Boolean, default: true },
    
    // Channel Enforcement
    forceChannelSubscription: { type: Boolean, default: true },
    
    // Custom Lists
    scamWordsList: [{ type: String, default: ['free money', 'lottery', 'win', 'click here', 'urgent'] }],
    pornWordsList: [{ type: String, default: ['porn', 'xxx', 'adult', 'nsfw', '18+'] }],
    allowedMedia: [{ type: String }],
    
    // Inactive Members
    removeInactiveDays: { type: Number, default: 7 },
    
    // Sleeping Mode Times
    sleepStart: { type: String, default: '23:00' },
    sleepEnd: { type: String, default: '06:00' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const ChannelSubscriber = mongoose.model('ChannelSubscriber', ChannelSubscriberSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = { User, Group, ChannelSubscriber, Settings };
