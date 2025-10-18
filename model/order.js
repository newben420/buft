class Order {

    /**
     * @type {string}
     */
    symbol;

    /**
     * @type {number}
     */
    open_time;

    /**
     * @type {number}
     */
    open_price;

    /**
     * @type {number}
     */
    close_time;

    /**
     * @type {number}
     */
    close_price;

    /**
     * @type {number}
     */
    gross_profit;

    /**
     * @type {number}
     */
    net_profit;

    /**
     * @type {number}
     */
    roi;

    /**
     * @type {number}
     */
    peak_roi;

    /**
     * @type {number}
     */
    peak_ts;

    /**
     * @type {number}
     */
    least_roi;

    /**
     * @type {number}
     */
    least_ts;

    /**
     * @type {number[]}
     */
    recent_ROE;

    /**
     * @type {number}
     */
    liquidation_price;

    /**
     * @type {number}
     */
    breakeven_price;

    /**
     * @type {"long"|"short"}
     */
    side;

    /**
     * @type {number}
     */
    size;

    /**
     * @type {number}
     */
    price;

    /**
     * @type {number}
     */
    leverage;

    /**
     * @type {string}
     */
    close_reason;

    /**
     * @type {string}
     */
    open_reason;

    /**
     * @type {string}
     */
    id;

    /**
     * @type {string}
     */
    orderId;

    /**
     * @type {number}
     */
    sl;

    /**
     * @type {boolean}
     */
    manual;

    /**
     * @type {number}
     */
    capital;

    /**
     * Object constructor
     * @param {string} symbol 
     * @param {string} id, 
     * @param {"long"|"short"} side 
     * @param {number} open_time 
     * @param {number} sl 
     * @param {boolean} manual 
     * @param {string} open_reason 
     * @param {number} cap 
     */
    constructor(
        symbol,
        id,
        side,
        open_time,
        sl,
        manual,
        open_reason,
        cap,
    ) {
        this.symbol = symbol;
        this.id = id;
        this.side = side;
        this.sl = sl;
        this.manual = manual;
        this.open_time = open_time;
        this.open_reason = open_reason;
        this.open_price = 0;
        this.close_time = 0;
        this.close_price = 0;
        this.recent_ROE = [];
        this.gross_profit = 0;
        this.net_profit = 0;
        this.roi = 0;
        this.peak_roi = 0;
        this.least_roi = 0;
        this.peak_ts = 0;
        this.least_ts = 0;
        this.liquidation_price = 0;
        this.breakeven_price = 0;
        this.size = 0;
        this.price = 0;
        this.leverage = 1;
        this.close_reason = "Manual";
        this.orderId = "";
        this.capital = cap;
    }
}

module.exports = Order;