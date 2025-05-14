const Site = require("../site");

class Sign {
    /**
     * @type {string}
     */
    signature;

    /**
     * @type {number}
     */
    addTimestamp;

    /**
     * @param {string} sign 
     */
    constructor(sign){
        this.signature = sign;
        this.addTimestamp = Date.now();
    }
};

/**
 * This filters out possible duplicate signals on a token.
 * For example, if repeated short signals are sent out on BTCUSDT,
 * later signals are discarded until a timeout is reached.
 * This can help in avoiding "buying at the top" or "selling at the bottom" situations.
 * 
 * This was supposed to be timebased, directly filtering out signals, but on a second thought...
 * It should rather work on orders actually opened.
 * For instance, it records the actions it take recently in a string array e.g. "LONGBTCUSDT SHORTBTCUSDT ...", only when an order goes though
 * we can maintain a length of recent 5.
 * If another order comes in with a signature same as any element of the signatures array, it is rejected.
 * 
 * Signatures are saved after buy orders are sent without errors, for non-manual orders.
 * Signatures are sent when signals are received from analysis, so only non-manual orders are affected.
 * Signature length can be configured with default as 5.
 * No time limits.
 * The downside to this is when using a tiny set of tickers, like 1.
 * So, yeah, implement some optional time limiting.
 */
class DupSig {
    /**
     * @type {Sign[]}
     */
    static #signs = [];

    /**
     * This gets rid of expired signs and maintains a configured length;
     */
    static #clean = () => {
        DupSig.#signs = DupSig.#signs.filter(sign => (Date.now() - sign.addTimestamp) < Site.DS_MAX_DURATION_MS);
        if(DupSig.#signs.length > Site.DS_MAX_SIGNS){
            DupSig.#signs = DupSig.#signs.slice(DupSig.#signs.length - Site.DS_MAX_SIGNS);
        }
    }

    /**
     * Adds a new signature.
     * @param {string} sign - e.g. LONGBTCUSDT
     * @returns {void}
     */
    static add = (sign) => {
        if(Site.DS_USE){
            DupSig.#signs.push(new Sign(sign));
            DupSig.#clean();
        }
    }

    /**
     * Checks if a signature is allowed to proceed.
     * @param {string} sign e.g SHORTETHUDT
     * @returns {boolean} True if proceed else false.
     */
    static check = (sign) => {
        if(!Site.DS_USE){
            return true;
        }
        DupSig.#clean();
        return DupSig.#signs.filter(sign => sign.signature == sign).length <= 0;
    }
    
}

module.exports = DupSig;