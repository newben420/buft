const { compute1ExpDirection, computeArithmeticDirection } = require("../lib/direction");
const Log = require("../lib/log");
const Candlestick = require("../model/candlestick")
const Signal = require("../model/signal");
const Site = require("../site");
const {
    MACD, PSAR, Stochastic, bullish, bearish, VWAP, ADL, ATR, AwesomeOscillator, ROC, ForceIndex,
    TRIX, ADX, BollingerBands, CCI, MFI, RSI, abandonedbaby, bearishengulfingpattern, darkcloudcover,
    piercingline, eveningstar, eveningdojistar, threeblackcrows, gravestonedoji, bearishharami, bearishmarubozu,
    tweezertop, hangingman, shootingstar, bearishharamicross, morningstar, threewhitesoldiers, bullishengulfingpattern,
    morningdojistar, hammerpattern, dragonflydoji, bullishharami, bullishmarubozu, bullishharamicross, tweezerbottom,
} = require("technicalindicators");

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
                const open = data.map(x => x.open);
                const high = data.map(x => x.high);
                const low = data.map(x => x.low);
                const close = data.map(x => x.close);
                const volume = data.map(x => x.volume);
                const latestRate = close[close.length - 1] || 0;
                const csd = { open, close, high, low };

                const priceDir = computeArithmeticDirection(close);


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


                console.log("MACD", "BULL", macdBull, "BEAR", macdBear);
                console.log("PSAR", "BULL", psarBull, "BEAR", psarBear);
                console.log("STOCH", "BULL", stochBull, "BEAR", stochBear, "OB", stochOB, "OS", stochOS);
                console.log("PRICE DIR", priceDir);
                console.log("TREND", "BULL", trendBull, "BEAR", trendBear);
                console.log("VWAP", "BULL", vwapBull, "BEAR", vwapBear);
                console.log("ADL", "BULL", adlBull, "BEAR", adlBear);


                resolve(null);
            }
            else {
                Log.flow(`Analysis > ${symbol} > Error > Not enough rows.`, 5);
                resolve(null);
            }
        })
    }
}

module.exports = Analysis;