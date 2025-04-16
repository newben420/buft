const Analysis = require("./engine/analysis");
const BitgetEngine = require("./engine/bitget");
const getDateTime = require("./lib/get_date_time");
const getTimeElapsed = require("./lib/get_time_elapsed");
const Log = require("./lib/log");
const Candlestick = require("./model/candlestick");
const Site = require("./site");

/**
 * This is responsible for hastened data collection for multilayering
 * It is independent of the normal working of the server
 */
class Collector {

    /**
     * @type {Record<string, Candlestick[]>}
     */
    static #csData = {};

    static run = async () => {
        Log.flow(`Collector > Initialized.`);
        Site.FLOW_LOG_MAX_PRIORITY = 0;
        for (const symbol of Site.CL_SYMBOLS) {
            Collector.#csData[symbol] = [];
            Log.flow(`Collector > ${symbol} > Initialized.`, 0);
            let remainingRowsToCollect = Site.CL_ROWS;
            let maxRowsPerFetch = Site.CL_MAX_ROWS_PER_FETCH;
            let errorEncountered = "";
            let lastStartTime = Math.floor((Date.now() - (Site.CL_ROWS * Site.TK_INTERVAL)) / 1000) * 1000;
            Log.flow(`Collector > ${symbol} > Data starting from ${getTimeElapsed(lastStartTime, Date.now())} ago will be collected.`, 0);
            while (remainingRowsToCollect > 0 && (!errorEncountered)) {
                let nowCollecting = (remainingRowsToCollect > maxRowsPerFetch ? (maxRowsPerFetch) : remainingRowsToCollect);
                let endTime = lastStartTime + (nowCollecting * Site.TK_INTERVAL);
                if (nowCollecting > maxRowsPerFetch) {
                    nowCollecting = maxRowsPerFetch;
                }
                remainingRowsToCollect -= nowCollecting;
                Log.flow(`Collector > ${symbol} > Now fetching ${nowCollecting} row${nowCollecting == 1 ? '' : 's'} of candlestick data from ${getDateTime(lastStartTime)} to ${getDateTime(endTime)}.`, 0);
                try {
                    const data = await BitgetEngine.getRestClient().getFuturesHistoricCandles({
                        granularity: Site.TK_GRANULARITY,
                        productType: Site.TK_PRODUCT_TYPE,
                        symbol: symbol,
                        kLineType: "MARKET",
                        limit: nowCollecting,
                        endTime: endTime,
                    });
                    if(data.msg = "success"){
                        Collector.#csData[symbol] = Collector.#csData[symbol].concat(data.data.map(x => new Candlestick(x[1], x[2], x[3], x[4], x[6])));
                    }
                    else{
                        errorEncountered = `${data.code} - ${data.msg}`;
                    }
                } catch (error) {
                    Log.dev(error);
                    errorEncountered = "Unknown Error";
                }
                lastStartTime = endTime;
            }
            if(errorEncountered){
                Log.flow(`Collector > ${symbol} > Fetch failed with error '${errorEncountered}'.`, 0);
            }
            else{
                const l = Collector.#csData[symbol].length;
                Log.flow(`Collector > ${symbol} > Fetch succeeded (${l} row${l == 1 ? "" : "s"}).`, 0);
                let t = 0;
                for (let i = (Site.TK_MAX_ROWS - 1); i < Collector.#csData[symbol].length; i++){
                    t++;
                    const data = Collector.#csData[symbol].slice((i + 1 - Site.TK_MAX_ROWS), (i + 1));
                    const analysed = await Analysis.run(symbol, data);
                }
                Log.flow(`Collector > ${symbol} > Analysis succeeded (${t} time${l == 1 ? "" : "s"}).`, 0);
            }
            Log.flow(`Collector > ${symbol} > Concluded.`, 0);
        }
        await Analysis.stop();
    }
}

Collector.run();