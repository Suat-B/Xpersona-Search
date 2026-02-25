import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const SDK_DIR = path.join(ROOT, "sdk", "xpersona-search-sdk");
const dryRun = process.argv.includes("--dry-run");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function main() {
  console.log(`[search-sdk] building in ${SDK_DIR}`);
  await run("npm", ["run", "clean"], SDK_DIR);
  await run("npm", ["run", "build"], SDK_DIR);

  const publishArgs = ["publish", "--access", "public"];
  if (dryRun) publishArgs.push("--dry-run");
  console.log(`[search-sdk] npm ${publishArgs.join(" ")}`);
  await run("npm", publishArgs, SDK_DIR);
}

main().catch((err) => {
  console.error("[search-sdk] publish failed", err);
  process.exit(1);
});

