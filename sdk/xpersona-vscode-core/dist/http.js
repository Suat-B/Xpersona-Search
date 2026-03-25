"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestJson = requestJson;
exports.streamJsonEvents = streamJsonEvents;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
function buildHeaders(auth, hasBody) {
    const headers = {};
    if (hasBody)
        headers["Content-Type"] = "application/json";
    if (auth?.bearer)
        headers.Authorization = `Bearer ${auth.bearer}`;
    else if (auth?.apiKey)
        headers["X-API-Key"] = auth.apiKey;
    return headers;
}
function parseJsonOrText(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return {};
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return trimmed;
    }
}
async function requestJson(method, url, auth, body, options) {
    const target = new url_1.URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
            reject(new Error("Request aborted"));
            return;
        }
        const req = transport.request(target, {
            method,
            headers: buildHeaders(auth, payload !== null),
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                if ((res.statusCode || 500) >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${raw || res.statusMessage || "request failed"}`));
                    return;
                }
                resolve(parseJsonOrText(raw));
            });
        });
        req.on("error", reject);
        if (options?.signal) {
            const onAbort = () => {
                req.destroy(new Error("Request aborted"));
            };
            options.signal.addEventListener("abort", onAbort, { once: true });
            req.on("close", () => options.signal?.removeEventListener("abort", onAbort));
        }
        if (payload !== null)
            req.write(payload);
        req.end();
    });
}
async function streamJsonEvents(method, url, auth, body, onEvent, options) {
    const target = new url_1.URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
            reject(new Error("Request aborted"));
            return;
        }
        let settled = false;
        const finish = (err) => {
            if (settled)
                return;
            settled = true;
            if (err)
                reject(err);
            else
                resolve();
        };
        let incoming = null;
        let req;
        const abortInFlight = () => {
            try {
                incoming?.destroy();
            }
            catch {
                /* ignore */
            }
            try {
                req.destroy(new Error("Request aborted"));
            }
            catch {
                /* ignore */
            }
        };
        req = transport.request(target, {
            method,
            headers: {
                ...buildHeaders(auth, true),
                Accept: "text/event-stream",
                "Cache-Control": "no-cache",
            },
        }, (res) => {
            incoming = res;
            if ((res.statusCode || 500) >= 400) {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on("end", () => {
                    finish(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8")}`));
                });
                return;
            }
            let buffer = "";
            /** One in-flight parse chain so concurrent `data` events cannot race on `buffer`. */
            let parseChain = Promise.resolve();
            const flushChunk = async (rawChunk) => {
                if (options?.signal?.aborted) {
                    abortInFlight();
                    throw new Error("Request aborted");
                }
                const lines = rawChunk
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart());
                if (lines.length === 0)
                    return;
                const rawData = lines.join("\n").trim();
                if (!rawData || rawData === "[DONE]")
                    return;
                let parsed = rawData;
                try {
                    parsed = JSON.parse(rawData);
                }
                catch {
                    parsed = rawData;
                }
                if (parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed) &&
                    typeof parsed.event === "string") {
                    await onEvent(String(parsed.event), parsed.data);
                    return;
                }
                await onEvent("message", parsed);
            };
            const drainBuffer = async () => {
                let boundary = buffer.indexOf("\n\n");
                while (boundary >= 0) {
                    const rawChunk = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    await flushChunk(rawChunk);
                    if (options?.signal?.aborted) {
                        abortInFlight();
                        throw new Error("Request aborted");
                    }
                    boundary = buffer.indexOf("\n\n");
                }
            };
            res.on("data", (chunk) => {
                if (settled)
                    return;
                if (options?.signal?.aborted) {
                    abortInFlight();
                    finish(new Error("Request aborted"));
                    return;
                }
                buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
                parseChain = parseChain
                    .then(() => drainBuffer())
                    .catch((e) => {
                    if (settled)
                        return;
                    const err = e instanceof Error ? e : new Error(String(e));
                    if (err.message === "Request aborted" || options?.signal?.aborted) {
                        finish(new Error("Request aborted"));
                    }
                    else {
                        finish(err);
                    }
                });
            });
            res.on("end", () => {
                if (settled)
                    return;
                if (options?.signal?.aborted) {
                    finish(new Error("Request aborted"));
                    return;
                }
                parseChain = parseChain
                    .then(async () => {
                    if (options?.signal?.aborted) {
                        throw new Error("Request aborted");
                    }
                    if (buffer.trim())
                        await flushChunk(buffer);
                })
                    .then(() => {
                    if (settled)
                        return;
                    if (options?.signal?.aborted) {
                        finish(new Error("Request aborted"));
                    }
                    else {
                        finish();
                    }
                })
                    .catch((e) => {
                    if (settled)
                        return;
                    const err = e instanceof Error ? e : new Error(String(e));
                    finish(err);
                });
            });
        });
        if (options?.signal) {
            const onAbort = () => {
                if (settled)
                    return;
                abortInFlight();
                finish(new Error("Request aborted"));
            };
            if (options.signal.aborted) {
                onAbort();
                return;
            }
            options.signal.addEventListener("abort", onAbort, { once: true });
            req.on("close", () => options.signal?.removeEventListener("abort", onAbort));
        }
        req.on("error", (e) => {
            if (!settled)
                finish(e instanceof Error ? e : new Error(String(e)));
        });
        req.write(payload);
        req.end();
    });
}
