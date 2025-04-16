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
    tpslPerc;

    /**
     * Object constructor
     * @param {boolean} short
     * @param {boolean} long
     * @param {string} description
     * @param {number} volPerc
     * @param {number} tpslPerc
     */
    constructor(short, long, description, volPerc, tpslPerc) {
        this.short = short;
        this.long = long;
        this.description = description;
        this.volatilityPerc = volPerc;
        this.tpslPerc = tpslPerc;
    }
}

module.exports = Signal;