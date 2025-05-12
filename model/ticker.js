const BitgetEngine = require("../engine/bitget");
const Log = require("../lib/log");
const { } = require("bitget-api");
const Site = require("../site");
const Candlestick = require("./candlestick");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Analysis = require("../engine/analysis");
const Trader = require("../engine/trader");

/**
 * This holds an added Ticker data
 */
class Ticker {
    /**
     * Symbol (Trading Pair) of the tickers
     * @type {string}
     */
    symbol;

    /**
     * This is refrence to the timeout object of the interval data fetching method
     * @type {NodeJS.Timeout}
     */
    dataTimeoutObject;

    /**
     * Keeps candlestick data
     * @type {Candlestick[]}
     */
    candlestickData;

    /**
     * Keeps track of the epoch milliseconds timestamp of the last time candlestick data was fetched
     * @type {number}
     */
    last_fetched;

    /**
     * Keeps the ticker alive
     */
    fetchCandleStickData() {
        this.last_fetched = Date.now();
        const conclude = () => {
            const now = Date.now();
            const scheduledTS = this.last_fetched + Site.TK_INTERVAL;
            if (now >= scheduledTS) {
                this.fetchCandleStickData();
            }
            else {
                const timeToSchedule = scheduledTS - now;
                Log.flow(`Candlestick > ${this.symbol} > Next iteration in ${getTimeElapsed(now, scheduledTS)}.`, 5);
                if (this.dataTimeoutObject) {
                    clearTimeout(this.dataTimeoutObject);
                }
                this.dataTimeoutObject = setTimeout(() => {
                    this.fetchCandleStickData();
                }, timeToSchedule);
            }
        }
        Log.flow(`Candlestick > ${this.symbol} > Initialized.`, 5);
        BitgetEngine.getRestClient().getFuturesCandles({
            granularity: Site.TK_GRANULARITY,
            productType: Site.TK_PRODUCT_TYPE,
            symbol: this.symbol,
            kLineType: "MARKET",
            limit: this.candlestickData.length > 0 ? `1` : `${Site.TK_MAX_ROWS}`,
        }).then(data => {
            if (data.msg == "success") {
                const d = data.data;
                this.candlestickData = this.candlestickData.concat(d.map(x => new Candlestick(x[1], x[2], x[3], x[4], x[6])));
                if (this.candlestickData.length > Site.TK_MAX_ROWS) {
                    this.candlestickData = this.candlestickData.slice(this.candlestickData.length - Site.TK_MAX_ROWS);
                }
                const l = d.length;
                Log.flow(`Candlestick > ${this.symbol} > Fetched ${l} row${l == 1 ? '' : 's'}.`, 5);
                Analysis.run(this.symbol, this.candlestickData).then(signal => {
                    if (signal) {
                        if (signal.long || signal.short) {
                            // SUBMIT SIGNAL TO TRADER
                            Trader.newSignal(this.symbol, signal);
                        }
                        conclude();
                    }
                    else {
                        Log.flow(`Analysis > ${this.symbol} > No signal.`, 5);
                        conclude();
                    }
                }).catch(err => {
                    Log.dev(err);
                    Log.flow(`Analysis > ${this.symbol} > Error > ${err.body ? `${err.body.code} - ${err.body.msg}` : `Unknwown`}.`, 5);
                    conclude();
                });
            }
            else {
                Log.flow(`Candlestick > ${this.symbol} > Error > ${data.code} - ${data.msg}.`, 5);
                this.candlestickData = [];
                conclude();
            }
        }).catch(err => {
            Log.dev(err);
            Log.flow(`Candlestick > ${this.symbol} > Error > ${err.body ? `${err.body.code} - ${err.body.msg}` : `Unknwown`}.`, 5);
            this.candlestickData = [];
            conclude();
        });
    }

    /**
     * destroys the ticker internally
     * @returns {Promise<boolean>}
     */
    destroy() {
        return new Promise((resolve, reject) => {
            if (this.dataTimeoutObject) {
                clearTimeout(this.dataTimeoutObject);
            }
            resolve(true);
        });
    }

    /**
     * Object constructor
     * @param {string} symbol 
     */
    constructor(symbol) {
        this.symbol = symbol;
        this.candlestickData = [];
        this.fetchCandleStickData();
    }

}

module.exports = Ticker;