/**
 * Floors a number to a specified number of significant figures.
 * This ensures the returned value has no more than the desired
 * number of significant digits, always rounded down (toward zero).
 *
 * @param {number} num - The number to be rounded down.
 * @param {number} [sigFigs=3] - The number of significant figures to retain (default is 3).
 * @returns {number} - The floored number with the specified significant figures.
 *
 * @example
 * floorToSigFigs(12345.678);        // returns 12300
 * floorToSigFigs(0.0045678);        // returns 0.00456
 * floorToSigFigs(0.000987654);      // returns 0.000987
 * floorToSigFigs(-45.987, 2);       // returns -45
 * floorToSigFigs(999.9999, 1);      // returns 900
 */
function floorToSigFigs(num, sigFigs = 3) {
    if (num === 0) return 0;

    const sign = Math.sign(num);
    num = Math.abs(num);

    const exponent = Math.floor(Math.log10(num));
    const factor = Math.pow(10, exponent - sigFigs + 1);

    const floored = Math.floor(num / factor) * factor;
    return sign * floored;
}

module.exports = floorToSigFigs;