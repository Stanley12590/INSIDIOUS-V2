const express = require('express');
const pino = require('pino');
const path = require('path');
const { makeWASocket, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@adiwajshing/baileys');
const { useMongoDBAuthState } = require('./authServices'); // Custom module for managing MongoDB auth state
const AuthDB = require('./AuthDB'); // Database model to manage authentication
const PORT = process.env.PORT || 3000;

const logger = pino({ level: 'info' });

const app = express();

// Maintain active bot connections globally
const globalConns = new Map();

/**
 * Validate and clean up the phone number format
 * This checks if the number has at least 10 digits, and removes any non-numeric characters.
 */
const validateAndCleanNumber = (num) => {
    const cleanNum = num.replace(/[^0-9]/g, '');
    if (cleanNum.length < 10 || cleanNum.length > 15) {
        return null; // Invalid number
    }
    return cleanNum;
};

/**
 * Handles bot connection lifecycle events.
 * Deals with connections being established or closed.
 */
const handleConnectionUpdate = async (update, sessionId, conn, saveCreds) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
        logger.info(`✅ Bot is now online for Session ID: ${sessionId}`);
        try {
            await conn.sendMessage(conn.user.id, { text: "🤖 Insidious bot connected successfully!" });
            logger.info('Welcome message sent to bot user.');
        } catch (e) {
            logger.error(`Failed to send welcome message for session ID ${sessionId}. Error: `, e);
        }
    }

    if (connection === 'close') {
        logger.warn(`Connection closed for Session ID: ${sessionId}`);
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
            logger.info(`Retrying connection for session ID ${sessionId} in 5 seconds...`);
            setTimeout(() => startBot(sessionId), 5000);
        } else {
            logger.info(`Session ID ${sessionId} is logged out. Cleaning up session.`);
            await AuthDB.deleteMany({ sessionId });
            globalConns.delete(sessionId);
        }
    }
};

/**
 * Starts a bot session for the given sessionId.
 * Sets up the connection to WhatsApp Web using Baileys library.
 */
const startBot = async (sessionId) => {
    try {
        logger.info(`Starting bot for Session ID: ${sessionId}`);
        const { state, saveCreds } = await useMongoDBAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            logger,
            browser: Browsers.ubuntu('Chrome'),
        });

        globalConns.set(sessionId, conn);

        conn.ev.on('connection.update', (update) => handleConnectionUpdate(update, sessionId, conn, saveCreds));
        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('messages.upsert', async (message) => {
            if (typeof handler === 'function') {
                handler(conn, message);
            }
        });

        return conn;
    } catch (e) {
        logger.error(`Error while starting bot for session ID ${sessionId}:`, e);
    }
};

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * PAIRING ENDPOINT: Handles WhatsApp pairing for a given phone number
 */
app.get('/pair', async (req, res) => {
    const num = req.query.num;

    if (!num) {
        return res.status(400).json({ error: 'No phone number provided!' });
    }

    // Validate and clean number format
    const cleanNum = validateAndCleanNumber(num);

    if (!cleanNum) {
        return res.status(400).json({ error: 'Invalid phone number. Make sure to include at least 10 digits.' });
    }

    try {
        logger.info(`Initiating pairing process for number: ${cleanNum}`);

        // 1. Clear any existing session for this number if it exists
        await AuthDB.deleteMany({ sessionId: cleanNum });

        // 2. Create a temporary auth state for this number
        const { state, saveCreds } = await useMongoDBAuthState(cleanNum);
        const { version } = await fetchLatestBaileysVersion();

        // 3. Make a temporary socket connection for pairing
        const tempConn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        let pairingCompleted = false;

        // Setup timeout for pairing process (60 seconds)
        const timeout = setTimeout(() => {
            if (!pairingCompleted) {
                tempConn.end();
                res.status(408).json({ error: 'Pairing timeout. Please try again.' });
                logger.warn(`Pairing timeout for number: ${cleanNum}`);
            }
        }, 60000); // 60 seconds

        tempConn.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                // Connection successful, send pairing code
                try {
                    logger.info(`Requesting pairing code for number: ${cleanNum}`);
                    const code = await tempConn.requestPairingCode(cleanNum);

                    pairingCompleted = true;
                    clearTimeout(timeout);

                    res.json({ success: true, pairingCode: code });
                    logger.info(`Pairing code sent to client for number: ${cleanNum}`);

                    // Save creds if they are updated during this session
                    tempConn.ev.on('creds.update', saveCreds);

                    // Close the temporary connection after pairing is complete
                    setTimeout(() => tempConn.end(), 5000);
                } catch (e) {
                    logger.error(`Failed to request pairing code for ${cleanNum}:`, e);
                    if (!pairingCompleted) {
                        clearTimeout(timeout);
                        res.status(500).json({ error: 'Error getting pairing code. Please try again.' });
                    }
                    tempConn.end();
                }
            }
        });

    } catch (e) {
        logger.error('Pairing error:', e);
        res.status(500).json({ error: 'Internal Server Error. Please try again.' });
    }
});

/**
 * HEALTH CHECK ENDPOINT: Checks the server health and number of active bots.
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        active_bots: globalConns.size,
    });
});

// Start the Express server
app.listen(PORT, () => logger.info(`Server started and running on port ${PORT}`));