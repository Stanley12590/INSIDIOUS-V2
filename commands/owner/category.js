module.exports = {
    name: "category",
    execute: async (conn, msg, args, { from, fancy }) => {
        let catName = args[0]?.toLowerCase();
        if (!catName) return msg.reply("🥀 Usage: .category [admin/bugs/media]");
        
        // Hii itatuma Buttons za Category husika pekee
        msg.reply(fancy(`🥀 Loading ${catName} interface...`));
    }
};