const Log = require("../lib/log");
const Candlestick = require("../model/candlestick");
const Multilayered = require("../model/multilayered");
const Signal = require("../model/signal");
const Site = require("../site");
const fs = require("fs");
let BroadcastEngine = null;
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
const formatNumber = require("../lib/format_number");
const getTimeElapsed = require("../lib/get_time_elapsed");
const getDateTime2 = require("../lib/get_date_time_2");
const TimeCycle = require("../lib/time_cycle");

class DataX {
    /**
     * @type {number[]}
     */
    open;

    /**
     * @type {number[]}
     */
    high;

    /**
     * @type {number[]}
     */
    low;

    /**
     * @type {number[]}
     */
    close;

    /**
     * @type {number[]}
     */
    volume;

    /**
     * @type {number[]}
     */
    timestamp;

    /**
     * @type {number}
     */
    latestRate;
}

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
     * Returns parameters for an indicator for prompt purposes.
     * @param {string} i 
     * @returns {string}
     */
    static #getParamsForInd = (i) => {
        const p = Object.keys(Site.IN_CFG).filter(x => x.startsWith(i));
        return p.length ? `(${p.map(x => `${Site.IN_CFG[x]}`).join("/")})` : '(default params)';
    };

    /**
     * Runs analysis on candlestic kdata
     * @param {string} symbol 
     * @param {(gran?: string) => Candlestick[]} dataFn 
     * @returns {Promise<Signal|null>}
     */
    static run = (symbol, dataFn) => {
        return new Promise((resolve, reject) => {
            Log.flow(`Analysis > ${symbol} > Initialized.`, 5);
            if (dataFn().length >= (Site.IN_CFG.MN_DATA_LEN || 10)) {
                let ts = Date.now();
                if (ts == Analysis.#lastTS) {
                    ts = ts + 1;
                }
                Analysis.#lastTS = ts;

                /**
                 * @type {Record<string, DataX>}
                 */
                const dataCache = {};

                /**
                 * @param {string} gran
                 * @returns {DataX} 
                 */
                const getData = (gran = Site.TK_GRANULARITY_DEF) => {
                    if (!dataCache[gran]) {
                        const data = dataFn(gran);
                        dataCache[gran] = {
                            open: data.map(x => x.open),
                            high: data.map(x => x.high),
                            low: data.map(x => x.low),
                            close: data.map(x => x.close),
                            volume: data.map(x => x.volume),
                            timestamp: data.map(x => x.ts),
                            latestRate: data.slice(-1)[0].close,
                        }
                    }
                    return dataCache[gran];
                }

                const { open, high, low, close, volume, timestamp, latestRate } = getData(Site.TK_GRANULARITIES[0]);
                const csd = { open, close, high, low };

                /**
                 * @type {string[][]}
                 */
                let userPrompt = [
                    [
                        `Ticker: ${symbol}`,
                        `Price: ${latestRate}`,
                    ], // INPUT DATA
                    [], // STEP 1
                    [], // STEP 2
                    [], // STEP 3
                    [], // STEP 4
                    [], // STEP 5
                    [], // STEP 6
                    [], // STEP 7
                    [], // PREVIOUS ANALYSIS
                ];
                let currentStep = 0;

                let cache = {
                    PSR: {},
                    PSR_BULL: {},
                    PSR_BEAR: {},
                    PSR_SL: {},
                    TMC: {},
                    TMC_BULL: {},
                    TMC_BEAR: {},
                    MCD: {},
                    MCD_BULL: {},
                    MCD_BEAR: {},
                    ICH: {},
                    ICH_BULL: {},
                    ICH_BEAR: {},
                    ICH_SL: {},
                    BLL_BULL: {},
                    BLL_BEAR: {},
                    BLL_BEAR: {},
                    KST_BULL: {},
                    KST_BEAR: {},
                    SMA_BULL: {},
                    SMA_BEAR: {},
                    EMA_BULL: {},
                    EMA_BEAR: {},
                    WMA_BULL: {},
                    WMA_BEAR: {},
                    VWP_BULL: {},
                    VWP_BEAR: {},
                    AOS_BULL: {},
                    AOS_BEAR: {},
                    TRX_BULL: {},
                    TRX_BEAR: {},
                    STRONG: {},
                    STC_OB: {},
                    STC_OS: {},
                    RSI_OB: {},
                    RSI_OS: {},
                    CCI_OB: {},
                    CCI_OS: {},
                    MFI_OB: {},
                    MFI_OS: {},
                    BBS_OB: {},
                    BBS_OS: {},
                    SRS_OB: {},
                    SRS_OS: {},
                    SRS_BULL: {},
                    SRS_BEAR: {},
                    STR: {},
                    HGM: {},
                    BAR: {},
                    EST: {},
                    TBC: {},
                    PIL: {},
                    DCC: {},
                    TTP: {},
                    TWS: {},
                    MST: {},
                    HMR: {},
                    TBT: {},
                    ABB: {},
                    BEP: {},
                    EDS: {},
                    GSD: {},
                    BRH: {},
                    BRM: {},
                    BHC: {},
                    BLE: {},
                    MDS: {},
                    DFD: {},
                    BLH: {},
                    BLM: {},
                    BLC: {},
                    ATR: {},
                    ENTRY: {},
                };

                const ensureInd = {
                    /**
                     * @param {string} gran 
                     */
                    PSR: (gran) => {
                        if (!cache.PSR[gran]) {
                            const { high, low, latestRate } = getData(gran);
                            const psar = PSAR.calculate({ high, low, step: Site.IN_CFG.PSR_ST ?? 0.02, max: Site.IN_CFG.PSR_MX ?? 0.2 });
                            const psarBull = (psar[psar.length - 1] ?? latestRate) < latestRate;
                            const psarBear = (psar[psar.length - 1] ?? latestRate) > latestRate;
                            const sl = psar[psar.length - 1] || 0;
                            cache.PSR[gran] = true;
                            cache.PSR_BULL[gran] = psarBull;
                            cache.PSR_BEAR[gran] = psarBear;
                            cache.PSR_SL[gran] = sl;
                        }
                        if (cache.PSR_BULL[gran] || cache.PSR_BEAR[gran]) userPrompt[currentStep].push(`${currentStep == 6 ? `${cache.PSR_SL[gran]} (PSAR ${gran})` : ''} ${(currentStep == 1 || (currentStep == 6 && Site.STR_TSL_IND.name != Site.STR_ENTRY_IND.name)) ? `${Analysis.#getParamsForInd('PSR_').replace("ST", "step").replace("mx", "max") || "default"}` : ''}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TMC: (gran) => {
                        let desc = '';
                        if (!cache.TMC[gran]) {
                            const { open, high, low,close } = getData(gran);
                            const tmc = TimeCycle.calculate({close, high, low, open, period: Site.IN_CFG.TMC_P ?? 20, model: 'both'});
                            const tmcBull = tmc.map(x => x.long).find(x => x);
                            const tmcBear = tmc.map(x => x.short).find(x => x);
                            cache.TMC[gran] = true;
                            cache.TMC_BULL[gran] = tmcBull;
                            cache.TMC_BEAR[gran] = tmcBear;
                            desc = (tmc[tmc.length - 1] || {}).description || '';
                            // console.log(tmc);
                        }
                        if (cache.TMC_BULL[gran] || cache.TMC_BEAR[gran]) userPrompt[currentStep].push(`${Analysis.#getParamsForInd('TMC_').replace("P", "period").replace("(", `(${desc ? (desc + ', ') : ''}`) || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    MCD: (gran) => {
                        if (!cache.MCD[gran]) {
                            const { close } = getData(gran);
                            const macd = MACD.calculate({ values: close, fastPeriod: Site.IN_CFG.MCD_FSP ?? 12, slowPeriod: Site.IN_CFG.MCD_SLP ?? 26, signalPeriod: Site.IN_CFG.MCD_SGP ?? 9, SimpleMAOscillator: false, SimpleMASignal: false });
                            const macdBull = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD > macd[macd.length - 1].signal : false) : false;
                            const macdBear = macd.length > 0 ? (((macd[macd.length - 1].MACD || macd[macd.length - 1].MACD === 0) && (macd[macd.length - 1].signal || macd[macd.length - 1].signal === 0)) ? macd[macd.length - 1].MACD < macd[macd.length - 1].signal : false) : false;
                            cache.MCD[gran] = true;
                            cache.MCD_BULL[gran] = macdBull;
                            cache.MCD_BEAR[gran] = macdBear;
                        }
                        if (cache.MCD_BULL[gran] || cache.MCD_BEAR[gran]) userPrompt[currentStep].push(`${currentStep == 2 ? `MACD ${gran}: ${cache.MCD_BULL[gran] ? 'Bullish' : cache.MCD_BEAR[gran] ? 'Bearish' : 'No Trend'}` : ''} ${(currentStep == 1 || (currentStep == 2 && (!Site.STR_TREND_IND.map(x => x.name).includes(Site.STR_ENTRY_IND.name)))) ? `${Analysis.#getParamsForInd('MCD_').replace("FSP", "fast period").replace("SLP", "slow period").replace("SGP", "signal period") || "default"}` : ''}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    SRS: (gran) => {
                        if (cache.SRS_OB[gran] === null || cache.SRS_OB[gran] === undefined) {
                            const { close } = getData(gran);
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
                            cache.SRS_OB[gran] = OB;
                            cache.SRS_OS[gran] = OS;
                            cache.SRS_BULL[gran] = !OS;
                            cache.SRS_BEAR[gran] = !OB;
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true && cache.SRS_OB[gran]) || (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false && cache.SRS_OS[gran])) userPrompt[currentStep].push(`STOCH RSI ${gran} ${(Analysis.#getParamsForInd('STC_').replace("SP", "stoch signal period").replace("P", "stoch period").replace(")", "") + '/' + Analysis.#getParamsForInd('RSI_').replace("P", "rsi period").replace("(", "")) || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    ICH: (gran) => {
                        if (!cache.ICH[gran]) {
                            const { close, high, low, latestRate } = getData(gran);
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
                            cache.ICH[gran] = true;
                            cache.ICH_BULL[gran] = bull;
                            cache.ICH_BEAR[gran] = bear;
                            cache.ICH_SL[gran] = sl;
                        }
                        if (cache.ICH_BULL[gran] || cache.ICH_BEAR[gran]) userPrompt[currentStep].push(`${currentStep == 6 ? `${cache.ICH_SL[gran]} (ICH ${gran})` : ''} ${(currentStep == 1 || (currentStep == 6 && Site.STR_TSL_IND.name != Site.STR_ENTRY_IND.name)) ? `${Analysis.#getParamsForInd('ICH_').replace("CVP", "conversion period").replace("BSP", "base period").replace("SPP", "span period").replace("DIS", "displacement") || "default"}` : ''}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BLL: (gran) => {
                        if (cache.BLL_BULL[gran] === null || cache.BLL_BULL[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BLL_BULL[gran] = bullish(csd);
                            cache.BLL_BEAR[gran] = bearish(csd);
                        }
                        if (cache.BLL_BULL[gran] || cache.BLL_BEAR[gran]) userPrompt[currentStep].push(`CANDLE ${gran}: ${cache.BLL_BULL[gran] ? 'Bullish' : cache.BLL_BEAR[gran] ? 'Bearish' : 'No Trend'}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    SMA: (gran) => {
                        if (cache.SMA_BULL[gran] === null || cache.SMA_BULL[gran] === undefined) {
                            const { close, latestRate } = getData(gran);
                            const ma = SMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.SMA_BULL[gran] = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.SMA_BEAR[gran] = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.SMA_BULL[gran] || cache.SMA_BEAR[gran]) userPrompt[currentStep].push(`SMA ${gran}: ${cache.SMA_BULL[gran] ? 'Bullish' : cache.SMA_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    KST: (gran) => {
                        if (cache.KST_BULL[gran] === null || cache.KST_BULL[gran] === undefined) {
                            const { close } = getData(gran);
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
                            cache.KST_BULL[gran] = bull;
                            cache.KST_BEAR[gran] = bear;
                        }
                        if (cache.KST_BULL[gran] || cache.KST_BEAR[gran]) userPrompt[currentStep].push(`KST ${gran}: ${cache.KST_BULL[gran] ? 'Bullish' : cache.KST_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('KST_').replace(/RP/g, "ROC period ").replace(/SG/, "signal period ").replace(/SP/g, "SMA ROC period ") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    EMA: (gran) => {
                        if (cache.EMA_BULL[gran] === null || cache.EMA_BULL[gran] === undefined) {
                            const { close, latestRate } = getData(gran);
                            const ma = EMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.EMA_BULL[gran] = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.EMA_BEAR[gran] = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.EMA_BULL[gran] || cache.EMA_BEAR[gran]) userPrompt[currentStep].push(`EMA ${gran}: ${cache.EMA_BULL[gran] ? 'Bullish' : cache.EMA_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    WMA: (gran) => {
                        if (cache.WMA_BULL[gran] === null || cache.WMA_BULL[gran] === undefined) {
                            const { close, latestRate } = getData(gran);
                            const ma = WMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.WMA_BULL[gran] = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.WMA_BEAR[gran] = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.WMA_BULL[gran] || cache.WMA_BEAR[gran]) userPrompt[currentStep].push(`WMA ${gran}: ${cache.WMA_BULL[gran] ? 'Bullish' : cache.WMA_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    VWP: (gran) => {
                        if (cache.VWP_BULL[gran] === null || cache.VWP_BULL[gran] === undefined) {
                            const { close, latestRate, high, low, volume } = getData(gran);
                            const vwap = VWAP.calculate({ close, high, low, volume });
                            cache.VWP_BULL[gran] = latestRate > (vwap[vwap.length - 1] || Infinity);
                            cache.VWP_BEAR[gran] = latestRate < (vwap[vwap.length - 1] || 0);
                        }
                        if (cache.VWP_BULL[gran] || cache.VWP_BEAR[gran]) userPrompt[currentStep].push(`VWAP ${gran}: ${cache.VWP_BULL[gran] ? 'Bullish' : cache.VWP_BEAR[gran] ? 'Bearish' : 'No Trend'}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    AOS: (gran) => {
                        if (cache.AOS_BULL[gran] === null || cache.AOS_BULL[gran] === undefined) {
                            const { high, low } = getData(gran);
                            const ao = AwesomeOscillator.calculate({ high, low, fastPeriod: Site.IN_CFG.AOS_FSP ?? 5, slowPeriod: Site.IN_CFG.AOS_SLP ?? 34 });
                            cache.AOS_BULL[gran] = (ao[ao.length - 1] || 0) > 0;
                            cache.AOS_BEAR[gran] = (ao[ao.length - 1] || 0) < 0;
                        }
                        if (cache.AOS_BULL[gran] || cache.AOS_BEAR[gran]) userPrompt[currentStep].push(`AO ${gran}: ${cache.AOS_BULL[gran] ? 'Bullish' : cache.AOS_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('AOS_').replace("FSP", "fast period").replace("SLP", "slow period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TRX: (gran) => {
                        if (cache.TRX_BULL[gran] === null || cache.TRX_BULL[gran] === undefined) {
                            const { close } = getData(gran);
                            const trix = TRIX.calculate({ values: close, period: Site.IN_CFG.TRX_P ?? 15 });
                            cache.TRX_BULL[gran] = (trix[trix.length - 1] || 0) > 0;
                            cache.TRX_BEAR[gran] = (trix[trix.length - 1] || 0) < 0;
                        }
                        if (cache.TRX_BULL[gran] || cache.TRX_BEAR[gran]) userPrompt[currentStep].push(`TRIX ${gran}: ${cache.TRX_BULL[gran] ? 'Bullish' : cache.TRX_BEAR[gran] ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('TRX_').replace("P", "period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    ADX: (gran) => {
                        if (cache.STRONG[gran] === null || cache.STRONG[gran] === undefined) {
                            const { close, high, low } = getData(gran);
                            const adx = ADX.calculate({ close, high, low, period: Site.IN_CFG.ADX_P ?? 14 });
                            cache.STRONG[gran] = ((adx[adx.length - 1] || {}).adx || 0) >= 25;
                        }
                        userPrompt[currentStep].push(`ADX ${gran} = ${cache.STRONG[gran] ? 'Strong' : 'Not Strong'} ${Analysis.#getParamsForInd('ADX_').replace("P", "period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    STC: (gran) => {
                        if (cache.STC_OB[gran] === null || cache.STC_OB[gran] === undefined) {
                            const { close, high, low } = getData(gran);
                            const stoch = Stochastic.calculate({ close, high, low, period: Site.IN_CFG.STC_P ?? 14, signalPeriod: Site.IN_CFG.STC_SP ?? 3 });
                            cache.STC_OB[gran] = ((stoch[stoch.length - 1] || {}).k || 0) > 80;
                            cache.STC_OS[gran] = ((stoch[stoch.length - 1] || {}).k || Infinity) < 20;
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true && cache.STC_OB[gran]) || (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false && cache.STC_OS[gran])) userPrompt[currentStep].push(`STOCH ${gran} ${Analysis.#getParamsForInd('STC_').replace("P", "period").replace("SP", "signal period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    RSI: (gran) => {
                        if (cache.RSI_OB[gran] === null || cache.RSI_OB[gran] === undefined) {
                            const { close } = getData(gran);
                            const rsi = RSI.calculate({ values: close, period: Site.IN_CFG.RSI_P ?? 14 });
                            cache.RSI_OB[gran] = (rsi[rsi.length - 1] || 0) > 70;
                            cache.RSI_OS[gran] = (rsi[rsi.length - 1] || Infinity) < 30;
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true && cache.RSI_OB[gran]) || (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false && cache.RSI_OS[gran])) userPrompt[currentStep].push(`RSI ${gran} ${Analysis.#getParamsForInd('RSI_').replace("P", "period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    CCI: (gran) => {
                        if (cache.CCI_OB[gran] === null || cache.CCI_OB[gran] === undefined) {
                            const { close, high, low } = getData(gran);
                            const cci = CCI.calculate({ close, high, low, period: Site.IN_CFG.CCI_P ?? 14 });
                            cache.CCI_OB[gran] = (cci[cci.length - 1] || 0) > 100;
                            cache.CCI_OB[gran] = (cci[cci.length - 1] || Infinity) < -100;
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true && cache.CCI_OB[gran]) || (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false && cache.CCI_OS[gran])) userPrompt[currentStep].push(`CCI ${gran} ${Analysis.#getParamsForInd('CCI_').replace("P", "period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    MFI: (gran) => {
                        if (cache.MFI_OB[gran] === null || cache.MFI_OB[gran] === undefined) {
                            const { close, high, low, volume } = getData(gran);
                            const mfi = MFI.calculate({ close, volume, high, low, period: Site.IN_CFG.MFI_P ?? 14 });
                            cache.MFI_OB[gran] = (mfi[mfi.length - 1] || 0) > 80;
                            cache.MFI_OS[gran] = (mfi[mfi.length - 1] || Infinity) < 20;
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true && cache.MFI_OB[gran]) || (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false && cache.MFI_OS[gran])) userPrompt[currentStep].push(`MFI ${gran} ${Analysis.#getParamsForInd('MFI_').replace("P", "period") || "default"}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    STR: (gran) => {
                        if (cache.STR[gran] === null || cache.STR[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.STR[gran] = shootingstar(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.STR[gran]) userPrompt[currentStep].push(`Shooting Star ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    HGM: (gran) => {
                        if (cache.HGM[gran] === null || cache.HGM[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.HGM[gran] = hangingman(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.HGM[gran]) userPrompt[currentStep].push(`Hanging Man ${gran}`);

                    },
                    /**
                     * @param {string} gran 
                     */
                    EST: (gran) => {
                        if (cache.EST[gran] === null || cache.EST[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.EST[gran] = eveningstar(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.EST[gran]) userPrompt[currentStep].push(`Evening Star ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TBC: (gran) => {
                        if (cache.TBC[gran] === null || cache.TBC[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.TBC[gran] = threeblackcrows(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.TBC[gran]) userPrompt[currentStep].push(`Three Black Crows ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    PIL: (gran) => {
                        if (cache.PIL[gran] === null || cache.PIL[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.PIL[gran] = piercingline(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.PIL[gran]) userPrompt[currentStep].push(`Piercing Line ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    DCC: (gran) => {
                        if (cache.DCC[gran] === null || cache.DCC[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.DCC[gran] = darkcloudcover(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.DCC[gran]) userPrompt[currentStep].push(`Dark Cloud Cover ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TTP: (gran) => {
                        if (cache.TTP[gran] === null || cache.TTP[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.TTP[gran] = tweezertop(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.TTP[gran]) userPrompt[currentStep].push(`Tweezer Top ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TWS: (gran) => {
                        if (cache.TWS[gran] === null || cache.TWS[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.TWS[gran] = threewhitesoldiers(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.TWS[gran]) userPrompt[currentStep].push(`Three White Soldiers ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    MST: (gran) => {
                        if (cache.MST[gran] === null || cache.MST[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.MST[gran] = morningstar(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.MST[gran]) userPrompt[currentStep].push(`Morning Star ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    HMR: (gran) => {
                        if (cache.HMR[gran] === null || cache.HMR[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.HMR[gran] = hammerpattern(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.HMR[gran]) userPrompt[currentStep].push(`Hammer Pattern ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    TBT: (gran) => {
                        if (cache.TBT[gran] === null || cache.TBT[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.TBT[gran] = tweezerbottom(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.TBT[gran]) userPrompt[currentStep].push(`Tweezer Bottom ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    ABB: (gran) => {
                        if (cache.ABB[gran] === null || cache.ABB[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.ABB[gran] = abandonedbaby(csd);
                        }
                        if (cache.ABB[gran]) userPrompt[currentStep].push(`Abandoned Baby ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BLE: (gran) => {
                        if (cache.BLE[gran] === null || cache.BLE[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BLE[gran] = bullishengulfingpattern(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.BLE[gran]) userPrompt[currentStep].push(`Bullish Engulfing Pattern ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    MDS: (gran) => {
                        if (cache.MDS[gran] === null || cache.MDS[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.MDS[gran] = morningdojistar(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.MDS[gran]) userPrompt[currentStep].push(`Morning Doji Star ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    DFD: (gran) => {
                        if (cache.DFD[gran] === null || cache.DFD[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.DFD[gran] = dragonflydoji(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.DFD[gran]) userPrompt[currentStep].push(`Dragon Fly Doji ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BLH: (gran) => {
                        if (cache.BLH[gran] === null || cache.BLH[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BLH[gran] = bullishharami(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.BLH[gran]) userPrompt[currentStep].push(`Bullish Harami ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BLM: (gran) => {
                        if (cache.BLM[gran] === null || cache.BLM[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BLM[gran] = bullishmarubozu(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.BLM[gran]) userPrompt[currentStep].push(`Bullish Marubozu ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BLC: (gran) => {
                        if (cache.BLC[gran] === null || cache.BLC[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BLC[gran] = bullishharamicross(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) && cache.BLC[gran]) userPrompt[currentStep].push(`Bullish Harami Cross ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BEP: (gran) => {
                        if (cache.BEP[gran] === null || cache.BEP[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BEP[gran] = bearishengulfingpattern(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.BEP[gran]) userPrompt[currentStep].push(`Bearish Engulfing Pattern ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    EDS: (gran) => {
                        if (cache.EDS[gran] === null || cache.EDS[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.EDS[gran] = eveningdojistar(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.EDS[gran]) userPrompt[currentStep].push(`Evening Doji Star ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    GSD: (gran) => {
                        if (cache.GSD[gran] === null || cache.GSD[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.GSD[gran] = gravestonedoji(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.GSD[gran]) userPrompt[currentStep].push(`Gravestone Doji ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BRH: (gran) => {
                        if (cache.BRH[gran] === null || cache.BRH[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BRH[gran] = bearishharami(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.BRH[gran]) userPrompt[currentStep].push(`Bearish Harami ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BRM: (gran) => {
                        if (cache.BRM[gran] === null || cache.BRM[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BRM[gran] = bearishmarubozu(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.BRM[gran]) userPrompt[currentStep].push(`Bearish Marubozu ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    BHC: (gran) => {
                        if (cache.BHC[gran] === null || cache.BHC[gran] === undefined) {
                            const { close, high, low, open } = getData(gran);
                            const csd = { open, high, low, close };
                            cache.BHC[gran] = bearishharamicross(csd);
                        }
                        if ((cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) && cache.BHC[gran]) userPrompt[currentStep].push(`Bearish Harami Cross ${gran}`);
                    },
                    /**
                     * @param {string} gran 
                     */
                    ATR: (gran) => {
                        if (cache.ATR[gran] === null || cache.ATR[gran] === undefined) {
                            const { close, high, low, latestRate } = getData(gran);
                            const atr = ATR.calculate({ period: Site.IN_CFG.ATR_P ?? 14, close, high, low });
                            const perc = ((atr[atr.length - 1] || 0) / latestRate) * 100;
                            cache.ATR[gran] = perc;
                        }
                        userPrompt[currentStep].push([`ATR ${gran} = ${(cache.ATR[gran] || 0).toFixed(2)}% of price ${Analysis.#getParamsForInd('ATR_').replace("P", "period") || "default"}`]);
                    },
                };

                /**
                 * Computes entry point.
                 * @returns {boolean|null} True if bullish entry detected, False if bearish entry detected, else False.
                 */
                const step1 = () => {
                    currentStep = 1;
                    ensureInd[Site.STR_ENTRY_IND.name](Site.STR_ENTRY_IND.granularity);
                    if (!Analysis.#isEntryBull[symbol]) {
                        Analysis.#isEntryBull[symbol] = [];
                    }
                    if (!Analysis.#isEntryBear[symbol]) {
                        Analysis.#isEntryBear[symbol] = [];
                    }
                    Analysis.#isEntryBull[symbol].push(cache[`${Site.STR_ENTRY_IND.name}_BULL`][Site.STR_ENTRY_IND.granularity] || false);
                    Analysis.#isEntryBear[symbol].push(cache[`${Site.STR_ENTRY_IND.name}_BEAR`][Site.STR_ENTRY_IND.granularity] || false);
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
                 * Confirms trend.
                 * @returns {boolean} True if trend else False.
                 */
                const step2 = () => {
                    currentStep = 2;
                    for (let i = 0; i < Site.STR_TREND_IND.length; i++) {
                        ensureInd[Site.STR_TREND_IND[i].name](Site.STR_TREND_IND[i].granularity);
                    }
                    currentStep = 0;
                    /**
                     * @type {boolean[]}
                     */
                    const bools = Site.STR_TREND_IND.map(x => cache[`${x.name}_${cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? 'BULL' : 'BEAR'}`][x.granularity] || false);
                    return booleanConsolidator(bools, Site.STR_TREND_CV);
                }

                /**
                 * Confirms strong trend.
                 * @returns {boolean} True if strong trend else False.
                 */
                const step3 = () => {
                    currentStep = 3;
                    ensureInd.ADX(Site.STR_STG_IND_GRAN);
                    currentStep = 0;
                    return cache.STRONG[Site.STR_STG_IND_GRAN] || false;
                }

                /**
                 * Detects overbought.
                 * @returns {boolean} True if overbought else False.
                 */
                const step4 = () => {
                    currentStep = 4;
                    for (let i = 0; i < Site.STR_OB_IND.length; i++) {
                        ensureInd[Site.STR_OB_IND[i].name](Site.STR_OB_IND[i].granularity);
                    }
                    currentStep = 0;
                    /**
                     * @type {boolean[]}
                     */
                    const bools = Site.STR_OB_IND.map(x => cache[`${x.name}_${cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? 'OB' : 'OS'}`][x.granularity] || false);
                    return booleanConsolidator(bools, Site.STR_OB_CV);
                }

                /**
                 * Detects reversal patterns.
                 * @returns {boolean} True if reversal else False.
                 */
                const step5 = () => {
                    currentStep = 5;
                    for (let i = 0; i < (cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR).length; i++) {
                        ensureInd[(cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR)[i].name]((cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR)[i].granularity);
                    }
                    currentStep = 0;
                    /**
                     * @type {boolean[]}
                     */
                    const bools = (cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR).map(x => cache[`${x.name}`][x.granularity] || false);
                    return booleanConsolidator(bools, Site.STR_REV_CV);
                }

                /**
                 * Computes stoploss price.
                 * @returns {number}
                 */
                const step6 = () => {
                    currentStep = 6;
                    ensureInd[Site.STR_TSL_IND.name](Site.STR_TSL_IND.granularity);
                    currentStep = 0;
                    if (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) {
                        return cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity] < latestRate ? cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity] : (latestRate - (cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity] - latestRate));
                    }
                    else if (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) {
                        return cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity] > latestRate ? cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity] : (latestRate + (latestRate - cache[`${Site.STR_TSL_IND.name}_SL`][Site.STR_TSL_IND.granularity]));
                    }
                    return 0;
                }

                /**
                 * Ensures price volatility is within suitable percentage range.
                 * @returns {boolean} True if within range else False.
                 */
                const step7 = () => {
                    currentStep = 7;
                    ensureInd.ATR(Site.STR_VOL_IND_GRAN);
                    currentStep = 0;
                    return cache.ATR[Site.STR_VOL_IND_GRAN] >= (Site.STR_VOL_RNG[0] || 0) && cache.ATR[Site.STR_VOL_IND_GRAN] <= (Site.STR_VOL_RNG[1] || Infinity);
                }

                let stoploss = 0;
                let long = false;
                let short = false;
                let desc = "No Signal";

                Log.flow(`Analysis > ${symbol} > Checking for entry...`, 6);
                cache.ENTRY[Site.STR_ENTRY_IND.granularity] = step1();
                const flip = (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) ? "Bullish flip" : (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) ? "Bearish flip" : "";
                const sig = (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true) ? "Long" : (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) ? "Short" : "";
                userPrompt[currentStep][0] = `${Site.STR_ENTRY_IND.name.replace("TMC", "Time Cycle").replace("ICH", "ICH").replace("PSR", "PSAR").replace("MCD", "MACD")} ${Site.STR_ENTRY_IND.granularity} = ${flip} → ${sig} ${userPrompt[currentStep][0]}`;
                currentStep = 0;
                if (cache.ENTRY[Site.STR_ENTRY_IND.granularity] === true || cache.ENTRY[Site.STR_ENTRY_IND.granularity] === false) {
                    // Entry detected.
                    Log.flow(`Analysis > ${symbol} > Entry detected. Confirming ${cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? 'bull' : 'bear'} trend...`, 6);
                    if ((step2() && Site.STR_TREND_FV) || (!Site.STR_TREND_FV)) {
                        // Trend confirmed.
                        Log.flow(`Analysis > ${symbol} > Trend confirmed. Checking trend strength...`, 6);
                        if ((step3() && Site.STR_STG_FV) || (!Site.STR_STG_FV)) {
                            // Trend strength confirmed.
                            Log.flow(`Analysis > ${symbol} > Strength is acceptable. Checking if over${cache.ENTRY[Site.STR_ENTRY_IND.granularity] ? 'bought' : 'sold'}...`, 6);
                            if (((!step4()) && Site.STR_OB_FV) || (!Site.STR_OB_FV)) {
                                // No presence of effecting overbought confirmed.
                                Log.flow(`Analysis > ${symbol} > Overbought condition acceptable. Checking for reversals...`, 6);
                                if (((!step5()) && Site.STR_REV_FV) || (!Site.STR_REV_FV)) {
                                    Log.flow(`Analysis > ${symbol} > Reversal conditions acceptable. Checking volatility...`, 6);
                                    // No reversl detected.
                                    if (step7()) {
                                        // Volatility is acceptable
                                        Log.flow(`Analysis > ${symbol} > Volatility is acceptable. Buy signal confirmed.`, 6);
                                        if (cache.ENTRY[Site.STR_ENTRY_IND.granularity]) {
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

                const signal = new Signal(short || false, long || false, desc || 'No Description', cache.ATR[Site.STR_VOL_IND_GRAN] || 0, stoploss || 0, latestRate);

                Analysis.#multilayer(symbol, long, short, desc, latestRate, ts, signal);
                const signals = Analysis.#getMultilayeredHistory(symbol);
                cache = Object.fromEntries(Object.entries(cache).filter(([__dirname, v]) => Object.keys(v).length > 0));


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
                if ((signal.long || signal.short) && (Site.BROADCAST || process.env.COLLER)) {
                    if (!BroadcastEngine) {
                        BroadcastEngine = require("./broadcast");
                    }
                    BroadcastEngine.entry(symbol, structuredClone(signal), structuredClone(userPrompt));
                }
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