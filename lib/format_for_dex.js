/**
 * Formats a number for display using:
 * - "K, M, B, T" notation for large numbers (thousands and above)
 * - Subscript notation for small numbers (e.g., 0.00000273 → 0.0<sub>6</sub>2.73)
 * - Returns an HTML string that can be inserted into a webpage.
 *
 * @param {number} num - The number to format.
 * @param {number} sigFigs - Number of significant figures to display.
 * @returns {string} Formatted number as an HTML string.
 */
function formatForDEX(num, sigFigs = 3) {
    if (num === 0) return "0";

    const absNum = Math.abs(num);

    // Large number formatting (K, M, B, T)
    const suffixes = ["", "K", "M", "B", "T", "Q"];
    let magnitude = Math.floor(Math.log10(absNum) / 3);
    
    if (magnitude > 0) {
        magnitude = Math.min(magnitude, suffixes.length - 1); // Prevent exceeding suffixes
        const shortNum = (num / Math.pow(10, magnitude * 3)).toPrecision(sigFigs);
        return `${shortNum}${suffixes[magnitude]}`;
    }

    // Small number formatting with subscript notation (0.0<sub>6</sub>2.73)
    if (absNum < 0.001) {
        let exponent = Math.floor(Math.log10(absNum));
        let mantissa = (num / Math.pow(10, exponent)).toPrecision(sigFigs).replace(".", "");
        let subscript = `<sub>${Math.abs(exponent)}</sub>`;
        return `0.0${subscript}${mantissa}`.includes("-") ? ("-" + (`0.0${subscript}${mantissa}`.replace("-",""))) : `0.0${subscript}${mantissa}`;
    }

    // Standard decimal notation for normal numbers
    return num.toPrecision(sigFigs);
}

module.exports = formatForDEX;