const Log = require("../lib/log");
const Candlestick = require("../model/candlestick")
const Signal = require("../model/signal");
const Site = require("../site");

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
            Log.flow(`Analysis > ${symbol} > Initialized.`, 5);
            if (data.length >= Site.AS_MIN_ROWS) {
                
            }
            else {
                Log.flow(`Analysis > ${symbol} > Error > Not enough rows.`, 5);
                resolve(null);
            }
        })
    }
}

module.exports = Analysis;