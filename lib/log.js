const Site = require("../site");
const getDateTime = require("./get_date_time");

/**
 * A unified stdout interface for the application
 */
class Log {

    /**
     * Logs in development mode
     * @param {any} message 
     */
    static dev = (message) => {
        if(!Site.PRODUCTION || Site.FLOW_LOG_MAX_PRIORITY == -2){
            console.log(message);
        }
    }

    /**
     * Flow log
     * @param {string} message 
     * @param {number} priority - high priority is 0, goes up 
     */
    static flow = (message, priority = 0) => {
        if(priority >= 0 && priority <= Site.FLOW_LOG_MAX_PRIORITY){
            console.log(`${getDateTime()}: ${message}`);
        }
    }
}

module.exports = Log;