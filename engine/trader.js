const FFF = require("../lib/fff");
const Log = require("../lib/log");
const Order = require("../model/order");
const Signal = require("../model/signal");
const Site = require("../site");
const Account = require("./account");
const BitgetEngine = require("./bitget");

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
    static tickerHasOrder = (symbol) => Trader.#orders.findIndex(x => x.symbol == symbol) >= 0;

    /**
    * Is called when there is a new signal received
    * @param {string} symbol 
    * @param {Signal} signal 
    */
    static newSignal = (symbol, signal) => {
        Trader.openOrder(symbol, signal);
    }

    /**
     * Flag to indicate if an order is currently being opened.
     * It is used to ignore orders that cannot be ordered immediately.
     * @type {boolean}
     */
    static #isOpening = false;

    /**
     * Holds observed volatility percentage of a ticker at order open time
     * @type {Record<string, number>}
     */
    static #volatility = {};

    /**
     * Holds observed trailing stop loss percentage of a ticker at order open time
     * @type {Record<string, number>}
     */
    static #trailingStopLoss = {};

    /**
     * Streamlined open order method
     * @param {string} symbol 
     * @param {Signal} signal 
     * @param {boolean} manual 
     * @returns {Promise<boolean>}
     */
    static openOrder = (symbol, signal, manual = false) => {
        return new Promise(async (resolve, reject) => {
            const index = Trader.#orders.findIndex(x => x.symbol == symbol);
            if ((manual ? true : Trader.#enabled) && Site.TR_SIGNAL_BLACKLIST.indexOf(signal.description) == -1 && index < 0 && Trader.#orders.length < Site.TR_GRID_LENGTH) {
                // Signal can be executed
                if (!Trader.#isOpening) {
                    Trader.#isOpening = true;
                    const balance = Account.getBalance();
                    const capital = Math.min(Site.TR_MAX_CAPITAL_MCOIN, Math.max(0, balance / (Site.TR_GRID_LENGTH - Trader.#orders.length)));
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
                            ]);
                            if (config[0].msg == "success" && config[0].data && Array.isArray(config[0].data) && config[1].msg == "success" && config[1].data && Array.isArray(config[1].data)) {
                                const cfg = config[0].data[0];
                                const tkr = config[1].data[0];
                                const leverage = (parseFloat(Site.TR_MARGIN_MODE == "isolated" ? (signal.long ? Site.TK_LEVERAGE_LONG : Site.TK_LEVERAGE_SHORT) : Site.TK_LEVERAGE_CROSS)) || 0;
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
                                        if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n'${cfg.symbol}' status`);
                                    }
                                    else if (amt < minAmt) {
                                        Log.flow(`Trader > Open > ${symbol} > Error > ${cfg.baseCoin} ${FFF(amt)} is less than minimum of ${cfg.baseCoin} ${FFF(minAmt)}.`, 3);
                                        if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${cfg.baseCoin} ${FFF(amt)} is less than minimum of ${cfg.baseCoin} ${FFF(minAmt)}`);
                                    }
                                    else {
                                        // valid
                                        const order = await BitgetEngine.getRestClient().futuresSubmitOrder({
                                            symbol: symbol,
                                            productType: Site.TK_PRODUCT_TYPE,
                                            marginMode: Site.TR_MARGIN_MODE,
                                            marginCoin: Site.TK_MARGIN_COIN,
                                            side: signal.long ? "buy" : "sell",
                                            tradeSide: "open",
                                            orderType: "market",
                                            size: `${amt}`,
                                        });
                                        if (order.msg == "success") {
                                            Log.flow(`Trader > Open > ${symbol} > Success > ${signal.description}.`, 3);
                                            Trader.#volatility[symbol] = signal.volatilityPerc;
                                            Trader.#trailingStopLoss[symbol] = signal.tpslPerc;
                                            success = true;
                                            if (manual) {
                                                if (Trader.#manualOrders.indexOf(symbol) == -1) {
                                                    Trader.#manualOrders.push(symbol);
                                                }
                                            }
                                            else {
                                                const min = Trader.#manualOrders.indexOf(symbol);
                                                if (min >= 0) {
                                                    Trader.#manualOrders.splice(min, 1);
                                                }
                                            }
                                        }
                                        else {
                                            Log.flow(`Trader > Open > ${symbol} > Error > "${order.code} - ${order.msg}".`, 3);
                                            if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${order.code} - ${order.msg}`);
                                        }
                                    }
                                }
                                else {
                                    Log.flow(`Trader > Open > ${symbol} > Error > Insufficient notional ${Site.TK_MARGIN_COIN} ${FFF(notionalUSDT)} for minimum of ${Site.TK_MARGIN_COIN} ${FFF(minUSDT)}.`, 3);
                                    if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nInsufficient notional ${Site.TK_MARGIN_COIN} ${FFF(notionalUSDT)} for minimum of ${Site.TK_MARGIN_COIN} ${FFF(minUSDT)}`);
                                }
                            }
                            else {
                                Log.flow(`Trader > Open > ${symbol} > Error > "${config[0].code} - ${config[0].msg}" and "${config[1].code} - ${config[1].msg}".`, 3);
                                if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n*CONFIG RES* ${config[0].code} - ${config[0].msg}\n*TICKER RES* ${config[1].code} - ${config[1].msg}`);
                            }

                        } catch (error) {
                            Log.dev(error);
                            Log.flow(`Trader > Open > ${symbol} > Error > Unknown error.`, 3);
                            if (error.body) {
                                if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\n${error.body.code} - ${error.body.msg}`);
                            }
                        }
                        finally {
                            Trader.#isOpening = false;
                            resolve(success);
                        }
                    }
                    else {
                        Log.flow(`Trader > Open > ${symbol} > Error > Insufficient capital.`, 3);
                        if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nCapital is not tangible`);
                        Trader.#isOpening = false;
                        resolve(false);
                    }
                }
                else {
                    if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nAnother trade is currently being opened`);
                    resolve(false);
                }
            }
            else {
                if (manual) Trader.sendMessage(`❌ *${symbol} ${signal.long ? "LONG" : "SHORT"}*\n\nTrade does not qualify`);
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
                            size: `${order.size}`,
                        });
                        if (ord.msg == "success") {
                            Log.flow(`Trader > Close > ${symbol} > ${order.side.toUpperCase()} > Success.`, 3);
                            success = true;
                        }
                        else {
                            Log.flow(`Trader > Close > ${symbol} > Error > "${ord.code} - ${ord.msg}".`, 3);
                            if (manual) Trader.sendMessage(`❌ *${symbol} ${order.side.toUpperCase()}*\n\n${ord.code} - ${ord.msg}`);
                        }
                    } catch (error) {
                        Log.dev(error);
                        Log.flow(`Trader > Close > ${symbol} > Error > Unknown error.`, 3);
                        if (error.body) {
                            if (manual) Trader.sendMessage(`❌ *${symbol} ${order.side.toUpperCase()}*\n\n${error.body.code} - ${error.body.msg}`);
                        }
                    }
                    finally {
                        delete Trader.#isClosing[symbol];
                        resolve(success);
                    }
                }
                else {
                    Log.flow(`Trader > Close > ${symbol} > Error > No active order for this ticker.`, 3);
                    if (manual) Trader.sendMessage(`❌ *${symbol} Close Order*\n\nNo active order for this ticker`);
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
     * Safely pushes order to list of orders
     * @param {Order} order 
     */
    static #pushOrder = (order) => {
        const id = Trader.#orders.findIndex(x => x.symbol == order.symbol);
        if (id >= 0) {
            Trader.#orders.splice(id, 1, order);
        }
        else {
            Trader.#orders.push(order);
        }
    }

    /**
     * Safely removes all orders based on a particular ticker symbol
     * @param {string} symbol 
     */
    static #popOrder = (symbol) => {
        Trader.#orders = Trader.#orders.filter(x => x.symbol != symbol);
        delete Trader.#volatility[symbol];
        delete Trader.#trailingStopLoss[symbol];
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
                            const price = parseFloat(pos.markPrice) || 0;
                            Trader.#positionUpdate(symbol, side, pnl, roi, liquidPrice, breakEvenPrice, leverage, price);
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
     * This holds symbols of orders that were created manually
     * @type {string[]}
     */
    static #manualOrders = []

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
            if (Site.TG_SEND_CREATE_ORDER) {
                Trader.sendMessage(`⏺️  *${side.toUpperCase()} Open Order Created*\n\nTicker 💲 ${symbol}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}`);
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
            const order = new Order(symbol, ts, price, side, size);
            Log.flow(`Trader > ${symbol} > Opened > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Filled.`, 1);
            Trader.#pushOrder(order);
            Trader.sendMessage(`🚀  *Opened ${side.toUpperCase()} Order*\n\nTicker 💲 ${symbol}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}\nPrice 💰 ${price}`);
        }
        else if (tradeSide == "close") {
            const order = Trader.#orders.filter(x => x.symbol == symbol && x.side == side)[0];
            if (order) {
                order.close_price = price;
                order.close_time = ts;
                order.gross_profit = profit;
                const netProfit = ((price - order.breakeven_price) / order.breakeven_price * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                order.net_profit = netProfit;
                Log.flow(`Trader > ${symbol} > Closed > ${side.toUpperCase()} > ${tradeSide.toUpperCase()} > Order Filled > Gross PnL: ${Site.TK_MARGIN_COIN} ${profit.toFixed(2)} | Net: ${netProfit.toFixed(2)}%.`, 1);
                Trader.sendMessage(`${profit > 0 ? `🟢` : `🔴`}  *Closed ${side.toUpperCase()} Order*\n\nTicker 💲 ${symbol}\nReason 💬 ${order.close_reason}\nOrder 🆔 \`${OID}\`\nClient Order 🆔 \`${COID}\`\nSize 💰 ${size}\nPrice 💰 ${price}\nGross Profit 💰 ${Site.TK_MARGIN_COIN} ${FFF(profit)} \nNet Profit 💰 ${netProfit.toFixed(2)}%\nROE 💰 ${order.roi.toFixed(2)}%\nPeak ROE 💰 ${order.peak_roi.toFixed(2)}%\nLeast ROE 💰 ${order.least_roi.toFixed(2)}%\n`);
                Trader.#popOrder(symbol);
                const min = Trader.#manualOrders.indexOf(symbol);
                if (min >= 0) {
                    Trader.#manualOrders.splice(min, 1);
                }
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
        const order = Trader.#orders.filter(x => x.symbol == symbol && x.side == side)[0];
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
            }
            if (order.least_roi == 0 || roi < order.least_roi) {
                order.least_roi = roi;
            }

            if (!order.take_profit_isset) {
                let tp = 0;
                if (Site.TR_TAKE_PROFIT == "TP" && Trader.#trailingStopLoss[symbol] && leverage) {
                    tp = Trader.#trailingStopLoss[symbol] * leverage;
                }
                else if (Site.TR_TAKE_PROFIT == "VOL" && Trader.#volatility[symbol] && leverage) {
                    tp = Trader.#volatility[symbol] * leverage;
                }
                else {
                    const vl = parseFloat(Site.TR_TAKE_PROFIT) || 0;
                    if (vl > 0) {
                        tp = vl;
                    }
                }
                if (tp > 0) {
                    // TAKE PROFIT IS BEING USED
                    order.take_profit_price = (((tp * order.breakeven_price) / 100) * (order.side == "long" ? 1 : -1)) + order.breakeven_price;
                }
                order.take_profit_isset = true;
            }

            if (!order.stop_loss_isset) {
                let sl = 0;
                if (Site.TR_STOP_LOSS == "SL" && Trader.#trailingStopLoss[symbol] && leverage) {
                    sl = Trader.#trailingStopLoss[symbol] * leverage * -1;
                }
                else if (Site.TR_STOP_LOSS == "VOL" && Trader.#volatility[symbol] && leverage) {
                    sl = Trader.#volatility[symbol] * leverage * -1;
                }
                else {
                    const vl = parseFloat(Site.TR_STOP_LOSS) || 0;
                    if (vl > 0) {
                        sl = vl * -1;
                    }
                }
                if (sl < 0) {
                    // STOP LOSS IS BEING USED
                    order.stop_loss_price = (((sl * order.breakeven_price) / 100) * (order.side == "long" ? 1 : -1)) + order.breakeven_price;
                    // ADJUST STOP LOSS PRICE BASED ON LIQUIDATION PRICE
                    order.stop_loss_price = order.side == "long" ? (Math.max(order.stop_loss_price, order.liquidation_price)) : (Math.min(order.stop_loss_price, order.liquidation_price));
                }
                order.stop_loss_isset = true;
            }

            // EXIT STRATEGY
            if (Trader.#manualOrders.indexOf(symbol) == -1) {
                const ROE = order.roi;
                const PeakROE = order.peak_roi || ROE;
                const LeasetROE = order.least_roi || ROE;
                const BreakEvenROE = ((((order.breakeven_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage) || 0;
                const LiquidationROE = ((((order.liquidation_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage) || 0;
                const PnLBreakEven = ((((order.price - order.breakeven_price) / order.breakeven_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage) || 0;
                const PnLOpen = ((((order.price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage) || 0;

                if (ROE >= BreakEvenROE) {
                    // ORDER IS IN THE PROFITABLE ZONE
                    if (order.take_profit_isset && order.take_profit_price ** price) {
                        // TAKE PROFIT (CONTENTMENT) STRATEGY IS BEING USED
                        if ((order.side == "long" && price >= order.take_profit_price) || (order.side == "short" && price <= order.take_profit_price)) {
                            // TAKE PROFIT CONDITION HAS BEEN FULFILLED
                            // CLOSE ORDER
                            order.close_reason = "Take Profit";
                            Trader.closeOrder(symbol);
                        }
                        else {
                            // TAKE PROFIT CONDITION IS NOT FULFILLED
                        }
                    }
                    else if (Site.TR_PEAK_DROP_MIN_DROP) {
                        // PEAK DROP (GREEDY) STRATEGY IS BEING USED
                        if (((PeakROE - BreakEvenROE) - ROE) >= Site.TR_PEAK_DROP_MIN_DROP) {
                            // PEAK DROP CONDITION HAS BEEN FULFILLED
                            // CLOSE ORDER
                            order.close_reason = "Peak Drop";
                            Trader.closeOrder(symbol);
                        }
                        else {
                            // PEAK DROP CONDITION IS NOT FULFILLED
                        }
                    }
                    else if ((Date.now() - order.open_time) >= Site.TR_PROFIT_ORDER_MAX_DURATION_MS && Site.TR_PROFIT_ORDER_MAX_DURATION_MS) {
                        // ORDER HAS EXPIRED WHILE STILL PROFITABLE
                        // CLOSE ORDER
                        order.close_reason = "Profitable Expiration";
                        Trader.closeOrder(symbol);
                    }
                    else {
                        // NOTHING ELSE TO DO HERE
                    }
                }
                else {
                    // ORDER IS IN THE NON PROFITABLE ZONE
                    if (order.stop_loss_isset && order.stop_loss_price) {
                        // STOP LOSS IS BEING USED
                        if ((order.side == "long" && price <= order.stop_loss_price) || (order.side == "short" && price >= order.stop_loss_price)) {
                            // STOP LOSS CONDITION HAS BEEN FULFILLED
                            // CLOSE ORDER
                            order.close_reason = "Stop Loss";
                            Trader.closeOrder(symbol);
                        }
                        else {
                            // STOP LOSS CONDITION IS NOT FULFILLED
                        }
                    }
                    else if ((Date.now() - order.open_time) >= Site.TR_LOSS_ORDER_MAX_DURATION_MS && Site.TR_LOSS_ORDER_MAX_DURATION_MS) {
                        // ORDER HAS EXPIRED WHILE STILL LOSING
                        // CLOSE ORDER
                        order.close_reason = "Lossy Expiration";
                        Trader.closeOrder(symbol);
                    }
                    else {
                        // NOTHING ELSE TO DO HERE
                    }
                }
            }
        }
    }

}

module.exports = Trader;