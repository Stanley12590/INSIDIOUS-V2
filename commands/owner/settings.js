const fs = require('fs-extra');
const path = require('path');
const handler = require('../../handler');

module.exports = {
    name: "settings",
    aliases: ["setting", "config"],
    ownerOnly: true,
    description: "Manage all bot features (toggle on/off)",
    usage: "[feature] [on/off]",
    
    execute: async (conn, msg, args, { from, fancy, config, isOwner, reply }) => {
        if (!isOwner) return reply("❌ This command is for owner only!");

        // Load current settings from handler
        let settings = await handler.loadSettings();

        // -------------------- SHOW ALL SETTINGS --------------------
        if (args.length === 0) {
            let text = `╭─── • 🥀 • ───╮\n`;
            text += `   *BOT SETTINGS*  \n`;
            text += `╰─── • 🥀 • ───╯\n\n`;

            text += `🔧 *ANTI FEATURES*\n`;
            text += `┌─────────────────\n`;
            text += `│ 🛡️ Antilink     : ${settings.antilink ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 🔞 Antiporn     : ${settings.antiporn ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 💰 Antiscam     : ${settings.antiscam ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 🏷️ Antitag      : ${settings.antitag ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 👁️ AntiViewOnce : ${settings.antiviewonce ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 🗑️ AntiDelete   : ${settings.antidelete ? '✅ ON' : '❌ OFF'}\n`;
            text += `└─────────────────\n\n`;

            text += `⚡ *AUTO FEATURES*\n`;
            text += `┌─────────────────\n`;
            text += `│ 👀 AutoRead     : ${settings.autoRead ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ ❤️ AutoReact    : ${settings.autoReact ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ ⌨️ AutoTyping   : ${settings.autoTyping ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 🎙️ AutoRecording: ${settings.autoRecording ? '✅ ON' : '❌ OFF'}\n`;
            text += `│ 📝 AutoBio      : ${settings.autoBio ? '✅ ON' : '❌ OFF'}\n`;
            text += `└─────────────────\n\n`;

            text += `👥 *GROUP FEATURES*\n`;
            text += `┌─────────────────\n`;
            text += `│ 🎉 Welcome/Goodbye: ${settings.welcomeGoodbye ? '✅ ON' : '❌ OFF'}\n`;
            text += `└─────────────────\n\n`;

            text += `🤖 *AI FEATURES*\n`;
            text += `┌─────────────────\n`;
            text += `│ 💬 Chatbot      : ${settings.chatbot ? '✅ ON' : '❌ OFF'}\n`;
            text += `└─────────────────\n\n`;

            text += `🔐 *PAIRING SYSTEM*\n`;
            text += `┌─────────────────\n`;
            text += `│ 👥 Max Co‑owners: ${settings.maxCoOwners}\n`;
            text += `└─────────────────\n\n`;

            text += `🌐 *BOT MODE*\n`;
            text += `┌─────────────────\n`;
            text += `│ 🤖 Mode        : ${settings.mode === 'public' ? '🌍 PUBLIC' : '🔒 SELF'}\n`;
            text += `└─────────────────\n\n`;

            text += `💡 *USAGE:*\n`;
            text += `${config.prefix}settings <feature> [on/off]\n`;
            text += `📌 *Example:* ${config.prefix}settings antilink on\n`;
            text += `📌 *Example:* ${config.prefix}settings chatbot off\n`;
            text += `📌 *Example:* ${config.prefix}settings mode public\n`;
            text += `📌 *Example:* ${config.prefix}settings maxCoOwners 3\n\n`;
            text += `_Settings are saved permanently._`;

            return reply(fancy(text));
        }

        // -------------------- TOGGLE SPECIFIC FEATURE --------------------
        const feature = args[0].toLowerCase();
        let value = args[1] ? args[1].toLowerCase() : null;

        // Special handling for mode
        if (feature === 'mode') {
            if (value === 'public' || value === 'self') {
                settings.mode = value;
            } else if (value === null) {
                // toggle between public/self
                settings.mode = settings.mode === 'public' ? 'self' : 'public';
            } else {
                return reply(`❌ Invalid mode. Use: public / self`);
            }
        }
        // Special handling for maxCoOwners (numeric)
        else if (feature === 'maxcoowners' || feature === 'maxCoOwners') {
            if (!args[1]) return reply(`❌ Provide a number between 1 and 5.`);
            const num = parseInt(args[1]);
            if (isNaN(num) || num < 1 || num > 5) {
                return reply(`❌ Max co‑owners must be between 1 and 5.`);
            }
            settings.maxCoOwners = num;
        }
        // All other boolean features
        else {
            if (!(feature in settings)) {
                return reply(`❌ Feature "${feature}" does not exist.\n📋 Use *${config.prefix}settings* to see the list.`);
            }
            if (value === null) {
                // toggle
                settings[feature] = !settings[feature];
            } else if (['on', 'enable', 'true', '1'].includes(value)) {
                settings[feature] = true;
            } else if (['off', 'disable', 'false', '0'].includes(value)) {
                settings[feature] = false;
            } else {
                return reply(`❌ Invalid value. Use: on / off`);
            }
        }

        // Save settings
        await handler.saveSettings(settings);
        await handler.refreshConfig(); // update global config

        // Notify user
        let status = '';
        if (feature === 'mode') status = settings.mode === 'public' ? '🌍 PUBLIC' : '🔒 SELF';
        else if (feature === 'maxCoOwners') status = settings.maxCoOwners;
        else status = settings[feature] ? '✅ ON' : '❌ OFF';

        let response = `✅ *Setting updated!*\n\n`;
        response += `🔧 Feature: *${feature}*\n`;
        response += `📊 Status: ${status}\n`;
        response += `\n_Settings saved._`;

        await reply(fancy(response));
    }
};
