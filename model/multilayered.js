class Multilayered {
    /**
     * Current rate
     * @type {number}
     */
    rate;

    /**
     * Signal history
     * @type {string[]}
     */
    signals;

    /**
     * Latest epoch timestamp as an identifier for the signal group
     */
    ts;

    /**
     * Class constructor
     */
    constructor() {
        this.rate = 0;
        this.signals = [];
        this.ts = Date.now();
    }
}

module.exports = Multilayered;