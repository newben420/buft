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

    static AS_MIN_ROWS = parseInt(process.env.AS_MIN_ROWS || "100");

    static CL_SYMBOLS = (process.env.CL_SYMBOLS || "").split(" ").filter(x => x.length > 0);
    static CL_ROWS = parseInt(process.env.CL_ROWS || "1000");
    static CL_MAX_ROWS_PER_FETCH = parseInt(process.env.CL_MAX_ROWS_PER_FETCH || "1000");

    static TR_AUTO_ENABLED = (process.env.TR_AUTO_ENABLED || "").toLowerCase() == "true";
    static TR_GRID_LENGTH = parseInt(process.env.TR_GRID_LENGTH || "1") || 1;
    static TR_MAX_CAPITAL_MCOIN = parseFloat(process.env.TR_MAX_CAPITAL_MCOIN || "0") || Infinity;
    static TR_SIGNAL_BLACKLIST = (process.env.TR_SIGNAL_BLACKLIST || "").split(" ").filter(x => x.length > 0).map(x => x.replace(/_/g, " "));
    static TR_POS_UPDATE_INTERVAL_MS = parseInt(process.env.TR_POS_UPDATE_INTERVAL_MS || "1000") || 1000;
    static TR_MARGIN_MODE = process.env.TR_MARGIN_MODE || "isolated";
    static TR_CAPITAL_RATIO_FOR_TRADE = parseFloat(process.env.TR_CAPITAL_RATIO_FOR_TRADE || "1") || 1;
    static TR_TAKE_PROFIT = (process.env.TR_TAKE_PROFIT || "").toUpperCase();
    static TR_STOP_LOSS = (process.env.TR_STOP_LOSS || "").toUpperCase();
    static TR_PEAK_DROP_MIN_DROP = (process.env.TR_PEAK_DROP_MIN_DROP || "0") || 0;
    static TR_PROFIT_ORDER_MAX_DURATION_MS = parseInt(process.env.TR_PROFIT_ORDER_MAX_DURATION_MS || "0") || 0;
    static TR_LOSS_ORDER_MAX_DURATION_MS = parseInt(process.env.TR_LOSS_ORDER_MAX_DURATION_MS || "0") || 0;

    static IN_MIN_CONFIDENCE = parseFloat(process.env.IN_MIN_CONFIDENCE || "0") || 0;
    static IN_DIRECTION_MAX_LENGTH = parseInt(process.env.IN_DIRECTION_MAX_LENGTH || "10");
    static IN_BOOLEAN_THRESHOLD_MIN_RATIO = parseFloat(process.env.IN_BOOLEAN_THRESHOLD_MIN_RATIO || "0.5");
    static IN_MACD_FAST_PERIOD = parseInt(process.env.IN_MACD_FAST_PERIOD || "12") || 12;
    static IN_MACD_SLOW_PERIOD = parseInt(process.env.IN_MACD_SLOW_PERIOD || "26") || 26;
    static IN_MACD_SIGNAL_PERIOD = parseInt(process.env.IN_MACD_SIGNAL_PERIOD || "9") || 9;
    static IN_MA_PERIOD = parseInt(process.env.IN_MA_PERIOD || "10") || 10;
    static IN_AO_FAST_PERIOD = parseInt(process.env.IN_AO_FAST_PERIOD || "5") || 5;
    static IN_AO_SLOW_PERIOD = parseInt(process.env.IN_AO_SLOW_PERIOD || "34") || 34;
    static IN_FI_PERIOD = parseInt(process.env.IN_FI_PERIOD || "14") || 14;
    static IN_BB_PERIOD = parseInt(process.env.IN_BB_PERIOD || "20") || 20;
    static IN_BB_STDDEV = parseFloat(process.env.IN_BB_STDDEV || "2") || 2;
    static IN_PSAR_STEP = parseFloat(process.env.IN_PSAR_STEP || "0.02") || 0.02;
    static IN_PSAR_MAX = parseFloat(process.env.IN_PSAR_MAX || "0.2") || 0.2;
    static IN_STOCH_PERIOD = parseInt(process.env.IN_STOCH_PERIOD || "14") || 14;
    static IN_STOCH_SIGNAL_PERIOD = parseInt(process.env.IN_STOCH_SIGNAL_PERIOD || "3") || 3;
    static IN_MAX_SIGNAL_HISTORY_LENGTH = parseInt(process.env.IN_MAX_SIGNAL_HISTORY_LENGTH || "5") || "5";
    static IN_ML_COLLECT_DATA = (process.env.IN_ML_COLLECT_DATA || "").toLowerCase() == "true";
    static IN_ML_DATA_PATH = path.join(rootDir(), `ml_data.json`);
    static IN_ML_CACHE_PATH = path.join(rootDir(), `ml_cache.json`);

    static FI_SAVE_PATH = process.env.FI_SAVE_PATH || "";

    static TG_TOKEN = process.env.TG_TOKEN ?? "";
    static TG_CHAT_ID = parseInt(process.env.TG_CHAT_ID ?? "0");
    static TG_POLLING = (process.env.TG_POLLING || "").toLowerCase() == "true";
    static TG_SEND_START = (process.env.TG_SEND_START || "").toLowerCase() == "true";
    static TG_SEND_STOP = (process.env.TG_SEND_STOP || "").toLowerCase() == "true";
    static TG_SEND_CREATE_ORDER = (process.env.TG_SEND_CREATE_ORDER || "").toLowerCase() == "true";
    static TG_WH_SECRET_TOKEN = process.env.TG_WH_SECRET_TOKEN ?? "";
    static TG_MESSAGE_DURATION_MS = parseInt(process.env.TG_MESSAGE_DURATION_MS || "5000") || 5000;
    static TG_BOT_URL = process.env.TG_BOT_URL ?? "";

    static BG_API_KEY = process.env.BG_API_KEY || "";
    static BG_API_SECRET = process.env.BG_API_SECRET || "";
    static BG_API_PASSPHRASE = process.env.BG_API_PASSPHRASE || "";

}

module.exports = Site;