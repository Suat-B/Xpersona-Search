import { promises as fs } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { collectApiInventory } from "./api-inventory.mjs";

const ROOT = process.cwd();
const PUBLIC_JSON = path.join(ROOT, "public", "openapi.v1.public.json");
const INTERNAL_JSON = path.join(ROOT, "public", "openapi.v1.internal.json");
const LEGACY_YAML = path.join(ROOT, "public", "openapi.yaml");

const NO_AUTH_PREFIXES = [
  "/api/v1/search",
  "/api/v1/health",
  "/api/v1/docs",
  "/api/v1/openapi",
  "/api/v1/stats/harvest-count",
  "/api/v1/skill",
];

function toV1Path(routePath) {
  if (routePath.startsWith("/api/v1")) return routePath;
  if (!routePath.startsWith("/api")) return routePath;
  return `/api/v1${routePath.slice("/api".length)}`;
}

function isInternalPath(v1Path) {
  return /^\/api\/v1\/(admin|cron)(\/|$)/.test(v1Path);
}

function requiresAuth(v1Path) {
  return !NO_AUTH_PREFIXES.some((prefix) => v1Path === prefix || v1Path.startsWith(`${prefix}/`));
}

function operationId(method, v1Path) {
  const normalized = v1Path
    .replace(/^\/api\/v1\//, "")
    .replace(/[{}+]/g, "")
    .split("/")
    .filter(Boolean)
    .join("_");
  return `${method.toLowerCase()}_${normalized || "root"}`;
}

function pathParameters(v1Path) {
  const params = [];
  for (const match of v1Path.matchAll(/\{([^}]+)\}/g)) {
    const rawName = match[1];
    const name = rawName.endsWith("+") ? rawName.slice(0, -1) : rawName;
    params.push({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
      description: `Path parameter: ${name}`,
    });
  }
  return params;
}

function operationTag(v1Path) {
  const seg = v1Path.replace(/^\/api\/v1\/?/, "").split("/")[0] || "root";
  return seg;
}

const REQUEST_BODY_OVERRIDES = {
  "/api/v1/search/outcome": {
    post: {
      required: true,
      schema: {
        type: "object",
        properties: {
          querySignature: { type: "string", minLength: 64, maxLength: 64 },
          selectedResultId: { type: "string", format: "uuid" },
          outcome: { type: "string", enum: ["success", "failure", "timeout"] },
          taskType: { type: "string" },
          query: { type: "string", minLength: 1, maxLength: 500 },
          failureCode: { type: "string", enum: ["auth", "rate_limit", "tool_error", "schema_mismatch"] },
          executionPath: { type: "string", enum: ["single", "delegated", "bundled"] },
          budgetExceeded: { type: "boolean" },
          latencyMs: { type: "integer", minimum: 0, maximum: 300000 },
          costUsd: { type: "number", minimum: 0, maximum: 10000 },
          modelUsed: { type: "string", minLength: 1, maxLength: 64 },
          tokensInput: { type: "integer", minimum: 0 },
          tokensOutput: { type: "integer", minimum: 0 },
        },
        required: ["querySignature", "selectedResultId", "outcome"],
        additionalProperties: false,
      },
      example: {
        querySignature: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        selectedResultId: "550e8400-e29b-41d4-a716-446655440000",
        outcome: "failure",
        taskType: "automation",
        query: "build mcp pipeline",
        failureCode: "timeout",
        executionPath: "delegated",
        budgetExceeded: false,
        latencyMs: 1800,
        costUsd: 0.012,
        modelUsed: "gpt-4o-mini",
        tokensInput: 420,
        tokensOutput: 128,
      },
    },
  },
};

function buildOperation(method, v1Path) {
  const params = pathParameters(v1Path);
  const requiresBody = !["GET", "HEAD", "OPTIONS"].includes(method);
  const authRequired = requiresAuth(v1Path);
  const override = REQUEST_BODY_OVERRIDES[v1Path]?.[method.toLowerCase()];

  return {
    operationId: operationId(method, v1Path),
    summary: `${method} ${v1Path}`,
    description: `Auto-generated operation for ${v1Path}.`,
    tags: [operationTag(v1Path)],
    ...(params.length > 0 ? { parameters: params } : {}),
    ...(requiresBody
      ? {
          requestBody: {
            required: override?.required ?? false,
            content: {
              "application/json": {
                schema: override?.schema ?? { type: "object", additionalProperties: true },
                examples: {
                  sample: {
                    value: override?.example ?? {},
                  },
                },
              },
            },
          },
        }
      : {}),
    responses: {
      "200": {
        description: "Success",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiSuccess" },
            examples: {
              success: {
                value: {
                  success: true,
                  data: {},
                  meta: {
                    requestId: "req_example",
                    version: "v1",
                    timestamp: "2026-02-24T00:00:00.000Z",
                  },
                },
              },
            },
          },
        },
      },
      default: {
        description: "Error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiErrorEnvelope" },
            examples: {
              error: {
                value: {
                  success: false,
                  error: {
                    code: "BAD_REQUEST",
                    message: "Invalid request",
                  },
                  meta: {
                    requestId: "req_example",
                    version: "v1",
                    timestamp: "2026-02-24T00:00:00.000Z",
                  },
                },
              },
            },
          },
        },
      },
    },
    ...(authRequired ? { security: [{ bearerAuth: [] }] } : {}),
  };
}

function emptySpec(title, description) {
  return {
    openapi: "3.1.0",
    info: {
      title,
      version: "1.0.0",
      description,
    },
    servers: [
      { url: "https://xpersona.co" },
      { url: "http://localhost:3000" },
    ],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
        },
      },
      schemas: {
        ApiMeta: {
          type: "object",
          properties: {
            requestId: { type: "string" },
            version: { type: "string", enum: ["v1"] },
            timestamp: { type: "string", format: "date-time" },
          },
          required: ["requestId", "version", "timestamp"],
        },
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", const: true },
            data: { type: "object", additionalProperties: true },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
          required: ["success", "data", "meta"],
        },
        ApiError: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: { type: "object", additionalProperties: true },
            retryable: { type: "boolean" },
          },
          required: ["code", "message"],
        },
        ApiErrorEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", const: false },
            error: { $ref: "#/components/schemas/ApiError" },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
          required: ["success", "error", "meta"],
        },
      },
    },
  };
}

function addOperation(spec, v1Path, method) {
  if (!spec.paths[v1Path]) spec.paths[v1Path] = {};
  spec.paths[v1Path][method.toLowerCase()] = buildOperation(method, v1Path);
}

function sortSpec(spec) {
  const sortedPaths = {};
  for (const route of Object.keys(spec.paths).sort()) {
    const methods = spec.paths[route];
    const sortedMethods = {};
    for (const method of Object.keys(methods).sort()) {
      sortedMethods[method] = methods[method];
    }
    sortedPaths[route] = sortedMethods;
  }
  return { ...spec, paths: sortedPaths };
}

function withContextPath(spec) {
  if (!spec.paths["/context/v1"]) {
    spec.paths["/context/v1"] = {
      get: {
        operationId: "get_context_v1",
        summary: "GET /context/v1",
        description: "Stable context surface for AI consumers.",
        tags: ["context"],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    };
  }
  return spec;
}

async function writeIfChanged(target, value, checkOnly) {
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  const current = await fs.readFile(target, "utf8").catch(() => null);
  if (current === text) return { changed: false, mismatch: false };
  if (checkOnly) return { changed: false, mismatch: true };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text, "utf8");
  return { changed: true, mismatch: false };
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const inventory = await collectApiInventory();

  const publicSpec = emptySpec(
    "Xpersona Public API v1",
    "Public and agent-facing endpoints."
  );
  const internalSpec = emptySpec(
    "Xpersona Internal API v1",
    "Admin and cron endpoints for internal consumers."
  );

  for (const route of inventory.routes) {
    const v1Path = toV1Path(route.path);
    const internal = isInternalPath(v1Path);
    const target = internal ? internalSpec : publicSpec;
    for (const method of route.methods) {
      addOperation(target, v1Path, method);
    }
  }

  withContextPath(publicSpec);

  const publicSorted = sortSpec(publicSpec);
  const internalSorted = sortSpec(internalSpec);
  const publicYaml = `${stringify(publicSorted)}\n`;

  const writes = await Promise.all([
    writeIfChanged(PUBLIC_JSON, publicSorted, checkOnly),
    writeIfChanged(INTERNAL_JSON, internalSorted, checkOnly),
    writeIfChanged(LEGACY_YAML, publicYaml, checkOnly),
  ]);

  if (checkOnly) {
    const hasMismatch = writes.some((w) => w.mismatch);
    if (hasMismatch) {
      console.error("OpenAPI drift detected. Run: npm run openapi:generate");
      process.exit(1);
    }
    console.log("OpenAPI drift check passed.");
    return;
  }

  console.log(`Generated ${path.relative(ROOT, PUBLIC_JSON).replace(/\\/g, "/")}`);
  console.log(`Generated ${path.relative(ROOT, INTERNAL_JSON).replace(/\\/g, "/")}`);
  console.log(`Generated ${path.relative(ROOT, LEGACY_YAML).replace(/\\/g, "/")}`);
}

main().catch((err) => {
  console.error("generate-openapi failed", err);
  process.exit(1);
});
