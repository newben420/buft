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

                /**
                 * @type {string[][]}
                 */
                let userPrompt = [
                    [
                        `Ticker: ${symbol}`,
                        `Data: ${data.length}x${Site.TK_GRANULARITY} (${getDateTime2(Date.now() - (Site.TK_INTERVAL * data.length))} → ${getDateTime2(Date.now())})`,
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
                        if (cache.PSR_BULL || cache.PSR_BEAR) userPrompt[currentStep].push(`${currentStep == 6 ? `${cache.PSR_SL} (PSAR)`: ''} ${(currentStep == 1 || (currentStep == 6 && Site.STR_TSL_IND != Site.STR_ENTRY_IND)) ? `${Analysis.#getParamsForInd('PSR_').replace("ST", "step").replace("mx", "max") || "default"}` : ''}`);
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
                        if (cache.MCD_BULL || cache.MCD_BEAR) userPrompt[currentStep].push(`${currentStep == 2 ? `MACD: ${cache.MCD_BULL ? 'Bullish' : cache.MCD_BEAR ? 'Bearish' : 'No Trend'}` : ''} ${(currentStep == 1 || (currentStep == 2 && (!Site.STR_TREND_IND.includes(Site.STR_ENTRY_IND)))) ? `${Analysis.#getParamsForInd('MCD_').replace("FSP", "fast period").replace("SLP", "slow period").replace("SGP", "signal period") || "default"}` : ''}`);
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
                        if ((cache.ENTRY === true && cache.SRS_OB) || (cache.ENTRY === false && cache.SRS_OS)) userPrompt[currentStep].push(`STOCH RSI ${(Analysis.#getParamsForInd('STC_').replace("SP", "stoch signal period").replace("P", "stoch period").replace(")", "") + '/' + Analysis.#getParamsForInd('RSI_').replace("P", "rsi period").replace("(", "")) || "default"}`);
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
                        if (cache.ICH_BULL || cache.ICH_BEAR) userPrompt[currentStep].push(`${currentStep == 6 ? `${cache.ICH_SL} (ICH)` : ''} ${(currentStep == 1 || (currentStep == 6 && Site.STR_TSL_IND != Site.STR_ENTRY_IND)) ?`${Analysis.#getParamsForInd('ICH_').replace("CVP", "conversion period").replace("BSP", "base period").replace("SPP", "span period").replace("DIS", "displacement") || "default"}` : ''}`);
                    },
                    BLL: () => {
                        if (cache.BLL_BULL === null) {
                            cache.BLL_BULL = bullish(csd);
                            cache.BLL_BEAR = bearish(csd);
                        }
                        if (cache.BLL_BULL || cache.BLL_BEAR) userPrompt[currentStep].push(`CANDLE: ${cache.BLL_BULL ? 'Bullish' : cache.BLL_BEAR ? 'Bearish' : 'No Trend'}`);
                    },
                    SMA: () => {
                        if (cache.SMA_BULL === null) {
                            const ma = SMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.SMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.SMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.SMA_BULL || cache.SMA_BEAR) userPrompt[currentStep].push(`SMA: ${cache.SMA_BULL ? 'Bullish' : cache.SMA_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
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
                        if (cache.KST_BULL || cache.KST_BEAR) userPrompt[currentStep].push(`KST: ${cache.KST_BULL ? 'Bullish' : cache.KST_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('KST_').replace(/RP/g, "ROC period ").replace(/SG/, "signal period ").replace(/SP/g, "SMA ROC period ") || "default"}`);
                    },
                    EMA: () => {
                        if (cache.EMA_BULL === null) {
                            const ma = EMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.EMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.EMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.EMA_BULL || cache.EMA_BEAR) userPrompt[currentStep].push(`EMA: ${cache.EMA_BULL ? 'Bullish' : cache.EMA_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
                    },
                    WMA: () => {
                        if (cache.WMA_BULL === null) {
                            const ma = WMA.calculate({ values: close, period: Site.IN_CFG.MAP ?? 20 });
                            cache.WMA_BULL = latestRate > (ma[ma.length - 1] || Infinity);
                            cache.WMA_BEAR = latestRate < (ma[ma.length - 1] || 0);
                        }
                        if (cache.WMA_BULL || cache.WMA_BEAR) userPrompt[currentStep].push(`WMA: ${cache.WMA_BULL ? 'Bullish' : cache.WMA_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('MAP') ? `${Analysis.#getParamsForInd('MAP')}` : "default"}`);
                    },
                    VWP: () => {
                        if (cache.VWP_BULL === null) {
                            const vwap = VWAP.calculate({ close, high, low, volume });
                            cache.VWP_BULL = latestRate > (vwap[vwap.length - 1] || Infinity);
                            cache.VWP_BEAR = latestRate < (vwap[vwap.length - 1] || 0);
                        }
                        if (cache.VWP_BULL || cache.VWP_BEAR) userPrompt[currentStep].push(`VWAP: ${cache.VWP_BULL ? 'Bullish' : cache.VWP_BEAR ? 'Bearish' : 'No Trend'}`);
                    },
                    AOS: () => {
                        if (cache.AOS_BULL === null) {
                            const ao = AwesomeOscillator.calculate({ high, low, fastPeriod: Site.IN_CFG.AOS_FSP ?? 5, slowPeriod: Site.IN_CFG.AOS_SLP ?? 34 });
                            cache.AOS_BULL = (ao[ao.length - 1] || 0) > 0;
                            cache.AOS_BEAR = (ao[ao.length - 1] || 0) < 0;
                        }
                        if (cache.AOS_BULL || cache.AOS_BEAR) userPrompt[currentStep].push(`AO: ${cache.AOS_BULL ? 'Bullish' : cache.AOS_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('AOS_').replace("FSP", "fast period").replace("SLP", "slow period") || "default"}`);
                    },
                    TRX: () => {
                        if (cache.TRX_BULL === null) {
                            const trix = TRIX.calculate({ values: close, period: Site.IN_CFG.TRX_P ?? 15 });
                            cache.TRX_BULL = (trix[trix.length - 1] || 0) > 0;
                            cache.TRX_BEAR = (trix[trix.length - 1] || 0) < 0;
                        }
                        if (cache.TRX_BULL || cache.TRX_BEAR) userPrompt[currentStep].push(`TRIX: ${cache.TRX_BULL ? 'Bullish' : cache.TRX_BEAR ? 'Bearish' : 'No Trend'} ${Analysis.#getParamsForInd('TRX_').replace("P", "period") || "default"}`);
                    },
                    ADX: () => {
                        if (cache.STRONG === null) {
                            const adx = ADX.calculate({ close, high, low, period: Site.IN_CFG.ADX_P ?? 14 });
                            cache.STRONG = ((adx[adx.length - 1] || {}).adx || 0) >= 25;
                        }
                        userPrompt[currentStep].push(`ADX = ${cache.STRONG ? 'Strong' : 'Not Strong'} ${Analysis.#getParamsForInd('ADX_').replace("P", "period") || "default"}`);
                    },
                    STC: () => {
                        if (cache.STC_OB === null) {
                            const stoch = Stochastic.calculate({ close, high, low, period: Site.IN_CFG.STC_P ?? 14, signalPeriod: Site.IN_CFG.STC_SP ?? 3 });
                            cache.STC_OB = ((stoch[stoch.length - 1] || {}).k || 0) > 80;
                            cache.STC_OS = ((stoch[stoch.length - 1] || {}).k || Infinity) < 20;
                        }
                        if ((cache.ENTRY === true && cache.STC_OB) || (cache.ENTRY === false && cache.STC_OS)) userPrompt[currentStep].push(`STOCH ${Analysis.#getParamsForInd('STC_').replace("P", "period").replace("SP", "signal period") || "default"}`);
                    },
                    RSI: () => {
                        if (cache.RSI_OB === null) {
                            const rsi = RSI.calculate({ values: close, period: Site.IN_CFG.RSI_P ?? 14 });
                            cache.RSI_OB = (rsi[rsi.length - 1] || 0) > 70;
                            cache.RSI_OS = (rsi[rsi.length - 1] || Infinity) < 30;
                        }
                        if ((cache.ENTRY === true && cache.RSI_OB) || (cache.ENTRY === false && cache.RSI_OS)) userPrompt[currentStep].push(`RSI ${Analysis.#getParamsForInd('RSI_').replace("P", "period") || "default"}`);
                    },
                    CCI: () => {
                        if (cache.CCI_OB === null) {
                            const cci = CCI.calculate({ close, high, low, period: Site.IN_CFG.CCI_P ?? 14 });
                            cache.CCI_OB = (cci[cci.length - 1] || 0) > 100;
                            cache.CCI_OB = (cci[cci.length - 1] || Infinity) < -100;
                        }
                        if ((cache.ENTRY === true && cache.CCI_OB) || (cache.ENTRY === false && cache.CCI_OS)) userPrompt[currentStep].push(`CCI ${Analysis.#getParamsForInd('CCI_').replace("P", "period") || "default"}`);
                    },
                    MFI: () => {
                        if (cache.MFI_OB === null) {
                            const mfi = MFI.calculate({ close, volume, high, low, period: Site.IN_CFG.MFI_P ?? 14 });
                            cache.MFI_OB = (mfi[mfi.length - 1] || 0) > 80;
                            cache.MFI_OS = (mfi[mfi.length - 1] || Infinity) < 20;
                        }
                        if ((cache.ENTRY === true && cache.MFI_OB)|| (cache.ENTRY === false && cache.MFI_OS)) userPrompt[currentStep].push(`MFI ${Analysis.#getParamsForInd('MFI_').replace("P", "period") || "default"}`);
                    },
                    STR: () => {
                        if (cache.STR === null) {
                            cache.STR = shootingstar(csd);
                        }
                        if ((cache.ENTRY === true) && cache.STR) userPrompt[currentStep].push(`Shooting Star`);
                    },
                    HGM: () => {
                        if (cache.HGM === null) {
                            cache.HGM = hangingman(csd);
                        }
                        if ((cache.ENTRY === true) && cache.HGM) userPrompt[currentStep].push(`Hanging Man`);

                    },
                    EST: () => {
                        if (cache.EST === null) {
                            cache.EST = eveningstar(csd);
                        }
                        if ((cache.ENTRY === true) && cache.EST) userPrompt[currentStep].push(`Evening Star`);
                    },
                    TBC: () => {
                        if (cache.TBC === null) {
                            cache.TBC = threeblackcrows(csd);
                        }
                        if ((cache.ENTRY === true) && cache.TBC) userPrompt[currentStep].push(`Three Black Crows`);

                    },
                    PIL: () => {
                        if (cache.PIL === null) {
                            cache.PIL = piercingline(csd);
                        }
                        if ((cache.ENTRY === true) && cache.PIL) userPrompt[currentStep].push(`Piercing Line`);
                    },
                    DCC: () => {
                        if (cache.DCC === null) {
                            cache.DCC = darkcloudcover(csd);
                        }
                        if ((cache.ENTRY === true) && cache.DCC) userPrompt[currentStep].push(`Dark Cloud Cover`);
                    },
                    TTP: () => {
                        if (cache.TTP === null) {
                            cache.TTP = tweezertop(csd);
                        }
                        if ((cache.ENTRY === true) && cache.TTP) userPrompt[currentStep].push(`Tweezer Top`);
                    },
                    TWS: () => {
                        if (cache.TWS === null) {
                            cache.TWS = threewhitesoldiers(csd);
                        }
                        if ((cache.ENTRY === false) && cache.TWS) userPrompt[currentStep].push(`Three White Soldiers`);
                    },
                    MST: () => {
                        if (cache.MST === null) {
                            cache.MST = morningstar(csd);
                        }
                        if ((cache.ENTRY === false) && cache.MST) userPrompt[currentStep].push(`Morning Star`);
                    },
                    HMR: () => {
                        if (cache.HMR === null) {
                            cache.HMR = hammerpattern(csd);
                        }
                        if ((cache.ENTRY === false) && cache.HMR) userPrompt[currentStep].push(`Hammer Pattern`);
                    },
                    TBT: () => {
                        if (cache.TBT === null) {
                            cache.TBT = tweezerbottom(csd);
                        }
                        if ((cache.ENTRY === false) && cache.TBT) userPrompt[currentStep].push(`Tweezer Bottom`);
                    },
                    ABB: () => {
                        if (cache.ABB === null) {
                            cache.ABB = abandonedbaby(csd);
                        }
                        if (cache.ABB) userPrompt[currentStep].push(`Abandoned Baby`);
                    },
                    BLE: () => {
                        if (cache.BLE === null) {
                            cache.BLE = bullishengulfingpattern(csd);
                        }
                        if ((cache.ENTRY === false) && cache.BLE) userPrompt[currentStep].push(`Bullish Engulfing Pattern`);
                    },
                    MDS: () => {
                        if (cache.MDS === null) {
                            cache.MDS = morningdojistar(csd);
                        }
                        if ((cache.ENTRY === false) && cache.MDS) userPrompt[currentStep].push(`Morning Doji Star`);
                    },
                    DFD: () => {
                        if (cache.DFD === null) {
                            cache.DFD = dragonflydoji(csd);
                        }
                        if ((cache.ENTRY === false) && cache.DFD) userPrompt[currentStep].push(`Dragon Fly Doji`);
                    },
                    BLH: () => {
                        if (cache.BLH === null) {
                            cache.BLH = bullishharami(csd);
                        }
                        if ((cache.ENTRY === false) && cache.BLH) userPrompt[currentStep].push(`Bullish Harami`);
                    },
                    BLM: () => {
                        if (cache.BLM === null) {
                            cache.BLM = bullishmarubozu(csd);
                        }
                        if ((cache.ENTRY === false) && cache.BLM) userPrompt[currentStep].push(`Bullish Marubozu`);
                    },
                    BLC: () => {
                        if (cache.BLC === null) {
                            cache.BLC = bullishharamicross(csd);
                        }
                        if ((cache.ENTRY === false) && cache.BLC) userPrompt[currentStep].push(`Bullish Harami Cross`);
                    },
                    BEP: () => {
                        if (cache.BEP === null) {
                            cache.BEP = bearishengulfingpattern(csd);
                        }
                        if ((cache.ENTRY === true) && cache.BEP) userPrompt[currentStep].push(`Bearish Engulfing Pattern`);
                    },
                    EDS: () => {
                        if (cache.EDS === null) {
                            cache.EDS = eveningdojistar(csd);
                        }
                        if ((cache.ENTRY === true) && cache.EDS) userPrompt[currentStep].push(`Evening Doji Star`);
                    },
                    GSD: () => {
                        if (cache.GSD === null) {
                            cache.GSD = gravestonedoji(csd);
                        }
                        if ((cache.ENTRY === true) && cache.GSD) userPrompt[currentStep].push(`Gravestone Doji`);
                    },
                    BRH: () => {
                        if (cache.BRH === null) {
                            cache.BRH = bearishharami(csd);
                        }
                        if ((cache.ENTRY === true) && cache.BRH) userPrompt[currentStep].push(`Bearish Harami`);
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
                        if ((cache.ENTRY === true) && cache.BHC) userPrompt[currentStep].push(`Bearish Harami Cross`);
                    },
                    ATR: () => {
                        if (cache.ATR === null) {
                            const atr = ATR.calculate({ period: Site.IN_CFG.ATR_P ?? 14, close, high, low });
                            const perc = ((atr[atr.length - 1] || 0) / latestRate) * 100;
                            cache.ATR = perc;
                        }
                        userPrompt[currentStep].push([`ATR = ${(cache.ATR || 0).toFixed(2)}% of price ${Analysis.#getParamsForInd('ATR_').replace("P", "period") || "default"}`]);
                    },
                };

                /**
                 * Computes entry point.
                 * @returns {boolean|null} True if bullish entry detected, False if bearish entry detected, else False.
                 */
                const step1 = () => {
                    currentStep = 1;
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
                 * Confirms trend.
                 * @returns {boolean} True if trend else False.
                 */
                const step2 = () => {
                    currentStep = 2;
                    for (let i = 0; i < Site.STR_TREND_IND.length; i++) {
                        ensureInd[Site.STR_TREND_IND[i]]();
                    }
                    currentStep = 0;
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
                    currentStep = 3;
                    ensureInd.ADX();
                    currentStep = 0;
                    return cache.STRONG || false;
                }

                /**
                 * Detects overbought.
                 * @returns {boolean} True if overbought else False.
                 */
                const step4 = () => {
                    currentStep = 4;
                    for (let i = 0; i < Site.STR_OB_IND.length; i++) {
                        ensureInd[Site.STR_OB_IND[i]]();
                    }
                    currentStep = 0;
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
                    currentStep = 5;
                    for (let i = 0; i < (cache.ENTRY ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR).length; i++) {
                        ensureInd[(cache.ENTRY ? Site.STR_REV_IND_BULL : Site.STR_REV_IND_BEAR)[i]]();
                    }
                    currentStep = 0;
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
                    currentStep = 6;
                    ensureInd[Site.STR_TSL_IND]();
                    currentStep = 0;
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
                    currentStep = 7;
                    ensureInd.ATR();
                    currentStep = 0;
                    return cache.ATR >= (Site.STR_VOL_RNG[0] || 0) && cache.ATR <= (Site.STR_VOL_RNG[1] || Infinity);
                }

                let stoploss = 0;
                let long = false;
                let short = false;
                let desc = "No Signal";

                Log.flow(`Analysis > ${symbol} > Checking for entry...`, 6);
                cache.ENTRY = step1();
                const flip = (cache.ENTRY === true) ? "Bullish flip" : (cache.ENTRY === false) ? "Bearish flip" : "";
                const sig = (cache.ENTRY === true) ? "Long" : (cache.ENTRY === false) ? "Short" : "";
                userPrompt[currentStep][0] = `${Site.STR_ENTRY_IND.replace("ICH", "ICH").replace("PSR", "PSAR").replace("MCD", "MACD")} = ${flip} → ${sig} ${userPrompt[currentStep][0]}`;
                currentStep = 0;
                if (cache.ENTRY === true || cache.ENTRY === false) {
                    // Entry detected.
                    Log.flow(`Analysis > ${symbol} > Entry detected. Confirming ${cache.ENTRY ? 'bull' : 'bear'} trend...`, 6);
                    if ((step2() && Site.STR_TREND_FV) || (!Site.STR_TREND_FV)) {
                        // Trend confirmed.
                        Log.flow(`Analysis > ${symbol} > Trend confirmed. Checking trend strength...`, 6);
                        if ((step3() && Site.STR_STG_FV) || (!Site.STR_STG_FV)) {
                            // Trend strength confirmed.
                            Log.flow(`Analysis > ${symbol} > Strength is acceptable. Checking if over${cache.ENTRY ? 'bought' : 'sold'}...`, 6);
                            if (((!step4()) && Site.STR_OB_FV) || (!Site.STR_OB_FV)) {
                                // No presence of effecting overbought confirmed.
                                Log.flow(`Analysis > ${symbol} > Overbought condition acceptable. Checking for reversals...`, 6);
                                if (((!step5()) && Site.STR_REV_FV) || (!Site.STR_REV_FV)) {
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