const FFF = require("../lib/fff");
const Log = require("../lib/log");
const Order = require("../model/order");
const Signal = require("../model/signal");
const Site = require("../site");
const BitgetEngine = require("./bitget");

/**
 * Manages trades and signal exec.
 */
class Trader {
    /**
     * Is called when there is a new signal received
     * @param {string} symbol 
     * @param {Signal} signal 
     */

    /**
     * All current active orders
     * @type {Order[]}
     */
    static #orders = [];

    static newSignal = (symbol, signal) => {
        // TODO - STREAMLINE ORDER PROCESS AND SUBSCRIBE TO ORDER WS ON START
        // TODO - work on the method "OpenOrder" and ensure only one order is active per ticker when all necessary conditions are met (enough balance, enough entry amount, ticker has no active order....e.t.c.)
        // TODO - work on the method "closeOrder" which can be called internally or even from the user interface
    }

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise(async (resolve, reject) => {
            try {
                await BitgetEngine.addCallbackFunction("create_order", Trader.#createOrder);
                await BitgetEngine.addCallbackFunction("fill_order", Trader.#fillOrder);
                await BitgetEngine.addCallbackFunction("position_update", Trader.#positionUpdate);
                BitgetEngine.getWSClient().subscribeTopic(Site.TK_PRODUCT_TYPE, "orders");
                BitgetEngine.getWSClient().subscribeTopic(Site.TK_PRODUCT_TYPE, "positions");
                const recovered = await Trader.#getPositions();
                if(recovered && Trader.#orders.length > 0){
                    const l = Trader.#orders.length;
                    Log.flow(`Trader > Recover > ${l} order${l == 1 ? "" : "s"} registered.`, 0);
                }
                Trader.#getUpdatedPositions();
                resolve(true);
            } catch (error) {
                Log.dev(error);
                resolve(false);
            }
        });
    }

    /**
     * Safely pushes order to list of orders
     * @param {Order} order 
     */
    static #pushOrder = (order) => {
        const id = Trader.#orders.findIndex(x => x.symbol == order.symbol);
        if(id >= 0){
            Trader.#orders.splice(id, 1, order);
        }
        else{
            Trader.#orders.push(order);
        }
    }

    /**
     * Safely removes all orders based on a particular ticker symbol
     * @param {string} symbol 
     */
    static #popOrder = (symbol) => {
        Trader.#orders = Trader.#orders.filter(x => x.symbol != symbol);
    }

    /**
     * Get active positions
     * @param {*} recovery - If true, creates orders from positions, else calls update on each
     * @returns {Promise<boolean>}
     */
    static #getPositions = (recovery) => {
        return new Promise(async (resolve, reject) => {
            try {
                const res = await BitgetEngine.getRestClient().getFuturesPositions({
                    productType: Site.TK_PRODUCT_TYPE,
                    marginCoin: Site.TK_MARGIN_COIN,
                });
                if (res.msg == "success" && res.data && Array.isArray(res.data)) {
                    for (const pos of res.data) {
                        if (recovery) {
                            // make all positions into orders
                            const symbol = pos.symbol;
                            const ts = parseInt(pos.cTime) || Date.now();
                            const price = parseFloat(pos.openPriceAvg) || 0;
                            const side = pos.holdSide || "";
                            const size = parseFloat(pos.marginSize) || 0;
                            const order = new Order(symbol, ts, price, side, size);
                            Trader.#pushOrder(order);
                        }
                        else {
                            // just a periodic position update
                            const symbol = pos.symbol;
                            const side = pos.holdSide || "";
                            const pnl = parseFloat(pos.unrealizedPL) || 0;
                            const size = parseFloat(pos.marginSize) || 0;
                            const roi = (pnl / size) * 100;
                            const liquidPrice = parseFloat(pos.liquidationPrice) || 0;
                            const breakEvenPrice = parseFloat(pos.breakEvenPrice) || 0;
                            const leverage = parseFloat(pos.leverage) || 1;
                            Trader.#positionUpdate(symbol, side, pnl, roi, liquidPrice, breakEvenPrice, leverage);
                        }
                    }
                    resolve(true);
                }
                else {
                    resolve(false);
                }
            } catch (error) {
                Log.dev(error);
                resolve(false);
            }
        })
    }

    /**
     * This is reference to the Timeout object used at any time for periodic update
     * @type {NodeJS.Timeout}
     */
    static #periodicUpdateReference = null;

    /**
     * This is a periodic recursive function to update status of opened positions.
     * It may be called once during start after recovery
     */
    static #getUpdatedPositions = async () => {
        const startTime = Date.now();
        const conclude = () => {
            const stopTime = Date.now();
            const diff = stopTime - startTime;
            if(diff >= Site.TR_POS_UPDATE_INTERVAL_MS){
                Trader.#getUpdatedPositions();
            }
            else{
                const remaining = Site.TR_POS_UPDATE_INTERVAL_MS - diff;
                if(Trader.#periodicUpdateReference){
                    clearTimeout(Trader.#periodicUpdateReference);
                }
                Trader.#periodicUpdateReference = setTimeout(() => {
                    Trader.#getUpdatedPositions();
                }, remaining);
            }
        }

        if(Trader.#orders.length > 0){
            const done = await Trader.#getPositions(false);
            conclude();
        }
        else{
            conclude();
        }
    }

    static #registerOrder = (symbol,) => { }

    /**
     * Called when orders are created.
     * @param {string} symbol 
     * @param {"long"|"short"} side 
     * @param {"open"|"close"} tradeSide 
     * @param {number} ts 
     * @param {string} OID 
     * @param {string} COID 
     * @param {number} size 
     */
    static #createOrder = (symbol, side, tradeSide, ts, OID, COID, size) => {
        Log.flow(`Trader > ${symbol} > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Created.`, 1);
        if (tradeSide == "open") {
            // TODO: send out notification if necessary
        }
        else if (tradeSide == "close") {
            // TODO: send out notification if necessary
        }
    }

    /**
     * Called when created orders are filled.
     * @param {string} symbol 
     * @param {"long"|"short"} side 
     * @param {"open"|"close"} tradeSide
     * @param {number} ts 
     * @param {string} OID 
     * @param {string} COID 
     * @param {number} size 
     * @param {number} price 
     * @param {number} profit 
     */
    static #fillOrder = (symbol, side, tradeSide, ts, OID, COID, size, price, profit) => {
        Log.flow(`Trader > ${symbol} > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Filled${profit ? ` > Gross PnL: ${Site.TK_MARGIN_COIN} ${profit.toFixed(2)}` : ''}.`, 1);
        if (tradeSide == "open") {
            const order = new Order(symbol, ts, price, side, size);
            Trader.#pushOrder(order);
        }
        else if (tradeSide == "close") {
            // TODO - calculate net pnl from breakevenprice and closing fill price and remove order
        }
    }

    /**
     * Called when there is an update in position.
     * @param {string} symbol 
     * @param {"long"|"short"} side 
     * @param {number} pnl 
     * @param {number} roi 
     * @param {number} liquidPrice 
     * @param {number} breakEvenPrice 
     * @param {number} leverage 
     */
    static #positionUpdate = (symbol, side, pnl, roi, liquidPrice, breakEvenPrice, leverage) => {
        Log.flow(`Trader > Position > ${symbol} > ${Site.TK_MARGIN_COIN} ${FFF(pnl)} (${roi.toFixed(2)}%)`, 2);
        // TODO update order properties and compute order closing strategy
    }

}

module.exports = Trader;