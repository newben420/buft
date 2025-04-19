const BitgetEngine = require("./engine/bitget");
const Log = require("./lib/log");
const Site = require("./site");
const arg = process.argv.slice(2);
/**
 * This, for now, is used to find tickers with minimal USDT requirements.
 * This tickers may be utilized when working with a very low capital.
 * This is a standalone script
 */
class Finder {

    static run = async () => {
        try {
            Log.flow(`Finder > Initialized.`, 0);
            const cres = await BitgetEngine.getRestClient().getFuturesContractConfig({
                productType: Site.TK_PRODUCT_TYPE,
            });
            if (cres.msg == "success" && cres.data && Array.isArray(cres.data)) {
                let contracts = cres.data.filter(c => [
                    "maintain", "limit_open", "restrictedAPI", "off"].indexOf(c.symbolStatus) == -1 &&
                    c.symbolType == "perpetual" && c.supportMarginCoins.indexOf(Site.TK_MARGIN_COIN) != -1
                );

                const tres = await BitgetEngine.getRestClient().getFuturesAllTickers({
                    productType: Site.TK_PRODUCT_TYPE,
                });
                if (tres.msg == "success" && tres.data && Array.isArray(tres.data)) {
                    let tickers = {}
                    tres.data.forEach(ticker => {
                        tickers[ticker.symbol] = parseFloat(ticker.lastPr) || 0;
                    });
                    contracts = contracts.filter(x => tickers[x.symbol]);
                    const l = contracts.length;
                    Log.flow(`Finder > Fetched ${l} contract${l == 1 ? "" : "s"}.`, 0);
                    let exntendedContracts = contracts.
                        map(x => ({ ...x, minTradeNum: parseFloat(x.minTradeNum), minTradeUSDT: parseFloat(x.minTradeUSDT) })).
                        map(x => ({ ...x, actualMin: x.minTradeNum * tickers[x.symbol] }));
                    exntendedContracts.sort((a, b) => {
                        if (a.actualMin != b.actualMin) {
                            return a.actualMin - b.actualMin;
                        }
                        return a.minTradeUSDT - a.minTradeUSDT;
                    })
                    exntendedContracts = exntendedContracts.map(x => ({
                        symbol: x.symbol,
                        feeRateUpRatio: parseFloat(x.feeRateUpRatio),
                        makerFeeRate: parseFloat(x.makerFeeRate),
                        takerFeeRate: parseFloat(x.takerFeeRate),
                        openCostUpRatio: parseFloat(x.openCostUpRatio),
                        minTradeNum: x.minTradeNum,
                        minTradeUSDT: x.minTradeUSDT,
                        actualMin: x.actualMin,
                        sizeMultiplier: parseFloat(x.sizeMultiplier),
                        fundInterval: parseFloat(x.fundInterval),

                    }));
                    if (exntendedContracts.length > 0) {
                        // console.log(...Object.keys(exntendedContracts[0]).map(x => `${x}\t`))
                        // exntendedContracts.forEach(c => {
                        //     console.log(...Object.keys(c).map(x => `${c[x]}\t`))
                        // });
                        if (Site.FI_SAVE_PATH) {
                            require("fs").writeFileSync(Site.FI_SAVE_PATH, JSON.stringify(exntendedContracts, null, "\t"), "utf8");
                            Log.flow(`Finder > Saved output to ${Site.FI_SAVE_PATH}.`, 0);
                        }
                        else {
                            exntendedContracts.forEach(c => {
                                console.log(c, "\n");
                            });
                        }
                    }
                    else {
                        Log.flow(`Finder > Error >No valid contracts found.`, 0);
                    }
                }
                else {
                    Log.flow(`Finder > Error > ${tres.code} - ${tres.msg}.`, 0);
                }
            }
            else {
                Log.flow(`Finder > Error > ${cres.code} - ${cres.msg}.`, 0);
            }
        } catch (error) {
            if (error.body) {
                Log.flow(`Finder > Error > ${error.body.code} - ${error.body.msg}.`, 0);
            }
            else {
                Log.flow(`Finder > Error > Unknown Error.`, 0);
                Log.dev(error);
            }
        }
    }
}

Finder.run();