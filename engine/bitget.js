const { RestClientV2, WebsocketClientV2, DefaultLogger, WS_KEY_MAP } = require("bitget-api");
const Site = require("../site");
const Log = require("../lib/log");
const getDateTime = require("../lib/get_date_time");
const FFF = require("../lib/fff");

// Disable all logging on the silly level (less console logs)
const customLogger = {
    ...DefaultLogger,
    silly: (...m) => {
        // console.log(m);
    },
    notice: (...m) => {
        // console.log(m);
    },
    info: (...m) => {
        // console.log(m);
    },
    debug: (...m) => {
        // console.log(m);
    },
    warning: (...m) => {
        // console.log(m);
        // Log.dev(m);
    },
    error: (...m) => {
        // console.log(m);
        // Log.dev(m);
    },
};

/**
 * Handles direct access to bitget
 */
class BitgetEngine {
    static #client = new RestClientV2({
        apiKey: Site.BG_API_KEY,
        apiPass: Site.BG_API_PASSPHRASE,
        apiSecret: Site.BG_API_SECRET,
    });

    static #ws = new WebsocketClientV2({
        apiKey: Site.BG_API_KEY,
        apiPass: Site.BG_API_PASSPHRASE,
        apiSecret: Site.BG_API_SECRET,
    }, customLogger);

    static getRestClient = () => BitgetEngine.#client;

    static getWSClient = () => BitgetEngine.#ws;

    /**
     * @type {Record<string, Function>}
     */
    static #callbackFunctions = {};

    /**
     * Adds a callback Function
     * @param {string} name 
     * @param {Function} func
     * @returns {Promise<any>} 
     */
    static addCallbackFunction = (name, func) => {
        return new Promise((resolve, reject) => {
            if (!BitgetEngine.#callbackFunctions[name]) {
                BitgetEngine.#callbackFunctions[name] = func;
            }
            resolve(true);
        })
    }

    /**
     * Gets a callback Function or returns an empty one.
     * @param {string} name 
     * @returns {Function}
     */
    static #getCallback = (name) => BitgetEngine.#callbackFunctions[name] || (() => { });

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise((resolve, reject) => {
            BitgetEngine.#ws.on('update', (data) => {
                // console.log('WS raw message received ', getDateTime(), data);
                if (data.arg) {
                    if (data.arg.instType == Site.TK_PRODUCT_TYPE) {
                        if (data.arg.channel == "account" && data.data && Array.isArray(data.data)) {
                            const bal = (data.data.filter(x => x.marginCoin == Site.TK_MARGIN_COIN)[0] || {}).available || 0;
                            BitgetEngine.#getCallback("balance_update")(bal);
                        }
                        if (data.arg.channel == "orders" && data.data && Array.isArray(data.data)) {
                            for (const order of data.data) {
                                /**
                                 * @type {"long"|"short"}
                                 */
                                const side = order.posSide || "";
                                /**
                                 * @type {"open"|"close"}
                                 */
                                const tradeSide = order.tradeSide || "";
                                /**
                                 * @type {string}
                                 */
                                const status = order.status || "";
                                const createTime = parseInt(order.cTime) || Date.now();
                                const clientOrderID = order.clientOid || "";
                                /**
                                 * @type {string}
                                 */
                                const orderID = order.orderId || "";
                                /**
                                 * @type {string}
                                 */
                                const symbol = order.instId || "";
                                const size = parseFloat(order.size) || 0;
                                const leverage = parseFloat(order.leverage);
                                if (tradeSide == "open") {
                                    if (status == "live") {
                                        // OPEN ORDER CREATED
                                        BitgetEngine.#getCallback("create_order")(symbol, side, tradeSide, createTime, orderID, clientOrderID, size);
                                    }
                                    else if (status == "filled") {
                                        // OPEN ORDER FILLED
                                        const fillTime = parseInt(order.fillTime) || Date.now();
                                        const fillPrice = parseFloat(order.fillPrice) || 0;
                                        /**
                                         * @type {string}
                                         */
                                        const tradeID = order.tradeId || "";
                                        BitgetEngine.#getCallback("fill_order")(symbol, side, tradeSide, fillTime, orderID, clientOrderID, size, fillPrice, 0);
                                    }
                                }
                                else if (tradeSide == "close") {
                                    if (status == "live") {
                                        // CLOSE ORDER CREATED
                                        BitgetEngine.#getCallback("create_order")(symbol, side, tradeSide, createTime, orderID, clientOrderID, size);
                                    }
                                    else if (status == "filled") {
                                        // CLOSE ORDER FILLED
                                        const profits = parseFloat(order.totalProfits) || 0;
                                        const fillTime = parseInt(order.fillTime) || Date.now();
                                        const fillPrice = parseFloat(order.fillPrice) || 0;
                                        /**
                                         * @type {string}
                                         */
                                        const tradeID = order.tradeId || "";
                                        BitgetEngine.#getCallback("fill_order")(symbol, side, tradeSide, fillTime, orderID, clientOrderID, size, fillPrice, profits);
                                    }
                                }
                            }
                        }
                        if (data.arg.channel == "positions" && data.data && Array.isArray(data.data)) {
                            for (const pos of data.data) {
                                /**
                                 * @type {string}
                                 */
                                const id = pos.posId || "";
                                /**
                                 * @type {string}
                                 */
                                const symbol = pos.instId || "";
                                /**
                                 * @type {"long"|"short"}
                                 */
                                const side = pos.holdSide || "";
                                // const openPrice = parseFloat(pos.openPriceAvg) || 0;
                                const leverage = parseFloat(pos.leverage);
                                // const achievedProfits = parseFloat(pos.achievedProfits) || 0;
                                const marginSize = parseFloat(pos.marginSize) || 0;
                                const unrealizedProfits = parseFloat(pos.unrealizedPL) || 0;
                                const ROI = (((parseFloat(pos.unrealizedPLR) || 0) / marginSize) * 100) || 0;
                                const liquidationPrice = parseFloat(pos.liquidationPrice) || 0;
                                const breakEvenPrice = parseFloat(pos.breakEvenPrice) || 0;
                                BitgetEngine.#getCallback("position_update")(symbol, side, unrealizedProfits, ROI, liquidationPrice, breakEvenPrice, leverage);
                            }
                        }
                    }
                }
            });
            BitgetEngine.#ws.on('open', (data) => {
                Log.flow(`WS > Connection > Opened.`, 5);
            });
            BitgetEngine.#ws.on('response', (data) => {
                if (data.event) {
                    Log.flow(`WS > Response > ${data.event}.`, 5);
                }
            });
            BitgetEngine.#ws.on('reconnect', ({ wsKey }) => {
                Log.flow(`WS > Connection > Reconnecting...`, 5);
            });
            BitgetEngine.#ws.on('reconnected', (data) => {
                Log.flow(`WS > Connection > Reconnected.`, 5);
            });
            BitgetEngine.#ws.on('exception', (data) => {
                Log.flow(`WS > Exception occurred.`, 5);
                // Log.dev(data);
            });

            resolve(true);
        });
    }
}

module.exports = BitgetEngine;