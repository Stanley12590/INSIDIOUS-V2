const mongoose = require('mongoose');

// USER SCHEMA
const UserSchema = new mongoose.Schema({
    jid: { type: String, required: true },
    name: String,
    deviceId: String,
    linkedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    isFollowingChannel: { type: Boolean, default: false },
    messageCount: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    warnings: { type: Number, default: 0 },
    countryCode: String,
    isBlocked: { type: Boolean, default: false }
});

// GROUP SCHEMA
const GroupSchema = new mongoose.Schema({
    jid: { type: String, required: true },
    name: String,
    participants: Number,
    admins: [String],
    joinedAt: { type: Date, default: Date.now }
});

// SETTINGS SCHEMA - SIMPLIFIED
const SettingsSchema = new mongoose.Schema({
    // Anti Features
    antilink: { type: Boolean, default: true },
    antiporn: { type: Boolean, default: true },
    antiscam: { type: Boolean, default: true },
    antimedia: { type: Boolean, default: false },
    antitag: { type: Boolean, default: true },
    antiviewonce: { type: Boolean, default: true },
    antidelete: { type: Boolean, default: true },
    
    // Other Features
    sleepingMode: { type: Boolean, default: false },
    welcomeGoodbye: { type: Boolean, default: true },
    chatbot: { type: Boolean, default: true },
    autoRead: { type: Boolean, default: true },
    autoReact: { type: Boolean, default: true },
    autoBio: { type: Boolean, default: true },
    anticall: { type: Boolean, default: true },
    antispam: { type: Boolean, default: true },
    antibug: { type: Boolean, default: true },
    
    // Timestamp
    updatedAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = {
    User,
    Group,
    Settings
};
