// database/models.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    jid: String,
    name: String,
    deviceId: String,
    linkedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    mustFollowChannel: { type: Boolean, default: true },
    lastActive: Date,
    messageCount: { type: Number, default: 0 },
    channelNotified: { type: Boolean, default: false },
    followingChannel: { type: Boolean, default: true },
    pairingCode: String
});

const groupSchema = new mongoose.Schema({
    jid: String,
    name: String,
    description: String,
    participants: Number,
    lastActivity: Date
});

const channelSubscriberSchema = new mongoose.Schema({
    jid: String,
    name: String,
    subscribedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    autoFollow: { type: Boolean, default: true },
    lastActive: Date,
    source: String
});

const settingsSchema = new mongoose.Schema({
    antilink: { type: Boolean, default: true },
    antiporn: { type: Boolean, default: true },
    antiscam: { type: Boolean, default: true },
    antimedia: { type: String, default: "off" },
    antitag: { type: Boolean, default: true },
    antiviewonce: { type: Boolean, default: true },
    antidelete: { type: Boolean, default: true },
    chatbot: { type: Boolean, default: true },
    workMode: { type: String, default: "public" },
    autoRead: { type: Boolean, default: true },
    autoReact: { type: Boolean, default: true },
    autoSave: { type: Boolean, default: true },
    autoTyping: { type: Boolean, default: true },
    antibug: { type: Boolean, default: true },
    antispam: { type: Boolean, default: true },
    channelSubscription: { type: Boolean, default: true },
    autoReactChannel: { type: Boolean, default: true },
    sleepingMode: { type: Boolean, default: false },
    welcomeGoodbye: { type: Boolean, default: true },
    autoBio: { type: Boolean, default: true },
    anticall: { type: Boolean, default: false },
    autoStatusView: { type: Boolean, default: true },
    autoStatusLike: { type: Boolean, default: true },
    autoStatusReply: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
    sessionId: String,
    jid: String,
    deviceId: String,
    isActive: { type: Boolean, default: true },
    connectedAt: { type: Date, default: Date.now },
    lastPing: Date,
    deviceInfo: Object,
    botName: String
});

module.exports = {
    User: mongoose.models.User || mongoose.model('User', userSchema),
    Group: mongoose.models.Group || mongoose.model('Group', groupSchema),
    ChannelSubscriber: mongoose.models.ChannelSubscriber || mongoose.model('ChannelSubscriber', channelSubscriberSchema),
    Settings: mongoose.models.Settings || mongoose.model('Settings', settingsSchema),
    Session: mongoose.models.Session || mongoose.model('Session', sessionSchema)
};
