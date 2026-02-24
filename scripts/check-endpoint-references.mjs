import { promises as fs } from "node:fs";
import path from "node:path";
import { collectApiInventory } from "./api-inventory.mjs";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib", "public", "skills"];
const ALLOWED_DOMAINS = /(?:^|\.)(xpersona\.co|localhost|127\.0\.0\.1)$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (["node_modules", ".next", ".git", "artifacts"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function routeToRegex(routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withParams = escaped
    .replace(/\\\{[^}]+\\\+\\\}/g, ".+")
    .replace(/\\\{[^}]+\\\}/g, "[^/]+")
    .replace(/\/$/, "");
  return new RegExp(`^${withParams || "/"}$`);
}

function normalizePath(input) {
  const noQuery = input.split("?")[0]?.split("#")[0] ?? input;
  if (noQuery.length > 1 && noQuery.endsWith("/")) return noQuery.slice(0, -1);
  return noQuery;
}

function shouldIgnoreAbsolute(urlText) {
  try {
    const url = new URL(urlText);
    return !ALLOWED_DOMAINS.test(url.hostname);
  } catch {
    return false;
  }
}

async function main() {
  const inventory = await collectApiInventory();
  const allRouteRegexes = inventory.routes.map((r) => ({ path: r.path, regex: routeToRegex(r.path) }));
  const legacyRouteRegexes = inventory.routes
    .filter((r) => !r.path.startsWith("/api/v1"))
    .map((r) => ({ path: r.path, regex: routeToRegex(r.path) }));

  const unresolved = [];

  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(ROOT, dir);
    try {
      const files = await walk(fullDir);
      for (const file of files) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|woff2?|map)$/i.test(rel)) continue;
        const content = await fs.readFile(file, "utf8").catch(() => null);
        if (!content) continue;

        const regex = /["'`](https?:\/\/[^\s"'`]+)?(\/api(?:\/v1)?\/[A-Za-z0-9_\-./{}\[\]]+)["'`]/g;
        for (const match of content.matchAll(regex)) {
          const absolute = match[1] ?? null;
          const rawPath = match[2];
          if (!rawPath) continue;

          if (absolute && shouldIgnoreAbsolute(absolute)) continue;

          const pathOnly = normalizePath(rawPath);
          if (pathOnly === "/api/v1") continue;

          const directMatch = allRouteRegexes.some((r) => r.regex.test(pathOnly));
          if (directMatch) continue;

          if (pathOnly.startsWith("/api/v1/")) {
            const mapped = normalizePath(`/api/${pathOnly.slice("/api/v1/".length)}`);
            const legacyMatch = legacyRouteRegexes.some((r) => r.regex.test(mapped));
            if (legacyMatch) continue;
          }

          unresolved.push({ file: rel, reference: pathOnly });
        }
      }
    } catch {
      // ignore missing directories
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of unresolved) {
    const key = `${item.file}|${item.reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (deduped.length > 0) {
    console.error(`Found ${deduped.length} unresolved API references:`);
    for (const item of deduped.slice(0, 200)) {
      console.error(`- ${item.file}: ${item.reference}`);
    }
    if (deduped.length > 200) {
      console.error(`...and ${deduped.length - 200} more`);
    }
    process.exit(1);
  }

  console.log("All API references resolve to known routes or v1-mapped routes.");
}

main().catch((err) => {
  console.error("check-endpoint-references failed", err);
  process.exit(1);
});
