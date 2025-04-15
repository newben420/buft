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

}

module.exports = Site;