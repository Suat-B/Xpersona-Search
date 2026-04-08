import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const distRendererDir = path.join(packageRoot, "dist", "renderer");

await rm(distRendererDir, { recursive: true, force: true });
await mkdir(distRendererDir, { recursive: true });
await cp(path.join(packageRoot, "renderer"), distRendererDir, {
  recursive: true,
  force: true,
});
