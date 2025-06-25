const https = require('https');
const Site = require("./site");
if (Site.FORCE_FAMILY_4) {
    https.globalAgent.options.family = 4;
}
const express = require('express');
const app = express();
const startEngine = require("./engine/start");
const stopEngine = require("./engine/stop");
const Log = require('./lib/log');
const server = require('http').createServer(app);
const bodyParser = require("body-parser");
const getDateTime = require('./lib/get_date_time');
const TelegramEngine = require('./engine/telegram');

app.disable("x-powered-by");
app.disable('etag');
app.use(bodyParser.json({ limit: "35mb" }));
app.use(
    bodyParser.urlencoded({
        extended: true,
        limit: "45mb",
        parameterLimit: 50000,
    })
);

const startTime = getDateTime(Date.now());
app.get("/", (req, res) => {
    res.type("txt").send(`${Site.TITLE} running since ${startTime} ${process.env.TZ || "UTC"}`);
});

app.post("/webhook", (req, res) => {
    const receivedToken = req.headers["x-telegram-bot-api-secret-token"];
    if (receivedToken != Site.TG_WH_SECRET_TOKEN) {
        res.sendStatus(403);
        return;
    }
    TelegramEngine.processWebHook(req.body);
    res.sendStatus(200);
});

app.use((req, res, next) => {
    res.sendStatus(404);
});

app.use((err, req, res, next) => {
    Log.dev(err);
    res.sendStatus(500);
});

process.on('exit', async (code) => {
    // NOTHING FOR NOW
});

process.on('SIGINT', async () => {
    Log.flow('Process > Received SIGINT.', 0);
    const l = await stopEngine();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    Log.flow('Process > Received SIGTERM.', 0);
    const l = await stopEngine();
    process.exit(0);
});

process.on('uncaughtException', async (err) => {
    Log.flow('Process > Unhandled exception caught.');
    console.log(err);
    if (Site.EXIT_ON_UNCAUGHT_EXCEPTION) {
        const l = await stopEngine();
        process.exit(0);
    }
});

process.on('unhandledRejection', async (err, promise) => {
    Log.flow('Process > Unhandled rejection caught.');
    console.log("Promise:", promise);
    console.log("Reason:", err);
    if (Site.EXIT_ON_UNHANDLED_REJECTION) {
        const l = await stopEngine();
        process.exit(0);
    }
});

startEngine().then(started => {
    Log.flow(`${Site.TITLE} > ${started ? `Started successfully.` : `Failed to start.`}`);
    if (started) {
        server.listen(Site.PORT, () => {
            Log.flow(`${Site.TITLE} > ${Site.URL}`);
            if (Site.TG_SEND_START) {
                setTimeout(() => {
                    TelegramEngine.sendMessage(`🚀 *${Site.TITLE}* has woken up`);
                }, 1000);
            }
        });
    }
    else {
        process.exit(0);
    }
}).catch(err => {
    console.log("Start Error", err);
    process.exit(0);
});
