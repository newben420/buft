const FFF = require("../lib/fff");
const TelegramBot = require('node-telegram-bot-api');
const formatNumber = require("../lib/format_number");
const Site = require("../site");
const { GroqEngine } = require("./groq");
const Log = require("../lib/log");
const getTimeElapsed = require("../lib/get_time_elapsed");

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

        if(verdict){
            m += `\n\n🤖 AI Verdict\n\`\`\`\n${verdict}\`\`\``;
        }

        /**
         * @type {TelegramBot.InlineKeyboardButton[][]}
         */
        let inline = [[
        ], [
            {
                text: `Create Order`,
                callback_data: `${signal.long ? 'long' : 'short'}_${ticker}`,
            }
        ]];

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
            prompt[0].content += `\n\nExample:\n{\n\t"supported": true,\n\t"reason": "ADX confirms strong trend and no reversal signs, supporting the short signal.",\n\t"confidence": 84\n}`;

            prompt[1].content += `# INPUT\n${rawPrompt[0].join("\n")}`;

            if (BroadcastEngine.#aiHistory[ticker].length > 0) {
                prompt[1].content += `\n\n## PREVIOUS SIGNALS`;
                prompt[1].content += `\nEach includes the trade type, time since generation, mark price, and your verdict at the time.`;
                for (let i = 0; i < BroadcastEngine.#aiHistory[ticker].length; i++) {
                    const row = BroadcastEngine.#aiHistory[ticker][i];
                    prompt[1].content += `\n${(i + 1)}. [${row.long ? "LONG" : "SHORT"}] | ${getTimeElapsed(row.ts, Date.now())} ago | Mark Price: ${row.price} | Verdict: ${row.supported ? "Supported" : "Rejected"} (Confidence: ${row.confidence})`;
                }
            }

            prompt[1].content += `\n\n## INDICATOR ANALYSIS`;
            for (let i = 1; i <= 7; i++) {
                const data = rawPrompt[i];
                switch (i) {
                    case 1:
                        prompt[1].content += `\n\n1. Entry:  \n`;
                        // prompt[1].content += `\nTrend/momentum switch detection using a single indicator.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : '\tNone detected'}`;
                        break;
                    case 2:
                        prompt[1].content += `\n\n2. Trend:  \n`;
                        // prompt[1].content += `\nDetermined using multiple trend indicators.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : '\tNone detected'}`;
                        break;
                    case 3:
                        prompt[1].content += `\n\n3. Strength:  \n`;
                        // prompt[1].content += `\nMeasured by ADX. Strong if ADX >= 25.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : '\tNone detected'}`;
                        break;
                    case 4:
                        prompt[1].content += `\n\n4. Over${signal.long ? 'bought' : 'sold'}:  \n`;
                        // prompt[1].content += `\nChecks if market conditions could reverse the signal.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : `\tNone detected`}`;
                        break;
                    case 5:
                        // prompt[1].content += `\n\n### STEP 5 - Candlestick Reversal Patterns`;
                        prompt[1].content += `\n\n5. Candlestick Reversals:  \n`;
                        // prompt[1].content += `\nDetects candlestick patterns opposing the signal.\n`;
                        prompt[1].content += `${data.length ? `${data.map(x => `\t- ${x}`).join("\n")}.` : '\tNone detected'}`;
                        break;
                    case 6:
                        prompt[1].content += `\n\n6. Stop Loss Price:  \n`;
                        // prompt[1].content += `\nStop loss price calculated using a volatility or trend-based indicator.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : '\tNone computed'}`;
                        break;
                    case 7:
                        prompt[1].content += `\n\n7. Volatility:  \n`;
                        // prompt[1].content += `\nComputed using ATR and expressed as a percentage of current price.\n`;
                        prompt[1].content += `${data.length ? data.map(x => `\t- ${x}`).join("\n") : '\tNone computed'}`;
                        break;
                    default:
                    // do nothing
                }
            }

            prompt[1].content += `\n\n## SIGNAL\nThe trading script now proposes a **${signal.long ? "LONG" : "SHORT"}** signal. ${occurence > 1 ? `The same signal has occurred ${occurence} times consecutively.` : ''}`;

            prompt[1].content += `\n\n## TASK\nReturn a JSON object only with:\n- supported: true/false\n- reason: short paragraph\n- confidence: 0–100`;

            prompt[0].content = prompt[0].content.replace(/ {2,}/g, " ");
            prompt[1].content = prompt[1].content.replace(/ {2,}/g, " ");

            console.log(prompt);

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
