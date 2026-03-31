import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

function runCapture(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
  });
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`[parity] Missing "${needle}" in ${label}`);
  }
}

function assertNotContains(text, needle, label) {
  if (text.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`[parity] Found forbidden token "${needle}" in ${label}`);
  }
}

async function main() {
  await runCapture("npm", ["--prefix", "sdk/playground-ai-cli", "run", "build"]);

  const binaryHelp = await runCapture("npm", ["--prefix", "sdk/playground-ai-cli", "exec", "binary", "--", "--help"]);
  const binaryIdeHelp = await runCapture("npm", ["--prefix", "sdk/playground-ai-cli", "exec", "binary-ide", "--", "--help"]);
  const pkg = JSON.parse(
    await readFile(path.join(process.cwd(), "sdk", "playground-ai-cli", "package.json"), "utf8")
  );

  const requiredTokens = [
    "Binary IDE CLI - Agentic coding runtime",
    "chat",
    "debug-runtime",
    "run",
    "runs",
    "sessions",
    "usage",
    "checkout",
    "replay",
    "execute",
    "index",
    "auth",
    "config",
  ];

  for (const token of requiredTokens) {
    assertContains(binaryHelp.stdout, token, "binary help");
    assertContains(binaryIdeHelp.stdout, token, "binary-ide help");
  }

  assertContains(JSON.stringify(pkg.bin || {}), "\"binary\":\"dist/cli.js\"", "package.json bin map");
  assertContains(JSON.stringify(pkg.bin || {}), "\"binary-ide\":\"dist/cli.js\"", "package.json bin map");

  for (const forbidden of ["Codex", "Playground AI", "playground", "pgai", "Cutie"]) {
    assertNotContains(binaryHelp.stdout, forbidden, "binary help");
    assertNotContains(binaryIdeHelp.stdout, forbidden, "binary-ide help");
  }

  if (binaryHelp.stdout !== binaryIdeHelp.stdout) {
    throw new Error("[cli-check] binary and binary-ide help output diverged");
  }

  console.log("[cli-check] Binary IDE CLI checks passed.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
