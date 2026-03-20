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

function sanitizeWorkspaceCodePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  if (!/\.(?:ts|tsx|js|jsx)$/i.test(normalized)) return null;
  return normalized;
}

function chooseTargetSourcePath(request: BinaryBuildRequest): string {
  const candidates = [
    request.retrievalHints?.preferredTargetPath,
    request.context?.activeFile?.path,
    ...(request.retrievalHints?.mentionedPaths || []),
    ...(request.retrievalHints?.recentTouchedPaths || []),
    ...(request.context?.openFiles?.map((file) => file.path) || []),
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeWorkspaceCodePath(candidate);
    if (sanitized) return sanitized;
  }

  return "src/index.ts";
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
  targetPath: string;
  contextSummary: string;
  preferredTargetPath?: string;
}): string {
  const normalizedIntent = compactWhitespace(input.intent);
  const implementationHint = buildImplementationHint(input.intent);
  const includeWebhook = /webhook/i.test(normalizedIntent);
  const includeApi = !includeWebhook && /(api|endpoint)/i.test(normalizedIntent);
  const includeWorker = !includeWebhook && !includeApi && /worker/i.test(normalizedIntent);
  const workerBlock = includeWorker
    ? `
let workerTimer: NodeJS.Timeout | null = null;
`
    : "";

  return `import { createServer, IncomingMessage } from "node:http";

const port = Number(process.env.PORT || 3000);

export function buildIntentSummary(): string {
  return ${JSON.stringify(normalizedIntent)};
}

export function describeWorkspaceContext() {
  return {
    targetPath: ${JSON.stringify(input.targetPath)},
    preferredTargetPath: ${JSON.stringify(input.preferredTargetPath || "")},
    context: ${JSON.stringify(input.contextSummary)},
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
    service: ${JSON.stringify(input.displayName)},
    intent: buildIntentSummary(),
    runtime: ${JSON.stringify(input.targetEnvironment.runtime)},
  };
}

export async function routeIndex() {
  return {
    ok: true,
    service: ${JSON.stringify(input.displayName)},
    intent: buildIntentSummary(),
    runtime: ${JSON.stringify(input.targetEnvironment.runtime)},
    implementationHint: ${JSON.stringify(implementationHint)},
    workspaceContext: describeWorkspaceContext(),
  };
}

${includeWebhook ? `export async function handleWebhook(rawBody: string) {
  return {
    ok: true,
    received: rawBody.length,
    intent: buildIntentSummary(),
    workspaceContext: describeWorkspaceContext(),
  };
}
` : ""}
${includeApi ? `export async function getApiSnapshot() {
  return {
    ok: true,
    intent: buildIntentSummary(),
    runtime: process.version,
    workspaceContext: describeWorkspaceContext(),
  };
}
` : ""}
${includeWorker ? `export async function runWorkerTick() {
  return {
    ok: true,
    tickAt: new Date().toISOString(),
    intent: buildIntentSummary(),
    workspaceContext: describeWorkspaceContext(),
  };
}

export function startWorkerHeartbeat() {
  if (workerTimer) return "worker already active";
  workerTimer = setInterval(() => {
    void runWorkerTick().then((payload) => {
      console.log("[binary-worker] heartbeat", JSON.stringify(payload));
    });
  }, 30_000);
  workerTimer.unref();
  return "worker heartbeat started";
}
` : ""}

export async function routeRequest(req: IncomingMessage) {
  if (req.method === "GET" && req.url === "/health") {
    return { statusCode: 200, body: await health() };
  }

  ${includeWebhook
    ? `if (req.method === "POST" && req.url === "/webhook") {
    return { statusCode: 200, body: await handleWebhook(await readBody(req)) };
  }`
    : ""}
  ${includeApi
    ? `if (req.method === "GET" && req.url === "/api") {
    return { statusCode: 200, body: await getApiSnapshot() };
  }`
    : ""}

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
      console.log(\`[binary-ide] ${input.displayName} listening on port \${port}\`);
      console.log(\`[binary-ide] intent: \${buildIntentSummary()}\`);
      resolve(\`listening:\${port}\`);
    });
  });
}

${workerBlock}

if (typeof require !== "undefined" && require.main === module) {
  ${includeWorker ? `startWorkerHeartbeat();` : ""}
  void startServer().catch((error) => {
    console.error("[binary-ide] startup failed", error);
    process.exitCode = 1;
  });
}
`;
}

export function synthesizeBinaryWorkspaceSpec(request: BinaryBuildRequest): BinaryWorkspaceSpec {
  const compactIntent = compactWhitespace(request.intent);
  const slug = slugify(compactIntent) || "binary-package";
  const packageName = `binary-${slug}`;
  const displayName = titleize(slug) || "Binary Package";
  const description = compactIntent.slice(0, 160) || "Portable Binary IDE starter bundle";
  const targetSourcePath = chooseTargetSourcePath(request);
  const outputEntrypoint = `dist/${targetSourcePath.replace(/\.(?:ts|tsx|js|jsx)$/i, ".js")}`;
  const contextSummary = compactWhitespace([
    request.context?.activeFile?.path ? `Active file: ${request.context.activeFile.path}.` : "",
    request.retrievalHints?.preferredTargetPath ? `Preferred target: ${request.retrievalHints.preferredTargetPath}.` : "",
    request.retrievalHints?.mentionedPaths?.length
      ? `Mentioned paths: ${request.retrievalHints.mentionedPaths.slice(0, 4).join(", ")}.`
      : "",
    request.context?.openFiles?.length
      ? `Open files: ${request.context.openFiles.slice(0, 4).map((file) => file.path).join(", ")}.`
      : "",
  ].filter(Boolean).join(" "));
  const sourceFiles: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: packageName,
        version: "0.1.0",
        private: true,
        description,
        scripts: {
          build: "tsc -p tsconfig.json",
          start: `node ${outputEntrypoint}`,
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
          module: "CommonJS",
          moduleResolution: "Node",
          outDir: "dist",
          rootDir: ".",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          types: ["node"],
        },
        include: ["**/*"],
      },
      null,
      2
    ),
    [targetSourcePath]: buildSourceIndex({
      intent: compactIntent,
      displayName,
      targetEnvironment: request.targetEnvironment,
      targetPath: targetSourcePath,
      contextSummary,
      preferredTargetPath: request.retrievalHints?.preferredTargetPath,
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
- Target source path: ${targetSourcePath}
${contextSummary ? `- Grounded workspace context: ${contextSummary}` : ""}
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
      entrypoint: outputEntrypoint,
      installCommand: "npm install",
      buildCommand: "npm run build",
      startCommand: "npm start",
    },
    warnings: compactIntent.length < 20 ? ["The intent is short, so the generated scaffold may need refinement."] : [],
  };
}
