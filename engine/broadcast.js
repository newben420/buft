const FFF = require("../lib/fff");
const TelegramBot = require('node-telegram-bot-api');
const formatNumber = require("../lib/format_number");

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
    update(isLong){
        /**
         * @type {'long'|'short'}
         */
        const newSignal = isLong ? "long" : "short";
        if(newSignal == this.signal){
            this.count++;
        }
        else{
            this.signal = newSignal;
            this.count = 1;
        }
    }

    /**
     * Get count of the current signal's occurence.
     * @returns {number}
     */
    getCount(){
        return this.count;
    }

    /**
     * Obj const.
     * @param {boolean} isLong 
     */
    constructor(isLong){
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
     */
    static entry = (ticker, signal) => {
        if(!TelegramEngine){
            TelegramEngine = require("./telegram");
        }
        if(!BroadcastEngine.#occ[ticker]){
            BroadcastEngine.#occ[ticker] = new Occurrence(signal.long);
        }
        else{
            BroadcastEngine.#occ[ticker].update(signal.long);
        }
        let m = `📣 *Signal Broadcast*\n\n`;
        m += `Ticker 💲 ${ticker}\n`;
        m += `Type 👉 ${signal.long ? "Long" : "Short"}\n`;
        m += `Description 💬 ${signal.description}\n`;
        m += `Mark Price 🏷️ ${FFF(signal.markPrice, 6)}\n`;
        m += `Stop Loss Price 🏷️ ${FFF(signal.tpsl, 6)}\n`;
        m += `Volatility 📈 ${FFF(signal.volatilityPerc)}%`;
        m += `Occurrence 🔄 ${formatNumber(BroadcastEngine.#occ[ticker].getCount())}`;

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
}

module.exports = BroadcastEngine;
