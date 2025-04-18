const { RestClientV2, WebsocketClientV2, DefaultLogger, WS_KEY_MAP } = require("bitget-api");
const Site = require("../site");
const Log = require("../lib/log");

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
        Log.dev(m);
    },
    error: (...m) => {
        // console.log(m);
        Log.dev(m);
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
            if(!BitgetEngine.#callbackFunctions[name]){
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
    static #getCallback = (name) => BitgetEngine.#callbackFunctions[name] || (() => {}); 

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise((resolve, reject) => {
            BitgetEngine.#ws.on('update', (data) => {
                // console.log('WS raw message received ', data);
                if(data.arg){
                    if(data.arg.instType == Site.TK_PRODUCT_TYPE){
                        if(data.arg.channel == "account" && data.data && Array.isArray(data.data)){
                            const bal = (data.data.filter(x => x.marginCoin == Site.TK_MARGIN_COIN)[0] || {}).available || 0;
                            BitgetEngine.#getCallback("balance_update")(bal);
                        }
                    }
                }
                // console.log('WS raw message received ', JSON.stringify(data, null, 2));
            });
            BitgetEngine.#ws.on('open', (data) => {
                Log.flow(`WS > Connection > Opened.`, 5);
            });
            BitgetEngine.#ws.on('response', (data) => {
                Log.flow(`WS > Response > ${data.event}.`, 5);
            });
            BitgetEngine.#ws.on('reconnect', ({ wsKey }) => {
                Log.flow(`WS > Connection > Reconnecting...`, 5);
            });
            BitgetEngine.#ws.on('reconnected', (data) => {
                Log.flow(`WS > Connection > Reconnected.`, 5);
            });
            BitgetEngine.#ws.on('exception', (data) => {
                Log.flow(`WS > Exception occurred.`, 5);
                Log.dev(data);
            });

            resolve(true);
        });
    }
}

module.exports = BitgetEngine;