const { config } = require("dotenv");
const reverseGranularity = require("./lib/reverse_granularity");
const args = process.argv.slice(2);
config({
    path: args[0] || ".env"
});
const path = require("path");
const rootDir = require("./root");
/**
 * Responsible for application-wide variables and configurations
 */
class Site {
    static TITLE = process.env.TITLE || "Application";
    static PORT = parseInt(process.env.PORT || "4000");
    static PRODUCTION = (process.env.PRODUCTION || "").toLowerCase() == "true";
    static URL = Site.PRODUCTION ? (process.env.PROD_URL || "") : `http://localhost:${Site.PORT}`;
    static FORCE_FAMILY_4 = (process.env.FORCE_FAMILY_4 || "").toLowerCase() == "true";
    static FLOW_LOG_MAX_PRIORITY = parseInt(process.env.FLOW_LOG_MAX_PRIORITY || "5");
    static EXIT_ON_UNCAUGHT_EXCEPTION = (process.env.EXIT_ON_UNCAUGHT_EXCEPTION || "").toLowerCase() == "true";
    static EXIT_ON_UNHANDLED_REJECTION = (process.env.EXIT_ON_UNHANDLED_REJECTION || "").toLowerCase() == "true";

    static TK_PRODUCT_TYPE = process.env.TK_PRODUCT_TYPE || "";
    static TK_MARGIN_COIN = process.env.TK_MARGIN_COIN || "USDT";
    static TK_AUTO_SYMBOLS = (process.env.TK_AUTO_SYMBOLS || "").split(" ").filter(x => x.length > 0);
    static TK_MAX = parseInt(process.env.TK_MAX || "100");
    static TK_GRANULARITY = process.env.TK_GRANULARITY || "1m";
    static TK_INTERVAL = reverseGranularity(Site.TK_GRANULARITY);
    static TK_MAX_ROWS = parseInt(process.env.TK_MAX_ROWS || "100");
    static TK_LEVERAGE_LONG = process.env.TK_LEVERAGE_LONG || "5";
    static TK_LEVERAGE_SHORT = process.env.TK_LEVERAGE_SHORT || "5";
    static TK_LEVERAGE_CROSS = process.env.TK_LEVERAGE_CROSS || "5";

    static IN_CFG = Object.fromEntries((process.env.IN_CFG || "").replace(/[\n\r]/g, " ").split(" ").filter(x => x.length > 0).reduce((acc, val, i, arr) => i % 2 === 0 ? acc : acc.concat([[arr[i - 1], /^true$/i.test(val) ? true : /^false$/i.test(val) ? false : isNaN(val) ? val : val.includes(".") ? parseFloat(val) : parseInt(val)]]), []));
    static IN_ML_DATA_PATH = (path.join(rootDir(), `analysis/ml_${Site.IN_CFG.ML_DATA_PATH || "default"}.json`));

    static STR_ENTRY_IND = process.env.STR_ENTRY_IND || "ICH";
    static STR_TREND_IND = (process.env.STR_TREND_IND || "BLL").split(" ").filter(x => x.length == 3);
    static STR_TREND_CV = parseFloat(process.env.STR_TREND_CV || "0") || 0;
    static STR_TREND_FV = parseFloat(process.env.STR_TREND_FV || "0") || 0;
    static STR_STG_FV = parseFloat(process.env.STR_STG_FV || "0") || 0;
    static STR_OB_IND = (process.env.STR_OB_IND || "STC").split(" ").filter(x => x.length == 3);
    static STR_OB_CV = parseFloat(process.env.STR_OB_CV || "0") || 0;
    static STR_OB_FV = parseFloat(process.env.STR_OB_FV || "0") || 0;
    static STR_REV_IND_BULL = (process.env.STR_REV_IND_BULL || "STR HGM EST TBC PIL DCC TTP").split(" ").filter(x => x.length == 3);
    static STR_REV_IND_BEAR = (process.env.STR_REV_IND_BEAR || "TWS MST HMR TBT").split(" ").filter(x => x.length == 3);
    static STR_REV_CV = parseFloat(process.env.STR_REV_CV || "0") || 0;
    static STR_REV_FV = parseFloat(process.env.STR_REV_FV || "0") || 0;
    static STR_TSL_IND = process.env.STR_TSL_IND || "PSR";
    static STR_VOL_RNG = (process.env.STR_VOL_RNG || "0 0").split(" ").filter(x => x.length > 0).map(x => parseFloat(x)).filter(x => (!Number.isNaN(x)));

    static CL_SYMBOLS = (process.env.CL_SYMBOLS || "").split(" ").filter(x => x.length > 0);
    static CL_ROWS = parseInt(process.env.CL_ROWS || "1000");
    static CL_MAX_ROWS_PER_FETCH = parseInt(process.env.CL_MAX_ROWS_PER_FETCH || "1000");

    static TR_AUTO_ENABLED = (process.env.TR_AUTO_ENABLED || "").toLowerCase() == "true";
    static TR_GRID_LENGTH = parseInt(process.env.TR_GRID_LENGTH || "1") || 1;
    static TR_MAX_CAPITAL_MCOIN = parseFloat(process.env.TR_MAX_CAPITAL_MCOIN || "0") || Infinity;
    static TR_POS_UPDATE_INTERVAL_MS = parseInt(process.env.TR_POS_UPDATE_INTERVAL_MS || "1000") || 1000;
    static TR_MARGIN_MODE = process.env.TR_MARGIN_MODE || "isolated";
    static TR_CAPITAL_RATIO_FOR_TRADE = parseFloat(process.env.TR_CAPITAL_RATIO_FOR_TRADE || "1") || 1;
    static TR_EXCLUDE_MANUAL_TRADES_FROM_EXIT = (process.env.TR_EXCLUDE_MANUAL_TRADES_FROM_EXIT || "").toLowerCase() == "true";
    static TR_STOPLOSS_PERC_RANGE = Object.fromEntries((process.env.TR_STOPLOSS_PERC_RANGE || "0 0").split(" ").map((v, i) => [i === 0 ? "min" : "max", Number(v)]));
    static TR_MANUAL_STOPLOSS_PERC = parseFloat(process.env.TR_MANUAL_STOPLOSS_PERC || "0") || 100;
    static TR_MANUAL_TAKEPROFIT_PERC = parseFloat(process.env.TR_MANUAL_TAKEPROFIT_PERC || "0") || 0;
    static TR_AUTOMATIC_TP_SL_MULTIPLIER = parseFloat(process.env.TR_AUTOMATIC_TP_SL_MULTIPLIER || "0") || 0;
    static TR_RECOVERY_DEFULT_SL_PERC = parseFloat(process.env.TR_RECOVERY_DEFULT_SL_PERC || "0") || 100;
    static TR_AUTO_SELL = (process.env.TR_AUTO_SELL || "").split("|").filter(x => x.length > 0).map(x => x.split(" ").filter(y => y.length > 0).map(y => parseFloat(y)).filter(y => !Number.isNaN(y))).filter(x => x.length == 3).map(x => ({ pnl: x[0] || 0, minDurationMS: x[1] || 0, maxDurationMS: x[2] || Infinity})).filter(x => x.pnl != 0 && x.minDurationMS > 0 && x.maxDurationMS > 0 && x.maxDurationMS >= x.minDurationMS);
    static TR_PEAK_DROP = (process.env.TR_PEAK_DROP || "").split("|").filter(x => x.length > 0).map(x => x.split(" ").filter(y => y.length > 0).map(y => parseFloat(y)).filter(y => !Number.isNaN(y))).filter(x => x.length == 4).map(x => ({ minDrop: x[0] || 0, maxDrop: x[1] || Infinity, minPnL: x[2] || 0, maxPnL: x[3] || Infinity})).filter(x => x.maxPnL >= x.minPnL && x.maxDrop >= x.minDrop);
    static TR_TEMP_ORDERS_MAX_DURATION_MS = parseFloat(process.env.TR_TEMP_ORDERS_MAX_DURATION_MS || "0") || 600000;

    static FI_SAVE_PATH = process.env.FI_SAVE_PATH || "";

    static TG_TOKEN = process.env.TG_TOKEN ?? "";
    static TG_CHAT_ID = parseInt(process.env.TG_CHAT_ID ?? "0");
    static TG_POLLING = (process.env.TG_POLLING || "").toLowerCase() == "true";
    static TG_SEND_START = (process.env.TG_SEND_START || "").toLowerCase() == "true";
    static TG_SEND_STOP = (process.env.TG_SEND_STOP || "").toLowerCase() == "true";
    static TG_SEND_CREATE_ORDER = (process.env.TG_SEND_CREATE_ORDER || "").toLowerCase() == "true";
    static TG_SEND_AUTO_FAIL = (process.env.TG_SEND_AUTO_FAIL || "").toLowerCase() == "true";
    static TG_WH_SECRET_TOKEN = process.env.TG_WH_SECRET_TOKEN ?? "";
    static TG_BOT_URL = process.env.TG_BOT_URL ?? "";

    static BG_API_KEY = process.env.BG_API_KEY || "";
    static BG_API_SECRET = process.env.BG_API_SECRET || "";
    static BG_API_PASSPHRASE = process.env.BG_API_PASSPHRASE || "";

    static DS_USE = (process.env.DS_USE || "").toLowerCase() == "true";
    static DS_MAX_SIGNS = parseInt(process.env.DS_MAX_SIGNS || "0") || 10;
    static DS_MAX_DURATION_MS = parseInt(process.env.DS_MAX_DURATION_MS || "0") || Infinity;

}

module.exports = Site;