const { config } = require("dotenv");
const reverseGranularity = require("./lib/reverse_granularity");
const args = process.argv.slice(2);
config({
    path: args[0] || ".env"
});

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
    static TK_AUTO_SYMBOLS = (process.env.TK_AUTO_SYMBOLS || "").split(" ").filter(x => x.length > 0);
    static TK_MAX = parseInt(process.env.TK_MAX || "100");
    static TK_GRANULARITY = process.env.TK_GRANULARITY || "1m";
    static TK_INTERVAL = reverseGranularity(Site.TK_GRANULARITY);
    static TK_MAX_ROWS = parseInt(process.env.TK_MAX_ROWS || "100");

    static AS_MIN_ROWS = parseInt(process.env.AS_MIN_ROWS || "100");

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

    static BG_API_KEY = process.env.BG_API_KEY || "";
    static BG_API_SECRET = process.env.BG_API_SECRET || "";
    static BG_API_PASSPHRASE = process.env.BG_API_PASSPHRASE || "";

}

module.exports = Site;