
class TimeCycleInput {
    /**
     * array of open values of the candles
     * @type {number[]}
     */
    open;

    /**
     * array of high values of the candles
     * @type {number[]}
     */
    high;

    /**
     * array of low values of the candles
     * @type {number[]}
     */
    low;

    /**
     * array of close values of the candles
     * @type {number[]}
     */
    close;

    /**
     * period of the time cycle
     * @type {number}
     */
    period;

    /**
     * @type {'both'|'continuous'|'reverse'}
     */
    model;
}
class TimeCycleOutput {
    /**
     * @type {boolean}
     */
    long;

    /**
     * @type {boolean}
     */
    short;

    /**
     * @type {string}
     */
    model;

    /**
     * @type {string}
     */
    description;
}

class TimeCycle {

    /**
     * @param {TimeCycleInput} input
     * @returns {TimeCycleOutput[]} 
     */
    static calculate = (input) => {
        let { open, high, low, close, period, model } = input;
        /**
         * @type {TimeCycleOutput[]}
         */
        const output = [];
        if (!period) {
            period = 20;
        }
        if (!model) {
            model = 'both';
        }
        const n = close.length;
        if (n < period * 2) {
            return output; // not enough data
        }

        // slice last circle
        const lastOpen = open.slice(-period)[0];
        const lastHighs = high.slice(-period);
        const lastHigh = Math.max(...lastHighs);
        const lastLows = low.slice(-period);
        const lastLow = Math.min(...lastLows);
        const lastClose = close.slice(-1)[0];

        // slice prev circle
        const prevHigh = Math.max(...high.slice((-period) * 2, -period));
        const prevLow = Math.min(...low.slice((-period) * 2, -period));
        let PARBull = false;
        let PARBear = false;
        let CMBull = false;
        let CMBear = false;
        const lastOpenedWithinPrevRange = lastOpen <= prevHigh && lastOpen >= prevLow;

        if (model == 'both' || model == 'reverse') {
            // test for purge and reverse model (PAR)
            // bullish PAR
            const breakoutIndex = lastHighs.findIndex(x => x >= prevHigh || x >= lastHigh);
            if (breakoutIndex >= 0) {
                const lowestWithinBreakoutIndex = Math.min(...lastLows.slice(0, breakoutIndex));
                const lowestPassed = lowestWithinBreakoutIndex <= prevLow;
                const highestAfterBreakout = Math.max(...lastHighs.slice(breakoutIndex));
                const highestPassed = highestAfterBreakout >= prevHigh;
                PARBull = lastOpenedWithinPrevRange && lowestPassed && highestPassed && lastClose >= prevHigh;
                // console.log(lastOpenedWithinPrevRange, lowestPassed, highestPassed, lastClose > prevHigh)
            }

            // bearish PAR
            const breakoutIndexBear = lastLows.findIndex(x => x <= prevLow || x <= lastLow);
            if (breakoutIndexBear >= 0) {
                const highestWithinBreakoutIndex = Math.max(...lastHighs.slice(0, breakoutIndexBear));
                const highestPassedBear = highestWithinBreakoutIndex >= prevHigh;
                const lowestAfterBreakout = Math.min(...lastLows.slice(breakoutIndexBear));
                const lowestPassedBear = lowestAfterBreakout <= prevLow;
                PARBear = lastOpenedWithinPrevRange && highestPassedBear && lowestPassedBear && lastClose <= lastLow;
            }

            // compile PAR result
            if ((PARBear || PARBull) && !(PARBear && PARBull)) {
                output.push({
                    long: PARBull,
                    short: PARBear,
                    model: 'PAR',
                    description: `${PARBull ? 'Bullish' : 'Bearish'} Purge and Reverse`
                });
            }
        }

        if (model == 'both' || model == 'continuous') {
            // test for continuous model (CM)
            // bullish CM
            const firstCrossoverIndex = lastHighs.findIndex(x => x >= prevHigh);
            if (firstCrossoverIndex >= 0) {
                const secondCrossoverIndex = lastHighs.findIndex((x, i) => i > firstCrossoverIndex && x >= prevHigh);
                if (secondCrossoverIndex >= 0) {
                    const firstHigh = Math.max(...lastHighs.slice(firstCrossoverIndex, secondCrossoverIndex));
                    const secondHigh = Math.max(...lastHighs.slice(secondCrossoverIndex));
                    const firstHighPassed = firstHigh > prevHigh;
                    const secondHighPassed = secondHigh > firstHigh;
                    CMBull = lastOpenedWithinPrevRange && firstHighPassed && secondHighPassed && lastClose >= lastHigh;
                }
            }

            // bearish CM
            const firstCrossoverIndexBear = lastLows.findIndex(x => x <= prevLow);
            if (firstCrossoverIndexBear >= 0) {
                const secondCrossoverIndexBear = lastLows.findIndex((x, i) => i > firstCrossoverIndexBear && x <= prevLow);
                if (secondCrossoverIndexBear >= 0) {
                    const firstLow = Math.min(...lastLows.slice(firstCrossoverIndexBear, secondCrossoverIndexBear));
                    const secondLow = Math.min(...lastLows.slice(secondCrossoverIndexBear));
                    const firstLowPassed = firstLow < prevLow;
                    const secondLowPassed = secondLow < firstLow;
                    CMBear = lastOpenedWithinPrevRange && firstLowPassed && secondLowPassed && lastClose <= lastLow;
                }
            }

            // compile CM result
            if ((CMBear || CMBull) && !(CMBear && CMBull)) {
                output.push({
                    long: CMBull,
                    short: CMBear,
                    model: 'CM',
                    description: `${CMBull ? 'Bullish' : 'Bearish'} Continuous`
                });
            }
        }

        return output;
    }
}

module.exports = TimeCycle;