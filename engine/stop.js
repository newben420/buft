const Site = require("../site");
const Analysis = require("./analysis");
const BroadcastEngine = require("./broadcast");
const { GroqEngine } = require("./groq");
const TelegramEngine = require("./telegram");

/**
 * Responsible for the successful shutting down of various engines when necessary
 * @returns {Promise<boolean>}
 */
const stopEngine = () => {
    return new Promise(async (resolve, reject) => {
        await Promise.all([
            Analysis.stop(),
            GroqEngine.shutdown(),
            BroadcastEngine.exit(),
        ]);
        if (Site.TG_SEND_STOP) {
            TelegramEngine.sendMessage(`😴 *${Site.TITLE}* is going to sleep`, r => {
                resolve(true);
            });
        }
        else {
            resolve(true);
        }
    })
}

module.exports = stopEngine;