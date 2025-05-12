/**
 * Generates a random string of lowercase alphanumeric characters.
 * @param {number} length - The desired length of the generated string.
 * @returns {string} A random lowercase alphanumeric string of the given length.
 */
function generateLowercaseAlphanumeric(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = generateLowercaseAlphanumeric;