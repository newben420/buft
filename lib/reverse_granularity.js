/**
 * Converts a granularity string (e.g., '1m', '4H', '1Dutc') into milliseconds.
 *
 * Supported formats:
 * - Minutes: 1m, 3m, 5m, 15m, 30m
 * - Hours: 1H, 4H, 6H, 12H
 * - Days: 1D, 3D
 * - Weeks: 1W
 * - Months: 1M
 * - UTC variants: 6Hutc, 12Hutc, 1Dutc, 3Dutc, 1Wutc, 1Mutc
 *
 * @param {string} granularity - The granularity string to convert.
 * @returns {number} The duration in milliseconds, or null if invalid.
 */
function reverseGranularity(granularity) {
    const timeUnits = {
        m: 60 * 1000,
        H: 60 * 60 * 1000,
        D: 24 * 60 * 60 * 1000,
        W: 7 * 24 * 60 * 60 * 1000,
        M: 30 * 24 * 60 * 60 * 1000
    };

    const match = granularity.match(/^(\d+)([mHDWM])(?:utc)?$/);
    if (!match) return null;

    const [, value, unit] = match;
    const multiplier = timeUnits[unit];
    return multiplier ? parseInt(value, 10) * multiplier : 60000;
}


module.exports = reverseGranularity;