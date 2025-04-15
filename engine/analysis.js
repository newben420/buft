const Candlestick = require("../model/candlestick")
const Signal = require("../model/signal")

/**
 * This analysis candlestick data and generates entry signals
 */
class Analysis {

    /**
     * Runs analysis on candlestic kdata
     * @param {string} symbol 
     * @param {Candlestick[]} data 
     * @returns {Promise<Signal|null>}
     */
    static run = (symbol, data) => {
        return new Promise((resolve, reject) => {
            // TODO
            resolve(null);
        })
    }
}

module.exports = Analysis;