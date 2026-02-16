module.exports = {
    name: "stopaudio",
    execute: async (conn, msg, args, { from, fancy, reply }) => {
        reply(fancy("⏹️ *Music stopped*"));
    }
};