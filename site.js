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

    static BG_API_KEY = process.env.BG_API_KEY || "";
    static BG_API_SECRET = process.env.BG_API_SECRET || "";
    static BG_API_PASSPHRASE = process.env.BG_API_PASSPHRASE || "";

}

module.exports = Site;