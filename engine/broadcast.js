const FFF = require("../lib/fff");
const TelegramBot = require('node-telegram-bot-api');

let TelegramEngine = null;
/**
 * This broadcasts signals to telegram bot in realtime.
 */
class BroadcastEngine {
    /**
     * Signals are passed here from analysis
     * @param {string} ticker 
     * @param {Record<string, any>} signal 
     */
    static entry = (ticker, signal) => {
        if(!TelegramEngine){
            TelegramEngine = require("./telegram");
        }
        let m = `📣 *Signal Broadcast*\n\n`;
        m += `Ticker 💲 ${ticker}\n`;
        m += `Type 👉 ${signal.long ? "Long" : "Short"}\n`;
        m += `Description 💬 ${signal.description}\n`;
        m += `Mark Price 🏷️ ${FFF(signal.markPrice, 6)}\n`;
        m += `Stop Loss Price 🏷️ ${FFF(signal.tpsl, 6)}\n`;
        m += `Volatility 📈 ${FFF(signal.volatilityPerc)}%`;

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
