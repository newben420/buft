class Candlestick {
    /**
     * @type {number}
     */
    open;

    /**
     * @type {number}
     */
    high;

    /**
     * @type {number}
     */
    low;

    /**
     * @type {number}
     */
    close;

    /**
     * @type {number}
     */
    volume;

    /**
     * @type {number}
     */
    ts;

    /**
     * Object constructor
     * @param {number} open 
     * @param {number} high 
     * @param {number} low 
     * @param {number} close 
     * @param {number} volume 
     * @param {number} ts
     */
    constructor(open, high, low, close, volume, ts){
        this.open = parseFloat(open);
        this.high = parseFloat(high);
        this.low = parseFloat(low);
        this.close = parseFloat(close);
        this.volume = parseFloat(volume);
        this.ts = parseInt(ts);
    }
}

module.exports = Candlestick;