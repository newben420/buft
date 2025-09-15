const BitgetEngine = require("../engine/bitget");
const Log = require("../lib/log");
const { } = require("bitget-api");
const Site = require("../site");
const Candlestick = require("./candlestick");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Analysis = require("../engine/analysis");
const Trader = require("../engine/trader");
const reverseGranularity = require("../lib/reverse_granularity");

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
     * Mark Price.
     * @type {number}
     */
    mark_price;

    /**
     * Returns Mark Price.
     * @returns {number}
     */
    getMarkPrice() {
        const data = (this.candlestickData || []);
        const row = (data[data.length - 1] || {});
        return this.mark_price || row.close || 0;
    }


    /**
     * Temp cache for consolidated data
     * @type {Record<string, Candlestick[]>}
     */
    consoleCache;

    /**
     * Returns the correct candlestick data for a particular granularity
     * @param {string} gran 
     * @returns {Candlestick[]}
     */
    getConsolidateData = (gran = Site.TK_GRANULARITY_DEF) => {
        if (this.consoleCache[gran]) {
            return this.consoleCache[gran];
        }
        else {
            const min = Site.TK_INTERVALS[0];
            const max = Site.TK_INTERVALS.slice(-1)[0];
            const current = Math.min(max, Math.max(min, (reverseGranularity(gran) || 0)));
            const ratio = current / min;
            const source = this.candlestickData;
            const consolidated = [];
            for (let i = source.length - 1; i >= 0; i -= ratio) {
                // const slice = source.slice(i, i + ratio);
                const slice = source.slice(i - ratio + 1, i + 1);
                if (slice.length < ratio) {
                    break;
                }

                const open = slice[0].open;
                const close = slice[slice.length - 1].close;
                const ts = slice[0].ts;
                const high = Math.max(...slice.map(c => c.high));
                const low = Math.min(...slice.map(c => c.low));
                const volume = slice.reduce((sum, c) => sum + (c.volume || 0), 0);
                consolidated.unshift(new Candlestick(open, high, low, close, volume, ts));
                if (consolidated.length >= Site.TK_MAX_ROWS) {
                    break;
                }
            }

            this.consoleCache[gran] = consolidated;
            return consolidated;
        }
    }

    /**
     * Keeps the ticker alive
     */
    fetchCandleStickData() {
        this.last_fetched = Date.now();
        const conclude = () => {
            const now = Date.now();
            const scheduledTS = this.last_fetched + Site.TK_INTERVALS[0];
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
            granularity: Site.TK_GRANULARITIES[0],
            productType: Site.TK_PRODUCT_TYPE,
            symbol: this.symbol,
            kLineType: "MARKET",
            limit: this.candlestickData.length > 0 ? `1` : `${Math.min(1000, Site.TK_COMPUTED_MAX_ROWS)}`,
        }).then(data => {
            if (data.msg == "success") {
                const d = data.data;
                this.consoleCache = {};
                this.candlestickData = this.candlestickData.concat(d.map(x => new Candlestick(x[1], x[2], x[3], x[4], x[6], x[0])));
                if (this.candlestickData.length > Site.TK_COMPUTED_MAX_ROWS) {
                    this.candlestickData = this.candlestickData.slice(this.candlestickData.length - Site.TK_COMPUTED_MAX_ROWS);
                }
                const l = d.length;
                Log.flow(`Candlestick > ${this.symbol} > Fetched ${l} row${l == 1 ? '' : 's'}.`, 5);
                Analysis.run(this.symbol, this.getConsolidateData).then(signal => {
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
        this.mark_price = 0;
        this.consoleCache = {};
        this.fetchCandleStickData();
    }

}

module.exports = Ticker;