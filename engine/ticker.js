const Log = require("../lib/log");
const Ticker = require("../model/ticker");
const Site = require("../site");
const BitgetEngine = require("./bitget");
let Analysis = null;

/**
 * Manages ticker
 */
class TickerEngine {

    /**
     * @type {Record<string,Ticker>}
     */
    static #tickers = {};

    /**
     * Get tickers' length
     * @returns {number}
     */
    static getLength = () => Object.keys(TickerEngine.#tickers).length;

    /**
     * Get all current tickers.
     * @returns {Ticker[]}
     */
    static getAllTickers = () => Object.keys(TickerEngine.#tickers).map(x => TickerEngine.#tickers[x]);

    /**
     * Deletes a ticker
     * @param {string} symbol 
     * @returns {Promise<boolean>}
     */
    static deleteTicker = (symbol) => {
        return new Promise(async (resolve, reject) => {
            if (TickerEngine.#tickers[symbol]) {
                Log.flow(`TickerEngine > Delete > ${symbol}.`, 2);
                const destroyed = await TickerEngine.#tickers[symbol].destroy();
                if (destroyed) {
                    delete TickerEngine.#tickers[symbol];
                    Log.flow(`TickerEngine > Delete > ${symbol} > Successful.`, 2);
                    if (!Analysis) {
                        Analysis = require("./analysis");
                    }
                    Analysis.removeTicker(symbol);
                    resolve(true);
                }
                else {
                    Log.flow(`TickerEngine > Delete > ${symbol} > Failed.`, 2);
                    resolve(false);
                }
            }
            else {
                resolve(false);
            }
        })
    };

    /**
     * Adds new ticker
     * @param {string} symbol 
     * @returns {Promise<boolean>}
     */
    static addTicker = (symbol) => {
        return new Promise(async (resolve, reject) => {
            Log.flow(`TickerEngine > Add > ${symbol}.`, 2);
            if (Object.keys(TickerEngine.#tickers).length >= Site.TK_MAX) {
                Log.flow(`TickerEngine > Add > ${symbol} > Error > Max amount of tickers exceeded.`, 2);
                resolve(false);
            }
            else {
                if (TickerEngine.#tickers[symbol]) {
                    Log.flow(`TickerEngine > Add > ${symbol} > Error > Ticker already exists.`, 2);
                    resolve(false);
                }
                else {
                    try {
                        if (Site.PRODUCTION) {
                            const ticker = await BitgetEngine.getRestClient().getFuturesTicker({
                                productType: Site.TK_PRODUCT_TYPE,
                                symbol: symbol,
                            });
                            if ((ticker.data ? (ticker.data.length > 0) : false) && ticker.msg == "success") {
                                const data = ticker.data[0];
                                const levy = await Promise.all(Site.TR_MARGIN_MODE == "isolated" ? [
                                    BitgetEngine.getRestClient().setFuturesLeverage({
                                        symbol: data.symbol,
                                        productType: Site.TK_PRODUCT_TYPE,
                                        marginCoin: Site.TK_MARGIN_COIN,
                                        holdSide: "long",
                                        leverage: Site.TK_LEVERAGE_LONG,
                                    }),
                                    BitgetEngine.getRestClient().setFuturesLeverage({
                                        symbol: data.symbol,
                                        productType: Site.TK_PRODUCT_TYPE,
                                        marginCoin: Site.TK_MARGIN_COIN,
                                        holdSide: "short",
                                        leverage: Site.TK_LEVERAGE_SHORT,
                                    }),
                                ] : [
                                    BitgetEngine.getRestClient().setFuturesLeverage({
                                        symbol: data.symbol,
                                        productType: Site.TK_PRODUCT_TYPE,
                                        marginCoin: Site.TK_MARGIN_COIN,
                                        leverage: Site.TK_LEVERAGE_CROSS,
                                    })
                                ]);
                                const passed = levy.filter(x => x.msg == "success");
                                if (passed.length == levy.length) {
                                    Log.flow(`TickerEngine > Add > ${symbol} > Successful.`, 2);
                                    TickerEngine.#tickers[data.symbol] = new Ticker(data.symbol);
                                    resolve(true);
                                }
                                else {
                                    Log.flow(`TickerEngine > Add > ${symbol} > Error > Could not set leverage.`, 2);
                                    resolve(false);
                                }
                            }
                            else {
                                Log.flow(`TickerEngine > Add > ${symbol} > Error > Ticker not found.`, 2);
                                resolve(false);
                            }
                        }
                        else {
                            Log.flow(`TickerEngine > Add > ${symbol} > Successful.`, 2);
                            TickerEngine.#tickers[data.symbol] = new Ticker(data.symbol);
                            resolve(true);
                        }
                    } catch (error) {
                        Log.dev(error);
                        Log.flow(`TickerEngine > Add > ${symbol} > Error > ${error.body ? `${error.body.code} - ${error.body.msg}` : ` Unknown error`}.`, 2);
                        resolve(false);
                    }
                }
            }
        })
    }

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise(async (resolve, reject) => {
            for (let i = 0; i < Site.TK_AUTO_SYMBOLS.length; i++) {
                await TickerEngine.addTicker(Site.TK_AUTO_SYMBOLS[i]);
            }
            resolve(true);
        });
    }
}

module.exports = TickerEngine;