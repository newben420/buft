const Groq = require("groq-sdk");
const { GRes, Res } = require("../lib/res");
const Site = require("../site");
const Log = require("../lib/log");
const { UUIDHelper } = require("../lib/uuid_helper");

const models = {
    "allam-2-7b": { RPM: 30, RPD: 7000, TPM: 6000 },
    "compound-beta": { RPM: 15, RPD: 200, TPM: 70000 },
    "compound-beta-mini": { RPM: 15, RPD: 200, TPM: 70000 },
    "deepseek-r1-distill-llama-70b": { RPM: 30, RPD: 1000, TPM: 6000 },
    "gemma2-9b-it": { RPM: 30, RPD: 14400, TPM: 15000, TPD: 500000 },
    "llama-3.1-8b-instant": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "llama-3.3-70b-versatile": { RPM: 30, RPD: 1000, TPM: 12000, TPD: 100000 },
    "llama3-70b-8192": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "llama3-8b-8192": { RPM: 30, RPD: 14400, TPM: 6000, TPD: 500000 },
    "meta-llama/llama-4-maverick-17b-128e-instruct": { RPM: 30, RPD: 1000, TPM: 6000 },
    "meta-llama/llama-4-scout-17b-16e-instruct": { RPM: 30, RPD: 1000, TPM: 30000 },
    "meta-llama/llama-guard-4-12b": { RPM: 30, RPD: 14400, TPM: 15000 },
    "meta-llama/llama-prompt-guard-2-22m": { RPM: 30, RPD: 14400, TPM: 15000 },
    "meta-llama/llama-prompt-guard-2-86m": { RPM: 30, RPD: 14400, TPM: 15000 },
    "mistral-saba-24b": { RPM: 30, RPD: 1000, TPM: 6000, TPD: 500000 },
    "qwen-qwq-32b": { RPM: 30, RPD: 1000, TPM: 6000 },
    "qwen/qwen3-32b": { RPM: 60, RPD: 1000, TPM: 6000 },
    "openai/gpt-oss-120b": { RPM: 30, RPD: 1000, TPM: 8000, TPD: 200000 },
    "openai/gpt-oss-20b": { RPM: 30, RPD: 1000, TPM: 8000, TPD: 200000 },
    "moonshotai/kimi-k2-instruct": {RPM: 60, RPD: 1000, TPM: 10000, TPD: 300000},
    "moonshotai/kimi-k2-instruct-0905": {RPM: 60, RPD: 1000, TPM: 10000, TPD: 300000},
};

class GroqEngine {
    static activeModels = Site.GROQ_MODELS
        .filter(x => Object.keys(models).includes(x))
        .map(name => ({
            name,
            currMin: Date.now(),
            currDay: Date.now(),
            useDay: 0,
            useMin: 0,
            useDayTok: 0,
            useMinTok: 0
        }));

    static queue = [];
    static isRunning = false;

    static client = {};

    /**
     * Starts the engine
     * @returns {Promise<boolean>}
     */
    static start = () => new Promise((resolve, reject) => {
        if(Site.GROQ_USE){
            GroqEngine.client = new Groq({
                apiKey: Site.GROQ_KEY,
                maxRetries: Site.GROQ_MAX_RETRIES,
                timeout: Site.GROQ_HTTP_TIMEOUT_MS
            });
        }
        resolve(true);
    });

    static request(req) {
        const id = UUIDHelper.generate();
        const instReq = {
            messages: req.messages,
            callback: req.callback,
            timeout: Site.GROQ_REQUEST_TIMEOUT_MS < Infinity
                ? setTimeout(() => {
                    const i = GroqEngine.queue.findIndex(x => x.id === id);
                    if (i >= 0 && !GroqEngine.queue[i].completed) {
                        GroqEngine.queue[i].callback(GRes.err("API.AI_TIMEOUT", { tr: true }));
                        GroqEngine.queue[i].callback = () => { };
                        GroqEngine.queue[i].completed = true;
                        GroqEngine.queue.splice(i, 1);
                    }
                }, Site.GROQ_REQUEST_TIMEOUT_MS)
                : null,
            preferredModels: req.preferredModels || [],
            id,
            priority: req.priority ?? Number.MAX_SAFE_INTEGER
        };

        const index = GroqEngine.queue.findIndex(x => x.priority > instReq.priority);
        if (index < 0) {
            GroqEngine.queue.push(instReq);
        } else {
            GroqEngine.queue.splice(index, 0, instReq);
        }
        GroqEngine.run();
    }

    static async run() {
        if (GroqEngine.isRunning) return;
        GroqEngine.isRunning = true;
        let backoff = 200;
        let noModelAvailable = false;

        while (GroqEngine.queue.length > 0) {
            let processedOne = false;

            for (let i = 0; i < GroqEngine.queue.length; i++) {
                const req = GroqEngine.queue[i];
                const now = Date.now();

                const candidates = (req.preferredModels.length > 0
                    ? GroqEngine.activeModels.filter(m => req.preferredModels.includes(m.name))
                    : GroqEngine.activeModels
                ).filter(m => {
                    const def = models[m.name];

                    if (now - m.currMin >= 60000) {
                        m.currMin = now;
                        m.useMin = 0;
                        m.useMinTok = 0;
                    }

                    if (now - m.currDay >= 86400000) {
                        m.currDay = now;
                        m.useDay = 0;
                        m.useDayTok = 0;
                    }

                    return m.useMin < def.RPM &&
                        m.useDay < def.RPD &&
                        m.useMinTok < (def.TPM || Infinity) &&
                        m.useDayTok < (def.TPD || Infinity);
                });

                if (candidates.length === 0) {
                    if (!noModelAvailable) {
                        Log.flow("GroqEngine > No models currently available due to rate/token limits", 2);
                        noModelAvailable = true;
                    }
                    continue;
                }

                const selected = candidates.sort(
                    (a, b) => (a.useMin + a.useDay) - (b.useMin + b.useDay)
                )[0];

                Log.flow(`GroqEngine > Selected model is ${selected.name}`, 2);

                const response = await GroqEngine.send(selected.name, req.messages);

                if (!req.completed) {
                    if (response.succ) {
                        req.callback(GRes.succ(response.message));
                    } else {
                        req.callback(response);
                    }
                }

                req.completed = true;
                if (req.timeout) {
                    clearTimeout(req.timeout);
                    req.timeout = null;
                }

                if (response.extra?.tt) {
                    selected.useMinTok += response.extra.tt;
                    selected.useDayTok += response.extra.tt;
                }

                selected.useMin++;
                selected.useDay++;
                GroqEngine.queue.splice(i, 1);
                i--;
                processedOne = true;

                Log.flow(`GroqEngine > Usage for ${selected.name}: ${selected.useMin}/${models[selected.name].RPM} RPM, ${selected.useMinTok}/${models[selected.name].TPM ?? "∞"} TPM`, 2);
            }

            if (!processedOne) {
                backoff = Math.min(backoff * 2, 2000);
                await GroqEngine.sleep(backoff);
            }
        }

        GroqEngine.isRunning = false;
    }

    static async flush() {
        while (GroqEngine.queue.length > 0 || GroqEngine.isRunning) {
            await GroqEngine.sleep(100);
        }
    }

    static shutdown() {
        return new Promise(async (resolve) => {
            await GroqEngine.flush();
            resolve(true);
        });
    }

    static send(model, messages) {
        return new Promise(async (resolve) => {
            try {
                const chatCompletion = await GroqEngine.client.chat.completions.create({
                    messages,
                    model,
                    temperature: 0.2,
                    max_completion_tokens: 1024,
                });
                const totalTokens = chatCompletion.usage?.total_tokens || 0;
                const r = chatCompletion.choices.map(x => x.message.content).join("\n").replace(/[\n]{3,}/g, "\n\n");
                resolve(GRes.succ(r, { tt: totalTokens }));
            } catch (err) {
                Log.dev(err, err.message);
                if (err instanceof Groq.APIError) {
                    resolve(GRes.err("API.GROQ_ERROR", { tr: true, reason: err.message || err.name || err.status }));
                } else {
                    resolve(GRes.err("API.GROQ_ERROR", { tr: true, reason: err.message || err }));
                }
            }
        });
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { GroqEngine };
