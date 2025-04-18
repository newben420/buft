const FFF = require("../lib/fff");
const Log = require("../lib/log");
const Site = require("../site");
const BitgetEngine = require("./bitget");

/**
 * Manages account used, its balance, PnL and Entry Amounts.
 */
class Account {

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise(async (resolve, reject) => {
            try {
                await BitgetEngine.addCallbackFunction("balance_update", Account.#updateBalance);
                BitgetEngine.getWSClient().subscribeTopic(Site.TK_PRODUCT_TYPE, "account");
                // const bal = await BitgetEngine.getRestClient().getFuturesAccountAssets();
                // console.log(bal);
                resolve(true);
            } catch (error) {
                Log.dev(error);
                resolve(false);
            }
        })
    }

    /**
     * Current available balance in margin coin
     * @type {number}
     */
    static #balance = 0;

    /**
     * Get account balance in margin coin.
     * @returns {number}
     */
    static getBalance = () => Account.#balance;


    /**
     * Called when there is a balance update.
     * @param {number} bal 
     */
    static #updateBalance = (bal) => {
        bal = parseFloat(bal) || 0;
        Account.#balance = bal;
        Log.flow(`Account > Balance > Update > ${Site.TK_MARGIN_COIN} ${FFF(bal)}`, 5);
    }

}

module.exports = Account;