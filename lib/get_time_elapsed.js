/**
 * Returns time ellasped.
 * @param {number} epochTimestamp 
 * @param {number} currentTimestamp 
 * @returns {string}
 */
const getTimeElapsed = (epochTimestamp, currentTimestamp) => {
    const SECOND = 1000; // Milliseconds in a second
    const MINUTE = 60 * SECOND; // Milliseconds in a minute
    const HOUR = 60 * MINUTE; // Milliseconds in an hour
    const DAY = 24 * HOUR; // Milliseconds in a day
    const WEEK = 7 * DAY; // Milliseconds in a week

    // Calculate the difference in milliseconds
    const elapsedTime = currentTimestamp - epochTimestamp;

    if (elapsedTime < 0) {
        return "0s"; // Return 0 seconds if the timestamp is in the future
    }

    const weeks = Math.floor(elapsedTime / WEEK);
    const days = Math.floor((elapsedTime % WEEK) / DAY);
    const hours = Math.floor((elapsedTime % DAY) / HOUR);
    const minutes = Math.floor((elapsedTime % HOUR) / MINUTE);
    const seconds = Math.floor((elapsedTime % MINUTE) / SECOND);

    // Construct the readable format with abbreviations
    const parts = [];

    if (weeks > 0) parts.push(`${weeks}w`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    // Limit to a maximum of two parts
    return parts.slice(0, 2).join(" ");
};

module.exports = getTimeElapsed;