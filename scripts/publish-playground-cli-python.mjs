import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const CLI_DIR = path.join(ROOT, "playground_ai", "python_cli");
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
  console.log("[legacy-python-cli] legacy helper invoked; Binary IDE now ships the Node CLI as the public release.");
  console.log(`[legacy-python-cli] building in ${CLI_DIR}`);
  await run("python", ["-m", "pip", "install", "--upgrade", "build", "twine"], CLI_DIR);

  await run("python", ["-m", "build"], CLI_DIR);
  if (dryRun) {
    console.log("[legacy-python-cli] dry run: twine check dist/*");
    await run("python", ["-m", "twine", "check", "dist/*"], CLI_DIR);
    return;
  }

  console.log("[legacy-python-cli] uploading to PyPI");
  await run("python", ["-m", "twine", "upload", "dist/*"], CLI_DIR);
}

main().catch((err) => {
  console.error("[legacy-python-cli] publish failed", err);
  process.exit(1);
});
