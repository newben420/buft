const Account = require("./account");
const BitgetEngine = require("./bitget");
const TickerEngine = require("./ticker");
const Trader = require("./trader");

/**
 * Responsible for the successful intialization of various engines
 * @returns {Promise<boolean>}
 */
const startEngine = () => {
    return new Promise(async (resolve, reject) => {
        const started = (await BitgetEngine.start()) && 
        (await Account.start()) &&
        (await Trader.start()) &&
        (await TickerEngine.start());
        resolve(started);
    })
}

module.exports = startEngine;