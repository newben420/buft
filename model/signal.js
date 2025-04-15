class Signal {
    /**
     * Type of entry signal
     * @type {"SHORT"|"LONG"}
     */
    type;

    /**
     * Object constructor
     * @param {"SHORT"|"LONG"} ty
     */
    constructor(ty){
        this.type = ty;
    }
}

module.exports = Signal;