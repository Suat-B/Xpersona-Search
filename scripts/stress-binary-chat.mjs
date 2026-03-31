import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_TASK =
  "Create a new plain JavaScript ESM project folder named duration-toolkit in the current workspace with package.json, src/index.js, test/duration.test.js, and README.md. Implement parseDuration(input) and formatDuration(ms) with support for ms, s, m, h, d; handle compound input like 1h 30m; include node:test coverage; run tests until they pass; use no external dependencies.";

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = path.join(currentDir, entry.name);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      results.push({ path: relative, type: "dir" });
      results.push(...(await collectFiles(rootDir, absolute)));
      continue;
    }
    const info = await stat(absolute);
    const preview = info.size <= 4096 ? await readFile(absolute, "utf8").catch(() => "") : "";
    results.push({
      path: relative,
      type: "file",
      size: info.size,
      preview: preview.slice(0, 600),
    });
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function runChat({ cwd, task }) {
  return new Promise((resolve) => {
    const cliEntry = path.resolve(process.cwd(), "sdk/playground-ai-cli/src/cli.ts");
    const tsxEntry = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const child = spawn(process.execPath, [tsxEntry, cliEntry, "chat"], {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });

    child.stdin.write(`${task}\n`);
    child.stdin.write(`/exit\n`);
    child.stdin.end();
  });
}

function summarizeFindings(task, transcript, files) {
  const findings = [];
  const expected = [
    "duration-toolkit",
    "duration-toolkit/package.json",
    "duration-toolkit/src/index.js",
    "duration-toolkit/test/duration.test.js",
    "duration-toolkit/README.md",
  ];
  const seen = new Set(files.map((file) => file.path));

  if (task === DEFAULT_TASK) {
    for (const target of expected) {
      if (!seen.has(target)) {
        findings.push(`missing:${target}`);
      }
    }
    for (const misplaced of ["package.json", "README.md", "src/index.js", "test/duration.test.js"]) {
      if (seen.has(misplaced)) {
        findings.push(`misplaced_root_write:${misplaced}`);
      }
    }
  }

  if (/"toolCall"\s*:\s*\{/.test(transcript)) {
    findings.push("raw_toolcall_json_visible");
  }
  if (/No concrete file actions were produced\./.test(transcript)) {
    findings.push("no_actions_reported");
  }
  if (/readline was closed/i.test(transcript)) {
    findings.push("stdin_closed_bug");
  }

  return findings;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const task = String(flags.task || DEFAULT_TASK);
  const workspace =
    typeof flags.workspace === "string"
      ? path.resolve(flags.workspace)
      : await mkdtemp(path.join(os.tmpdir(), "binary-chat-stress-"));
  await mkdir(workspace, { recursive: true });

  const result = await runChat({ cwd: workspace, task });
  const files = await collectFiles(workspace);
  const transcript = `${result.stdout}${result.stderr}`;
  const findings = summarizeFindings(task, transcript, files);
  const report = {
    ok: result.code === 0 && findings.length === 0,
    task,
    workspace,
    exitCode: result.code,
    findings,
    transcript,
    files,
  };

  const outputPath =
    typeof flags.output === "string"
      ? path.resolve(flags.output)
      : path.join(workspace, "binary-chat-stress-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Workspace: ${workspace}`);
  console.log(`Report: ${outputPath}`);
  console.log(`Exit code: ${result.code}`);
  if (findings.length) {
    console.log(`Findings: ${findings.join(", ")}`);
  } else {
    console.log("Findings: none");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
