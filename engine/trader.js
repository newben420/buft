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
    static orders = [];

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
                // TODO: RECOVERY == GET CURRENT ACTIVE FILLED ORDERS AND REGISTER THEM
                // TODO: create a function that fetches positions at an interval and calls positionupdate
                resolve(true);
            } catch (error) {
                Log.dev(error);
                resolve(false);
            }
        });
    }

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
        if(tradeSide == "open"){
            // TODO: send out notification if necessary
        }
        else if(tradeSide == "close"){
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
        if(tradeSide == "open"){
            // TODO: create order
        }
        else if(tradeSide == "close"){
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
        // TODO compute order closing strategy
    }

}

module.exports = Trader;