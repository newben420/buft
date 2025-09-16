process.env.COLLER = true;
const arg = process.argv.slice(2);
if (arg.length && arg[0] == "nc") {
    process.argv.splice(2, 0, ".env");
}
const Analysis = require("./engine/analysis");
const BitgetEngine = require("./engine/bitget");
const getDateTime = require("./lib/get_date_time");
const getTimeElapsed = require("./lib/get_time_elapsed");
const Log = require("./lib/log");
const reverseGranularity = require("./lib/reverse_granularity");
const Candlestick = require("./model/candlestick");
const rootDir = require("./root");
const Site = require("./site");
const fs = require("fs");
const path = require("path");

const useCache = arg.indexOf("nc") < 0;

Site.PRODUCTION = true;
Site.FLOW_LOG_MAX_PRIORITY = 1;
Site.IN_CFG.ML_COL_DATA = true;
Site.BROADCAST = false;

const tc = str => str.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

/**
 * This is responsible for hastened data collection for multilayering
 * It is independent of the normal working of the server
 * This is a standalone script
 */
class Collector {

    static #cacheId = `CL_${Site.CL_ROWS}_${Site.TK_GRANULARITY}`;

    /**
     * @type {Record<string,Record<string, any[]>>}
     */
    static #cache = {};

    static #persPth = path.resolve(rootDir(), "analysis");
    static #cachePth = path.resolve(Collector.#persPth, "cache.json");
    static #colPth = path.resolve(Collector.#persPth, "col_data.json");

    /**
     * @type {Record<string, Record<string>[]>};
     */
    static #colData = {}

    /**
    * Script initialzizer.
    * @returns {Promise<boolean>}
    */
    static #start = () => {
        return new Promise((resolve, reject) => {
            Log.flow(`Collector > Running prerequisites.`, 0);
            try {
                if (!fs.existsSync(Collector.#persPth)) {
                    fs.mkdirSync(Collector.#persPth);
                    Log.flow(`Collector > Created directory at '${Collector.#persPth}'.`, 0);
                }
                if (fs.existsSync(Collector.#cachePth)) {
                    Log.flow(`Collector > Cache file found at '${Collector.#cachePth}'.`, 0);
                    Collector.#cache = JSON.parse(fs.readFileSync(Collector.#cachePth, "utf8"));
                    resolve(true);
                }
                else {
                    Log.flow(`Collector > No cache found.`, 0);
                    resolve(true);
                }
            } catch (error) {
                Log.flow(`Collector > Error encountered ${error.message ? `${error.message}` : ''}.`, 0);
                Log.dev(error);
                resolve(false);
            }
        });
    }

    /**
     * Script destructor.
     * @returns {Promise<boolean>}
     */
    static #stop = () => {
        return new Promise((resolve, reject) => {
            Log.flow(`Collector > Running post-sctipts.`, 0);
            try {
                fs.writeFileSync(Collector.#cachePth, JSON.stringify(Collector.#cache), "utf8");
                Log.flow(`Collector > Saved cache to '${Collector.#cachePth}'.`, 0);
                fs.writeFileSync(Collector.#colPth, JSON.stringify(Collector.#colData, null, "\t"), "utf8");
                Log.flow(`Collector > Saved collector data to '${Collector.#colPth}'.`, 0);
                resolve(true);
            } catch (error) {
                Log.flow(`Collector > Error encountered ${error.message ? `${error.message}` : ''}.`, 0);
                Log.dev(error);
                resolve(false);
            }
        })
    }

    /**
     * Ensures data is available for a token
     * @param {string} symbol 
     * @returns {Promise<Candlestick[]|null>}
     */
    static #fetchData = (symbol) => {
        return new Promise(async (resolve, reject) => {
            let cachedData = (Collector.#cache[Collector.#cacheId] || {})[symbol];
            if ((cachedData ? (cachedData.length > 0) : false) && useCache) {
                Log.flow(`Collector > Cached data found for ${symbol}.`, 0);
                resolve(cachedData);
            }
            else {
                Log.flow(`Collector > Cached data not found for ${symbol}. Fetching data...`, 0);
                if (!Collector.#cache[Collector.#cacheId]) {
                    Collector.#cache[Collector.#cacheId] = {};
                }
                if (!Collector.#cache[Collector.#cacheId][symbol] || (!useCache)) {
                    Collector.#cache[Collector.#cacheId][symbol] = []
                }
                let remainingRowsToCollect = (Math.ceil(Site.CL_ROWS * Site.TK_GRAN_RATIOS.slice(-1)[0])) + Site.CL_ROWS;
                let maxRowsPerFetch = Site.CL_MAX_ROWS_PER_FETCH;
                let errorEncountered = "";
                let lastStartTime = Math.floor((Date.now() - ((Math.ceil(Site.CL_ROWS * Site.TK_GRAN_RATIOS.slice(-1)[0]) + Site.CL_ROWS) * Site.TK_INTERVALS[0])) / 1000) * 1000;
                Log.flow(`Collector > ${symbol} > Data starting from ${getTimeElapsed(lastStartTime, Date.now())} ago will be collected.`, 0);
                while (remainingRowsToCollect > 0 && (!errorEncountered)) {
                    let nowCollecting = (remainingRowsToCollect > maxRowsPerFetch ? (maxRowsPerFetch) : remainingRowsToCollect);
                    let endTime = lastStartTime + (nowCollecting * Site.TK_INTERVALS[0]);
                    if (nowCollecting > maxRowsPerFetch) {
                        nowCollecting = maxRowsPerFetch;
                    }
                    remainingRowsToCollect -= nowCollecting;
                    Log.flow(`Collector > ${symbol} > Now fetching ${nowCollecting} row${nowCollecting == 1 ? '' : 's'} of candlestick data from ${getDateTime(lastStartTime)} to ${getDateTime(endTime)}.`, 0);
                    try {
                        const data = await BitgetEngine.getRestClient().getFuturesHistoricCandles({
                            granularity: Site.TK_GRANULARITIES[0],
                            productType: Site.TK_PRODUCT_TYPE,
                            symbol: symbol,
                            kLineType: "MARKET",
                            limit: nowCollecting,
                            endTime: endTime,
                        });
                        if (data.msg = "success") {
                            Collector.#cache[Collector.#cacheId][symbol] = Collector.#cache[Collector.#cacheId][symbol].concat(data.data.map(x => new Candlestick(x[1], x[2], x[3], x[4], x[6], x[0])));
                        }
                        else {
                            errorEncountered = `${data.code} - ${data.msg}`;
                        }
                    } catch (error) {
                        Log.dev(error);
                        errorEncountered = "Unknown Error";
                    }
                    lastStartTime = endTime;
                }
                if (errorEncountered) {
                    Log.flow(`Collector > ${symbol} > Fetch failed with error '${errorEncountered}'.`, 0);
                    resolve(null);
                }
                else {
                    const l = Collector.#cache[Collector.#cacheId][symbol].length;
                    Log.flow(`Collector > ${symbol} > Fetch succeeded (${l} row${l == 1 ? "" : "s"}).`, 0);
                    resolve(Collector.#cache[Collector.#cacheId][symbol]);
                }
            }
        });
    }

    /**
     * Activation method
     */
    static run = async () => {
        Log.flow(`Collector > Initialized.`, 0);
        if (Site.CL_SYMBOLS.length) {
            const started = await Collector.#start();
            if (started) {
                Log.flow(`Collector > Done running prerequisites.`, 0);
                let kk = 1;
                for (const symbol of Site.CL_SYMBOLS) {
                    Log.flow(`${kk}. Collector > ${symbol} > Obtaining data...`, 0);
                    const data = await Collector.#fetchData(symbol);
                    if (data ? (data.length > 0) : false) {
                        Log.flow(`${kk}. Collector > ${symbol} > Data obtained.`, 0);
                        let t = 0;
                        const rows = (Math.ceil(Site.CL_ROWS * Site.TK_GRAN_RATIOS.slice(-1)[0]));
                        for (let i = (rows - 1); i < data.length; i++) {
                            t++;
                            const d = data.slice((i + 1 - rows), (i + 1));
                            /**
                             * Temp cache for consolidated data
                             * @type {Record<string, Candlestick[]>}
                             */
                            const consoleCache = {};

                            /**
                             * Returns the correct candlestick data for a particular granularity
                             * @param {string} gran 
                             * @returns {Candlestick[]}
                             */
                            const getConsolidateData = (gran = Site.TK_GRANULARITY_DEF) => {
                                if (consoleCache[gran]) {
                                    return consoleCache[gran];
                                }
                                else {
                                    const min = Site.TK_INTERVALS[0];
                                    const max = Site.TK_INTERVALS.slice(-1)[0];
                                    const current = Math.min(max, Math.max(min, (reverseGranularity(gran) || 0)));
                                    const ratio = current / min;
                                    const source = d;
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
                        
                                    consoleCache[gran] = consolidated;
                                    return consolidated;
                                }
                            }
                            const signal = await Analysis.run(symbol, getConsolidateData);
                        }
                        Log.flow(`${kk}. Collector > ${symbol} > Analysis succeeded ${t} time${t == 1 ? "" : "s"}.`, 0);
                    }
                    else {
                        Log.flow(`${kk}. Collector > ${symbol} > Failed to obtain data.`, 0);
                    }
                    kk++;
                }
                Collector.#colData = Analysis.collectedData;
                await Collector.#stop();
            }
            else {
                Log.flow(`Collector > Script failed to start.`, 0);
            }
        }
        else {
            Log.flow(`Collector > No tickers found.`, 0);
        }
    }
}

Collector.run();