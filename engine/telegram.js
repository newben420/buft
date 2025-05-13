const TelegramBot = require('node-telegram-bot-api');
const Site = require('../site');
const Log = require('../lib/log');
const FFF = require('../lib/fff');
const formatNumber = require('../lib/format_number');
const getTimeElapsed = require('../lib/get_time_elapsed');
const getDateTime = require('../lib/get_date_time');
const Trader = require('./trader');
const TickerEngine = require('./ticker');
const Account = require('./account');
const Signal = require('../model/signal');
const BitgetEngine = require('./bitget');

process.env.NTBA_FIX_350 = true;

class TelegramEngine {

    /**
     * @type {TelegramBot}
     */
    static #bot;

    /**
     * This is called to accept updates when polling is not enabled.
     * @param {any} body 
     */
    static processWebHook = (body) => {
        if (!Site.POLLING) {
            try {
                TelegramEngine.#bot.processUpdate(body);
            } catch (error) {
                Log.dev(error);
            }

        }
    }

    /**
     * @type {string}
     */
    static #lastStatContent = "";

    /**
     * @type {string}
     */
    static #lastOrdersContent = "";

    /**
     * This generates content for the stats command.
     * @returns {any}
     */
    static #getStatsContent = () => {
        /**
         * @type {string}
         */
        let message = `🚀 *${Site.TITLE}* - ${getDateTime()}\n\n`;
        const trader = Trader.isEnabled();
        message += `Trader Enabled ${trader ? `🟢 Yes` : `🔴 No`}\n`;
        message += `Tickers 💲 ${formatNumber(TickerEngine.getLength())}\n`;
        message += `Active Orders 📈 ${formatNumber(Trader.getOrdersLength())}\n`;
        message += `Balance 💰 ${Site.TK_MARGIN_COIN} ${FFF(Account.getBalance())}\n`;
        if (Trader.getOrdersLength() == 0) {
            message += `Session PnL 💰 ${Site.TK_MARGIN_COIN} ${FFF(Account.getSessionPNL())}\n`;
        }
        message += `Margin Mode ⚙️ ${Site.TR_MARGIN_MODE.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())}\n`;
        if (Site.TR_MARGIN_MODE == "isolated") {
            message += `Long Leverage ✖️ ${Site.TK_LEVERAGE_LONG}\n`;
            message += `Short Leverage ✖️ ${Site.TK_LEVERAGE_SHORT}\n`;
        }
        else {
            message += `Cross Leverage ✖️ ${Site.TK_LEVERAGE_CROSS}\n`;
        }
        /**
         * @type {TelegramBot.InlineKeyboardButton[][]}
         */
        let inline = [[
            {
                text: `♻️ Refresh`,
                callback_data: `refreshstats`,
            }
        ], [
            {
                text: trader ? `🔴 Disable Trader` : `🟢 Enable Trader`,
                callback_data: `trader_${trader ? "false" : "true"}`,
            }
        ]];
        return { message, inline };
    }

    /**
     * Saves message ID of last "/tickers" message
     * @type {any}
     */
    static #lastTickersMessageID = null;

    /**
    * This generates content for the orders command.
    * @returns {any}
    */
    static #getOrdersContent = () => {

        const orders = Trader.getAllOrders();
        if (orders.length > 0) {
            /**
             * @type {string}
             */
            let message = `📈 *Active Orders* - ${getDateTime()}\n\n`;
            /**
             * @type {TelegramBot.InlineKeyboardButton[][]}
             */
            let inline = [
                [
                    {
                        text: `♻️ Refresh`,
                        callback_data: `refreshorders`,
                    }
                ]
            ];
            for (const order of orders) {
                let moji = ((order.side == "short" && order.price < order.open_price) || (order.side == "long" && order.price > order.open_price)) ? "🟢" : "🔴";
                let m = `${moji} *${order.side.toUpperCase()} ${order.symbol}*\n`;
                m += `⏱️ ${getTimeElapsed(order.open_time, Date.now())} 💬 ${order.open_reason}\n`;
                m += `PnL 💰 ${Site.TK_MARGIN_COIN} ${FFF(order.gross_profit)}\n`;
                m += `ROE 💰 ${order.roi.toFixed(2)}%\n`;
                const breakEvenROE = (((order.breakeven_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                const liquidationROE = (((order.liquidation_price - order.open_price) / order.open_price) * 100) * (order.side == "long" ? 1 : -1) * order.leverage;
                /**
                 * @type {number}
                 */
                let tpROE;
                /**
                 * @type {number}
                 */
                let slROE = Math.min(Math.abs(liquidationROE), (Math.min((Site.TR_STOPLOSS_PERC_RANGE.max || 100), Math.max((Site.TR_STOPLOSS_PERC_RANGE.min || 0), (order.sl * order.leverage))))) * -1;
                if(order.manual){
                    tpROE = Site.TR_MANUAL_STOPLOSS_PERC;
                }
                else{
                    tpROE = ((order.sl * order.leverage) * Site.TR_AUTOMATIC_TP_SL_MULTIPLIER);
                }
                m += `Break Even ROE 💰 ${breakEvenROE.toFixed(2)}%\n`;
                m += `liquidation ROE 💰 ${liquidationROE.toFixed(2)}%\n`;
                m += `TPSL 💰 ${FFF(tpROE || 0)}% ${FFF(slROE || 0)}%\n`;
                m += `Peak ROE 💰 ${order.peak_roi.toFixed(2)}%\n`;
                m += `Least ROE 💰 ${order.least_roi.toFixed(2)}%\n`;
                m += `Current Price 💰 ${order.price || order.open_price}\n`;
                m += `Open Price 💰 ${order.open_price}\n`;
                m += `Break Even Price 💰 ${FFF(order.breakeven_price)}\n`;
                m += `Liquidation Price 💰 ${FFF(order.liquidation_price)}\n`;
                
                m += `\n`;
                message += m;
                inline.push([{
                    text: `Close ${order.symbol.replace(new RegExp(`${Site.TK_MARGIN_COIN}$`), "")}`,
                    callback_data: `close_${order.symbol}`,
                }]);
            }
            return { inline, message };
        }
        else {
            return {
                message: `📈 *Active Orders* - ${getDateTime()}\n\n❌ No active orders at the moment`, inline: [
                    [
                        {
                            text: `♻️ Refresh`,
                            callback_data: `refreshorders`,
                        }
                    ]
                ]
            };
        }
    }

    /**
    * This generates content for the tickers command.
    * @returns {any}
    */
    static #getTickersContent = () => {
        let message = `💲 *Tickers* - ${getDateTime()}\n\n`;
        /**
         * @type {TelegramBot.InlineKeyboardButton[][]}
         */
        let inline = []
        const tickers = TickerEngine.getAllTickers();
        for (const ticker of tickers) {
            /**
             * @type {TelegramBot.InlineKeyboardButton[]}
             */
            let arr = [
                {
                    text: `${ticker.symbol.replace(new RegExp(`${Site.TK_MARGIN_COIN}$`), "")}`,
                    callback_data: `ticker`,
                },
                {
                    text: `🗑️`,
                    callback_data: `delticker_${ticker.symbol}`,
                }
            ];
            if (!Trader.tickerHasOrder(ticker.symbol)) {
                arr.push(
                    {
                        text: `📈`,
                        callback_data: `long_${ticker.symbol}`,
                    }
                );
                arr.push({
                    text: `📉`,
                    callback_data: `short_${ticker.symbol}`,
                });
            }
            inline.push(arr);
        }
        return { message: inline.length ? message : `❌ No tickers available`, inline };
    }

    /**
     * Engine start method
     * @returns {Promise<boolean>}
     */
    static start = () => {
        return new Promise((resolve, reject) => {
            // REGISTER CALLBACKS
            Trader.sendMessage = TelegramEngine.sendMessage;
            TelegramEngine.#bot = new TelegramBot(Site.TG_TOKEN, {
                polling: Site.TG_POLLING,
                request: {
                    agentOptions: {
                        family: Site.FORCE_FAMILY_4 ? 4 : undefined,
                    }
                }
            });
            TelegramEngine.#bot.setMyCommands([
                {
                    command: "/start",
                    description: "👋"
                },
                {
                    command: "/stats",
                    description: "Status",
                },
                {
                    command: "/tickers",
                    description: "Tickers"
                },
                {
                    command: "/orders",
                    description: "Orders"
                }
            ]);
            if (!Site.TG_POLLING) {
                TelegramEngine.#bot.setWebHook(`${Site.URL}/webhook`, {
                    secret_token: Site.TG_WH_SECRET_TOKEN,
                });
            }
            TelegramEngine.#bot.on("text", async (msg) => {
                let content = (msg.text || "").trim();
                const pid = msg.chat.id || msg.from.id;
                if (pid && pid == Site.TG_CHAT_ID) {
                    if (/^\/start$/.test(content)) {
                        TelegramEngine.sendMessage(`${Site.TITLE} says hi 👋`);
                    }
                    else if (/^\/stats$/.test(content)) {
                        const { message, inline } = TelegramEngine.#getStatsContent();
                        if (message != TelegramEngine.#lastStatContent) {
                            TelegramEngine.sendMessage(message, mid => {
                                TelegramEngine.#lastStatContent = message;
                            }, {
                                parse_mode: "MarkdownV2",
                                disable_web_page_preview: true,
                                reply_markup: {
                                    inline_keyboard: inline,
                                }
                            });
                        }
                    }
                    else if (/^\/tickers$/.test(content)) {
                        TelegramEngine.#lastTickersMessageID = msg.message_id;
                        const { message, inline } = TelegramEngine.#getTickersContent();
                        TelegramEngine.sendMessage(message, mid => { }, {
                            parse_mode: "MarkdownV2",
                            disable_web_page_preview: true,
                            reply_markup: {
                                inline_keyboard: inline,
                            }
                        });
                    }
                    else if (/^\/collect$/.test(content)) {
                        try {
                            require("./analysis").sendCollected();
                        } catch (error) {
                            Log.dev(error);
                        }
                    }
                    else if (/^\/orders$/.test(content)) {
                        const { message, inline } = TelegramEngine.#getOrdersContent();
                        if (message != TelegramEngine.#lastOrdersContent) {
                            TelegramEngine.sendMessage(message, mid => {
                                TelegramEngine.#lastOrdersContent = message;
                            }, {
                                parse_mode: "MarkdownV2",
                                disable_web_page_preview: true,
                                reply_markup: {
                                    inline_keyboard: inline,
                                }
                            });
                        }
                    }
                    else if ((new RegExp(`[A-Z0-9]+${Site.TK_MARGIN_COIN}`)).test(content)) {
                        const symbols = content.split(" ").filter(x => (new RegExp(`^[A-Z0-9]+${Site.TK_MARGIN_COIN}$`)).test(x));
                        let a = 0;
                        let b = 0;
                        for (let i = 0; i < symbols.length; i++) {
                            const symbol = symbols[i];
                            const done = await TickerEngine.addTicker(symbol);
                            if (done) {
                                a++;
                            }
                            else {
                                b++;
                            }
                        }
                        if (a > 0) {
                            TelegramEngine.sendMessage(`✅ ${a} ticker${a == 1 ? "" : "s"} added`);
                        }
                        if (b > 0) {
                            TelegramEngine.sendMessage(`❌ Could not add ${b} ticker${b == 1 ? "" : "s"}`);
                        }
                    }
                    else if (/^lever=[0-9]+$/i.test(content)) {
                        try {
                            const isolated = Site.TR_MARGIN_MODE == "isolated";
                            let symbols = TickerEngine.getAllTickers().map(x => x.symbol);
                            const leverage = content.replace(/^lever=/i, "").trim();
                            /**
                             * @type {string[][]}
                             */
                            let grouped = symbols.reduce((a, _, i) => (i % (isolated ? 2 : 5) === 0 ? [...a, symbols.slice(i, i + (isolated ? 2 : 5))] : a), []);
                            for (const group of grouped) {
                                let tasks = [];
                                for (const symbol of group) {
                                    if (isolated) {
                                        tasks.push(BitgetEngine.getRestClient().setFuturesLeverage({
                                            marginCoin: Site.TK_MARGIN_COIN,
                                            symbol: symbol,
                                            productType: Site.TK_PRODUCT_TYPE,
                                            holdSide: "long",
                                            leverage: leverage,
                                        }));
                                        tasks.push(BitgetEngine.getRestClient().setFuturesLeverage({
                                            marginCoin: Site.TK_MARGIN_COIN,
                                            symbol: symbol,
                                            productType: Site.TK_PRODUCT_TYPE,
                                            holdSide: "short",
                                            leverage: leverage,
                                        }));
                                    }
                                    else {
                                        tasks.push(BitgetEngine.getRestClient().setFuturesLeverage({
                                            marginCoin: Site.TK_MARGIN_COIN,
                                            symbol: symbol,
                                            productType: Site.TK_PRODUCT_TYPE,
                                            leverage: leverage,
                                        }));
                                    }
                                }
                                let done = await Promise.all(tasks);
                                await new Promise(res => setTimeout(res, 1000));
                            }
                            if (isolated) {
                                Site.TK_LEVERAGE_LONG = leverage;
                                Site.TK_LEVERAGE_SHORT = leverage;
                            }
                            else {
                                Site.TK_LEVERAGE_CROSS = leverage;
                            }
                            TelegramEngine.sendMessage(`✅ Leverages for all tickers in current margin mode updated to ${leverage}`);
                        } catch (error) {
                            Log.dev(error);
                            if (error.body) {
                                TelegramEngine.sendMessage(`❌ Could not update leverage for registered tickers\n\n${error.body.code} - ${error.body.msg}`);
                            }
                            else {
                                TelegramEngine.sendMessage(`❌ Could not update leverage for registered tickers`);
                            }
                        }
                    }
                    else {
                        TelegramEngine.sendMessage(`😔 *${Site.TITLE}* could not understand your last message\n\nSend a ticker symbol or more e.g. "BTCUSDT ETHUSDT" to add it to tickers\n\nSend "lever=[value]" e.g. lever=20 to change leverages for all tickers in current margin mode`);
                    }
                }
            });

            TelegramEngine.#bot.on("callback_query", async (callbackQuery) => {
                const pid = callbackQuery.message.chat.id || callbackQuery.message.from.id;
                if (pid && pid == Site.TG_CHAT_ID) {
                    if (callbackQuery.data == "refreshstats") {
                        try {
                            TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id);
                            const { message, inline } = TelegramEngine.#getStatsContent();
                            if (message != TelegramEngine.#lastStatContent) {
                                const done = await TelegramEngine.#bot.editMessageText(TelegramEngine.sanitizeMessage(message), {
                                    chat_id: Site.TG_CHAT_ID,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: "MarkdownV2",
                                    disable_web_page_preview: true,
                                    reply_markup: {
                                        inline_keyboard: inline
                                    }
                                });
                                if (done) {
                                    TelegramEngine.#lastStatContent = message;
                                }
                            }
                        } catch (error) {
                            Log.dev(error);
                        }
                    }
                    if (callbackQuery.data == "refreshorders") {
                        try {
                            TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id);
                            const { message, inline } = TelegramEngine.#getOrdersContent();
                            if (message != TelegramEngine.#lastOrdersContent) {
                                const done = await TelegramEngine.#bot.editMessageText(TelegramEngine.sanitizeMessage(message), {
                                    chat_id: Site.TG_CHAT_ID,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: "MarkdownV2",
                                    disable_web_page_preview: true,
                                    reply_markup: {
                                        inline_keyboard: inline
                                    }
                                });
                                if (done) {
                                    TelegramEngine.#lastOrdersContent = message;
                                }
                            }
                        } catch (error) {
                            Log.dev(error);
                        }
                    }
                    else if (callbackQuery.data == "ticker") {
                        try {
                            TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id);
                        } catch (error) {
                            Log.dev(error);
                        }
                    }
                    else {
                        let content = callbackQuery.data || "";
                        content = content.replace(/\-/g, ".").trim().replace(/_/g, " ").trim();
                        if (content.startsWith("trader ")) {
                            let temp1 = content.split(" ");
                            let newStatus = temp1[1] == "true";
                            const newv = Trader.toggle();
                            try {
                                TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id);
                                const { message, inline } = TelegramEngine.#getStatsContent();
                                const done = await TelegramEngine.#bot.editMessageText(TelegramEngine.sanitizeMessage(message), {
                                    chat_id: Site.TG_CHAT_ID,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: "MarkdownV2",
                                    disable_web_page_preview: true,
                                    reply_markup: {
                                        inline_keyboard: inline
                                    }
                                });
                                if (done) {
                                    TelegramEngine.#lastStatContent = message;
                                }
                            } catch (error) {
                                Log.dev(error);
                            }
                        }
                        else if (content.startsWith("delticker ")) {
                            let temp1 = content.split(" ");
                            let symbol = temp1[1];
                            try {
                                const delt = await TickerEngine.deleteTicker(symbol);
                                if (delt) {
                                    const { message, inline } = TelegramEngine.#getTickersContent();
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `✅ Deleted ${symbol}`,
                                    });
                                    TelegramEngine.#bot.editMessageText(TelegramEngine.sanitizeMessage(message), {
                                        chat_id: Site.TG_CHAT_ID,
                                        message_id: callbackQuery.message.message_id,
                                        parse_mode: "MarkdownV2",
                                        disable_web_page_preview: true,
                                        reply_markup: {
                                            inline_keyboard: inline
                                        }
                                    });
                                }
                                else {
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `❌ Could not delete ${symbol}`,
                                    });
                                }
                            } catch (error) {
                                Log.dev(error);
                            }
                        }
                        else if (content.startsWith("long ")) {
                            let temp1 = content.split(" ");
                            let symbol = temp1[1];
                            try {
                                const signal = new Signal(false, true, "Manual Long", 0, Site.TR_MANUAL_STOPLOSS_PERC, 0);
                                const done = await Trader.openOrder(symbol, signal, true);
                                if (done) {
                                    if (TelegramEngine.#lastTickersMessageID) TelegramEngine.deleteMessage(TelegramEngine.#lastTickersMessageID);
                                    TelegramEngine.deleteMessage(callbackQuery.message.message_id);
                                    const { message, inline } = TelegramEngine.#getTickersContent();
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `✅ Longed ${symbol}`,
                                    });
                                }
                                else {
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `❌ Could not long ${symbol}`,
                                    });
                                }
                            } catch (error) {
                                Log.dev(error);
                            }
                        }
                        else if (content.startsWith("short ")) {
                            let temp1 = content.split(" ");
                            let symbol = temp1[1];
                            try {
                                const signal = new Signal(true, false, "Manual Short", 0, Site.TR_MANUAL_STOPLOSS_PERC, 0);
                                const done = await Trader.openOrder(symbol, signal, true);
                                if (done) {
                                    if (TelegramEngine.#lastTickersMessageID) TelegramEngine.deleteMessage(TelegramEngine.#lastTickersMessageID);
                                    TelegramEngine.deleteMessage(callbackQuery.message.message_id);
                                    const { message, inline } = TelegramEngine.#getTickersContent();
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `✅ Shorted ${symbol}`,
                                    });
                                }
                                else {
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `❌ Could not short ${symbol}`,
                                    });
                                }
                            } catch (error) {
                                Log.dev(error);
                            }
                        }
                        else if (content.startsWith("close ")) {
                            let temp1 = content.split(" ");
                            let symbol = temp1[1];
                            try {
                                const done = await Trader.closeOrder(symbol, true);
                                if (done) {
                                    let { message, inline } = TelegramEngine.#getOrdersContent();
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `✅ Closed ${symbol}`,
                                    });
                                    TelegramEngine.#bot.editMessageText(TelegramEngine.sanitizeMessage(message), {
                                        chat_id: Site.TG_CHAT_ID,
                                        message_id: callbackQuery.message.message_id,
                                        parse_mode: "MarkdownV2",
                                        disable_web_page_preview: true,
                                        reply_markup: {
                                            inline_keyboard: inline.filter(x => !x[0].text.includes(symbol.replace(new RegExp(`${Site.TK_MARGIN_COIN}$`), ""))),
                                        }
                                    });
                                }
                                else {
                                    TelegramEngine.#bot.answerCallbackQuery(callbackQuery.id, {
                                        text: `❌ Could not close ${symbol}`,
                                    });
                                }
                            } catch (error) {
                                Log.dev(error);
                            }
                        }
                    }
                }
            });

            TelegramEngine.#bot.on("polling_error", (err) => {
                // Log.dev(err);
                Log.flow(`Telegram > Polling error.`, 3);
            });
            TelegramEngine.#bot.on("webhook_error", (err) => {
                // Log.dev(err);
                Log.flow(`Telegram > Webhook error.`, 3);
            });

            Log.flow(`Telegram > Initialized.`, 0);
            resolve(true);
        })
    }

    /**
         * Sends string as a text file.
         * @param {string} content 
         * @param {string} caption 
         * @param {string} filename 
         * @returns {Promise<boolean>}
         */
    static sendStringAsTxtFile = (content, caption, filename) => {
        return new Promise((resolve, reject) => {
            TelegramEngine.#bot.sendDocument(Site.TG_CHAT_ID, Buffer.from(content, "utf8"), {
                parse_mode: "MarkdownV2",
                caption: TelegramEngine.sanitizeMessage(caption),
            }, {
                contentType: "text/plain",
                filename: filename,
            }).then(r => {
                resolve(true);
            }).catch(err => {
                Log.dev(err);
                resolve(false);
            });
        })

    }

    /**
     * Sends string as a JSON file.
     * @param {string} content 
     * @param {string} caption 
     * @param {string} filename 
     * @returns {Promise<boolean>}
     */
    static sendStringAsJSONFile = (content, caption, filename) => {
        return new Promise((resolve, reject) => {
            TelegramEngine.#bot.sendDocument(Site.TG_CHAT_ID, Buffer.from(content, "utf8"), {
                parse_mode: "MarkdownV2",
                caption: TelegramEngine.sanitizeMessage(caption),
            }, {
                contentType: "application/json",
                filename: filename,
            }).then(r => {
                resolve(true);
            }).catch(err => {
                Log.dev(err);
                resolve(false);
            });
        })
    }

    static #messageQueue = [];
    static #processing = false;
    static #WINDOW_DURATION = 1000;
    static #windowStart = Date.now();
    static #globalCount = 0;
    static #chatCounts = {};

    static sendWarning = (warning) => {
        TelegramEngine.sendMessage(`🚨 *Warning*\n\n${warning}`);
    }

    /**
     * Sends message to user.
     * @param {string} message 
     * @param {(data: string|null) => void} callback
     * @param {TelegramBot.SendMessageOptions} opts
     * @param {boolean} isTemp
     * 
     */
    static sendMessage = (message, callback = () => { }, opts = {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
    }, isTemp = false,) => {
        TelegramEngine.#messageQueue.push({
            message,
            callback,
            opts,
            isTemp,
        });

        if (!TelegramEngine.#processing) {
            TelegramEngine.#processQueue();
        }
    }

    /**
     * @param {any} messageId 
     */
    static deleteMessage = (messageId) => {
        return new Promise((resolve, reject) => {
            TelegramEngine.#bot.deleteMessage(Site.TG_CHAT_ID, messageId).then(() => {
                resolve(true);
            }
            ).catch(err => {
                Log.dev(err);
                resolve(false);
            }
            );
        })
    }

    static #processQueue = async () => {
        TelegramEngine.#processing = true;

        while (TelegramEngine.#messageQueue.length > 0) {
            const now = Date.now();

            // Reset the counters if the window has passed
            if (now - TelegramEngine.#windowStart >= TelegramEngine.#WINDOW_DURATION) {
                TelegramEngine.#windowStart = now;
                TelegramEngine.#globalCount = 0;
                TelegramEngine.#chatCounts = {};
            }

            let sentAny = false;
            // Use  variable to track the minimal wait time needed for any blocked message
            let nextDelay = TelegramEngine.#WINDOW_DURATION;

            // Iterate through the queue and process eligible messages
            for (let i = 0; i < TelegramEngine.#messageQueue.length; i++) {
                const msg = TelegramEngine.#messageQueue[i];
                const chatCount = TelegramEngine.#chatCounts[msg.chatId] || 0;
                const globalLimitReached = TelegramEngine.#globalCount >= Site.MAX_MESSAGE_PER_SECOND;
                const chatLimitReached = chatCount >= Site.MAX_MESSAGE_PER_SECOND_PER_CHAT;

                // If sending this message does not exceed limits, send it immediately
                if (!globalLimitReached && !chatLimitReached) {
                    TelegramEngine.#globalCount++;
                    TelegramEngine.#chatCounts[msg.chatId] = chatCount + 1;
                    // Remove message from the queue and send it
                    TelegramEngine.#messageQueue.splice(i, 1);
                    // Adjust index due to removal
                    i--;
                    TelegramEngine.#sendIndividualMessage(msg);
                    sentAny = true;
                }
                else {
                    // Determine the delay required for either global or per-chat counter to reset
                    let globalDelay = globalLimitReached ? TelegramEngine.#WINDOW_DURATION - (now - TelegramEngine.#windowStart) : 0;
                    let chatDelay = chatLimitReached ? TelegramEngine.#WINDOW_DURATION - (now - TelegramEngine.#windowStart) : 0;
                    // The message will be eligible after the maximum of these two delays
                    const delayForMsg = Math.max(globalDelay, chatDelay);
                    // Save the minimal delay needed among all blocked messages
                    if (delayForMsg < nextDelay) {
                        nextDelay = delayForMsg;
                    }
                }
            }

            // if no messages were sent in this pass, wait for the minimal  required delay
            if (!sentAny) {
                await new Promise(resolve => setTimeout(resolve, nextDelay));
            }
        }

        TelegramEngine.#processing = false;
    }

    /**
     * Sanitize for markdown v2
     * @param {string} txt 
     * @returns {string}
     */
    static sanitizeMessage = (txt) => txt.replace(/([~>#\+\-=\|{}\.!])/g, '\\$&');

    static #lastMessageID = null;
    static #lastTokenMessageID = null

    static #sendIndividualMessage = (msg) => {
        const { callback, message, opts, isTemp } = msg;
        TelegramEngine.#bot.sendMessage(Site.TG_CHAT_ID, TelegramEngine.sanitizeMessage(message), opts).then((mess) => {
            Log.flow(`Telegram > Sent text.`, 3);
            if (!isTemp) {
                TelegramEngine.#lastMessageID = mess.message_id;
            }
            callback(mess.message_id);
        }).catch(err => {
            Log.dev(err);
            Log.flow(`Telegram > Error sending text.`, 3);
            callback(null);
        });
    }
}

module.exports = TelegramEngine;