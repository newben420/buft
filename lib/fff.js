const formatForDEX = require("./format_for_dex")
const convertSubscriptTags = require("./subconvert")

/**
 * This is a combo of formatForDex and subConverter.
 * @param {number} val 
 * @param {number} appr 
 * @returns {string}
 */
const FFF = (val, appr = 3) => {
    return convertSubscriptTags(formatForDEX(val, appr));
}

module.exports = FFF;