/** Represents a standard response object. */
class Res {
    constructor() {
        this.succ = false;
        this.message = null;
        this.extra = null;
    }
}

/** Static helper for creating success and error response objects. */
class GRes {
    /** Create a success response.
     * @param {any} message - Main message or payload
     * @param {any} extra - Extra metadata (optional)
     * @returns {Res}
     */
    static succ(message = "", extra = {}) {
        let r = new Res();
        r.succ = true;
        r.message = message;
        r.extra = extra || {};
        return r;
    }

    /** Create an error response.
     * @param {any} message - Error message
     * @param {any} extra - Extra metadata (optional)
     * @returns {Res}
     */
    static err(message = "", extra = {}) {
        let r = new Res();
        r.succ = false;
        r.message = message;
        r.extra = extra || {};
        return r;
    }
}

module.exports = { Res, GRes };
