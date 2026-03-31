import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const CLI_DIR = path.join(ROOT, "sdk", "playground-ai-cli");
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
  console.log(`[binary-ide-cli] building in ${CLI_DIR}`);
  await run("npm", ["run", "clean"], CLI_DIR);
  await run("npm", ["run", "build"], CLI_DIR);

  const publishArgs = ["publish", "--access", "public"];
  if (dryRun) publishArgs.push("--dry-run");
  console.log(`[binary-ide-cli] npm ${publishArgs.join(" ")}`);
  await run("npm", publishArgs, CLI_DIR);
}

main().catch((err) => {
  console.error("[binary-ide-cli] publish failed", err);
  process.exit(1);
});
