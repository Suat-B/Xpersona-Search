import { promises as fs } from "node:fs";
import path from "node:path";

const nextVersion = process.argv[2];
if (!nextVersion) {
  console.error("Usage: node scripts/bump-playground-python-cli-version.mjs <version>");
  process.exit(1);
}

const ROOT = process.cwd();
const pyprojectPath = path.join(ROOT, "playground_ai", "python_cli", "pyproject.toml");

async function main() {
  const raw = await fs.readFile(pyprojectPath, "utf8");
  const updated = raw.replace(
    /(^\s*version\s*=\s*")[^"]+(")/m,
    `$1${nextVersion}$2`
  );
  if (updated === raw) {
    throw new Error("Could not find version field in pyproject.toml");
  }
  await fs.writeFile(pyprojectPath, updated, "utf8");
  console.log(`[playground-python-cli] version set to ${nextVersion}`);
}

main().catch((err) => {
  console.error("[playground-python-cli] version bump failed", err);
  process.exit(1);
});
