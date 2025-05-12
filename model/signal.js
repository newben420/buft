class Signal {
    /**
     * @type {boolean}
     */
    short;

    /**
    * @type {boolean}
    */
    long;

    /**
     * @type {string}
     */
    description;

    /**
     * @type {number}
     */
    volatilityPerc;

    /**
     * @type {number}
     */
    tpsl;

    /**
     * @type {number}
     */
    markPrice;

    /**
     * Object constructor
     * @param {boolean} short
     * @param {boolean} long
     * @param {string} description
     * @param {number} volPerc
     * @param {number} tpsl
     * @param {number} mark
     */
    constructor(short, long, description, volPerc, tpsl, mark) {
        this.short = short;
        this.long = long;
        this.description = description;
        this.volatilityPerc = volPerc;
        this.tpsl = tpsl;
        this.markPrice = mark;
    }
}

module.exports = Signal;