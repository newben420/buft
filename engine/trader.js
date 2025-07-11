const FFF = require("../lib/fff");
const getTimeElapsed = require("../lib/get_time_elapsed");
const Log = require("../lib/log");
const Order = require("../model/order");
const Signal = require("../model/signal");
const Site = require("../site");
const Account = require("./account");
const BitgetEngine = require("./bitget");
const generateLowercaseAlphanumeric = require("../lib/unique_string");
const DupSig = require("./dup_sig");
const { computeArithmeticDirection } = require("../lib/direction");

let SigSmooth = null;
let BroadcastEngine = null;

/**
 * Manages trades and signal exec.
 */
class Trader {

    /**
     * If true, incoming signals are executed, else, ignored.
     * @type {boolean}
     */
    static #enabled = Site.TR_AUTO_ENABLED;

    /**
     * If set, is used instead of normal calculated capital for the next trade, then reset
     * @type {number}
     */
    static tempCapital = 0;

    /**
     * Generates a unique unused order id.
     * @returns {string} Unique order ID
     */
    static #generateOrderID = () => {
        const length = 5;
        let id = generateLowercaseAlphanumeric(length).toUpperCase();
        let tryTimes = 200;
        let generated = false;
        while ((!generated) && (tryTimes > 0)) {
            if (Trader.#orders.map(x => x.id).indexOf(id) >= 0) {
                tryTimes -= 1;
                generated = false;
                id = generateLowercaseAlphanumeric(length).toUpperCase();
            }
            else {
                generated = true;
                tryTimes = 0;
            }
        }
        return generated ? id : Date.now().toString();
    }

    /**
     * Toggle trader status and return new value
     * @returns {boolean}
     */
    static toggle = () => {
        Trader.#enabled = !Trader.#enabled;
        return Trader.#enabled;
    }

    /**
     * Returns true if trader is enabled.
     * @returns {boolean}
     */
    static isEnabled = () => Trader.#enabled;

    /**
     * All current active orders
     * @type {Order[]}
     */
    static #orders = [];

    /**
     * All orders created but not yet filled
     * @type {Order[]}
     */
    static #tempOrders = [];

    /**
     * Get number of active orders.
     * @returns {number}
     */
    static getOrdersLength = () => Trader.#orders.length;

    /**
     * Get all orders.
     * @returns {Order[]}
     */
    static getAllOrders = () => Trader.#orders.map(x => x);

    /**
     * Returns true if the ticker has an active order.
     * @param {string} symbol 
     * @returns {boolean}
     */
    static tickerHasOrder = (symbol) => (Trader.#orders.findIndex(x => x.symbol == symbol) >= 0) || (Trader.#tempOrders.findIndex(x => x.symbol == symbol) >= 0);

    /**
    * Is called when there is a new signal received
    * @param {string} symbol 
    * @param {Signal} signal 
    */
    static newSignal = (symbol, signal) => {
        if (!SigSmooth) {
            SigSmooth = require("./sigsmooth");
        }
        if (Trader.#enabled) {
            if ((signal.long || signal.short) ? (DupSig.check(`${signal.long ? `LONG` : `SHORT`}${symbol}`) && SigSmooth.entry(symbol, signal)) : false) {
                Trader.openOrder(symbol, signal);
            }
        }
    }

    /**
     * Flag to indicate if an order is currently being opened.
     * It is used to ignore orders that cannot be ordered immediately.
     * @type {boolean}
     */
    static #isOpening = false;

    /**
     * Streamlined open order method
     * @param {string} symbol 
     * @param {Signal} signal 
     * @param {boolean} manual 
     * @param {boolean} atr 
     * @returns {Promise<boolean>}
     */
    static openOrder = (symbol, signal, manual = false, atr = false) => {
        return new Promise(async (resolve, reject) => {
            Trader.#tempOrders = Trader.#tempOrders.filter(x => (Date.now() - x.open_time) <= Site.TR_TEMP_ORDERS_MAX_DURATION_MS);
            const index = (Trader.#orders.findIndex(x => x.symbol == symbol) < 0) && (Trader.#tempOrders.findIndex(x => x.symbol == symbol) < 0);
            if (((manual || atr) ? true : Trader.#enabled) && index && Trader.#orders.length < Site.TR_GRID_LENGTH) {
                // Signal can be executed
                if (!Trader.#isOpening) {
                    Trader.#isOpening = true;
                    const balance = Account.getBalance();
                    const capital = (Trader.tempCapital && Trader.tempCapital > 0 && Trader.tempCapital <= balance) ? Trader.tempCapital : Math.min(Site.TR_MAX_CAPITAL_MCOIN, Math.max(0, balance / (Site.TR_GRID_LENGTH - Trader.#orders.length)));
                    Trader.tempCapital = 0;
                    Log.flow(`Trader > Open > ${symbol} > ${signal.long ? "LONG" : "SHORT"} > Balance: ${FFF(balance)} | Capital: ${FFF(capital)}.`, 3);
                    if (capital > 0) {
                        // Capital is tangible
                        let success = false;
                        try {
                            const config = await Promise.all([
                                BitgetEngine.getRestClient().getFuturesContractConfig({
                                    productType: Site.TK_PRODUCT_TYPE,
                                    symbol: symbol,
                                }),
                                BitgetEngine.getRestClient().getFuturesTicker({
                                    productType: Site.TK_PRODUCT_TYPE,
                                    symbol: symbol,
                                }),
                                BitgetEngine.getRestClient().getFuturesAccountAsset({
                                    marginCoin: Site.TK_MARGIN_COIN,
                                    productType: Site.TK_PRODUCT_TYPE,
                                    symbol: symbol,
                                })
                            ]);
                            if (config[0].msg == "success" && config[0].data && Array.isArray(config[0].data) && config[1].msg == "success" && config[1].data && Array.isArray(config[1].data) && config[2].msg == "success") {
                                const cfg = config[0].data[0];
                                const tkr = config[1].data[0];
                                const leverage = (parseFloat(Site.TR_MARGIN_MODE == "isolated" ? (signal.long ? config[2].data.isolatedLongLever : config[2].data.isolatedShortLever) : config[2].data.crossedMarginLeverage)) || 0;
                                const notionalUSDT = capital * leverage;
                                const price = parseFloat(tkr.lastPr) || 0;
                                const mul = parseFloat(cfg.sizeMultiplier) || 0;
                                const amt = Math.floor(((notionalUSDT / price) * Site.TR_CAPITAL_RATIO_FOR_TRADE) / mul) * mul;
                                const minAmt = parseFloat(cfg.minTradeNum) || 0;
                                const minUSDT = parseFloat(cfg.minTradeUSDT) || 0;
                                if (notionalUSDT >= minUSDT) {
                                    Log.flow(`Trader > Open > ${symbol} > ${cfg.baseCoin} ${FFF(amt)}.`, 3);
                                    const cannotTrade = ["maintain", "limit_open", "restrictedAPI", "off"].indexOf(cfg.symbolStatus) != -1;
                                    if (cannotTrade) {
                                        Log.flow(`Trader > Open > ${symbol} > Error > '${cfg.symbol}' status.`, 3);
                                        if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n'${cfg.symbol}' status`);
                                    }
                                    else if (amt < minAmt) {
                                        Log.flow(`Trader > Open > ${symbol} > Error > ${cfg.baseCoin} ${FFF(amt)} is less than minimum of ${cfg.baseCoin} ${FFF(minAmt)}.`, 3);
                                        if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${cfg.baseCoin} ${FFF(amt)} is less than minimum of ${cfg.baseCoin} ${FFF(minAmt)}`);
                                    }
                                    else {
                                        // valid
                                        const id = Trader.#generateOrderID();
                                        const ord = new Order(symbol, id, signal.long ? "long" : "short", Date.now(), signal.tpsl, manual, signal.description);
                                        Trader.#tempOrders.push(ord);
                                        const order = await BitgetEngine.getRestClient().futuresSubmitOrder({
                                            symbol: symbol,
                                            productType: Site.TK_PRODUCT_TYPE,
                                            marginMode: Site.TR_MARGIN_MODE,
                                            marginCoin: Site.TK_MARGIN_COIN,
                                            side: signal.long ? "buy" : "sell",
                                            tradeSide: "open",
                                            orderType: "market",
                                            clientOid: id,
                                            size: `${amt}`,
                                        });
                                        if (order.msg == "success") {
                                            if (!BroadcastEngine) {
                                                BroadcastEngine = require("./broadcast");
                                            }
                                            delete BroadcastEngine.atr[`${symbol}_${signal.long ? "LONG" : "SHORT"}`];
                                            Log.flow(`Trader > Open > ${symbol} > Success > ${signal.description}.`, 3);
                                            Trader.#tempOrders = Trader.#tempOrders.filter(x => (Date.now() - x.open_time) <= Site.TR_TEMP_ORDERS_MAX_DURATION_MS);
                                            success = true;
                                            if (!manual) {
                                                DupSig.add(`${signal.long ? `LONG` : `SHORT`}${symbol}`);
                                            }
                                        }
                                        else {
                                            Trader.#tempOrders = Trader.#tempOrders.filter(x => x.id != id);
                                            Log.flow(`Trader > Open > ${symbol} > Error > "${order.code} - ${order.msg}".`, 3);
                                            if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${order.code} - ${order.msg}`);
                                        }
                                    }
                                }
                                else {
                                    Log.flow(`Trader > Open > ${symbol} > Error > Insufficient notional ${Site.TK_MARGIN_COIN} ${FFF(notionalUSDT)} for minimum of ${Site.TK_MARGIN_COIN} ${FFF(minUSDT)}.`, 3);
                                    if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nInsufficient notional ${Site.TK_MARGIN_COIN} ${FFF(notionalUSDT)} for minimum of ${Site.TK_MARGIN_COIN} ${FFF(minUSDT)}`);
                                }
                            }
                            else {
                                Log.flow(`Trader > Open > ${symbol} > Error > "${config[0].code} - ${config[0].msg}" and "${config[1].code} - ${config[1].msg}".`, 3);
                                if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n*CONFIG RES* ${config[0].code} - ${config[0].msg}\n*TICKER RES* ${config[1].code} - ${config[1].msg}`);
                            }

                        } catch (error) {
                            Log.dev(error);
                            Log.flow(`Trader > Open > ${symbol} > Error > ${error.body ? `${error.body.code} - ${error.body.msg}` : `Unknown error`}.`, 3);
                            if (error.body) {
                                if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${error.body.code} - ${error.body.msg}`);
                            }
                        }
                        finally {
                            Trader.#isOpening = false;
                            resolve(success);
                        }
                    }
                    else {
                        Log.flow(`Trader > Open > ${symbol} > Error > Insufficient capital.`, 3);
                        if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nCapital is not tangible`);
                        Trader.#isOpening = false;
                        resolve(false);
                    }
                }
                else {
                    if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nAnother trade is currently being opened`);
                    resolve(false);
                }
            }
            else {
                if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nTrade does not qualify`);
                resolve(false);
            }
        })
    }

    static sendMessage = () => { };

    /**
     * @type {Record<string, boolean>}
     */
    static #isClosing = {}

    /**
     * Streamlined close Order Method.
     * @param {string} symbol 
     * @param {boolean} manual 
     * @returns {Promise<boolean>}
     */
    static closeOrder = (symbol, manual = false) => {
        return new Promise(async (resolve, reject) => {
            Log.flow(`Trader > Close > ${symbol}.`, 3);
            if (!Trader.#isClosing[symbol]) {
                Trader.#isClosing[symbol] = true;
                const order = Trader.#orders.filter(x => x.symbol == symbol)[0];
                if (order) {
                    let success = false;
                    try {
                        const ord = await BitgetEngine.getRestClient().futuresSubmitOrder({
                            symbol: symbol,
                            productType: Site.TK_PRODUCT_TYPE,
                            marginMode: Site.TR_MARGIN_MODE,
                            marginCoin: Site.TK_MARGIN_COIN,
                            side: order.side == "long" ? "buy" : "sell",
                            tradeSide: "close",
                            orderType: "market",
                            clientOid: order.id,
                            size: `${order.size}`,
                        });
                        if (ord.msg == "success") {
                            Log.flow(`Trader > Close > ${symbol} > ${order.side.toUpperCase()} > Success.`, 3);
                            success = true;
                        }
                        else {
                            Log.flow(`Trader > Close > ${symbol} > Error > "${ord.code} - ${ord.msg}".`, 3);
                            if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${order.side.toUpperCase()}*\n\n${ord.code} - ${ord.msg}`);
                        }
                    } catch (error) {
                        Log.dev(error);
                        Log.flow(`Trader > Close > ${symbol} > Error > ${error.body ? `${error.body.code} - ${error.body.msg}` : `Unknown error`}.`, 3);
                        if (error.body) {
                            if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} ${order.side.toUpperCase()}*\n\n${error.body.code} - ${error.body.msg}`);
                        }
                    }
                    finally {
                        delete Trader.#isClosing[symbol];
                        resolve(success);
                    }
                }
                else {
                    Log.flow(`Trader > Close > ${symbol} > Error > No active order for this ticker.`, 3);
                    if (manual || Site.TG_SEND_AUTO_FAIL) Trader.sendMessage(`❌ *${symbol} Close Order*\n\nNo active order for this ticker`);
                    delete Trader.#isClosing[symbol];
                    resolve(false);
                }
            }
            else {
                resolve(false);
            }
        });
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
                const recovered = await Trader.#getPositions(true);
                if (recovered && Trader.#orders.length > 0) {
                    const l = Trader.#orders.length;
                    Log.flow(`Trader > Recover > ${l} order${l == 1 ? "" : "s"} registered.`, 0);
                    setTimeout(() => {
                        Trader.sendMessage(`🥳 *${Site.TITLE}* has recovered ${l} order${l == 1 ? "" : "s"}`);
                    }, 1000);
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
     * Get active positions
     * @param {boolean} recovery - If true, creates orders from positions, else calls update on each
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
                    /**
                     * @type {string[]}
                     */
                    let activeTickers = [];
                    for (const pos of res.data) {
                        if (activeTickers.indexOf(pos.symbol) == -1) {
                            activeTickers.push(pos.symbol);
                        }
                        if (recovery) {
                            // make all positions into orders
                            const id = Trader.#generateOrderID();
                            const symbol = pos.symbol;
                            const ts = parseInt(pos.cTime) || Date.now();
                            const price = parseFloat(pos.openPriceAvg) || 0;
                            const side = pos.holdSide || "";
                            const size = parseFloat(pos.available) || 0;
                            const order = new Order(symbol, id, side, ts, Site.TR_RECOVERY_DEFULT_SL_PERC, false, "Recovery");
                            order.orderId = `${symbol}_RECOVERY`;
                            order.price = price;
                            order.open_price = price;
                            order.size = size;
                            if (!Trader.#orders.find(x => x.symbol == symbol)) {
                                Trader.#orders.push(order);
                            }
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
                            const price = parseFloat(pos.markPrice) || 0;
                            Trader.#positionUpdate(symbol, side, pnl, roi, liquidPrice, breakEvenPrice, leverage, price);
                        }
                    }
                    /**
                     * @type {string[]}
                     */
                    Trader.#orders.map(x => x.symbol).filter(x => activeTickers.indexOf(x) == -1).forEach(x => {
                        if (Trader.#orders.find(y => y.symbol == x)) {
                            Trader.#orders.splice(Trader.#orders.findIndex(y => y.symbol == x), 1);
                        }
                    });
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
            if (diff >= Site.TR_POS_UPDATE_INTERVAL_MS) {
                Trader.#getUpdatedPositions();
            }
            else {
                const remaining = Site.TR_POS_UPDATE_INTERVAL_MS - diff;
                if (Trader.#periodicUpdateReference) {
                    clearTimeout(Trader.#periodicUpdateReference);
                }
                Trader.#periodicUpdateReference = setTimeout(() => {
                    Trader.#getUpdatedPositions();
                }, remaining);
            }
        }

        if (Trader.#orders.length > 0) {
            const done = await Trader.#getPositions(false);
            conclude();
        }
        else {
            conclude();
        }
    }

    /**
     * Returns exact order with original reference in case of manipulations.
     * @param {string} id 
     */
    static exactOrderFromID = (id) => Trader.#orders.find(order => order.id === id);

    /**
     * Returns exact temporary order with original reference in case of manipulations.
     * @param {string} id 
     */
    static exactTempOrderFromID = (id) => Trader.#tempOrders.find(order => order.id === id);

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
            const order = Trader.exactTempOrderFromID(COID);
            if (order) {
                order.orderId = OID;
                order.size = size;
                Log.flow(`Trader > ${symbol} > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Temp order found and updated.`, 1);
                if (Site.TG_SEND_CREATE_ORDER) {
                    Trader.sendMessage(`⏺️  *${side.toUpperCase()} Open Order Created*\n\nTicker 💲 ${symbol}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}`);
                }
            }
            else {
                Log.flow(`Trader > ${symbol} > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Temp order not found.`, 1);
            }
        }
        else if (tradeSide == "close") {
            if (Site.TG_SEND_CREATE_ORDER) {
                Trader.sendMessage(`⏺️  *${side.toUpperCase()} Close Order Created*\n\nTicker 💲 ${symbol}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}`);
            }
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
        if (tradeSide == "open") {
            const order = Trader.exactTempOrderFromID(COID);
            if (order) {
                Log.flow(`Trader > ${symbol} > Opened > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Filled.`, 1);
                order.open_time = ts;
                order.peak_ts = ts;
                order.least_ts = ts;
                order.size = size;
                order.price = price;
                order.open_price = price;
                Trader.#orders.push(order);
                Trader.#tempOrders.splice(Trader.#tempOrders.findIndex(x => x.id == COID), 1);
                let m = `🚀 *Opened ${side.toUpperCase()} Order*\n\n`;
                m += `Ticker 💲 ${symbol}\n`;
                m += `Order 🆔 \`${OID}\`\n`;
                m += `Client Order 🆔 \`${COID}\`\n`;
                m += `Size 💰 ${size}\n`;
                m += `Price 💰 ${price}\n`;
                // order.id = Trader.#generateOrderID();
                Trader.sendMessage(m);
                order.id = Trader.#generateOrderID();
            }
            else {
                Log.flow(`Trader > ${symbol} > Opened > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order not found in temp.`, 1);
                Trader.sendMessage(`❌ *Missing Opened ${side.toUpperCase()} Order*\n\nTicker 💲 ${symbol}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}\nPrice 💰 ${price}`);
            }

        }
        else if (tradeSide == "close") {
            const order = Trader.exactOrderFromID(COID);
            if (order) {
                order.close_price = price;
                order.close_time = ts;
                order.gross_profit = profit;
                const netProfit = ((price - order.breakeven_price) / order.breakeven_price * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                order.net_profit = netProfit;
                Log.flow(`Trader > ${symbol} > Closed > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Filled > Gross PnL: ${Site.TK_MARGIN_COIN} ${profit.toFixed(2)} | Net: ${netProfit.toFixed(2)}%.`, 1);
                const breakEvenROE = (((order.breakeven_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                const liquidationROE = (((order.liquidation_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                /**
                 * @type {number}
                 */
                let tpROE;
                /**
                 * @type {number}
                 */
                let slROE = Math.min(Math.abs(liquidationROE), (Math.min((Site.TR_STOPLOSS_PERC_RANGE.max || 100), Math.max((Site.TR_STOPLOSS_PERC_RANGE.min || 0), (order.sl * order.leverage))))) * -1;
                if (order.manual) {
                    tpROE = Site.TR_MANUAL_STOPLOSS_PERC;
                }
                else {
                    tpROE = ((order.sl * order.leverage) * Site.TR_AUTOMATIC_TP_SL_MULTIPLIER);
                }
                let m = ``;
                m += `${profit > 0 ? `🟢` : `🔴`}  *Closed ${side.toUpperCase()} Order*\n\n`;
                m += `Ticker 💲 ${symbol}\n`;
                m += `Open Reason 💬 ${order.open_reason}\n`;
                m += `Close Reason 💬 ${order.close_reason}\n`;
                m += `Durations ⏱️ ${getTimeElapsed(order.open_time, order.close_time)}  🔼 ${getTimeElapsed(order.peak_ts, order.close_time)} 🔽 ${getTimeElapsed(order.least_ts, order.close_time)}\n`;
                m += `Order 🆔 \`${OID}\`\n`;
                m += `Client Order 🆔 \`${COID}\`\n`;
                m += `Size 💰 ${size}\n`;
                m += `Price 💰 ${price}\n`;
                m += `Gross Profit 💰 ${Site.TK_MARGIN_COIN} ${FFF(profit)} \n`;
                m += `Net Profit 💰 ${netProfit.toFixed(2)}%\n`;
                m += `ROE 💰 ${order.roi.toFixed(2)}%\n`;
                m += `Peak ROE 💰 ${order.peak_roi.toFixed(2)}%\n`;
                m += `Least ROE 💰 ${order.least_roi.toFixed(2)}%\n`;
                m += `TPSL 💰 ${FFF(tpROE || 0)}% ${FFF(slROE || 0)}%\\(${FFF((order.sl * order.leverage) || 0)}%\\)\n`;
                Trader.sendMessage(m);
                Trader.#orders.splice(Trader.#orders.findIndex(x => x.id == COID), 1);
            }
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
     * @param {number} price
     */
    static #positionUpdate = (symbol, side, pnl, roi, liquidPrice, breakEvenPrice, leverage, price = 0) => {
        Log.flow(`Trader > Position > ${symbol} > ${Site.TK_MARGIN_COIN} ${FFF(pnl)} (${roi.toFixed(2)}%)`, 2);
        const order = Trader.#orders.find(x => x.symbol == symbol && x.side == side);
        if (order) {
            if (price > 0 && price) {
                order.price = price;
            }
            order.breakeven_price = breakEvenPrice;
            order.liquidation_price = liquidPrice;
            order.leverage = leverage;
            order.gross_profit = pnl;
            order.roi = roi;
            if (order.peak_roi == 0 || roi > order.peak_roi) {
                order.peak_roi = roi;
                order.peak_ts = Date.now();
            }
            if (order.least_roi == 0 || roi < order.least_roi) {
                order.least_roi = roi;
                order.least_ts = Date.now();
            }

            if (order.recent_ROE.length > 0 ? (order.recent_ROE[order.recent_ROE.length - 1] != roi) : true) {
                order.recent_ROE.push(roi);
                if (order.recent_ROE.length > Site.DC_MAX_LATEST_SIGNALS) {
                    order.recent_ROE = order.recent_ROE.slice(order.recent_ROE.length - Site.DC_MAX_LATEST_SIGNALS);
                }
            }


            // EXIT STRATEGY
            if (!BroadcastEngine) {
                BroadcastEngine = require("./broadcast");
            }
            const breakEvenROE = (((order.breakeven_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
            const liquidationROE = (((order.liquidation_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
            if (!Trader.#isClosing[symbol] && (Trader.#enabled || BroadcastEngine.autoATR)) {
                if ((order.roi < 0) && (order.sl > 0) && (Math.abs(order.roi) >= Math.min(Math.abs(liquidationROE), (Math.min((Site.TR_STOPLOSS_PERC_RANGE.max || 100), Math.max((Site.TR_STOPLOSS_PERC_RANGE.min || 0), (order.sl * order.leverage))))))) {
                    // stop loss condition fulfilled
                    order.close_reason = `Stop Loss ${FFF(order.sl)}`;
                    Trader.closeOrder(symbol);
                }
                else if (order.manual && Site.TR_MANUAL_TAKEPROFIT_PERC && (order.roi > 0) && ((order.roi - breakEvenROE) >= Site.TR_MANUAL_STOPLOSS_PERC)) {
                    // Take profit for manual orders
                    order.close_reason = `Manual Take Profit ${FFF(Site.TR_MANUAL_TAKEPROFIT_PERC)}`;
                    Trader.closeOrder(symbol);
                }
                else if ((!order.manual) && (order.sl > 0) && (Site.TR_AUTOMATIC_TP_SL_MULTIPLIER > 0) && ((order.roi - breakEvenROE) >= ((order.sl * order.leverage) * Site.TR_AUTOMATIC_TP_SL_MULTIPLIER))) {
                    // Take profit for automatic orders
                    order.close_reason = `Auto Take Profit ${FFF((order.sl * Site.TR_AUTOMATIC_TP_SL_MULTIPLIER))}`;
                    Trader.closeOrder(symbol);
                }
                else if (order.manual) {
                    let exitAlready = false;
                    let duration = (Date.now - order.open_time) || 0;
                    let drop = (order.peak_roi - order.roi) || 0;
                    // MANUAL PEAK DROP
                    if (!exitAlready) {
                        for (let i = 0; i < Site.TR_PEAK_DROP_MANUAL.length; i++) {
                            let p = Site.TR_PEAK_DROP_MANUAL[i];
                            if ((drop >= p.minDrop) && (drop <= p.maxDrop) && ((order.roi - breakEvenROE) >= p.minPnL) && ((order.roi - breakEvenROE) <= p.maxPnL)) {
                                exitAlready = true;
                                order.close_reason = `Auto PeakDrop ${(i + 1)}`;
                                Trader.closeOrder(symbol);
                                break;
                            }
                        }
                    }
                }
                else if (!order.manual) {
                    // Exit strategies for automated orders
                    let exitAlready = false;
                    let duration = (Date.now - order.open_time) || 0;
                    let drop = (order.peak_roi - order.roi) || 0;
                    // AUTO SELL
                    if (!exitAlready) {
                        for (let i = 0; i < Site.TR_AUTO_SELL.length; i++) {
                            let c = Site.TR_AUTO_SELL[i];
                            if (((c.pnl > 0) ? ((order.roi - breakEvenROE) >= c.pnl) : (order.roi <= c.pnl)) && (duration >= c.minDurationMS) && (duration <= c.maxDurationMS)) {
                                exitAlready = true;
                                order.close_reason = `Auto Sell ${(i + 1)}`;
                                Trader.closeOrder(symbol);
                                break;
                            }
                        }
                    }
                    // PEAK DROP
                    if (!exitAlready) {
                        for (let i = 0; i < Site.TR_PEAK_DROP.length; i++) {
                            let p = Site.TR_PEAK_DROP[i];
                            if ((drop >= p.minDrop) && (drop <= p.maxDrop) && ((order.roi - breakEvenROE) >= p.minPnL) && ((order.roi - breakEvenROE) <= p.maxPnL)) {
                                exitAlready = true;
                                order.close_reason = `Auto PeakDrop ${(i + 1)}`;
                                Trader.closeOrder(symbol);
                                break;
                            }
                        }
                    }
                    // DAMAGE CONTROL
                    const dom = BroadcastEngine.getDominantSignal();
                    const sig = order.side;
                    const valid = dom != "no_signal" && dom != sig && computeArithmeticDirection(order.recent_ROE) < 1;
                    if (valid && !exitAlready && BroadcastEngine.autoATR) {
                        // means the dominant signal is the opposite of this trade
                        for (let i = 0; i < Site.DC_SELL.length; i++) {
                            let s = Site.DC_SELL[i];
                            if(duration >= s.minDuration && duration <= s.maxDuration && order.roi >= s.minPnL){
                                exitAlready = true;
                                order.close_reason = `Damage Control ${s.minPnL}%`;
                                Trader.closeOrder(symbol);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

}

module.exports = Trader;