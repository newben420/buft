const { compute1ExpDirection } = require("../lib/direction");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Log = require("../lib/log");
const Signal = require("../model/signal");
const Site = require("../site");
const TickerEngine = require("./ticker");
const Trader = require("./trader");

/**
 * Handles lone signal's mechanism.
 * Read documentation of the class below to understand this class.
 */
class LoneSignal {
    /**
     * @type {string}
     */
    symbol;

    /**
     * @type {string}
     */
    remove_reason;

    /**
     * @type {boolean}
     */
    isLong;

    /**
     * @type {number}
     */
    addTimestamp;

    /**
     * @type {number}
     */
    markPrice;

    /**
     * @type {number}
     */
    slPerc;

    /**
     * @type {number}
     */
    volatilityPerc;

    /**
     *  @param {string} s - Symbol
     */
    destFx = (s) => { };

    /**
     * @type {NodeJS.Timeout}
     */
    intervalRef;

    /**
     * @param {string} symbol 
     * @param {Signal} signal 
     * @param {Function} destFx 
     */
    constructor(symbol, signal, destFx) {
        this.symbol = symbol;
        this.addTimestamp = Date.now();
        this.isLong = signal.long;
        this.markPrice = signal.markPrice;
        this.remove_reason = "Unspecified";
        this.slPerc = signal.tpsl;
        this.volatilityPerc = signal.volatilityPerc;
        this.destFx = destFx;
        setTimeout(() => {
            this.runner();
        }, 10);
    }

    runner() {
        const start = Date.now();
        const conclude = () => {
            const diff = Date.now() - start;
            if (diff >= Site.TK_INTERVALS[0]) {
                Log.flow(`LoneSignal > ${this.symbol} > End iteration.`, 4);
                this.runner();
            }
            else {
                let remTime = Site.TK_INTERVALS[0] - diff;
                Log.flow(`LoneSignal > ${this.symbol} > End iteration. Next in ${getTimeElapsed(0, remTime)}.`, 4);
                this.intervalRef = setTimeout(() => {
                    this.runner();
                }, remTime);
            }
        }
        // BEGIN RUNNER
        Log.flow(`LoneSignal > ${this.symbol} > Begin iteration.`, 4);
        const ticker = TickerEngine.getTicker(this.symbol);
        if (ticker) {
            if ((Date.now() - this.addTimestamp) > Site.SS_LONE_MAX_DURATION_MS) {
                this.remove_reason = "Timeout";
                this.destFx(this.symbol);
            }
            else {
                if (ticker.candlestickData.length > 0) {
                    // Continue Analysis
                    // I studied the behaviour of lone signals on my self-developed test suite to make this simple computation.
                    // I would have added a mechanism to also confirm the lone signals... But may be too late.
                    // In the next update though, we'd study its progression and emit same signal with adjusted stop loss values.
                    const latestRate = ticker.candlestickData[ticker.candlestickData.length - 1].close;
                    const volatility = Math.abs((((latestRate - this.markPrice) / this.markPrice) * 100) || 0) || Infinity;
                    const curveDir = SigSmooth.curveDirection();
                    const sigDir = this.isLong ? 1 : -1;
                    const safeZone = (Math.abs(volatility - this.slPerc) <= (this.volatilityPerc * 2)) && (curveDir != sigDir);
                    const safeUTurn = (volatility >= this.slPerc) && (this.isLong ? (latestRate < this.markPrice) : (latestRate > this.markPrice));
                    if (safeUTurn) {
                        // Signal direction has turned and has hit stop loss value
                        if (safeZone) {
                            // U turn is within safe zone
                            // discard lone signal
                            // emit a reverse signal
                            Trader.newSignal(this.symbol, new Signal(
                                this.isLong ? true : false,
                                this.isLong ? false : true,
                                "Lone Signal Reversal",
                                this.volatilityPerc,
                                this.slPerc,
                                latestRate,
                            ));
                            this.remove_reason = "Reversal Emitted";
                            this.destFx(this.symbol);
                        }
                        else {
                            // U turn is outside of safezone
                            // discard lone signal
                            this.remove_reason = "Reversal Not In Safe Zone";
                            this.destFx(this.symbol);
                        }
                    }
                    else {
                        conclude();
                    }
                }
                else {
                    conclude();
                }
            }
        }
        else {
            this.remove_reason = "No Ticker";
            this.destFx(this.symbol);
        }
    }

    internalDestroy() {
        if (this.intervalRef) {
            clearTimeout(this.intervalRef);
        }
        return this.remove_reason;
    }
}

/**
 * This filters out lone sgnals that do not conform to the current upward/downward trend.
 * It uses my ExponentialDirection function and an int array it adds to by --/++ the last element based on long/short.
 * I have observed that most established coins tend to follow a single trend at a time with just little individual volatility.
 * This makes up a major reason why I went degen (this does not happen in degen). 
 * I was trading spots, so my systems were sitting ducks in a bearish trend, made worse with no leverage to enhance my positions,
 *  
 * I am implementing this class/component because an unfortunate event occurred today.
 * A hype ticker went all "hypy" and emitted a lone long signal in a bearish trend.
 * It hit my "lose all 100%" experimental stop loss and closed at -200% gross almost faster than a Kenyan in a Boston Marathon (You can't outrun them, I love them...)
 * So now, I am gonna make this class, but I wont leave it at that.
 * I know how hype coins behave doing hypes, they get overbought real quick and you can make a fortune when you short them after they are done hyping.
 * So, the lone signals that would be fitered out here, would be observed and molded into signals that fit the trend and at the right time, emitted.
 * Hence, making the class a bit more sophisticated...
 * So Help Me God. 
 */
class SigSmooth {
    /**
     * This maintains a configured normal/max length of any array that we may use here.
     * @type {number}
     */
    static #l = Site.IN_CFG.DIR_LEN || 5;

    /**
     * This maintains values based on current trend.
     * A new element is added whenever a new signal is received.
     * Its value is computed by --/++ the current last child based on the direction of the signal.
     * It begins with a clear default of 0 (directionless) element.
     * @type {number[]}
     */
    static #arr = [0];

    static curveDirection = () => compute1ExpDirection(SigSmooth.#arr, Math.min(SigSmooth.#arr.length, SigSmooth.#l));


    /**
     * This is the entry point to the mechanism of this class. It returns a boolean.
     * The ExpDirection function is applied to the #arr array and if the direction conforms with the signal, it is not a lone signal.
     * @param {string} symbol - Ticker symbol of the signal.
     * @param {Signal} signal - A signal that made it to Trader.
     * @returns {boolean} True if the signal can be used, else False. 
     */
    static entry = (symbol, signal) => {
        if (!Site.SS_USE) {
            return true;
        }
        // Update the trend curve.
        if (signal.long) {
            SigSmooth.#arr.push((SigSmooth.#arr[SigSmooth.#arr.length - 1] || 0) + 1);
        }
        else if (signal.short) {
            SigSmooth.#arr.push((SigSmooth.#arr[SigSmooth.#arr.length - 1] || 0) - 1);
        }

        // Maintain the length of the trend curve.
        if (SigSmooth.#arr.length > SigSmooth.#l) {
            SigSmooth.#arr = SigSmooth.#arr.slice(SigSmooth.#arr.length - SigSmooth.#l);
        }

        // Calculate curve direction.
        const curveDir = SigSmooth.curveDirection();

        // Calculate signal direction
        const sigDir = signal.long ? 1 : signal.short ? -1 : 0;

        // Calculate conformation
        const conform = curveDir === sigDir;

        if (!conform) {
            SigSmooth.addLone(symbol, signal);
        }

        return conform;
    }

    /**
     * @type {LoneSignal[]}
     */
    static #lones = [];

    /**
     * Adds a lone signal
     * @param {string} symbol 
     * @param {Signal} signal 
     */
    static addLone = (symbol, signal) => {
        if (this.#lones.filter(lone => lone.symbol == symbol).length <= 0) {
            Log.flow(`LoneSignal > Add ${symbol}.`, 3);
            SigSmooth.#lones.push(new LoneSignal(symbol, signal, SigSmooth.removeLone));
        }
    }

    /**
     * Removes a lone signal
     * @param {string} symbol 
     */
    static removeLone = (symbol) => {
        const ls = SigSmooth.#lones.find(l => l.symbol == symbol);
        if (ls) {
            const reason = ls.internalDestroy();
            Log.flow(`LoneSignal > Remove ${symbol} with reason '${reason}'.`, 3);
            SigSmooth.#lones.splice(SigSmooth.#lones.findIndex(l => l.symbol == symbol), 1);
        }
    }
}

module.exports = SigSmooth;

// BASIC MODULE TEST
// let i = 30;
// while (i > 0) {
//     i--;
//     let rando = Math.round(Math.random() * 10);
//     let long = rando > 5;
//     let short = !long;
//     console.log(`${long ? `LONG` : `SHRT`}`, SigSmooth.entry("BTCUSDT", new Signal(short, long, "", rando, rando, rando)));
// }