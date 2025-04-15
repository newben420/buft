const { RestClientV2, WebsocketClientV2, DefaultLogger, WS_KEY_MAP } = require("bitget-api");
const Site = require("../site");

// Disable all logging on the silly level (less console logs)
const customLogger = {
    ...DefaultLogger,
    silly: (m) => {
        // console.log(m);
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
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise((resolve, reject) => {
            BitgetEngine.#ws.on('update', (data) => {
                // console.log('WS raw message received ', data);
                // console.log('WS raw message received ', JSON.stringify(data, null, 2));
            });
            BitgetEngine.#ws.on('open', (data) => {
                // console.log('WS connection opened:', data.wsKey);
            });
            BitgetEngine.#ws.on('response', (data) => {
                // console.log('WS response: ', JSON.stringify(data, null, 2));
            });
            BitgetEngine.#ws.on('reconnect', ({ wsKey }) => {
                // console.log('WS automatically reconnecting.... ', wsKey);
            });
            BitgetEngine.#ws.on('reconnected', (data) => {
                // console.log('WS reconnected ', data?.wsKey);
            });
            BitgetEngine.#ws.on('exception', (data) => {
                // console.log('WS error', data);
            });

            resolve(true);
        });
    }
}

module.exports = BitgetEngine;