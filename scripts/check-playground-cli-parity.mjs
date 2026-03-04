import { spawn } from "node:child_process";

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

  const nodeHelp = await runCapture("node", ["sdk/playground-ai-cli/dist/cli.js", "--help"]);
  const pyHelp = await runCapture(
    "python",
    ["-m", "playground_ai_cli.cli", "--help"],
    "playground_ai/python_cli"
  );

  const requiredTokens = [
    "Playground AI CLI - Agentic coding runtime",
    "chat",
    "run",
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
    assertContains(nodeHelp.stdout, token, "node help");
    assertContains(pyHelp.stdout, token, "python help");
  }

  assertNotContains(nodeHelp.stdout, "Codex", "node help");
  assertNotContains(pyHelp.stdout, "Codex", "python help");

  console.log("[parity] Playground AI CLI parity checks passed (Node + Python).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
