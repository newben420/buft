const FFF = require("../lib/fff");

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
        m += `Mark Price 🏷️ ${FFF(signal.markPrice)}\n`;
        m += `Stop Loss Price 🏷️ ${FFF(signal.tpsl)}\n`;
        m += `Volatility 📈 ${FFF(signal.volatilityPerc)}%`;

        TelegramEngine.sendMessage(m);
    }
}

module.exports = BroadcastEngine;