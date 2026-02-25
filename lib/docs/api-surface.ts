import { readFile, readdir, stat } from "fs/promises";
import path from "path";

export type ApiEndpoint = {
  method: string;
  route: string;
  auth?: string;
  headers?: string[];
};

export async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stats = await stat(full);
    if (stats.isDirectory()) {
      files.push(...(await listRouteFiles(full)));
    } else if (entry === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

export function toApiRoute(baseDir: string, filePath: string, prefix: string): string {
  const rel = path.relative(baseDir, filePath).replace(/\\/g, "/");
  const cleaned = rel.replace(/\/route\.ts$/, "");
  const withParams = cleaned.replace(/\[([^\]]+)\]/g, (_m, p1) => `:${p1}`);
  const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return `${normalizedPrefix}/${withParams}`.replace(/\/$/, "");
}

export function parseMethods(source: string): string[] {
  const methods = new Set<string>();
  const exportFnRegex = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  const exportListRegex = /export\s*\{\s*([^}]+)\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = exportFnRegex.exec(source))) {
    methods.add(match[1]);
  }
  while ((match = exportListRegex.exec(source))) {
    const chunk = match[1];
    chunk
      .split(",")
      .map((s) => s.trim())
      .forEach((name) => {
        const cleaned = name.replace(/as\s+\w+$/, "").trim();
        if (["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(cleaned)) {
          methods.add(cleaned);
        }
      });
  }
  return methods.size ? Array.from(methods) : ["GET"];
}

export async function buildApiSurface(opts: {
  baseDir: string;
  routePrefix: string;
  endpointMeta?: Map<string, { auth?: string; headers?: string[] }>;
}): Promise<ApiEndpoint[]> {
  const { baseDir, routePrefix, endpointMeta } = opts;
  let routeFiles: string[] = [];
  try {
    routeFiles = await listRouteFiles(baseDir);
  } catch {
    routeFiles = [];
  }

  const endpoints: ApiEndpoint[] = [];
  for (const file of routeFiles) {
    try {
      const source = await readFile(file, "utf-8");
      const route = toApiRoute(baseDir, file, routePrefix);
      const methods = parseMethods(source);
      const meta = endpointMeta?.get(route);
      for (const method of methods) {
        endpoints.push({
          method,
          route,
          auth: meta?.auth,
          headers: meta?.headers,
        });
      }
    } catch {
      continue;
    }
  }

  return endpoints.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
}
