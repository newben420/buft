/**
 * Converts numeric values inside <sub>...</sub> tags to their Unicode subscript equivalents.
 * 
 * @param {string} input - The input string that may contain <sub>...</sub> tags.
 * @returns {string} - The modified string with numeric subscript values replaced by Unicode equivalents.
 */
function convertSubscriptTags(input) {
    // Unicode subscript mapping for digits
    const subscriptMap = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    };

    return input.replace(/<sub>(\d+)<\/sub>/g, (match, p1) => {
        // Convert each digit to its Unicode subscript equivalent
        return p1.split('').map(digit => subscriptMap[digit] || digit).join('');
    });
}

module.exports = convertSubscriptTags;