const BitgetEngine = require("./bitget");

/**
 * Responsible for the successful intialization of various engines
 * @returns {Promise<boolean>}
 */
const startEngine = () => {
    return new Promise(async (resolve, reject) => {
        const started = (await BitgetEngine.start());
        resolve(started);
    })
}

module.exports = startEngine;