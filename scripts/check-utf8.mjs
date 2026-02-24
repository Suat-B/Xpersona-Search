import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "artifacts"]);
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".7z", ".tar", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".mov", ".webm", ".avi", ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".wasm", ".lock", ".sqlite", ".db", ".bin",
]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

function isLikelyBinary(file) {
  const ext = path.extname(file).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

async function main() {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = await walk(ROOT);
  const invalid = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (isLikelyBinary(rel)) continue;

    let buf;
    try {
      buf = await fs.readFile(file);
    } catch {
      continue;
    }

    try {
      decoder.decode(buf);
    } catch {
      invalid.push(rel);
    }
  }

  if (invalid.length > 0) {
    console.error(`Invalid UTF-8 files (${invalid.length}):`);
    for (const file of invalid) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log("UTF-8 check passed.");
}

main().catch((err) => {
  console.error("check-utf8 failed", err);
  process.exit(1);
});
