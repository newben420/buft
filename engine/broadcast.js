const FFF = require("../lib/fff");
const TelegramBot = require('node-telegram-bot-api');
const formatNumber = require("../lib/format_number");
const Site = require("../site");
const { GroqEngine } = require("./groq");
const Log = require("../lib/log");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Signal = require("../model/signal");

let Trader = null;

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
     * The number of times the current signal has occurred.\
     * @type {number}
     */
    count;

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
     * OBJ cons
     * @param {string} symbol 
     * @param {'long'|'short'} signal 
     * @param {number} price 
     */
    constructor(symbol, signal, price) {
        this.symbol = symbol;
        this.signal = signal;
        this.price = price;
        this.ts = Date.now();
    }
}

let TelegramEngine = null;
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
     * Keeps track of ATR Buys
     * @type {Record<string, ATRBuyData>}
     */
    static atr = {}

    /**
     * Signals are passed here from analysis
     * @param {string} ticker 
     * @param {Record<string, any>} signal 
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

        const occurence = BroadcastEngine.#occ[ticker].getCount();
        let m = `📣 *Signal Broadcast*\n\n`;
        m += `Ticker 💲 ${ticker}\n`;
        m += `Type 👉 ${signal.long ? "Long" : "Short"}\n`;
        m += `Description 💬 ${signal.description}\n`;
        m += `Mark Price 🏷️ ${FFF(signal.markPrice, 6)}\n`;
        m += `Stop Loss Price 🏷️ ${FFF(signal.tpsl, 6)}\n`;
        m += `Volatility 📈 ${FFF(signal.volatilityPerc)}%\n`;
        m += `Occurrence 🔄 ${formatNumber(occurence)}`;

        const verdict = await BroadcastEngine.#computePrompt(ticker, signal, rawPrompt, occurence);

        if (verdict) {
            m += `\n\n🤖 AI Verdict\n\`\`\`\n${verdict}\`\`\``;
        }

        const ATRID = `${ticker}_${signal.long ? "LONG" : "SHORT"}`;
        const ATRPF = ((signal.volatilityPerc || 0) / 100) * (signal.markPrice || 0);
        const ATRP = signal.long ? ((signal.markPrice || 0) + ATRPF) : ((signal.markPrice || 0) - ATRPF);
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
                    callback_data: `ATR_${isReg ? "false" : "true"}_${ATRID}_${ATRP}`,
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
        if (BroadcastEngine.atr[`${symbol}_LONG`]) {
            if (!BroadcastEngine.#executingATR[`${symbol}_LONG`]) {
                BroadcastEngine.#executingATR[`${symbol}_LONG`] = true;
                const atd = BroadcastEngine.atr[`${symbol}_LONG`];
                if (price >= atd.price) {
                    const signal = new Signal(false, true, "ATR Long", 0, Site.TR_MANUAL_STOPLOSS_PERC, 0);
                    const done = await Trader.openOrder(symbol, signal, true);
                    if (done) {
                        TelegramEngine.sendMessage(`✅ ATR executed for ${symbol}_LONG at ${FFF(price)}`);
                    }
                    else {
                        TelegramEngine.sendMessage(`❌ Failed to execute ATR for ${symbol}_LONG at ${FFF(price)}`);
                    }
                    delete BroadcastEngine.atr[`${symbol}_LONG`];
                }
                delete BroadcastEngine.#executingATR[`${symbol}_LONG`];
            }
        }
        if (BroadcastEngine.atr[`${symbol}_SHORT`]) {
            if (!BroadcastEngine.#executingATR[`${symbol}_SHORT`]) {
                BroadcastEngine.#executingATR[`${symbol}_SHORT`] = true;
                const atd = BroadcastEngine.atr[`${symbol}_SHORT`];
                if (price <= atd.price) {
                    const signal = new Signal(true, false, "ATR Short", 0, Site.TR_MANUAL_STOPLOSS_PERC, 0);
                    const done = await Trader.openOrder(symbol, signal, true);
                    if (done) {
                        TelegramEngine.sendMessage(`✅ ATR executed for ${symbol}_SHORT at ${FFF(price)}`);
                    }
                    else {
                        TelegramEngine.sendMessage(`❌ Failed to execute ATR for ${symbol}_SHORT at ${FFF(price)}`);
                    }
                    delete BroadcastEngine.atr[`${symbol}_SHORT`];
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
     * @param {number} price 
     */
    static manageATR = (activate, symbol, signal, price) => {
        let message = ``;
        let succ = true;
        const id = `${symbol}_${signal.toUpperCase()}`;
        if (activate) {
            // SET NEW ATR
            if (BroadcastEngine.atr[id]) {
                succ = false
                message = `❌ ATR Buy already set for ${id}`;
            }
            else {
                BroadcastEngine.atr[id] = new ATRBuyData(symbol, signal, price);
                succ = true
                message = `✅ ATR Buy set for ${id} at price ${FFF(price)}`;
            }
        }
        else {
            // UNSET EXISITNG ATR
            if (BroadcastEngine.atr[id]) {
                delete BroadcastEngine.atr[id];
                succ = true
                message = `✅ ATR Buy unset for ${id} at price ${FFF(price)}`;
            }
            else {
                succ = false
                message = `❌ No ATR Buy set for ${id}`;
            }
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
     * @returns {Promise<string|null>}
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
                        `- ${row.long ? "LONG" : "SHORT"} | ${getTimeElapsed(row.ts, Date.now())} ago | ${row.price} | ${row.supported ? "✓" : "✗"} ${row.confidence}%`
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

            if(process.env.COLLER) console.log(prompt);

            GroqEngine.request({
                messages: prompt,
                callback(r) {
                    if (r.succ) {
                        try {
                            const { supported, reason, confidence } = JSON.parse(r.message);
                            const row = { ts: Date.now(), supported: supported, confidence: confidence, long: signal.long, price: signal.markPrice };

                            BroadcastEngine.#aiHistory[ticker].push(row);
                            if (BroadcastEngine.#aiHistory[ticker].length > Site.GROQ_MAX_HISTORY_COUNT) {
                                BroadcastEngine.#aiHistory[ticker] = BroadcastEngine.#aiHistory[ticker].slice(BroadcastEngine.#aiHistory[ticker].length - Site.GROQ_MAX_HISTORY_COUNT);
                            }
                            resolve(`Supported: ${supported ? 'Yes' : 'No'}\nReason: ${reason}\nConfidence: ${confidence}`);
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
        });
    }
}

module.exports = BroadcastEngine;
