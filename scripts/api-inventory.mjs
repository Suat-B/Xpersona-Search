import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api");
const SCAN_DIRS = ["app", "components", "lib", "public", "docs", "skills"];
const METHOD_NAMES = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function segmentToOpenApi(segment) {
  if (/^\[\.\.\.(.+)\]$/.test(segment)) {
    return `{${segment.slice(4, -1)}+}`;
  }
  if (/^\[(.+)\]$/.test(segment)) {
    return `{${segment.slice(1, -1)}}`;
  }
  return segment;
}

function routeFileToPath(file) {
  const rel = path.relative(API_DIR, file).replace(/\\/g, "/");
  const withoutRoute = rel.replace(/\/route\.(t|j)sx?$/, "");
  const parts = withoutRoute.split("/").filter(Boolean).map(segmentToOpenApi);
  if (parts.length === 0) return "/api";
  return `/api/${parts.join("/")}`;
}

function extractMethods(source) {
  const methods = new Set();

  const asyncFn = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  for (const match of source.matchAll(asyncFn)) {
    methods.add(match[1]);
  }

  const constFn = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=/g;
  for (const match of source.matchAll(constFn)) {
    methods.add(match[1]);
  }

  const destructured = /export\s+const\s+\{([^}]+)\}\s*=\s*handlers/g;
  for (const match of source.matchAll(destructured)) {
    const names = match[1].split(",").map((v) => v.trim());
    for (const name of names) {
      const normalized = name.replace(/\s+as\s+.*/, "");
      if (METHOD_NAMES.includes(normalized)) methods.add(normalized);
    }
  }

  if (methods.size === 0) {
    methods.add("GET");
  }

  return [...methods].sort((a, b) => METHOD_NAMES.indexOf(a) - METHOD_NAMES.indexOf(b));
}

function normalizeApiReference(matchText) {
  const withoutDomain = matchText.replace(/^https?:\/\/[^/]+/i, "");
  const noQuery = withoutDomain.split("?")[0]?.split("#")[0] ?? withoutDomain;
  return noQuery.endsWith("/") && noQuery.length > 1 ? noQuery.slice(0, -1) : noQuery;
}

export async function collectApiInventory() {
  const allFiles = await walk(API_DIR);
  const routeFiles = allFiles.filter((f) => /\/route\.(t|j)sx?$/.test(f.replace(/\\/g, "/")));

  const routes = [];
  for (const file of routeFiles) {
    const source = await fs.readFile(file, "utf8");
    routes.push({
      file: path.relative(ROOT, file).replace(/\\/g, "/"),
      path: routeFileToPath(file),
      methods: extractMethods(source),
    });
  }

  routes.sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file));

  const consumers = [];
  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(ROOT, dir);
    try {
      const files = await walk(fullDir);
      for (const file of files) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (rel.startsWith("app/api/")) continue;
        if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|woff2?)$/i.test(rel)) continue;
        const content = await fs.readFile(file, "utf8").catch(() => null);
        if (!content) continue;
        const regex = /(?:https?:\/\/[^\s"'`]+)?\/api(?:\/v1)?\/[A-Za-z0-9_\-./{}\[\]]+/g;
        const found = new Set();
        for (const match of content.matchAll(regex)) {
          const normalized = normalizeApiReference(match[0]);
          found.add(normalized);
        }
        for (const ref of found) {
          consumers.push({ file: rel, reference: ref });
        }
      }
    } catch {
      // ignore missing directories
    }
  }

  consumers.sort((a, b) => a.reference.localeCompare(b.reference) || a.file.localeCompare(b.file));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      routeFiles: routes.length,
      operations: routes.reduce((sum, r) => sum + r.methods.length, 0),
      routeConsumers: consumers.length,
    },
    routes,
    consumers,
  };
}

async function main() {
  const inventory = await collectApiInventory();
  const outDir = path.join(ROOT, "artifacts");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "api-inventory.json");
  await fs.writeFile(outPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  console.log(`API routes: ${inventory.totals.routeFiles}`);
  console.log(`API operations: ${inventory.totals.operations}`);
  console.log(`API references found: ${inventory.totals.routeConsumers}`);
  console.log(`Wrote ${path.relative(ROOT, outPath).replace(/\\/g, "/")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error("api-inventory failed", err);
    process.exit(1);
  });
}
