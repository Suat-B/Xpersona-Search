import { createServer, IncomingMessage } from "node:http";

const port = Number(process.env.PORT || 3000);

export function buildIntentSummary(): string {
  return "Make me a small customer support dashboard with a login screen, ticket list, and search.";
}

export function describeWorkspaceContext() {
  return {
    targetPath: "src/index.ts",
    preferredTargetPath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    context: "Active file: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Preferred target: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Mentioned paths: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine. Open files: trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine.",
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function health() {
  return {
    ok: true,
    service: "Make Me A Small Customer Support Dashboa",
    intent: buildIntentSummary(),
    runtime: "node18",
  };
}

export async function routeIndex() {
  return {
    ok: true,
    service: "Make Me A Small Customer Support Dashboa",
    intent: buildIntentSummary(),
    runtime: "node18",
    implementationHint: "Expose a GET / route and a GET /health route.",
    workspaceContext: describeWorkspaceContext(),
  };
}





export async function routeRequest(req: IncomingMessage) {
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

export async function startServer() {
  const server = createServer(async (req, res) => {
    const response = await routeRequest(req);
    res.writeHead(response.statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response.body));
  });

  return new Promise<string>((resolve, reject) => {
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
