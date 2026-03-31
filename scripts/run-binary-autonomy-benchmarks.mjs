import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_HOST_URL = process.env.BINARY_IDE_HOST_URL || "http://127.0.0.1:7777";
const DEFAULT_MODEL = "Binary IDE";
const POLL_INTERVAL_MS = 1200;
const MAX_WAIT_MS = 180000;
const DEFAULT_MAX_TOOL_STEPS = 128;
const DEFAULT_MAX_WORKSPACE_MUTATIONS = 64;

const CATEGORY_DEFS = [
  {
    id: "multi_file_project_generation",
    task:
      "Create a new plain JavaScript ESM project folder named duration-toolkit in the current workspace with package.json, src/index.js, test/duration.test.js, and README.md. Implement parseDuration(input) and formatDuration(ms) with support for ms, s, m, h, d; handle compound input like 1h 30m; include node:test coverage; run tests until they pass; use no external dependencies.",
    expectedPaths: [
      "duration-toolkit",
      "duration-toolkit/package.json",
      "duration-toolkit/src/index.js",
      "duration-toolkit/test/duration.test.js",
      "duration-toolkit/README.md",
    ],
  },
  {
    id: "trusted_workspace_command_execution",
    task:
      "Create a folder named command-proof and a file command-proof/result.txt containing the text ok. Then run a shell command that lists the file you created so there is proof in the tool trace.",
    expectedPaths: ["command-proof", "command-proof/result.txt"],
  },
  {
    id: "long_run_task",
    task:
      "Create a project folder named notes-workbench with README.md, docs/plan.md, src/index.js, src/summary.js, test/index.test.js, and package.json. Implement a tiny notes summarizer with tests, run the tests until they pass, and stop only after the project is complete.",
    expectedPaths: [
      "notes-workbench",
      "notes-workbench/README.md",
      "notes-workbench/docs/plan.md",
      "notes-workbench/src/index.js",
      "notes-workbench/src/summary.js",
      "notes-workbench/test/index.test.js",
      "notes-workbench/package.json",
    ],
  },
  {
    id: "git_commit_workflow",
    task:
      "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json for a tiny Node ESM utility. Run tests until they pass. Then initialize git inside repo-proof, create a feature branch named feat/autonomy-proof, add the files, and create a commit proving the project is complete.",
    expectedPaths: [
      "repo-proof",
      "repo-proof/README.md",
      "repo-proof/src/index.js",
      "repo-proof/test/index.test.js",
      "repo-proof/package.json",
    ],
    requiredCommands: ["git init", "git checkout -b feat/autonomy-proof", "git commit"],
  },
  {
    id: "complex_autonomy_delivery",
    task:
      "Create a folder named launchpad-studio containing package.json, README.md, docs/architecture.md, docs/usage.md, src/index.js, src/planner.js, src/format.js, src/validate.js, test/index.test.js, test/planner.test.js, and .gitignore for a tiny Node ESM release-planning toolkit. Implement a planner that normalizes feature requests into release cards, add formatting helpers and validation, write meaningful node:test coverage, run tests until they pass, then initialize git inside launchpad-studio, create a feature branch named feat/ship-launchpad-studio, add all files, and create a commit proving the delivery is complete.",
    expectedPaths: [
      "launchpad-studio",
      "launchpad-studio/package.json",
      "launchpad-studio/README.md",
      "launchpad-studio/docs/architecture.md",
      "launchpad-studio/docs/usage.md",
      "launchpad-studio/src/index.js",
      "launchpad-studio/src/planner.js",
      "launchpad-studio/src/format.js",
      "launchpad-studio/src/validate.js",
      "launchpad-studio/test/index.test.js",
      "launchpad-studio/test/planner.test.js",
      "launchpad-studio/.gitignore",
    ],
    requiredCommands: ["npm test", "git init", "git checkout -b feat/ship-launchpad-studio", "git commit"],
  },
];

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

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.error || `Request failed: ${response.status}`);
  }
  return parsed;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listMissing(expectedPaths, files) {
  const seen = new Set(files.map((file) => file.path));
  return expectedPaths.filter((item) => !seen.has(item));
}

function summarizeCategory(category, exportedRun, files, elapsedMs) {
  const finalEnvelope = exportedRun.finalEnvelope && typeof exportedRun.finalEnvelope === "object" ? exportedRun.finalEnvelope : {};
  const loopState = finalEnvelope.loopState && typeof finalEnvelope.loopState === "object" ? finalEnvelope.loopState : {};
  const toolResults = Array.isArray(exportedRun.toolResults) ? exportedRun.toolResults : [];
  const missingPaths = listMissing(category.expectedPaths, files);
  const commandRuns = toolResults.filter((item) => item?.name === "run_command");
  const totalToolCalls = toolResults.length;
  const validationPassed = commandRuns.some((item) => item?.ok === true);
  const matchedCommands = Array.isArray(category.requiredCommands)
    ? category.requiredCommands.filter((needle) =>
        commandRuns.some((item) => {
          const command = String(item?.data?.command || item?.summary || "");
          return item?.ok === true && command.includes(needle);
        })
      )
    : [];
  const toolCounts = Object.fromEntries(
    toolResults.reduce((map, item) => {
      const key = String(item?.name || "unknown");
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map())
  );
  return {
    category: category.id,
    workspace: exportedRun.workspaceRoot || null,
    status: exportedRun.status,
    finishStatus: exportedRun.status,
    eventCount: Array.isArray(exportedRun.events) ? exportedRun.events.length : 0,
    artifactCorrect: missingPaths.length === 0,
    validationPassed,
    totalToolCalls,
    successfulToolCalls: toolResults.filter((item) => item?.ok === true).length,
    failedToolCalls: toolResults.filter((item) => item?.ok === false).length,
    toolCounts,
    stalledBeforeFirstTool:
      exportedRun.status === "running" &&
      totalToolCalls === 0 &&
      Array.isArray(exportedRun.events) &&
      exportedRun.events.length <= 2,
    requiredCommandProof: Array.isArray(category.requiredCommands) ? matchedCommands.length === category.requiredCommands.length : true,
    matchedCommands,
    missingPaths,
    turns: typeof loopState.stepCount === "number" ? loopState.stepCount : toolResults.length,
    repeatedCallCount: typeof loopState.repeatedCallCount === "number" ? loopState.repeatedCallCount : 0,
    repairCount: typeof loopState.repairCount === "number" ? loopState.repairCount : 0,
    takeoverRequired: exportedRun.status === "takeover_required",
    elapsedMs,
    traceId: exportedRun.traceId,
    runId: exportedRun.id,
    hostedRunId: exportedRun.runId || null,
    files,
  };
}

async function runCategory(baseUrl, category) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `binary-autonomy-${category.id}-`));
  await mkdir(workspace, { recursive: true });
  await requestJson(baseUrl, "/v1/workspaces/trust", {
    method: "POST",
    body: {
      path: workspace,
      mutate: true,
      commands: "allow",
      network: "deny",
      elevated: "deny",
    },
  });

  const startedAt = Date.now();
  const started = await requestJson(baseUrl, "/v1/runs/assist", {
    method: "POST",
    body: {
      task: category.task,
      mode: "auto",
      model: DEFAULT_MODEL,
      workspaceRoot: workspace,
      detach: true,
      clientTrace: {
        extensionVersion: "autonomy-benchmark",
        workspaceHash: category.id,
        maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
        maxWorkspaceMutations: DEFAULT_MAX_WORKSPACE_MUTATIONS,
      },
      client: {
        surface: "cli",
        version: "autonomy-benchmark",
      },
    },
  });

  let done = false;
  let after = 0;
  while (!done && Date.now() - startedAt < MAX_WAIT_MS) {
    const events = await requestJson(baseUrl, `/v1/runs/${encodeURIComponent(started.id)}/events?after=${after}`);
    for (const event of events.events || []) {
      after = Math.max(after, Number(event.seq) || after);
    }
    done = Boolean(events.done);
    if (!done) await sleep(POLL_INTERVAL_MS);
  }

  if (!done) {
    try {
      await requestJson(baseUrl, `/v1/runs/${encodeURIComponent(started.id)}/control`, {
        method: "POST",
        body: { action: "cancel", note: "Benchmark timeout" },
      });
    } catch {
      // Keep timeout handling best-effort.
    }
  }

  const exported = await requestJson(baseUrl, `/v1/runs/${encodeURIComponent(started.id)}/export`);
  const files = await collectFiles(workspace);
  const summary = summarizeCategory(category, exported, files, Date.now() - startedAt);
  return {
    ...summary,
    timedOut: !done,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const baseUrl = String(flags["host-url"] || DEFAULT_HOST_URL).replace(/\/+$/, "");
  const requestedIds =
    typeof flags.categories === "string"
      ? flags.categories.split(",").map((value) => value.trim()).filter(Boolean)
      : CATEGORY_DEFS.map((item) => item.id);
  const categories = CATEGORY_DEFS.filter((item) => requestedIds.includes(item.id));
  if (!categories.length) {
    throw new Error(`No benchmark categories matched: ${requestedIds.join(", ")}`);
  }

  const health = await requestJson(baseUrl, "/v1/healthz");
  const results = [];
  for (const category of categories) {
    results.push(await runCategory(baseUrl, category));
  }

  const report = {
    version: "binary_autonomy_benchmark_v1",
    createdAt: new Date().toISOString(),
    host: {
      url: baseUrl,
      version: health.version,
    },
    categories: results,
    summary: {
      total: results.length,
      passed: results.filter((item) => item.artifactCorrect && item.finishStatus === "completed" && item.requiredCommandProof !== false).length,
      takeoverRequired: results.filter((item) => item.takeoverRequired).length,
      validationPassed: results.filter((item) => item.validationPassed).length,
    },
  };

  const outputPath =
    typeof flags.output === "string"
      ? path.resolve(flags.output)
      : path.join(process.cwd(), "binary-autonomy-benchmarks.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Host: ${baseUrl}`);
  console.log(`Report: ${outputPath}`);
  console.log(`Benchmarks: ${results.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
