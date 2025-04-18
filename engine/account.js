const FFF = require("../lib/fff");
const Log = require("../lib/log");
const Site = require("../site");
const BitgetEngine = require("./bitget");

/**
 * Manages account used, its balance, and PnL
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
     * Starting available balance in margin coin
     * @type {number}
     */
    static #initialBalance = 0;

    /**
     * Get account balance in margin coin.
     * @returns {number}
     */
    static getBalance = () => Account.#balance;

    /**
     * Get current session's PnL in Margin Coin.
     * @returns {number}
     */
    static getSessionPNL = () => Account.#balance - Account.#initialBalance;

    /**
     * Flag for when the first non-zero balance update is received
     * @type {boolean}
     */
    static #initialBalanceUpdateDone = false;


    /**
     * Called when there is a balance update.
     * @param {number} bal 
     */
    static #updateBalance = (bal) => {
        bal = parseFloat(bal) || 0;
        if((!Account.#initialBalanceUpdateDone) && bal > 0){
            Account.#initialBalance = bal;
            Account.#initialBalanceUpdateDone = true;
        }
        Account.#balance = bal;
        Log.flow(`Account > Balance > Update > ${Site.TK_MARGIN_COIN} ${FFF(bal)}`, 5);
    }

}

module.exports = Account;