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

app.disable("x-powered-by");
app.disable('etag');
app.use(bodyParser.json({ limit: "35mb" }));
app.use(
    bodyParser.urlencoded({
        extended: true,
        limit: "35mb",
        parameterLimit: 50000,
    })
);

const startTime = getDateTime(Date.now());
app.get("/", (req, res) => {
    res.type("txt").send(`${Site.TITLE} running since ${startTime} UTC`);
});

app.use((req, res, next) => {
    res.sendStatus(404);
});

app.use((err, req, res, next) => {
    Log.dev(err);
    res.sendStatus(500);
});

process.on('exit', async (code) => {
    const l = await stopEngine();
    // TODO - SEND UI NOTIFICATIONS ON EXIT
});

process.on('SIGINT', async () => {
    Log.flow('Process > Received SIGINT.', 0);
    process.exit(0);
});

process.on('SIGTERM', async () => {
    Log.flow('Process > Received SIGTERM.', 0);
    process.exit(0);
});

process.on('uncaughtException', async (err) => {
    Log.flow('Process > Unhandled exception caught.');
    console.log(err);
    if (Site.EXIT_ON_UNCAUGHT_EXCEPTION) {
        process.exit(0);
    }
});

process.on('unhandledRejection', async (err, promise) => {
    Log.flow('Process > Unhandled rejection caught.');
    console.log("Promise:", promise);
    console.log("Reason:", err);
    if (Site.EXIT_ON_UNHANDLED_REJECTION) {
        process.exit(0);
    }
});

startEngine().then(started => {
    Log.flow(`${Site.TITLE} > ${started ? `Started successfully.` : `Failed to start.`}`);
    if (started) {
        server.listen(Site.PORT, () => {
            Log.flow(`${Site.TITLE} > ${Site.URL}`);
            // TODO - SEND UI NOTIFICATIONS ON START
        });
    }
    else {
        process.exit(0);
    }
}).catch(err => {
    console.log("Start Error", err);
    process.exit(0);
});