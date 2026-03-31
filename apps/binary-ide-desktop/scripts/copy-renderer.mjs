import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

await mkdir(path.join(packageRoot, "dist", "renderer"), { recursive: true });
await cp(path.join(packageRoot, "renderer"), path.join(packageRoot, "dist", "renderer"), {
  recursive: true,
  force: true,
});
