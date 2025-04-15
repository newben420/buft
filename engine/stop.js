/**
 * Responsible for the successful shutting down of various engines when necessary
 * @returns {Promise<boolean>}
 */
const stopEngine = () => {
    return new Promise((resolve, reject) => {
        resolve(true);
    })
}

module.exports = stopEngine;