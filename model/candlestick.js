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
     * Object constructor
     * @param {number} open 
     * @param {number} high 
     * @param {number} low 
     * @param {number} close 
     * @param {number} volume 
     */
    constructor(open, high, low, close, volume){
        this.open = parseFloat(open);
        this.high = parseFloat(high);
        this.low = parseFloat(low);
        this.close = parseFloat(close);
        this.volume = parseFloat(volume);
    }
}

module.exports = Candlestick;