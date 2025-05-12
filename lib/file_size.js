/**
 * Calculates the size in bytes of a UTF-8 encoded text file
 * that would be created from the given string content.
 *
 * @param {string} content - The input string to encode.
 * @returns {number} The size of the resulting UTF-8 encoded file in bytes.
 */
function calculateUtf8FileSize(content) {
    return Buffer.byteLength(content, 'utf-8');
}

module.exports = calculateUtf8FileSize;