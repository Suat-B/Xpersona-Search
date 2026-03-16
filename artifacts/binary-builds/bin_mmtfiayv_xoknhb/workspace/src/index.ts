import { createServer, IncomingMessage } from "node:http";

const port = Number(process.env.PORT || 3000);

function buildIntentSummary(): string {
  return "Hello I want to create a trailing stop loss <3";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "Hello I Want To Create A Trailing Stop L" }));
    return;
  }

  

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "Hello I Want To Create A Trailing Stop L",
        intent: buildIntentSummary(),
        runtime: "node18",
        implementationHint: "Expose a GET / route and a GET /health route.",
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});



server.listen(port, () => {
  console.log(`[binary-ide] Hello I Want To Create A Trailing Stop L listening on port ${port}`);
  console.log(`[binary-ide] intent: ${buildIntentSummary()}`);
});
