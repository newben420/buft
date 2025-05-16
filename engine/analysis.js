const Log = require("../lib/log");
const Candlestick = require("../model/candlestick");
const Multilayered = require("../model/multilayered");
const Signal = require("../model/signal");
const Site = require("../site");
const fs = require("fs");
const {
    MACD, PSAR, Stochastic, bullish, bearish, VWAP, ADL, ATR, AwesomeOscillator,
    TRIX, ADX, CCI, MFI, RSI, darkcloudcover,
    piercingline, eveningstar, threeblackcrows,
    tweezertop, hangingman, shootingstar,
    IchimokuCloud,
    StochasticRSI,
    SMA,
    EMA,
    WMA,
    threewhitesoldiers,
    morningstar,
    hammerpattern,
    tweezerbottom,
    abandonedbaby,
    bullishengulfingpattern,
    morningdojistar,
    dragonflydoji,
    bullishharami,
    bullishmarubozu,
    bullishharamicross,
    bearishengulfingpattern,
    eveningdojistar,
    gravestonedoji,
    bearishharami,
    bearishmarubozu,
    bearishharamicross,
    KST,
} = require("technicalindicators");
const FFF = require("../lib/fff");
const booleanConsolidator = require("../lib/boolean_consolidator");
const calculateUtf8FileSize = require("../lib/file_size");
const getDateTime = require("../lib/get_date_time");

let TelegramEngine = null;

/**
 * This analysis candlestick data and generates entry signals
 */
class Analysis {
    /**
     * Holds previous entry values per token
     * @type {Record<string, boolean[]>}
     */
    static #isEntryBull = {};

    /**
     * Holds previous entry values per token
     * @type {Record<string, boolean[]>}
     */
    static #isEntryBear = {};

    /**
     * Remove ticker
     * @param {string} symbol 
     */
    static removeTicker = (symbol) => {
        delete Analysis.#latestSignal[symbol];
        delete Analysis.#multilayered[symbol];
        delete Analysis.#multilayeredHistory[symbol];
        delete Analysis.#isEntryBear[symbol];
        delete Analysis.#isEntryBull[symbol];
    }

    /**
     * Gracious exit function
     * @returns {Promise<boolean>}
     */
    static stop = () => {
        return new Promise((resolve, reject) => {
            try {
                if (Site.IN_CFG.ML_COL_DATA && (!Site.PRODUCTION)) {
                    fs.writeFileSync(Site.IN_ML_DATA_PATH, JSON.stringify(Analysis.collectedData, null, "\t"));
                    Log.flow("Analysis > Data collection saved.");
                }
            } catch (error) {

            }
            finally {
                resolve(true);
            }
        })
    }

    /**
     * Keeps track of last time a collected file was sent
     * @type {number}
     */
    static #lastChecked = 0;

    /**
     * Holds collected data if collection is enabled.
     * @type {any}
     */
    static collectedData = {}

    /**
     * 
     * @param {string} symbol 
     * @param {number} rate 
     * @param {string} signal 
     * @param {boolean} long 
     * @param {boolean} short 
     * @param {number} sl 
     * @param {string} desc 
     * @param {any} extra
     */
    static #collector = (
        symbol,
        rate,
        signal,
        long,
        short,
        sl,
        desc,
        extra
    ) => {
        if (Site.IN_CFG.ML_COL_DATA) {
            if (!Analysis.collectedData[symbol]) {
                Analysis.collectedData[symbol] = [];
            }
            if (signal) {
                Analysis.collectedData[symbol].push({
                    rate,
                    signal,
                    long,
                    short,
                    sl,
                    desc,
                    extra,
                });
                if ((Date.now() - Analysis.#lastChecked) >= (Site.IN_CFG.COOL_DOWN_MS || 60000)) {
                    try {
                        if (!TelegramEngine) {
                            TelegramEngine = require("./telegram");
                        }
                        const content = JSON.stringify(Analysis.collectedData);
                        const size = calculateUtf8FileSize(content);
                        if (size >= (Site.IN_CFG.COL_MX_FILSIZ || 2000000)) {
                            Analysis.sendCollected();
                        }
                    } catch (error) {
                        Log.dev(error);
                    }
                }
            }
        }
    }

    static #sending = false;

    static sendCollected = async () => {
        try {
            if (!Analysis.#sending) {
                Analysis.#sending = true;
                if (!TelegramEngine) {
                    TelegramEngine = require("./telegram");
                }
                const content = JSON.stringify(Analysis.collectedData);
                if (content.length > 0) {
                    let caption = `*Collected Candlestick Analysis Data* - ${getDateTime()}`;
                    const d = new Date();
                    let filename = `${d.getFullYear().toString().padStart(2, '0')}${(d.getMonth() + 1).toString().padStart(2, '0')}${(d.getDate()).toString().padStart(2, '0')}${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}${d.getSeconds().toString().padStart(2, '0')}.json`;
                    const done = await TelegramEngine.sendStringAsJSONFile(content, caption, filename);
                    if (done) {
                        Analysis.collectedData = {};
                    }
                }
                Analysis.#sending = false;
            }
        } catch (error) {
            Log.dev(error);
        }
    }

    static #lastTS = 0;

    /**
     * Runs analysis on candlestic kdata
     * @param {string} symbol 
     * @param {Candlestick[]} data 
     * @returns {Promise<Signal|null>}
     */
    static run = (symbol, data) => {
        return new Promise((resolve, reject) => {
            Log.flow(`Analysis > ${symbol} > Initialized.`, 5);
            if (data.length >= (Site.IN_CFG.MN_DATA_LEN || 10)) {
                let ts = Date.now();
                if (ts == Analysis.#lastTS) {
                    ts = ts + 1;
                }
                Analysis.#lastTS = ts;
                const open = data.map(x => x.open);
                const high = data.map(x => x.high);
                const low = data.map(x => x.low);
                const close = data.map(x => x.close);
                const volume = data.map(x => x.volume);
                const latestRate = close[close.length - 1] || 0;
                const csd = { open, close, high, low };

                let cache = {
                    PSR: null,
                    PSR_BULL: null,
                    PSR_BEAR: null,
                    PSR_SL: null,
                    MCD: null,
                    MCD_BULL: null,
                    MCD_BEAR: null,
                    ICH: null,
                    ICH_BULL: null,
                    ICH_BEAR: null,
                    ICH_SL: null,
                    BLL_BULL: null,
                    BLL_BEAR: null,
                    BLL_BEAR: null,
                    KST_BULL: null,
                    KST_BEAR: null,
                    SMA_BULL: null,
                    SMA_BEAR: null,
                    EMA_BULL: null,
                    EMA_BEAR: null,
                    WMA_BULL: null,
                    WMA_BEAR: null,
                    VWP_BULL: null,
                    VWP_BEAR: null,
                    AOS_BULL: null,
                    AOS_BEAR: null,
                    TRX_BULL: null,
                    TRX_BEAR: null,
                    STRONG: null,
                    STC_OB: null,
                    STC_OS: null,
                    RSI_OB: null,
                    RSI_OS: null,
                    CCI_OB: null,
                    CCI_OS: null,
                    MFI_OB: null,
                    MFI_OS: null,
                    BBS_OB: null,
                    BBS_OS: null,
                    SRS_OB: null,
                    SRS_OS: null,
                    SRS_BULL: null,
                    SRS_BEAR: null,
                    STR: null,
                    HGM: null,
                    BAR: null,
                    EST: null,
                    TBC: null,
                    PIL: null,
                    DCC: null,
                    TTP: null,
                    TWS: null,
                    MST: null,
                    HMR: null,
                    TBT: null,
                    ABB: null,
                    BEP: null,
                    EDS: null,
                    GSD: null,
                    BRH: null,
                    BRM: null,
                    BHC: null,
                    BLE: null,
                    MDS: null,
                    DFD: null,
                    BLH: null,
                    BLM: null,
                    BLC: null,
                    ATR: null,
                    ENTRY: null,
                };

                const ensureInd = {
                    PSR: () => {
                        if (!cache.PSR) {
                            const psar = PSAR.calculate({ high, low, step: Site.IN_CFG.PSR_ST ?? 0.02, max: Site.IN_CFG.PSR_MX ?? 0.2 });
                            const psarBull = (psar[psar.length - 1] ?? latestRate) < latestRate;
                            const psarBear = (psar[psar.length - 1] ?? latestRate) > latestRate;
                            const sl = psar[psar.length - 1] || 0;
                            cache.PSR = true;
                            cache.PSR_BULL = psarBull;
                            cache.PSR_BEAR = psarBear;
                            cache.PSR_SL = sl;
                        }
                    },
                    MCD: () => {
                        if (!cache.MCD) {
                            const macd = MACD.calculate({ values: close, fastPeriod: Site.IN_CFG.MCD_FSP ?? 12, slowPeriod: Site.IN_CFG.MCD_SLP ?? 26, signalPeriod: Site.IN_CFG.MCD_SGP ?? 9, SimpleMAOscillator: false, SimpleMASignal: false });
                            const macdBull = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD > macd[macd.length - 1].signal : false) : false;
                            const macdBear = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD < macd[macd.length - 1].signal : false) : false;
                            cache.MCD = true;
                            cache.MCD_BULL = macdBull;
                            cache.MCD_BEAR = macdBear;
                        }
                    },
                    SRS: () => {
                        if (cache.SRS_OB === null) {
                            const srsi = StochasticRSI.calculate({
                                dPeriod: Site.IN_CFG.STC_SP ?? 3,
                                kPeriod: Site.IN_CFG.STC_SP ?? 3,
                                rsiPeriod: Site.IN_CFG.RSI_P ?? 14,
                                stochasticPeriod: Site.IN_CFG.STC_P ?? 14,
                                values: close,
                            });
                            const OB = (((srsi[srsi.length - 1] || {}).stochRSI || 0) > 80) &&
                                (((srsi[srsi.length - 1] || {}).d || 0) > 80) &&
                                (((srsi[srsi.length - 1] || {}).k || 0) > 80);
                            const OS = (((srsi[srsi.length - 1] || {}).stochRSI || 100) < 20) &&
                                (((srsi[srsi.length - 1] || {}).d || 100) < 20) &&
                                (((srsi[srsi.length - 1] || {}).k || 100) < 20);
                            cache.SRS_OB = OB;
                            cache.SRS_OS = OS;
                            cache.SRS_BULL = !OS;
                            cache.SRS_BEAR = !OB;
                        }
                    },
                    ICH: () => {
                        if (!cache.ICH) {
                            const ichimoku = IchimokuCloud.calculate({
                                high,
                                low,
                                conversionPeriod: Site.IN_CFG.ICH_CVP ?? 9,
                                basePeriod: Site.IN_CFG.ICH_BSP ?? 26,
                                spanPeriod: Site.IN_CFG.ICH_SPP ?? 52,
                                displacement: Site.IN_CFG.ICH_DIS ?? 26,
                            });
                            const conversion = (ichimoku[ichimoku.length - 1] || {}).conversion ?? 0;
                            const base = (ichimoku[ichimoku.length - 1] || {}).base ?? 0;
                            const spanA = (ichimoku[ichimoku.length - 1] || {}).spanA ?? 0;
                            const spanB = (ichimoku[ichimoku.length - 1] || {}).spanB ?? 0;
                            const lag = close[close.length - (Site.IN_CFG.ICH_DIS ?? 26) - 1] ?? 0;
                            const lagSpanA = (ichimoku[ichimoku.length - 1 - (Site.IN_CFG.ICH_DIS ?? 26)] || {}).spanA ?? 0;
                            const lagSpanB = (ichimoku[ichimoku.length - 1 - (Site.IN_CFG.ICH_DIS ?? 26)] || {}).spanB ?? 0;
                            const bull = (latestRate > spanA) && (spanA > spanB) && (conversion > base) && (lag > Math.max(lagSpanA, lagSpanB));
                            const bear = (latestRate < spanA) && (spanA < spanB) && (conversion < base) && (lag < Math.min(lagSpanA, lagSpanB));
                            let sl = spanB;
                            cache.ICH = true;
                            cache.ICH_BULL = bull;
                            cache.ICH_BEAR = bear;
                            cache.ICH_SL = sl;
                        }
                    },
                    BLL: () => {
                        if (cache.BLL_BULL === null) {
                            cache.BLL_BULL = bullish(csd);
                            cache.BLL_BEAR = bearish(csd);
                        }
                    },
                    SMA: () => {
                        if (cache.SMA_BULL === null) {
                            const ma = SMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.SMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.SMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                    },
                    KST: () => {
                        if (cache.KST_BULL === null) {
                            const kst = KST.calculate({
                                ROCPer1: Site.IN_CFG.KST_RP1 ?? 10,
                                ROCPer2: Site.IN_CFG.KST_RP2 ?? 15,
                                ROCPer3: Site.IN_CFG.KST_RP3 ?? 20,
                                ROCPer4: Site.IN_CFG.KST_RP4 ?? 30,
                                signalPeriod: Site.IN_CFG.KST_SGP ?? 9,
                                SMAROCPer1: Site.IN_CFG.KST_SP1 ?? 10,
                                SMAROCPer2: Site.IN_CFG.KST_SP2 ?? 10,
                                SMAROCPer3: Site.IN_CFG.KST_SP3 ?? 10,
                                SMAROCPer4: Site.IN_CFG.KST_SP4 ?? 15,
                                values: close,
                            });
            
                            const bull = (((kst[kst.length - 1] || {}).kst || Number.MIN_VALUE) > ((kst[kst.length - 1] || {}).signal || 0))
                            && (((kst[kst.length - 1] || {}).kst || Number.MIN_VALUE) > 0);
                            const bear = (((kst[kst.length - 1] || {}).kst || Number.MAX_VALUE) < ((kst[kst.length - 1] || {}).signal || 0))
                            && (((kst[kst.length - 1] || {}).kst || Number.MAX_VALUE) < 0);
                            cache.KST_BULL = bull;
                            cache.KST_BEAR = bear;
                        }
                    },
                    EMA: () => {
                        if (cache.EMA_BULL === null) {
                            const ma = EMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.EMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.EMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                    },
                    WMA: () => {
                        if (cache.WMA_BULL === null) {
                            const ma = WMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.WMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.WMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                    },
                    VWP: () => {
                        if (cache.VWP_BULL === null) {
                            const vwap = VWAP.calculate({ close, high, low, volume });
                            cache.VWP_BULL = latestRate > (vwap[vwap.length - 1] || Infinity);
                            cache.VWP_BEAR = latestRate < (vwap[vwap.length - 1] || 0);
                        }
                    },
                    AOS: () => {
                        if (cache.AOS_BULL === null) {
                            const ao = AwesomeOscillator.calculate({ high, low, fastPeriod: Site.IN_CFG.AOS_FSP ?? 5, slowPeriod: Site.IN_CFG.AOS_SLP ?? 34 });
                            cache.AOS_BULL = (ao[ao.length - 1] || 0) > 0;
                            cache.AOS_BEAR = (ao[ao.length - 1] || 0) < 0;
                        }
                    },
                    TRX: () => {
                        if (cache.TRX_BULL === null) {
                            const trix = TRIX.calculate({ values: close, period: Site.IN_CFG.TRX_P ?? 15 });
                            cache.TRX_BULL = (trix[trix.length - 1] || 0) > 0;
                            cache.TRX_BEAR = (trix[trix.length - 1] || 0) < 0;
                        }
                    },
                    ADX: () => {
                        if (cache.STRONG === null) {
                            const adx = ADX.calculate({ close, high, low, period: Site.IN_CFG.ADX_P ?? 14 });
                            cache.STRONG = ((adx[adx.length - 1] || {}).adx || 0) >= 25;
                        }
                    },
                    STC: () => {
                        if (cache.STC_OB === null) {
                            const stoch = Stochastic.calculate({ close, high, low, period: Site.IN_CFG.STC_P ?? 14, signalPeriod: Site.IN_CFG.STC_SP ?? 3 });
                            cache.STC_OB = ((stoch[stoch.length - 1] || {}).k || 0) > 80;
                            cache.STC_OS = ((stoch[stoch.length - 1] || {}).k || Infinity) < 20;
                        }
                    },
                    RSI: () => {
                        if (cache.RSI_OB === null) {
                            const rsi = RSI.calculate({ values: close, period: Site.IN_CFG.RSI_P ?? 14 });
                            cache.RSI_OB = (rsi[rsi.length - 1] || 0) > 70;
                            cache.RSI_OS = (rsi[rsi.length - 1] || Infinity) < 30;
                        }
                    },
                    CCI: () => {
                        if (cache.CCI_OB === null) {
                            const cci = CCI.calculate({ close, high, low, period: Site.IN_CFG.CCI_P ?? 14 });
                            cache.CCI_OB = (cci[cci.length - 1] || 0) > 100;
                            cache.CCI_OB = (cci[cci.length - 1] || Infinity) < -100;
                        }
                    },
                    MFI: () => {
                        if (cache.MFI_OB === null) {
                            const mfi = MFI.calculate({ close, volume, high, low, period: Site.IN_CFG.MFI_P ?? 14 });
                            cache.MFI_OB = (mfi[mfi.length - 1] || 0) > 80;
                            cache.MFI_OS = (mfi[mfi.length - 1] || Infinity) < 20;
                        }
                    },
                    STR: () => {
                        if (cache.STR === null) {
                            cache.STR = shootingstar(csd);
                        }
                    },
                    HGM: () => {
                        if (cache.HGM === null) {
                            cache.HGM = hangingman(csd);
                        }
                    },
                    EST: () => {
                        if (cache.EST === null) {
                            cache.EST = eveningstar(csd);
                        }
                    },
                    TBC: () => {
                        if (cache.TBC === null) {
                            cache.TBC = threeblackcrows(csd);
                        }
                    },
                    PIL: () => {
                        if (cache.PIL === null) {
                            cache.PIL = piercingline(csd);
                        }
                    },
                    DCC: () => {
                        if (cache.DCC === null) {
                            cache.DCC = darkcloudcover(csd);
                        }
                    },
                    TTP: () => {
                        if (cache.TTP === null) {
                            cache.TTP = tweezertop(csd);
                        }
                    },
                    TWS: () => {
                        if (cache.TWS === null) {
                            cache.TWS = threewhitesoldiers(csd);
                        }
                    },
                    MST: () => {
                        if (cache.MST === null) {
                            cache.MST = morningstar(csd);
                        }
                    },
                    HMR: () => {
                        if (cache.HMR === null) {
                            cache.HMR = hammerpattern(csd);
                        }
                    },
                    TBT: () => {
                        if (cache.TBT === null) {
                            cache.TBT = tweezerbottom(csd);
                        }
                    },
                    ABB: () => {
                        if (cache.ABB === null) {
                            cache.ABB = abandonedbaby(csd);
                        }
                    },
                    BLE: () => {
                        if (cache.BLE === null) {
                            cache.BLE = bullishengulfingpattern(csd);
                        }
                    },
                    MDS: () => {
                        if (cache.MDS === null) {
                            cache.MDS = morningdojistar(csd);
                        }
                    },
                    DFD: () => {
                        if (cache.DFD === null) {
                            cache.DFD = dragonflydoji(csd);
                        }
                    },
                    BLH: () => {
                        if (cache.BLH === null) {
                            cache.BLH = bullishharami(csd);
                        }
                    },
                    BLM: () => {
                        if (cache.BLM === null) {
                            cache.BLM = bullishmarubozu(csd);
                        }
                    },
                    BLC: () => {
                        if (cache.BLC === null) {
                            cache.BLC = bullishharamicross(csd);
                        }
                    },
                    BEP: () => {
                        if (cache.BEP === null) {
                            cache.BEP = bearishengulfingpattern(csd);
                        }
                    },
                    EDS: () => {
                        if (cache.EDS === null) {
                            cache.EDS = eveningdojistar(csd);
                        }
                    },
                    GSD: () => {
                        if (cache.GSD === null) {
                            cache.GSD = gravestonedoji(csd);
                        }
                    },
                    BRH: () => {
                        if (cache.BRH === null) {
                            cache.BRH = bearishharami(csd);
                        }
                    },
                    BRM: () => {
                        if (cache.BRM === null) {
                            cache.BRM = bearishmarubozu(csd);
                        }
                    },
                    BHC: () => {
                        if (cache.BHC === null) {
                            cache.BHC = bearishharamicross(csd);
                        }
                    },
                    ATR: () => {
                        if (cache.ATR === null) {
                            const atr = ATR.calculate({ period: Site.IN_CFG.ATR_P ?? 14, close, high, low });
                            const perc = ((atr[atr.length - 1] || 0) / latestRate) * 100;
                            cache.ATR = perc;
                        }
                    },
                };

                /**
                 * Computes entry point.
                 * @returns {boolean|null} True if bullish entry detected, False if bearish entry detected, else False.
                 */
                const step1 = () => {
                    ensureInd[Site.STR_ENTRY_IND]();
                    if (!Analysis.#isEntryBull[symbol]) {
                        Analysis.#isEntryBull[symbol] = [];
                    }
                    if (!Analysis.#isEntryBear[symbol]) {
                        Analysis.#isEntryBear[symbol] = [];
                    }
                    Analysis.#isEntryBull[symbol].push(cache[`${Site.STR_ENTRY_IND}_BULL`] || false);
                    Analysis.#isEntryBear[symbol].push(cache[`${Site.STR_ENTRY_IND}_BEAR`] || false);
                    if (Analysis.#isEntryBull[symbol].length > (Site.IN_CFG.DIR_LEN || 5)) {
                        Analysis.#isEntryBull[symbol] = Analysis.#isEntryBull[symbol].slice(Analysis.#isEntryBull[symbol].length - (Site.IN_CFG.DIR_LEN || 5));
                    }
                    if (Analysis.#isEntryBear[symbol].length > (Site.IN_CFG.DIR_LEN || 5)) {
                        Analysis.#isEntryBear[symbol] = Analysis.#isEntryBear[symbol].slice(Analysis.#isEntryBear[symbol].length - (Site.IN_CFG.DIR_LEN || 5));
                    }
                    if (Analysis.#isEntryBull[symbol].length >= 2 ? (((Analysis.#isEntryBull[symbol][Analysis.#isEntryBull[symbol].length - 1]) && (!Analysis.#isEntryBull[symbol][Analysis.#isEntryBull[symbol].length - 2]))) : false) {
                        return true;
                    }
                    if (Analysis.#isEntryBear[symbol].length >= 2 ? (((Analysis.#isEntryBear[symbol][Analysis.#isEntryBear[symbol].length - 1]) && (!Analysis.#isEntryBear[symbol][Analysis.#isEntryBear[symbol].length - 2]))) : false) {
                        return false;
                    }
                    return null;
                }

                /**
                 * Confirms bull trend.
                 * @returns {boolean} True if bull trend else False.
                 */
                const step2 = () => {
                    for (let i = 0; i < Site.STR_TREND_IND.length; i++) {
                        ensureInd[Site.STR_TREND_IND[i]]();
                    }
                    /**
                     * @type {boolean[]}
                     */
                    const bools = Site.STR_TREND_IND.map(x => cache[`${x}_${cache.ENTRY ? 'BULL' : 'BEAR'}`] || false);
                    return booleanConsolidator(bools, Site.STR_TREND_CV);
                }

                /**
                 * Confirms strong trend.
                 * @returns {boolean} True if strong trend else False.
                 */
                const step3 = () => {
                    ensureInd.ADX();
                    return cache.STRONG || false;
                }

                /**
                 * Detects overbought.
                 * @returns {boolean} True if overbought else False.
                 */
                const step4 = () => {
                    for (let i = 0; i < Site.STR_OB_IND.length; i++) {
                        ensureInd[Site.STR_OB_IND[i]]();
                    }
                    /**
                     * @type {boolean[]}
                     */
                    const bools = Site.STR_OB_IND.map(x => cache[`${x}_${cache.ENTRY ? 'OB' : 'OS'}`] || false);
                    return booleanConsolidator(bools, Site.STR_OB_CV);
                }

                /**
                 * Detects reversal patterns.
                 * @returns {boolean} True if reversal else False.
                 */
                const step5 = () => {
                    for (let i = 0; i < (cache.ENTRY ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR).length; i++) {
                        ensureInd[(cache.ENTRY ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR)[i]]();
                    }
                    /**
                     * @type {boolean[]}
                     */
                    const bools = (cache.ENTRY ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR).map(x => cache[`${x}`] || false);
                    return booleanConsolidator(bools, Site.STR_REV_CV);
                }

                /**
                 * Computes stoploss price.
                 * @returns {number}
                 */
                const step6 = () => {
                    ensureInd[Site.STR_TSL_IND]();
                    if (cache.ENTRY === true) {
                        return cache[`${Site.STR_TSL_IND}_SL`] < latestRate ? cache[`${Site.STR_TSL_IND}_SL`] : (latestRate - (cache[`${Site.STR_TSL_IND}_SL`] - latestRate));
                    }
                    else if (cache.ENTRY === false) {
                        return cache[`${Site.STR_TSL_IND}_SL`] > latestRate ? cache[`${Site.STR_TSL_IND}_SL`] : (latestRate + (latestRate - cache[`${Site.STR_TSL_IND}_SL`]));
                    }
                    return 0;
                }

                /**
                 * Ensures price volatility is within suitable percentage range.
                 * @returns {boolean} True if within range else False.
                 */
                const step7 = () => {
                    ensureInd.ATR();
                    return cache.ATR >= (Site.STR_VOL_RNG[0] || 0) && cache.ATR <= (Site.STR_VOL_RNG[1] || Infinity);
                }

                let stoploss = 0;
                let long = false;
                let short = false;
                let desc = "No Signal";

                Log.flow(`Analysis > ${symbol} > Checking for entry...`, 6);
                cache.ENTRY = step1();
                if (cache.ENTRY === true || cache.ENTRY === false) {
                    // Entry detected.
                    Log.flow(`Analysis > ${symbol} > Entry detected. Confirming ${cache.ENTRY ? 'bull' : 'bear'} trend...`, 6);
                    if ((Site.STR_TREND_FV && step2()) || (!Site.STR_TREND_FV)) {
                        // Trend confirmed.
                        Log.flow(`Analysis > ${symbol} > Trend confirmed. Checking trend strength...`, 6);
                        if ((Site.STR_STG_FV && step3()) || (!Site.STR_STG_FV)) {
                            // Trend strength confirmed.
                            Log.flow(`Analysis > ${symbol} > Strength is acceptable. Checking if over${cache.ENTRY ? 'bought' : 'sold'}...`, 6);
                            if ((Site.STR_OB_FV && (!step4())) || (!Site.STR_OB_FV)) {
                                // No presence of effecting overbought confirmed.
                                Log.flow(`Analysis > ${symbol} > Overbought condition acceptable. Checking for reversals...`, 6);
                                if ((Site.STR_REV_FV && (!step5())) || (!Site.STR_REV_FV)) {
                                    Log.flow(`Analysis > ${symbol} > Reversal conditions acceptable. Checking volatility...`, 6);
                                    // No reversl detected.
                                    if (step7()) {
                                        // Volatility is acceptable
                                        Log.flow(`Analysis > ${symbol} > Volatility is acceptable. Buy signal confirmed.`, 6);
                                        if (cache.ENTRY) {
                                            long = true;
                                            desc = "Confirmed Long"
                                        }
                                        else {
                                            short = true;
                                            desc = "Confirmed Short"
                                        }
                                    }
                                    else {
                                        Log.flow(`Analysis > ${symbol} > Volatility out of range.`, 6);
                                    }
                                }
                                else {
                                    Log.flow(`Analysis > ${symbol} > Trend reversal detected.`, 6);
                                }
                            }
                            else {
                                Log.flow(`Analysis > ${symbol} > Ticker is overbought.`, 6);
                            }
                        }
                        else {
                            Log.flow(`Analysis > ${symbol} > Strength not acceptable.`, 6);
                        }
                    }
                    else {
                        Log.flow(`Analysis > ${symbol} > Trend not confirmed.`, 6);
                    }
                }
                else {
                    Log.flow(`Analysis > ${symbol} > No entry detected.`, 6);
                }

                stoploss = step6();
                // Stop loss computed.
                // Object.keys(ensureInd).forEach(key => ensureInd[key]());


                const signal = new Signal(short, long, desc, cache.ATR, stoploss, latestRate);

                Analysis.#multilayer(symbol, long, short, desc, latestRate, ts, signal);
                const signals = Analysis.#getMultilayeredHistory(symbol);
                cache = Object.fromEntries(Object.entries(cache).filter(([__dirname, v]) => v !== null));

                // CORRECT SIGNALS HERE
                const { nlong, nshort, ndesc } = Analysis.#correctSignals(signals, long, short, desc);
                signal.long = nlong;
                signal.short = nshort;
                signal.description = ndesc;

                if ((long && !nlong) || (short && !nshort)) {
                    signal.description = "No Signal";
                }

                // COLLECT DATA FOR EXTERNAL MULTILAYER ANALYSIS FROM HERE
                if (Site.IN_CFG.ML_COL_DATA) {
                    Analysis.#collector(symbol, latestRate, signals[signals.length - 1] || "", signal.long, signal.short, stoploss, signal.description, cache);
                }

                // CONCLUDE ANALYSIS
                Log.flow(`Analysis > ${symbol} > Success > Long: ${signal.long ? "Yes" : "No"} | Short: ${signal.short ? "Yes" : "No"} | Price: ${FFF(latestRate)}${stoploss ? ` | Stoploss: ${FFF(stoploss)}` : ""}.`, 5);
                // CONVERT STOP LOSS TO PERCENTAGE AND FIT WITHIN RANGE
                signal.tpsl = Math.floor(Math.abs((latestRate - signal.tpsl) / latestRate * 100) * 100) / 100;
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
        let ndesc = desc;
        return { nlong, nshort, ndesc };
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
        if (history.length > (Site.IN_CFG.MX_SIGHIST_LEN || 5)) {
            history = history.slice(history.length - (Site.IN_CFG.MX_SIGHIST_LEN || 5));
        }
        return history;
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
            if (Analysis.#multilayeredHistory[symbol].length > (Site.IN_CFG.MX_SIGHIST_LEN || 5)) {
                Analysis.#multilayeredHistory[symbol] = Analysis.#multilayeredHistory[symbol].slice(Analysis.#multilayeredHistory[symbol].length - (Site.IN_CFG.MX_SIGHIST_LEN || 5));
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