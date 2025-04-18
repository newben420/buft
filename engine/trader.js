const Signal = require("../model/signal");

/**
 * Manages trades and signal exec.
 */
class Trader {
    /**
     * Is called when there is a new signal received
     * @param {string} symbol 
     * @param {Signal} signal 
     */
    static newSignal = (symbol, signal) => {
        // TODO - STREAMLINE ORDER PROCESS AND SUBSCRIBE TO ORDER WS ON START
    }

}

module.exports = Trader;