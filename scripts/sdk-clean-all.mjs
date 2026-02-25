import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const SDK_ROOT = path.join(ROOT, "sdk");

async function listSdkPackages() {
  const entries = await fs.readdir(SDK_ROOT, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const packages = [];
  for (const dir of dirs) {
    const pkgPath = path.join(SDK_ROOT, dir, "package.json");
    try {
      await fs.access(pkgPath);
      packages.push({ name: dir, dir: path.join(SDK_ROOT, dir) });
    } catch {
      // skip non-packages
    }
  }
  return packages;
}

function runNpm(prefixDir, scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["--prefix", prefixDir, "run", scriptName], {
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run ${scriptName} failed in ${prefixDir}`));
    });
  });
}

async function main() {
  const packages = await listSdkPackages();
  if (packages.length === 0) {
    console.log("No SDK packages found under ./sdk");
    return;
  }
  for (const pkg of packages) {
    console.log(`\n[SDK] clean -> ${pkg.name}`);
    await runNpm(pkg.dir, "clean");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
