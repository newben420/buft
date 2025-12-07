const FFF = require("../lib/fff");
const TelegramBot = require('node-telegram-bot-api');
const formatNumber = require("../lib/format_number");
const Site = require("../site");
const { GroqEngine } = require("./groq");
const Log = require("../lib/log");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Signal = require("../model/signal");
const TimeCycle = require("../lib/time_cycle");

let Trader = null;
let TelegramEngine = null;
let TickerEngine = null;

/**
 * Helps track recurring signals.
 * USE CASE: execute only the earlier signals.
 */
class Occurrence {
    /**
     * The current occuring signal
     * @type {'long'|'short'}
     */
    signal;

    /**
     * The number of times the current signal has occurred.\=
     * @type {number}
     */
    count;

    /**
     * The timestamp since when the current signal was first recorded.
     * @type {number}
     */
    timeSinceFirst;

    /**
     * Get timestamp since when the current signal was first recorded.
     * @returns {number}
     */
    getFirstTime() {
        return this.timeSinceFirst;
    }

    /**
     * Updates count and signal.
     * @param {boolean} isLong 
     */
    update(isLong) {
        /**
         * @type {'long'|'short'}
         */
        const newSignal = isLong ? "long" : "short";
        if (newSignal == this.signal) {
            this.count++;
        }
        else {
            this.signal = newSignal;
            this.count = 1;
            this.timeSinceFirst = Date.now();
        }
    }

    /**
     * Get count of the current signal's occurence.
     * @returns {number}
     */
    getCount() {
        return this.count;
    }

    /**
     * Obj const.
     * @param {boolean} isLong 
     */
    constructor(isLong) {
        this.signal = isLong ? "long" : "short";
        this.count = 1;
        this.timeSinceFirst = Date.now();
    }
}

class ATRBuyData {
    /**
     * @type {string}
     */
    symbol;

    /**
     * @type {'long'|'short'}
     */
    signal;

    /**
     * @type {number}
     */
    price;

    /**
     * @type {number}
     */
    ts;

    /**
     * @type {number}
     */
    vol;

    /**
     * @type {number}
     */
    sl;

    /**
     * OBJ cons
     * @param {string} symbol 
     * @param {'long'|'short'} signal 
     * @param {number} price 
     * @param {number} vol 
     * @param {number} sl 
     */
    constructor(symbol, signal, price, vol, sl) {
        this.symbol = symbol;
        this.signal = signal;
        this.price = price;
        this.vol = vol;
        this.sl = sl;
        this.ts = Date.now();
    }
}

class SignalCache {
    /**
     * @type {number}
     */
    execPrice;

    /**
     * @type {number}
     */
    sl;

    /**
     * @type {number}
     */
    volPerc;

    /**
     * @type {number}
     */
    markPrice;

    /**
     * @param {number} ep 
     * @param {number} sl 
     * @param {number} v 
     * @param {number} mp 
     */
    constructor(ep, sl, v, mp) {
        this.execPrice = ep;
        this.markPrice = mp;
        this.sl = sl;
        this.volPerc = v;
    }
}

/**
 * This broadcasts signals to telegram bot in realtime.
 */
class BroadcastEngine {

    /**
     * Keeps track of signal occurences per token
     * @type {Record<string, Occurrence>}
     */
    static #occ = {};

    /**
     * Long signals are only executed if true.
     * @type {boolean}
     */
    static long = true;

    /**
     * Short signals are only executed if true.
     * @type {boolean}
     */
    static short = true;

    /**
     * @type {('long'|'short')[]}
     */
    static #recentSignals = [];

    /**
     * @returns {'no_signal'|'long'|'short'}
     */
    static getDominantSignal = () => {
        if (BroadcastEngine.#recentSignals.length > 2) {
            const longPerc = (BroadcastEngine.#recentSignals.filter(x => x == "long").length / BroadcastEngine.#recentSignals.length) * 100;
            const shortPerc = (BroadcastEngine.#recentSignals.filter(x => x == "short").length / BroadcastEngine.#recentSignals.length) * 100;

            if (longPerc >= Site.DC_MIN_DOM_PERC && shortPerc < Site.DC_MIN_DOM_PERC) {
                return "long";
            }

            if (shortPerc >= Site.DC_MIN_DOM_PERC && longPerc < Site.DC_MIN_DOM_PERC) {
                return "short";
            }
        }

        return 'no_signal';
    }

    /**
     * @type {Record<string, SignalCache>}
     */
    static #sigCache = {};

    /**
     * Keeps track of ATR Buys
     * @type {Record<string, ATRBuyData>}
     */
    static atr = {}

    static atrCount = () => Object.keys(BroadcastEngine.atr).length;

    static clearATR = () => {
        Object.keys(BroadcastEngine.atr).forEach(key => {
            delete BroadcastEngine.atr[key];
        })
        return true;
    }

    /**
     * @type {boolean}
     */
    static autoATR = Site.ATR_AUTO_ENABLE.length > 0;

    /**
     * Signals are passed here from analysis
     * @param {string} ticker 
     * @param {Signal} signal 
     * @param {string[][]} rawPrompt
     */
    static entry = async (ticker, signal, rawPrompt) => {

        if (!TelegramEngine) {
            TelegramEngine = require("./telegram");
        }
        if (!BroadcastEngine.#occ[ticker]) {
            BroadcastEngine.#occ[ticker] = new Occurrence(signal.long);
        }
        else {
            BroadcastEngine.#occ[ticker].update(signal.long);
        }

        // update recent signals
        BroadcastEngine.#recentSignals.push(signal.long ? 'long' : 'short');
        if (BroadcastEngine.#recentSignals.length > Site.DC_MAX_LATEST_SIGNALS) {
            BroadcastEngine.#recentSignals = BroadcastEngine.#recentSignals.slice(BroadcastEngine.#recentSignals.length - Site.DC_MAX_LATEST_SIGNALS);
        }

        const occurence = BroadcastEngine.#occ[ticker].getCount();
        const occFirstTime = BroadcastEngine.#occ[ticker].getFirstTime();
        let m = `📣 *Signal Broadcast*\n\n`;
        m += `Ticker 💲 ${ticker}\n`;
        m += `Type 👉 ${signal.long ? "Long" : "Short"}\n`;
        m += `Description 💬 ${signal.description}\n`;
        m += `Mark Price 🏷️ ${FFF(signal.markPrice, 6)}\n`;
        m += `Stop Loss Price 🏷️ ${FFF(signal.tpsl, 6)}\n`;
        m += `Volatility 📈 ${FFF(signal.volatilityPerc)}%\n`;
        m += `Occurrence 🔄 ${formatNumber(occurence)} \\(${getTimeElapsed(occFirstTime, Date.now())} ago\\)`;

        const verdict = await BroadcastEngine.#computePrompt(ticker, signal, rawPrompt, occurence);

        if (verdict) {
            m += `\n\n🤖 AI Verdict\n\`\`\`\n${verdict.str}\`\`\``;
        }

        if(Site.ALRT_SHOW_ONLY_SUPPORTED && !(verdict || {supported: false}).supported) {
            return;
        }

        if(Site.ALRT_SHOW_MINIMUM_CONFIDENCE && (verdict || {confidence: 0}).confidence < Site.ALRT_SHOW_MINIMUM_CONFIDENCE) {
            return;
        }

        if (!process.env.COLLER) {
            const ATRID = `${ticker}_${signal.long ? "LONG" : "SHORT"}`;
            const ATRPF = ((signal.volatilityPerc || 0) / 100) * (signal.markPrice || 0);
            const ATRP = signal.long ? ((signal.markPrice || 0) + ATRPF) : ((signal.markPrice || 0) - ATRPF);
            let verd = verdict ? verdict.obj : { confidence: 0, reason: '', supported: false };
            if (BroadcastEngine.#sigCache[ATRID]) {
                delete BroadcastEngine.#sigCache[ATRID];
            }
            BroadcastEngine.#sigCache[ATRID] = new SignalCache(ATRP, signal.tpsl, signal.volatilityPerc, signal.markPrice);
            if (BroadcastEngine.autoATR) {
                let autoEnabled = false;
                for (let i = 0; i < Site.ATR_AUTO_ENABLE.length; i++) {
                    let cond = Site.ATR_AUTO_ENABLE[i];
                    if (occurence <= cond.maxOccur && occurence >= cond.minOccur && verd.confidence >= cond.minConf && (cond.supportReq ? verd.supported : true)) {
                        autoEnabled = true;
                        break;
                    }
                }
                if (autoEnabled) {
                    if (BroadcastEngine.atr[ATRID]) {
                        delete BroadcastEngine.atr[ATRID];
                    }
                    BroadcastEngine.manageATR(true, ticker, signal.long ? "long" : "short");
                }
            }
            const isReg = BroadcastEngine.atr[ATRID] ? true : false;

            /**
             * @type {TelegramBot.InlineKeyboardButton[][]}
             */
            let inline = [
                [
                    {
                        text: `Create Order`,
                        callback_data: `${signal.long ? 'long' : 'short'}_${ticker}`,
                    },
                    {
                        text: `Mark Price`,
                        callback_data: `price_${ticker}`,
                    }
                ],
                [
                    {
                        text: `${isReg ? 'Dea' : 'A'}ctivate ATR Buy`,
                        callback_data: `ATR_${isReg ? "false" : "true"}_${ATRID}`,
                    },
                ],
            ];

            TelegramEngine.sendMessage(m, mid => {
            }, {
                parse_mode: "MarkdownV2",
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: inline,
                }
            });
        }
    }

    /**
     * @type {Record<string, boolean>}
     */
    static #executingATR = {};

    /**
     * Updates mark price of a ticker.
     * @param {string} symbol 
     * @param {number} price 
     */
    static updateMarkPrice = async (symbol, price) => {
        if (!Trader) {
            Trader = require("./trader");
        }
        if (!TelegramEngine) {
            TelegramEngine = require("./telegram");
        }
        const INDICATORS = {
            atr: (breakoutPrice, long) => long ? (price >= breakoutPrice) : (price <= breakoutPrice),
            tch: (gran, long) => {
                if (!TickerEngine) {
                    TickerEngine = require("./ticker");
                }
                const ticker = TickerEngine.getTicker(symbol);
                if (ticker) {
                    const data = ticker.getConsolidateData(gran);
                    /**
                     * @type {number[]}
                     */
                    const open = data.map(x => x.open);
                    /**
                     * @type {number[]}
                     */
                    const high = data.map(x => x.high);
                    /**
                     * @type {number[]}
                     */
                    const low = data.map(x => x.low);
                    /**
                     * @type {number[]}
                     */
                    const close = data.map(x => x.close);

                    const tmc = TimeCycle.calculate({ close, high, low, open, period: Site.IN_CFG.TMC_P ?? 20, model: (Site.IN_CFG.TMC_MODEL && ['reverse', 'both', 'continuous'].includes(Site.IN_CFG.TMC_MODEL)) ? Site.IN_CFG.TMC_MODEL : 'both' });
                    return (long ? tmc.map(x => x.long).find(x => x) : tmc.map(x => x.short).find(x => x)) || false;
                }
                else {
                    return false;
                }
            }
        };
        if (BroadcastEngine.atr[`${symbol}_LONG`]) {
            if (!BroadcastEngine.#executingATR[`${symbol}_LONG`]) {
                BroadcastEngine.#executingATR[`${symbol}_LONG`] = true;
                const atd = BroadcastEngine.atr[`${symbol}_LONG`];
                let pass = false;
                let passReason = '';
                for (const cond of Site.ATR_INDS){
                    if(cond.ind == "atr"){
                        pass = INDICATORS.atr(atd.price, true);
                        passReason = '';
                    }
                    else if(cond.ind == "tch"){
                        pass = INDICATORS.tch(cond.gran, true);
                        passReason = ` TCH ${cond.gran}`;
                    }
                    if(pass){
                        break;
                    }
                }
                if (pass && BroadcastEngine.autoATR) {
                    const domSig = this.getDominantSignal();
                    if ((domSig == "no_signal" || domSig == atd.signal) && BroadcastEngine.long) {
                        const mark = atd.price / (1 + (atd.vol) / 100);
                        const signal = new Signal(false, true, ("ATR Long"+`${passReason}`).trim(), atd.vol, atd.sl, mark);
                        const done = await Trader.openOrder(symbol, signal, false, true);
                        if (done) {
                            TelegramEngine.sendMessage(`✅ ATR${passReason} executed for ${symbol} LONG at ${FFF(price)} after ${getTimeElapsed(atd.ts, Date.now())}`);
                        }
                        else {
                            TelegramEngine.sendMessage(`❌ Failed to execute ATR${passReason} for ${symbol} LONG at ${FFF(price)} after ${getTimeElapsed(atd.ts, Date.now())}`);
                        }
                        delete BroadcastEngine.atr[`${symbol}_LONG`];
                    }
                }
                delete BroadcastEngine.#executingATR[`${symbol}_LONG`];
            }
        }
        if (BroadcastEngine.atr[`${symbol}_SHORT`]) {
            if (!BroadcastEngine.#executingATR[`${symbol}_SHORT`]) {
                BroadcastEngine.#executingATR[`${symbol}_SHORT`] = true;
                const atd = BroadcastEngine.atr[`${symbol}_SHORT`];
                let pass = false;
                let passReason = '';
                for (const cond of Site.ATR_INDS){
                    if(cond.ind == "atr"){
                        pass = INDICATORS.atr(atd.price, false);
                        passReason = '';
                    }
                    else if(cond.ind == "tch"){
                        pass = INDICATORS.tch(cond.gran, false);
                        passReason = ` TCH ${cond.gran}`;
                    }
                    if(pass){
                        break;
                    }
                }
                if (pass && BroadcastEngine.autoATR) {
                    const domSig = this.getDominantSignal();
                    if ((domSig == "no_signal" || domSig == atd.signal) && BroadcastEngine.short) {
                        const mark = atd.price / (1 - (atd.vol) / 100);
                        const signal = new Signal(true, false, ("ATR Short"+`${passReason}`).trim(), atd.vol, atd.sl, mark);
                        const done = await Trader.openOrder(symbol, signal, false, true);
                        if (done) {
                            TelegramEngine.sendMessage(`✅ ATR${passReason} executed for ${symbol} SHORT at ${FFF(price)} after ${getTimeElapsed(atd.ts, Date.now())}`);
                        }
                        else {
                            TelegramEngine.sendMessage(`❌ Failed to execute ATR${passReason} for ${symbol} SHORT at ${FFF(price)} after ${getTimeElapsed(atd.ts, Date.now())}`);
                        }
                        delete BroadcastEngine.atr[`${symbol}_SHORT`];
                    }
                }
                delete BroadcastEngine.#executingATR[`${symbol}_SHORT`];
            }
        }
    }

    /**
     * @type {NodeJS.Timeout}
     */
    static #ATRGabbageCollector;

    /**
     * @returns {Promise<boolean>}
     */
    static init = () => new Promise((resolve, reject) => {
        BroadcastEngine.#ATRGabbageCollector = setInterval(() => {
            Object.keys(BroadcastEngine.atr).filter(id => (Date.now() - BroadcastEngine.atr[id].ts) >= Site.ATR_TIMEOUT_MS).forEach(id => {
                delete BroadcastEngine.atr[id];
            });
        }, Site.ATR_INTERVAL_MS);
        resolve(true);
    });

    /**
     * @returns {Promise<boolean>}
     */
    static exit = () => new Promise((resolve, reject) => {
        if (BroadcastEngine.#ATRGabbageCollector) {
            clearInterval(BroadcastEngine.#ATRGabbageCollector);
        }
        resolve(true);
    });

    /**
     * This is used to set/unset ATR buy.
     * @param {boolean} activate 
     * @param {string} symbol 
     * @param {'long'|'short'} signal 
     */
    static manageATR = (activate, symbol, signal) => {
        let message = ``;
        let succ = true;
        const id = `${symbol}_${signal.toUpperCase()}`;
        if (BroadcastEngine.#sigCache[id]) {
            const vol = BroadcastEngine.#sigCache[id].volPerc;
            const mp = BroadcastEngine.#sigCache[id].markPrice;
            const ep = BroadcastEngine.#sigCache[id].execPrice;
            const sl = BroadcastEngine.#sigCache[id].sl;
            if (activate) {
                // SET NEW ATR
                if (BroadcastEngine.atr[id]) {
                    succ = false
                    message = `❌ ATR Buy already set for ${id}`;
                }
                else {
                    BroadcastEngine.atr[id] = new ATRBuyData(symbol, signal, ep, vol, sl);
                    succ = true
                    message = `✅ ATR Buy set for ${id} at price ${FFF(ep)}`;
                }
            }
            else {
                // UNSET EXISITNG ATR
                if (BroadcastEngine.atr[id]) {
                    delete BroadcastEngine.atr[id];
                    succ = true
                    message = `✅ ATR Buy unset for ${id} at price ${FFF(ep)}`;
                }
                else {
                    succ = false
                    message = `❌ No ATR Buy set for ${id}`;
                }
            }
        }
        else {
            succ = false;
            message = `❌ No signal cache for ${id}`;
        }
        return { succ, message };
    }

    /**
     * Keeps track of successful AI prompts to be used in successive ones.
     * @type {Record<string, {ts: number, supported: boolean, confidence: number, long: boolean, price: number}[]>}
     */
    static #aiHistory = {}

    /**
     * Handles prompt activity for a signal.
     * @param {string} ticker 
     * @param {Record<string, any>} signal 
     * @param {string[][]} rawPrompt
     * @param {number} occurence
     * @returns {Promise<{str: string, obj: {supported: boolean, reason: string, confidence: number}}|null>}
     */
    static #computePrompt = (ticker, signal, rawPrompt, occurence) => {
        return new Promise((resolve, reject) => {
            if (!BroadcastEngine.#aiHistory[ticker]) {
                BroadcastEngine.#aiHistory[ticker] = [];
            }
            let prompt = [
                {
                    role: "system",
                    content: "",
                },
                {
                    role: "user",
                    content: "",
                },
            ];

            prompt[0].content += `You are ${Site.TITLE || "Bennie"} AI,  a trading assistant skilled in indicator-based strategy evaluation for BitGet USDT Futures.`;
            prompt[0].content += `\n\nGiven structured data and recent signal history, determine if the proposed signal is valid.`;
            prompt[0].content += `\n\nRespond ONLY with a JSON object like:`;
            prompt[0].content += `\n\n{\n\t"supported": boolean,\n\t"reason": string,\n\t"confidence": number (0 to 100)\n}`;
            prompt[0].content += `\n\nExample:\n{\n\t"supported": true,\n\t"reason": "ADX confirms strong trend and no reversal signs, supporting the short signal.",\n\t"confidence": 84\n}\n\nNote: Numeric values in parentheses (e.g., 14 or 9/26/52/26) beside indicators represent their parameters when applicable.`;

            prompt[1].content += `# INPUT\n${rawPrompt[0].join("\n")}`;

            // if (BroadcastEngine.#aiHistory[ticker].length > 0) {
            //     prompt[1].content += `\n\nPrevious Signals: `;
            //     // prompt[1].content += `\nEach includes the trade type, time since generation, mark price, and your verdict at the time.`;
            //     for (let i = 0; i < BroadcastEngine.#aiHistory[ticker].length; i++) {
            //         const row = BroadcastEngine.#aiHistory[ticker][i];
            //         prompt[1].content += `\n- ${row.long ? "LONG" : "SHORT"} | ${getTimeElapsed(row.ts, Date.now())} ago | Mark Price: ${row.price} | Verdict: ${row.supported ? "Supported" : "Rejected"} (Confidence: ${row.confidence})`;
            //     }
            // }

            const history = BroadcastEngine.#aiHistory[ticker];
            if (history.length > 0) {
                prompt[1].content += `\n\nPrevious Signals:\n` +
                    history.map(row =>
                        `- ${row.long ? "LONG" : "SHORT"} | ${getTimeElapsed(row.ts, Date.now())} ago | price: ${row.price} | ${row.supported ? "Supported" : "Not Supported"} ${row.confidence}%`
                    ).join("\n");
            }

            // prompt[1].content += `\n\n## INDICATOR ANALYSIS`;
            for (let i = 1; i <= 7; i++) {
                const data = rawPrompt[i];
                switch (i) {
                    case 1:
                        prompt[1].content += `\n\nEntry: `;
                        // prompt[1].content += `\nTrend/momentum switch detection using a single indicator.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `${x}`).join("") : 'None'}`;
                        break;
                    case 2:
                        prompt[1].content += `\n\nTrend: `;
                        // prompt[1].content += `\nDetermined using multiple trend indicators.\n`;
                        prompt[1].content += `${data.length ? '\n' + data.map(x => `- ${x}`).join("\n") : 'None'}`;
                        break;
                    case 3:
                        prompt[1].content += `\n\nStrength: `;
                        // prompt[1].content += `\nMeasured by ADX. Strong if ADX >= 25.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `${x}`).join("") : 'None'}`;
                        break;
                    case 4:
                        prompt[1].content += `\n\nOver${signal.long ? 'bought' : 'sold'} (Checks if market conditions could reverse the signal): `;
                        // prompt[1].content += `\nChecks if market conditions could reverse the signal.\n`;
                        prompt[1].content += `${data.length ? '\n' + data.map(x => `- ${x}`).join("\n") : `None`}`;
                        break;
                    case 5:
                        // prompt[1].content += `\n\n### STEP 5 - Candlestick Reversal Patterns`;
                        prompt[1].content += `\n\nReversal Candles (Detects candlestick patterns opposing the signal): `;
                        // prompt[1].content += `\nDetects candlestick patterns opposing the signal.\n`;
                        prompt[1].content += `${data.length ? `${data.map(x => `${x}`).join(", ")}` : 'None'}`;
                        break;
                    case 6:
                        prompt[1].content += `\n\nStop Loss Price:  \n`;
                        // prompt[1].content += `\nStop loss price calculated using a volatility or trend-based indicator.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `- ${x}`).join("\n") : 'None'}`;
                        break;
                    case 7:
                        prompt[1].content += `\n\nVolatility: `;
                        // prompt[1].content += `\nComputed using ATR and expressed as a percentage of current price.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `${x}`).join("") : 'None'}`;
                        break;
                    default:
                    // do nothing
                }
            }

            prompt[1].content += `\n\nSignal: **${signal.long ? "LONG" : "SHORT"}** ${occurence > 1 ? `(Occurred ${occurence}x consecutively)` : ''}`;

            prompt[1].content += `\n\n## TASK\nReturn a JSON object only with:\n- supported: true/false\n- reason: short paragraph\n- confidence: 0–100`;

            prompt[0].content = prompt[0].content.replace(/ {2,}/g, " ");
            prompt[1].content = prompt[1].content.replace(/ {2,}/g, " ");

            if (process.env.COLLER) {
                console.log(prompt);
                resolve(null);
            }

            else {
                GroqEngine.request({
                    messages: prompt,
                    callback(r) {
                        if (r.succ) {
                            try {
                                r.message = r.message.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
                                const { supported, reason, confidence } = JSON.parse(r.message);
                                const row = { ts: Date.now(), supported: supported, confidence: confidence, long: signal.long, price: signal.markPrice };

                                BroadcastEngine.#aiHistory[ticker].push(row);
                                if (BroadcastEngine.#aiHistory[ticker].length > Site.GROQ_MAX_HISTORY_COUNT) {
                                    BroadcastEngine.#aiHistory[ticker] = BroadcastEngine.#aiHistory[ticker].slice(BroadcastEngine.#aiHistory[ticker].length - Site.GROQ_MAX_HISTORY_COUNT);
                                }
                                resolve({
                                    str: `Supported: ${supported ? 'Yes' : 'No'}\nReason: ${reason}\nConfidence: ${confidence}`,
                                    obj: {
                                        confidence: confidence,
                                        reason: reason,
                                        supported: supported,
                                    }
                                });
                            } catch (error) {
                                Log.dev(error);
                                resolve(null);
                            }
                        }
                        else {
                            resolve(null);
                        }
                    },
                });
            }
        });
    }
}

module.exports = BroadcastEngine;
