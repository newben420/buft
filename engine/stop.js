const Analysis = require("./analysis");

/**
 * Responsible for the successful shutting down of various engines when necessary
 * @returns {Promise<boolean>}
 */
const stopEngine = () => {
    return new Promise(async (resolve, reject) => {
        await Analysis.stop();
        resolve(true);
    })
}

module.exports = stopEngine;