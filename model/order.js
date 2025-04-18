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
    least_roi;

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
    take_profit_price;

    /**
     * @type {boolean}
     */
    take_profit_isset;

    /**
     * @type {boolean}
     */
    stop_loss_isset;

    /**
     * @type {number}
     */
    stop_loss_price;

    /**
     * @type {number}
     */
    leverage;

    /**
     * @type {string}
     */
    close_reason;

    /**
     * Object constructor
     * @param {string} symbol 
     * @param {number} open_time 
     * @param {number} open_price 
     * @param {"long"|"short"} side 
     * @param {number} size 
     */
    constructor(
        symbol,
        open_time,
        open_price,
        side,
        size,
    ) {
        this.symbol = symbol;
        this.open_time = open_time;
        this.open_price = open_price;
        this.close_time = 0;
        this.close_price = 0;
        this.gross_profit = 0;
        this.net_profit = 0;
        this.roi = 0;
        this.peak_roi = 0;
        this.least_roi = 0;
        this.liquidation_price = 0;
        this.breakeven_price = 0;
        this.side = side;
        this.size = size;
        this.price = 0;
        this.leverage = 1;
        this.take_profit_price = 0;
        this.stop_loss_price = 0;
        this.take_profit_isset = false;
        this.stop_loss_isset = false;
        this.close_reason = "Manual";
    }
}

module.exports = Order;