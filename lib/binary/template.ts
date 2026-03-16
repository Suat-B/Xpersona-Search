import type { BinaryBuildRequest, BinaryManifest, BinaryTargetEnvironment } from "@/lib/binary/contracts";

export type BinaryWorkspaceSpec = {
  packageName: string;
  displayName: string;
  description: string;
  targetEnvironment: BinaryTargetEnvironment;
  sourceFiles: Record<string, string>;
  manifestBase: Omit<
    BinaryManifest,
    "buildId" | "createdAt" | "sourceFiles" | "outputFiles" | "warnings"
  >;
  warnings: string[];
};

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function titleize(value: string): string {
  return String(value || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildImplementationHint(intent: string): string {
  const normalized = intent.toLowerCase();
  if (normalized.includes("webhook")) {
    return "Expose a POST /webhook endpoint and a GET /health route.";
  }
  if (normalized.includes("api") || normalized.includes("endpoint")) {
    return "Expose a GET /api route and a GET /health route.";
  }
  if (normalized.includes("worker")) {
    return "Run a lightweight interval worker and expose a GET /health route.";
  }
  return "Expose a GET / route and a GET /health route.";
}

function buildSourceIndex(input: {
  intent: string;
  displayName: string;
  targetEnvironment: BinaryTargetEnvironment;
}): string {
  const normalizedIntent = compactWhitespace(input.intent);
  const implementationHint = buildImplementationHint(input.intent);
  const includeWebhook = /webhook/i.test(normalizedIntent);
  const includeApi = !includeWebhook && /(api|endpoint)/i.test(normalizedIntent);
  const includeWorker = !includeWebhook && !includeApi && /worker/i.test(normalizedIntent);
  const routeBody = includeWebhook
    ? `if (req.method === "POST" && req.url === "/webhook") {
    const body = await readBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, received: body.length, intent: buildIntentSummary() }));
    return;
  }`
    : includeApi
      ? `if (req.method === "GET" && req.url === "/api") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, intent: buildIntentSummary(), runtime: process.version }));
    return;
  }`
      : "";

  const workerBlock = includeWorker
    ? `
setInterval(() => {
  console.log("[binary-worker] heartbeat", new Date().toISOString());
}, 30_000).unref();
`
    : "";

  return `import { createServer, IncomingMessage } from "node:http";

const port = Number(process.env.PORT || 3000);

function buildIntentSummary(): string {
  return ${JSON.stringify(normalizedIntent)};
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
    res.end(JSON.stringify({ ok: true, service: ${JSON.stringify(input.displayName)} }));
    return;
  }

  ${routeBody}

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: ${JSON.stringify(input.displayName)},
        intent: buildIntentSummary(),
        runtime: ${JSON.stringify(input.targetEnvironment.runtime)},
        implementationHint: ${JSON.stringify(implementationHint)},
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

${workerBlock}

server.listen(port, () => {
  console.log(\`[binary-ide] ${input.displayName} listening on port \${port}\`);
  console.log(\`[binary-ide] intent: \${buildIntentSummary()}\`);
});
`;
}

export function synthesizeBinaryWorkspaceSpec(request: BinaryBuildRequest): BinaryWorkspaceSpec {
  const compactIntent = compactWhitespace(request.intent);
  const slug = slugify(compactIntent) || "binary-package";
  const packageName = `binary-${slug}`;
  const displayName = titleize(slug) || "Binary Package";
  const description = compactIntent.slice(0, 160) || "Portable Binary IDE starter bundle";
  const sourceFiles: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: packageName,
        version: "0.1.0",
        private: true,
        type: "module",
        description,
        scripts: {
          build: "tsc -p tsconfig.json",
          start: "node dist/index.js",
        },
        devDependencies: {
          "@types/node": "^22.0.0",
          typescript: "^5.0.0",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          types: ["node"],
        },
        include: ["src/**/*"],
      },
      null,
      2
    ),
    "src/index.ts": buildSourceIndex({
      intent: compactIntent,
      displayName,
      targetEnvironment: request.targetEnvironment,
    }),
    "README.md": `# ${displayName}

Generated by Binary IDE as a portable \`package_bundle\` starter bundle.

## Intent

${compactIntent}

## Run

\`\`\`bash
npm install
npm run build
npm start
\`\`\`

## Runtime

- Runtime: ${request.targetEnvironment.runtime}
- Platform: ${request.targetEnvironment.platform}
- Package manager: ${request.targetEnvironment.packageManager}
`,
  };

  return {
    packageName,
    displayName,
    description,
    targetEnvironment: request.targetEnvironment,
    sourceFiles,
    manifestBase: {
      artifactKind: "package_bundle",
      name: packageName,
      displayName,
      description,
      intent: compactIntent,
      runtime: request.targetEnvironment.runtime,
      platform: request.targetEnvironment.platform,
      packageManager: request.targetEnvironment.packageManager,
      entrypoint: "dist/index.js",
      installCommand: "npm install",
      buildCommand: "npm run build",
      startCommand: "npm start",
    },
    warnings: compactIntent.length < 20 ? ["The intent is short, so the generated scaffold may need refinement."] : [],
  };
}
