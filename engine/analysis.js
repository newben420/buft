const booleanThreshold = require("../lib/boolean_threshold");
const { compute1ExpDirection, computeArithmeticDirection, clearDirection } = require("../lib/direction");
const Log = require("../lib/log");
const Candlestick = require("../model/candlestick");
const Multilayered = require("../model/multilayered");
const Signal = require("../model/signal");
const Site = require("../site");
const fs = require("fs");
const strategy = require("./strategy.json");
const {
    MACD, PSAR, Stochastic, bullish, bearish, VWAP, ADL, ATR, AwesomeOscillator, ROC, ForceIndex,
    TRIX, ADX, BollingerBands, CCI, MFI, RSI, abandonedbaby, bearishengulfingpattern, darkcloudcover,
    piercingline, eveningstar, eveningdojistar, threeblackcrows, gravestonedoji, bearishharami, bearishmarubozu,
    tweezertop, hangingman, shootingstar, bearishharamicross, morningstar, threewhitesoldiers, bullishengulfingpattern,
    morningdojistar, hammerpattern, dragonflydoji, bullishharami, bullishmarubozu, bullishharamicross, tweezerbottom,
} = require("technicalindicators");
const FFF = require("../lib/fff");

/**
 * This analysis candlestick data and generates entry signals
 */
class Analysis {
    /**
     * Holds take profit data for a token
     * @type {Record<string, number[]>}
     */
    static #tp = {};

    /**
     * Holds volatility data for a token
     * @type {Record<string, number[]>}
     */
    static #vol = {};

    /**
     * This applies strategy to compute long and short signals
     * @param {Record<string, any>} state 
     * @returns {Record<string, any>}
     */
    static #computeMatrix = (state) => {
        const {
            overallBull,
            overallBear,
            supportBull,
            supportBear,
            goodBuy,
            goodSell,
            overBought,
            overSold,
            bearishReversal,
            bullishReversal,
            adxStrong,
            adxWeak,
            priceDir
        } = state;
        const result = Object.keys(strategy).map(result => {
            let score = 0;
            let maxScore = 0;
            let strat = strategy[result];
            for (const rule of strat.rules) {
                maxScore += rule.weight;
                const actual = state[rule.var];
                if (rule.hasOwnProperty("value")) {
                    if (actual === rule.value) score += rule.weight;
                } else if (rule.hasOwnProperty("greaterThan")) {
                    if (actual > rule.greaterThan) score += rule.weight;
                } else if (rule.hasOwnProperty("lessThan")) {
                    if (actual < rule.lessThan) score += rule.weight;
                }
            }
            const confidence = score / maxScore * 100;
            if (score >= strat.threshold && confidence >= Site.IN_MIN_CONFIDENCE) {
                return {
                    signal: result,
                    score,
                    confidence,
                };
            }
            return null;
        }).filter(Boolean).sort((a, b) => {
            if (a.confidence !== b.confidence) {
                return b.confidence - a.confidence;
            }
            return b.score - a.score;
        });
        const description = (result[0] || {}).signal || "No Signal";
        const possibleLong = description.toLowerCase().includes("long");
        const possibleShort = description.toLowerCase().includes("short");
        const long = possibleLong && (!possibleShort);
        const short = possibleShort && (!possibleLong);
        return { long, short, description, result };
    }

    /**
     * Holds collected data if collection is enabled.
     * @type {any}
     */
    static #collectedData = {}

    /**
     * Collects data for external multilayering analysis if collection is enabled.
     * @param {string} symbol 
     * @param {number} rate 
     * @param {string} signal 
     * @param {boolean} long 
     * @param {boolean} short 
     * @param {number} vol 
     * @param {number} tpsl 
     * @param {string} desc 
     * @param {any} extra 
     */
    static #collector = (
        symbol,
        rate,
        signal,
        long,
        short,
        vol,
        tpsl,
        desc,
        extra
    ) => {
        if (!Analysis.#collectedData[symbol]) {
            Analysis.#collectedData[symbol] = [];
        }
        if (signal) {
            Analysis.#collectedData[symbol].push({
                rate,
                signal,
                long,
                short,
                vol,
                tpsl,
                desc,
                extra,
            });
        }
    }

    /**
     * Gracious stop function
     * @returns {Promise<boolean>}
     */
    static stop = () => {
        return new Promise((resolve, reject) => {
            try {
                if (Object.keys(Analysis.#collectedData).length > 0) {
                    fs.writeFileSync(Site.IN_ML_DATA_PATH, JSON.stringify(Analysis.#collectedData, null, "\t"));
                    Log.flow(`Collector > Data collection saved to ${Site.IN_ML_DATA_PATH}`, 0);
                }
            } catch (error) {
                Log.dev(error);
            }
            finally {
                resolve(true);
            }
        })
    }

    /**
     * Keeps track of immediate past overbought and oversold values of each ticker
     * @type {Record<string, Record<string, boolean>}
     */
    static #obos = {}

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
                const ts = Date.now();
                const open = data.map(x => x.open);
                const high = data.map(x => x.high);
                const low = data.map(x => x.low);
                const close = data.map(x => x.close);
                const volume = data.map(x => x.volume);
                const latestRate = close[close.length - 1] || 0;
                const csd = { open, close, high, low };

                const priceDir = compute1ExpDirection(close);
                // const priceDir = computeArithmeticDirection(close);
                if (!Analysis.#obos[symbol]) {
                    Analysis.#obos[symbol] = {};
                }


                // PRIMARY INDICATORS
                const macd = MACD.calculate({ values: close, fastPeriod: Site.IN_MACD_FAST_PERIOD, slowPeriod: Site.IN_MACD_SLOW_PERIOD, signalPeriod: Site.IN_MACD_SIGNAL_PERIOD, SimpleMAOscillator: false, SimpleMASignal: false });
                const psar = PSAR.calculate({ high, low, step: Site.IN_PSAR_STEP, max: Site.IN_PSAR_MAX });
                const stoch = Stochastic.calculate({ close, high, low, period: Site.IN_STOCH_PERIOD, signalPeriod: Site.IN_STOCH_SIGNAL_PERIOD });
                // PRIMARY COMPUTATIONS
                const macdBull = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD > macd[macd.length - 1].signal : false) : false;
                const macdBear = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD < macd[macd.length - 1].signal : false) : false;
                const psarBull = (psar[psar.length - 1] ?? latestRate) < latestRate;
                const psarBear = (psar[psar.length - 1] ?? latestRate) > latestRate;
                const stochOB = stoch.length > 0 ? (Math.max(stoch[stoch.length - 1].k, stoch[stoch.length - 1].d) > 80) : false;
                const stochOS = stoch.length > 0 ? (Math.max(stoch[stoch.length - 1].k, stoch[stoch.length - 1].d) < 20) : false;
                const stochBull = stochOB ? false : (stoch.length > 1 ? (((stoch[stoch.length - 1].k || stoch[stoch.length - 1].k === 0) && (stoch[stoch.length - 1].d || stoch[stoch.length - 1].d === 0)) ? (stoch[stoch.length - 1].k > stoch[stoch.length - 1].d) : false) : false);
                const stochBear = stochOS ? false : (stoch.length > 1 ? (((stoch[stoch.length - 1].k || stoch[stoch.length - 1].k === 0) && (stoch[stoch.length - 1].d || stoch[stoch.length - 1].d === 0)) ? (stoch[stoch.length - 1].k < stoch[stoch.length - 1].d) : false) : false);

                // COMPUTE TREND CONFIRMATION AND SUPORTING INDICATORS
                const trendBull = bullish(csd);
                const trendBear = bearish(csd);
                const vwap = VWAP.calculate({ close, high, low, volume });
                const vwapBull = vwap.length > 0 ? latestRate > vwap[vwap.length - 1] : false;
                const vwapBear = vwap.length > 0 ? latestRate < vwap[vwap.length - 1] : false;
                const adl = ADL.calculate({ close, high, low, volume });
                const adlDir = computeArithmeticDirection(adl);
                const adlBull = adlDir > 0 && priceDir > 0;
                const adlBear = adlDir < 0 && priceDir < 0;
                const atr = ATR.calculate({ close, high, low, period: Site.IN_MA_PERIOD });
                const ao = AwesomeOscillator.calculate({ fastPeriod: Site.IN_AO_FAST_PERIOD, slowPeriod: Site.IN_AO_SLOW_PERIOD, high, low });
                const aoBull = (ao[ao.length - 1] ?? -1) > 0;
                const aoBear = (ao[ao.length - 1] ?? 1) < 0;
                const roc = ROC.calculate({ values: close, period: Site.IN_MA_PERIOD });
                const rocDir = computeArithmeticDirection(roc);
                const rocBull = (roc[roc.length - 1] ?? -1) > 0;
                const rocBear = (roc[roc.length - 1] ?? 1) < 0;
                const fi = ForceIndex.calculate({ close, volume, period: Site.IN_FI_PERIOD });
                const fiDir = computeArithmeticDirection(fi);
                const fiBull = fiDir > 0 && (fi[fi.length - 1] ?? 0) > 0;
                const fiBear = fiDir < 0 && (fi[fi.length - 1] ?? 0) < 0;
                const trix = TRIX.calculate({ period: Site.IN_MA_PERIOD, values: close });
                const trixBull = (trix[trix.length - 1] ?? 0) > 0;
                const trixBear = (trix[trix.length - 1] ?? 0) < 0;
                const adx = ADX.calculate({ close, high, low, period: Site.IN_MA_PERIOD * 2 });
                const adxStrong = adx.length > 0 ? ((adx[adx.length - 1].adx || adx[adx.length - 1].adx === 0) ? adx[adx.length - 1].adx > 25 : false) : false;
                const adxWeak = adx.length > 0 ? ((adx[adx.length - 1].adx || adx[adx.length - 1].adx === 0) ? adx[adx.length - 1].adx < 20 : false) : false;
                const bb = BollingerBands.calculate({ period: Site.IN_BB_PERIOD, stdDev: Site.IN_BB_STDDEV, values: close });
                const bbBuy = bb.length > 0 ? latestRate < bb[bb.length - 1].lower : false;
                const bbSell = bb.length > 0 ? latestRate > bb[bb.length - 1].upper : false;
                const bbOS = bbBuy;
                const bbOB = bbSell;

                // OVERBOUGHT AND OVERSOLD INDICATORS
                const cci = CCI.calculate({ close, high, low, period: Site.IN_MA_PERIOD });
                const mfi = MFI.calculate({ close, high, low, volume, period: Math.min(Site.IN_MA_PERIOD, data.length) });
                const rsi = RSI.calculate({ values: close, period: Math.min(Site.IN_MA_PERIOD, data.length) });
                // OVERBOUGHT AND OVERSOLD COMPUTATIONS
                const cciOB = (cci[cci.length - 1] ?? -1) > 100;
                const mfiOB = (mfi[mfi.length - 1] ?? 80) > 80;
                const rsiOB = (rsi[rsi.length - 1] ?? 70) > 70;
                const cciOS = (cci[cci.length - 1] ?? 1) < -100;
                const mfiOS = (mfi[mfi.length - 1] ?? 20) < 20;
                const rsiOS = (rsi[rsi.length - 1] ?? 30) < 30;

                // CANDLESTICK COMPUTATIONS
                const bearishReversal = (abandonedbaby(csd) || bearishengulfingpattern(csd) ||
                    darkcloudcover(csd) || piercingline(csd) || eveningstar(csd) || eveningdojistar(csd) ||
                    threeblackcrows(csd) || gravestonedoji(csd) || bearishharami(csd) || bearishmarubozu(csd) ||
                    tweezertop(csd) || hangingman(csd) || shootingstar(csd) || bearishharamicross(csd)) &&
                    Analysis.#obos[symbol].ob &&
                    clearDirection(close.slice(close.length - 3)) <= 0;
                const bullishReversal = (abandonedbaby(csd) || bullishengulfingpattern(csd) ||
                    threewhitesoldiers(csd) || morningstar(csd) || morningdojistar(csd) || hammerpattern(csd) ||
                    dragonflydoji(csd) || bullishharami(csd) || bullishmarubozu(csd) || bullishharamicross(csd) ||
                    tweezerbottom(csd)) && Analysis.#obos[symbol].os &&
                    clearDirection(close.slice(close.length - 3)) >= 0;

                // PREFLOW COMPUTATIONS
                const overallBull = macdBull && (psarBull || stochBull);
                const overallBear = macdBear && (psarBear || stochBear);
                const supportBull = booleanThreshold([
                    trendBull,
                    vwapBull,
                    adlBull,
                    aoBull,
                    rocBull,
                    fiBull,
                    trixBull,
                ]);
                const supportBear = booleanThreshold([
                    trendBear,
                    vwapBear,
                    adlBear,
                    aoBear,
                    rocBear,
                    fiBear,
                    trixBear,
                ]);
                const goodBuy = bbBuy;
                const goodSell = bbSell;
                const volatilityPerc = (atr.length > 0 ? atr[atr.length - 1] : 0) / latestRate * 100;
                const TPSLPerc = Math.abs((psar[psar.length - 1] ?? latestRate) - latestRate) / latestRate * 100;
                if (!Analysis.#tp[symbol]) {
                    Analysis.#tp[symbol] = [];
                }
                if (!Analysis.#vol[symbol]) {
                    Analysis.#vol[symbol] = [];
                }
                Analysis.#tp[symbol].push(TPSLPerc);
                Analysis.#vol[symbol].push(volatilityPerc);
                if (Analysis.#tp[symbol].length > Site.IN_DIRECTION_MAX_LENGTH) {
                    Analysis.#tp[symbol] = Analysis.#tp[symbol].slice(Analysis.#tp[symbol].length - Site.IN_DIRECTION_MAX_LENGTH);
                }
                if (Analysis.#vol[symbol].length > Site.IN_DIRECTION_MAX_LENGTH) {
                    Analysis.#vol[symbol] = Analysis.#vol[symbol].slice(Analysis.#vol[symbol].length - Site.IN_DIRECTION_MAX_LENGTH);
                }

                // FINAL COMPUTATIONS
                const overBought = booleanThreshold([stochOB, cciOB, mfiOB, rsiOB, bbOB]);
                const overSold = booleanThreshold([stochOS, cciOS, mfiOS, rsiOS, bbOS]);
                const currentState = {
                    overallBull,
                    overallBear,
                    supportBull,
                    supportBear,
                    goodBuy,
                    goodSell,
                    overBought,
                    overSold,
                    bearishReversal,
                    bullishReversal,
                    adxStrong,
                    adxWeak,
                    priceDir,
                }

                let { long, short, description, result } = Analysis.#computeMatrix(currentState);
                const VT = `${clearDirection(Analysis.#vol[symbol])}${clearDirection(Analysis.#tp[symbol])}`;
                const signal = new Signal(short, long, description, volatilityPerc, TPSLPerc);
                Analysis.#multilayer(symbol, long, short, description, latestRate, ts, signal);
                const signals = Analysis.#getMultilayeredHistory(symbol);

                // CORRECT SIGNALS HERE
                const { nlong, nshort } = Analysis.#correctSignals(signals, long, short, description);
                signal.long = nlong;
                signal.short = nshort;

                if ((long || short) && !nlong && !nshort) {
                    signal.description = "Corrected Signal";
                }

                // COLLECT DATA FOR EXTERNAL MULTILAYER ANALYSIS FROM HERE
                if (Site.IN_ML_COLLECT_DATA) {
                    Analysis.#collector(symbol, latestRate, signals[signals.length - 1], signal.long, signal.short, volatilityPerc, TPSLPerc, signal.description,
                        {
                            macdBear,
                            macdBull,
                            psarBull,
                            psarBear,
                            stochBull,
                            stochBear,
                            trendBull,
                            trendBear,
                            vwapBull,
                            adlBull,
                            aoBull,
                            rocBull,
                            fiBull,
                            trixBull,
                            vwapBear,
                            adlBear,
                            aoBear,
                            rocBear,
                            fiBear,
                            trixBear,
                            stochOB, cciOB, mfiOB, rsiOB,
                            stochOS, cciOS, mfiOS, rsiOS,
                            bearishReversal,
                            bullishReversal,
                            priceDir,
                            VT,
                            overallBull,
                            overallBear,
                            supportBull,
                            supportBear,
                            goodBuy,
                            goodSell,
                            overBought,
                            overSold,
                            adxStrong,
                            adxWeak,
                        }
                    );
                }

                // REGISTER CURRENT OB AND OS
                Analysis.#obos[symbol].ob = overBought;
                Analysis.#obos[symbol].os = overSold;

                // CONCLUDE ANALYSIS
                Log.flow(`Analysis > ${symbol} > Success > Long: ${signal.long ? "Yes" : "No"} | Short: ${signal.short ? "Yes" : "No"} | Price: ${FFF(latestRate)}`, 5);
                resolve(signal);
            }
            else {
                Log.flow(`Analysis > ${symbol} > Error > Not enough rows.`, 5);
                resolve(null);
            }
        })
    }

    /**
     * Performs multilayering signal check
     * Simple and static for now
     * @param {string[]} signals 
     * @param {boolean} long 
     * @param {boolean} short 
     * @param {string} desc 
     * @returns {any}
     */
    static #correctSignals = (signals, long, short, desc) => {
        let nlong = long;
        let nshort = short;
        if (signals.length < 2) {
            nlong = false;
            nshort = false;
        }
        else {
            if (signals.length > 2) {
                signals = signals.slice(signals.length - 2);
            }
            let signal = signals.join(" ");
            if (long) {
                nlong = signal == "FHNP BDNP"
            }
            if (short) {
                nshort = signal == "FHNP FHJL"
            }
        }
        if(long && Site.TR_SIGNAL_BLACKLIST.indexOf(desc) >= 0){
            nlong = false;
        }
        if(short && Site.TR_SIGNAL_BLACKLIST.indexOf(desc) >= 0){
            nshort = false;
        }
        return { nlong, nshort };
    }

    /**
     * Holds most recent signal made on a token
     * @type {Record<string, Signal>}
     */
    static #latestSignal = {};

    /**
     * Holds multilayered data per each token
     * @type {Record<string, Multilayered>}
     */
    static #multilayered = {};

    /**
     * Holds multilayered history per each token
     * @type {Record<string, string[]};
     */
    static #multilayeredHistory = {};


    /**
     * Get ticker's signal history
     * @param {string} symbol
     * @returns {string[]}
     */
    static #getMultilayeredHistory = (symbol) => {
        /**
         * @type {string[]}
         */
        let history = [];
        if (Analysis.#multilayeredHistory[symbol]) {
            history = history.concat(Analysis.#multilayeredHistory[symbol]);
        }
        if (Analysis.#multilayered[symbol] ? Analysis.#multilayered[symbol].signals.length > 0 : false) {
            history = history.concat([Analysis.#multilayered[symbol].signals.sort((a, b) => a.localeCompare(b)).join("")]);
        }
        if (history.length > Site.IN_MAX_SIGNAL_HISTORY_LENGTH) {
            history = history.slice(history.length - Site.IN_MAX_SIGNAL_HISTORY_LENGTH);
        }
        return history
    }

    /**
     * Computes multilayering
     * @param {string} symbol 
     * @param {boolean} long 
     * @param {boolean} short 
     * @param {string} desc 
     * @param {number} rate 
     * @param {number} ts 
     * @param {Signal} signal
     */
    static #multilayer = (symbol, long, short, desc, rate, ts, signal) => {
        // Ensure objects are initialized
        if (!Analysis.#multilayered[symbol]) {
            Analysis.#multilayered[symbol] = new Multilayered();
        }
        if (!Analysis.#multilayeredHistory[symbol]) {
            Analysis.#multilayeredHistory[symbol] = [];
        }
        if (ts !== Analysis.#multilayered[symbol].ts && Analysis.#multilayered[symbol].signals.length > 0) {
            // harvest
            Analysis.#multilayeredHistory[symbol].push(Analysis.#multilayered[symbol].signals.sort((a, b) => a.localeCompare(b)).join(""));
            if (Analysis.#multilayeredHistory[symbol].length > Site.IN_MAX_SIGNAL_HISTORY_LENGTH) {
                Analysis.#multilayeredHistory[symbol] = Analysis.#multilayeredHistory[symbol].slice(Analysis.#multilayeredHistory[symbol].length - Site.IN_MAX_SIGNAL_HISTORY_LENGTH);
            }
            Analysis.#multilayered[symbol].signals = [];
        }
        Analysis.#multilayered[symbol].ts = ts;
        if (Analysis.#latestSignal[symbol]) {
            if (long) {
                if (Analysis.#latestSignal[symbol].long) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("A") == -1) {
                        Analysis.#multilayered[symbol].signals.push("A");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("B") == -1) {
                        Analysis.#multilayered[symbol].signals.push("B");
                    }
                }
                if (Analysis.#latestSignal[symbol].short) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("C") == -1) {
                        Analysis.#multilayered[symbol].signals.push("C");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("D") == -1) {
                        Analysis.#multilayered[symbol].signals.push("D");
                    }
                }
            }
            else {
                if (Analysis.#latestSignal[symbol].long) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("E") == -1) {
                        Analysis.#multilayered[symbol].signals.push("E");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("F") == -1) {
                        Analysis.#multilayered[symbol].signals.push("F");
                    }
                }
                if (Analysis.#latestSignal[symbol].short) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("G") == -1) {
                        Analysis.#multilayered[symbol].signals.push("G");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("H") == -1) {
                        Analysis.#multilayered[symbol].signals.push("H");
                    }
                }
            }
            if (short) {
                if (Analysis.#latestSignal[symbol].long) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("I") == -1) {
                        Analysis.#multilayered[symbol].signals.push("I");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("J") == -1) {
                        Analysis.#multilayered[symbol].signals.push("J");
                    }
                }
                if (Analysis.#latestSignal[symbol].short) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("K") == -1) {
                        Analysis.#multilayered[symbol].signals.push("K");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("L") == -1) {
                        Analysis.#multilayered[symbol].signals.push("L");
                    }
                }
            }
            else {
                if (Analysis.#latestSignal[symbol].long) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("M") == -1) {
                        Analysis.#multilayered[symbol].signals.push("M");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("N") == -1) {
                        Analysis.#multilayered[symbol].signals.push("N");
                    }
                }
                if (Analysis.#latestSignal[symbol].short) {
                    if (Analysis.#multilayered[symbol].signals.indexOf("O") == -1) {
                        Analysis.#multilayered[symbol].signals.push("O");
                    }
                }
                else {
                    if (Analysis.#multilayered[symbol].signals.indexOf("P") == -1) {
                        Analysis.#multilayered[symbol].signals.push("P");
                    }
                }
            }
        }
        if (!Analysis.#latestSignal[symbol]) {
            Analysis.#latestSignal[symbol] = structuredClone(signal);
        }
        Analysis.#latestSignal[symbol].long = long;
        Analysis.#latestSignal[symbol].short = short;
    }
}

module.exports = Analysis;