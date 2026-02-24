import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "components", "lib/hooks", "lib/safeFetch.ts"];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  const offenders = [];

  for (const target of TARGET_DIRS) {
    const abs = path.join(ROOT, target);
    try {
      const stat = await fs.stat(abs);
      const files = stat.isDirectory() ? await walk(abs) : [abs];

      for (const file of files) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (rel.startsWith("app/api/")) continue;
        if (!/\.(ts|tsx|js|jsx|mdx)$/.test(rel)) continue;

        const content = await fs.readFile(file, "utf8");
        const regex = /["'`]\/api\/(?!v1\/)/g;
        if (regex.test(content)) {
          offenders.push(rel);
        }
      }
    } catch {
      // ignore missing target
    }
  }

  if (offenders.length > 0) {
    console.error("Legacy /api/ usage found outside app/api:");
    for (const file of [...new Set(offenders)].sort()) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log("No legacy /api/ usage found in frontend consumers.");
}

main().catch((err) => {
  console.error("check-legacy-api-usage failed", err);
  process.exit(1);
});
