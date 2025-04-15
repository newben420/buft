const BitgetEngine = require("./bitget");
const TickerEngine = require("./ticker");

/**
 * Responsible for the successful intialization of various engines
 * @returns {Promise<boolean>}
 */
const startEngine = () => {
    return new Promise(async (resolve, reject) => {
        const started = (await BitgetEngine.start()) && (await TickerEngine.start());
        resolve(started);
    })
}

module.exports = startEngine;