import { createServer } from "node:http";
const port = Number(process.env.PORT || 3000);
function buildIntentSummary() {
    return "Create a trailing stop loss";
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8");
}
const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "Create A Trailing Stop Loss" }));
        return;
    }
    if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            service: "Create A Trailing Stop Loss",
            intent: buildIntentSummary(),
            runtime: "node20",
            implementationHint: "Expose a GET / route and a GET /health route.",
        }));
        return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
});
server.listen(port, () => {
    console.log(`[binary-ide] Create A Trailing Stop Loss listening on port ${port}`);
    console.log(`[binary-ide] intent: ${buildIntentSummary()}`);
});
