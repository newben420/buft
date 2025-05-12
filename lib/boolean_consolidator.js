/**
 * Consolidates an array of boolean values based on a specified type.
 *
 * @param {boolean[]} arr - An array of boolean values to consolidate.
 * @param {number} type - Determines the consolidation method:
 *   - If type === 1: returns true only if all values in the array are true.
 *   - If type === 0: returns true if at least one value in the array is true.
 *   - If 0 < type < 1 (float): returns true if at least that ratio of values in the array are true.
 *   - Any other value returns false.
 *
 * @returns {boolean} - The consolidated boolean result based on the given type.
 */
function booleanConsolidator(arr, type) {
    if (!Array.isArray(arr) || arr.some(val => typeof val !== 'boolean')) {
        return false;
    }

    const trueCount = arr.filter(Boolean).length;
    const total = arr.length;

    if (type === 1) {
        return trueCount === total;
    } else if (type === 0) {
        return trueCount > 0;
    } else if (typeof type === 'number' && type > 0 && type < 1) {
        return trueCount / total >= type;
    } else {
        return false;
    }
}

module.exports = booleanConsolidator;
