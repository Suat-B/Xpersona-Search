"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIntentSummary = buildIntentSummary;
exports.describeWorkspaceContext = describeWorkspaceContext;
exports.health = health;
exports.routeIndex = routeIndex;
exports.routeRequest = routeRequest;
exports.startServer = startServer;
const node_http_1 = require("node:http");
const port = Number(process.env.PORT || 3000);
function buildIntentSummary() {
    return "Make me a small customer support dashboard with a login screen, ticket list, and search.";
}
function describeWorkspaceContext() {
    return {
        targetPath: "src/index.ts",
        preferredTargetPath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
        context: "Active file: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Preferred target: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Mentioned paths: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Open files: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine.",
    };
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8");
}
async function health() {
    return {
        ok: true,
        service: "Make Me A Small Customer Support Dashboa",
        intent: buildIntentSummary(),
        runtime: "node18",
    };
}
async function routeIndex() {
    return {
        ok: true,
        service: "Make Me A Small Customer Support Dashboa",
        intent: buildIntentSummary(),
        runtime: "node18",
        implementationHint: "Expose a GET / route and a GET /health route.",
        workspaceContext: describeWorkspaceContext(),
    };
}
async function routeRequest(req) {
    if (req.method === "GET" && req.url === "/health") {
        return { statusCode: 200, body: await health() };
    }
    if (req.method === "GET" && req.url === "/") {
        return { statusCode: 200, body: await routeIndex() };
    }
    return {
        statusCode: 404,
        body: { ok: false, error: "Not found", workspaceContext: describeWorkspaceContext() },
    };
}
async function startServer() {
    const server = (0, node_http_1.createServer)(async (req, res) => {
        const response = await routeRequest(req);
        res.writeHead(response.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response.body));
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
            console.log(`[binary-ide] Make Me A Small Customer Support Dashboa listening on port ${port}`);
            console.log(`[binary-ide] intent: ${buildIntentSummary()}`);
            resolve(`listening:${port}`);
        });
    });
}
if (typeof require !== "undefined" && require.main === module) {
    void startServer().catch((error) => {
        console.error("[binary-ide] startup failed", error);
        process.exitCode = 1;
    });
}
