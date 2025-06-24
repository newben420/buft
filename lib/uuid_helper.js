const { v4: uuidv4, validate } = require("uuid");

/** Utility class for UUID operations. */
class UUIDHelper {
    /** Generates a full UUID v4.
     * @returns {string}
     */
    static generate() {
        return uuidv4();
    }

    /** Generates a short UUID (first segment only).
     * @returns {string}
     */
    static short() {
        return UUIDHelper.generate().split("-")[0];
    }

    /** Validates a UUID string.
     * @param {string} ud
     * @returns {boolean}
     */
    static validate(ud) {
        return validate(ud);
    }
}

module.exports = { UUIDHelper };
