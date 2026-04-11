import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_HOST_URL = process.env.BINARY_IDE_HOST_URL || "http://127.0.0.1:7777";
const DEFAULT_MODEL = "Binary IDE";
const POLL_INTERVAL_MS = 1200;
const MAX_WAIT_MS = 240000;

const CASES = [
  {
    id: "semantic_window_max",
    project: "semantic-window-max",
    task:
      "Repair the semantic-window-max project so npm test passes. Do not modify test files or package metadata. Only fix src/index.js with a correct linear-time sliding-window implementation for maxSubarraySum(nums, k).",
    setupFiles: [
      {
        path: "semantic-window-max/package.json",
        content:
          '{\n  "name": "semantic-window-max",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "test": "node --test"\n  }\n}\n',
      },
      {
        path: "semantic-window-max/src/index.js",
        content:
          'export function maxSubarraySum(nums, k) {\n  if (!Array.isArray(nums) || !Number.isInteger(k) || k <= 0) return 0;\n  return 0;\n}\n',
      },
      {
        path: "semantic-window-max/test/index.test.js",
        content:
          'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { maxSubarraySum } from "../src/index.js";\n\ntest("maxSubarraySum handles positive numbers", () => {\n  assert.equal(maxSubarraySum([1, 2, 3, 4], 2), 7);\n});\n\ntest("maxSubarraySum handles mixed values", () => {\n  assert.equal(maxSubarraySum([5, -2, 3, -1, 6], 3), 8);\n});\n\ntest("maxSubarraySum handles all negatives", () => {\n  assert.equal(maxSubarraySum([-8, -3, -6, -2], 2), -5);\n});\n',
      },
    ],
    sourcePath: "semantic-window-max/src/index.js",
    testPaths: ["semantic-window-max/test/index.test.js"],
  },
  {
    id: "semantic_merge_intervals",
    project: "semantic-merge-intervals",
    task:
      "Repair the semantic-merge-intervals project so npm test passes. Do not modify tests or package metadata. Implement mergeIntervals in src/index.js so overlapping intervals are merged correctly and output is sorted.",
    setupFiles: [
      {
        path: "semantic-merge-intervals/package.json",
        content:
          '{\n  "name": "semantic-merge-intervals",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "test": "node --test"\n  }\n}\n',
      },
      {
        path: "semantic-merge-intervals/src/index.js",
        content: "export function mergeIntervals(intervals) {\n  return Array.isArray(intervals) ? intervals : [];\n}\n",
      },
      {
        path: "semantic-merge-intervals/test/index.test.js",
        content:
          'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { mergeIntervals } from "../src/index.js";\n\ntest("merges overlapping ranges", () => {\n  assert.deepEqual(mergeIntervals([[1,3],[2,6],[8,10],[15,18]]), [[1,6],[8,10],[15,18]]);\n});\n\ntest("merges touching ranges", () => {\n  assert.deepEqual(mergeIntervals([[1,4],[4,5]]), [[1,5]]);\n});\n\ntest("sorts unsorted input before merge", () => {\n  assert.deepEqual(mergeIntervals([[9,12],[1,2],[2,4],[7,8]]), [[1,4],[7,8],[9,12]]);\n});\n',
      },
    ],
    sourcePath: "semantic-merge-intervals/src/index.js",
    testPaths: ["semantic-merge-intervals/test/index.test.js"],
  },
  {
    id: "semantic_toposort",
    project: "semantic-toposort",
    task:
      "Repair the semantic-toposort project so npm test passes. Do not modify tests or package metadata. Implement topoSort(graph) in src/index.js returning a valid topological order array for DAGs or null when a cycle exists.",
    setupFiles: [
      {
        path: "semantic-toposort/package.json",
        content:
          '{\n  "name": "semantic-toposort",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "test": "node --test"\n  }\n}\n',
      },
      {
        path: "semantic-toposort/src/index.js",
        content: "export function topoSort(graph) {\n  return [];\n}\n",
      },
      {
        path: "semantic-toposort/test/index.test.js",
        content:
          'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { topoSort } from "../src/index.js";\n\nfunction respectsOrder(order, edges) {\n  const pos = new Map(order.map((n, i) => [n, i]));\n  return edges.every(([a, b]) => pos.has(a) && pos.has(b) && pos.get(a) < pos.get(b));\n}\n\ntest("returns a valid topological order for DAG", () => {\n  const graph = {\n    build: ["test", "lint"],\n    test: ["package"],\n    lint: ["package"],\n    package: []\n  };\n  const out = topoSort(graph);\n  assert.ok(Array.isArray(out));\n  assert.equal(out.length, 4);\n  assert.ok(respectsOrder(out, [["build","test"],["build","lint"],["test","package"],["lint","package"]]));\n});\n\ntest("returns null for cycle", () => {\n  const graph = { a: ["b"], b: ["c"], c: ["a"] };\n  assert.equal(topoSort(graph), null);\n});\n',
      },
    ],
    sourcePath: "semantic-toposort/src/index.js",
    testPaths: ["semantic-toposort/test/index.test.js"],
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

async function writeSetupFiles(rootDir, setupFiles) {
  for (const file of setupFiles) {
    const absolute = path.join(rootDir, file.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
  }
}

async function hashFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

async function runCommand(command, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn("cmd", ["/c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\ncommand_timeout`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: (code ?? 1) === 0, code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\n${message}`.trim() });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnknownRunError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Unknown Binary Host run");
}

async function runCase(baseUrl, model, testCase) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `binary-hardmode-${testCase.id}-`));
  await mkdir(workspace, { recursive: true });
  await writeSetupFiles(workspace, testCase.setupFiles);

  const testHashesBefore = {};
  for (const relPath of testCase.testPaths) {
    testHashesBefore[relPath] = await hashFile(path.join(workspace, relPath));
  }
  const sourceBefore = await hashFile(path.join(workspace, testCase.sourcePath));

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
      task: testCase.task,
      mode: "auto",
      model,
      workspaceRoot: workspace,
      detach: true,
      clientTrace: {
        extensionVersion: "hardmode-semantic-suite",
        workspaceHash: testCase.id,
        maxToolSteps: 220,
        maxWorkspaceMutations: 120,
      },
      client: {
        surface: "cli",
        version: "hardmode-semantic-suite",
      },
    },
  });

  const runIdCandidates = Array.from(
    new Set([started?.id, started?.runId, started?.run?.id].map((v) => String(v || "").trim()).filter(Boolean))
  );
  if (!runIdCandidates.length) {
    throw new Error(`No run id returned for ${testCase.id}`);
  }

  const requestRun = async (pathBuilder, options = undefined) => {
    let lastUnknown = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      for (const runId of runIdCandidates) {
        try {
          return await requestJson(baseUrl, pathBuilder(runId), options);
        } catch (error) {
          if (!isUnknownRunError(error)) throw error;
          lastUnknown = error;
        }
      }
      await sleep(500);
    }
    throw (lastUnknown instanceof Error ? lastUnknown : new Error("Unknown Binary Host run."));
  };

  let done = false;
  let after = 0;
  while (!done && Date.now() - startedAt < MAX_WAIT_MS) {
    const events = await requestRun((runId) => `/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`);
    for (const event of events.events || []) {
      after = Math.max(after, Number(event.seq) || after);
    }
    done = Boolean(events.done);
    if (!done) await sleep(POLL_INTERVAL_MS);
  }
  if (!done) {
    try {
      await requestRun((runId) => `/v1/runs/${encodeURIComponent(runId)}/control`, {
        method: "POST",
        body: { action: "cancel", note: "Hardmode suite timeout" },
      });
    } catch {}
  }

  let exported = await requestRun((runId) => `/v1/runs/${encodeURIComponent(runId)}/export`);
  if (String(exported?.status || "") === "running") {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(750);
      exported = await requestRun((runId) => `/v1/runs/${encodeURIComponent(runId)}/export`);
      if (String(exported?.status || "") !== "running") break;
    }
  }
  const npmResult = await runCommand("npm test --silent", path.join(workspace, testCase.project));

  const testHashAfter = {};
  for (const relPath of testCase.testPaths) {
    testHashAfter[relPath] = await hashFile(path.join(workspace, relPath));
  }
  const sourceAfter = await hashFile(path.join(workspace, testCase.sourcePath));

  const testsUntouched = testCase.testPaths.every((relPath) => testHashesBefore[relPath] === testHashAfter[relPath]);
  const sourceChanged = sourceBefore !== sourceAfter;
  const runStatus = String(exported?.status || "unknown");
  const completed = runStatus === "completed";
  const takeoverRequired = runStatus === "takeover_required";
  const repromptRequired = runStatus !== "completed";
  const independentValidationPassed = npmResult.ok;
  const pass = completed && independentValidationPassed && testsUntouched && sourceChanged;

  return {
    caseId: testCase.id,
    workspace,
    runId: exported?.id || started?.id || null,
    status: runStatus,
    completed,
    takeoverRequired,
    repromptRequired,
    independentValidationPassed,
    testsUntouched,
    sourceChanged,
    pass,
    elapsedMs: Date.now() - startedAt,
    toolCallCount: Array.isArray(exported?.toolResults) ? exported.toolResults.length : 0,
    npmTest: {
      ok: npmResult.ok,
      code: npmResult.code,
      stdout: String(npmResult.stdout || "").slice(0, 1500),
      stderr: String(npmResult.stderr || "").slice(0, 1500),
    },
    testIntegrity: {
      before: testHashesBefore,
      after: testHashAfter,
    },
  };
}

async function runCaseWithRetries(baseUrl, model, testCase, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runCase(baseUrl, model, testCase);
    } catch (error) {
      lastError = error;
      if (!isUnknownRunError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }
  throw (lastError instanceof Error ? lastError : new Error(`Failed to run case ${testCase.id}`));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const baseUrl = String(flags["host-url"] || DEFAULT_HOST_URL).replace(/\/+$/, "");
  const model = String(flags.model || DEFAULT_MODEL);
  const requested = typeof flags.cases === "string" ? new Set(flags.cases.split(",").map((v) => v.trim())) : null;
  const cases = requested ? CASES.filter((item) => requested.has(item.id)) : CASES;
  if (!cases.length) throw new Error("No hardmode cases selected.");

  await requestJson(baseUrl, "/v1/healthz");

  const startedAt = Date.now();
  const results = [];
  for (const testCase of cases) {
    results.push(await runCaseWithRetries(baseUrl, model, testCase));
  }

  const summary = {
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    takeoverRequired: results.filter((item) => item.takeoverRequired).length,
    repromptRequired: results.filter((item) => item.repromptRequired).length,
    independentValidationPassed: results.filter((item) => item.independentValidationPassed).length,
    testsUntouched: results.filter((item) => item.testsUntouched).length,
    sourceChanged: results.filter((item) => item.sourceChanged).length,
    elapsedMs: Date.now() - startedAt,
  };

  const report = {
    version: "binary_hardmode_semantic_suite_v1",
    createdAt: new Date().toISOString(),
    host: baseUrl,
    model,
    results,
    summary,
    pass: summary.passed === summary.total && summary.takeoverRequired === 0 && summary.repromptRequired === 0,
  };

  const outputPath =
    typeof flags.output === "string"
      ? path.resolve(flags.output)
      : path.join(process.cwd(), "artifacts/benchmarks/hardmode-semantic-suite.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Hardmode semantic suite report: ${outputPath}`);
  console.log(
    `Summary: total=${summary.total} passed=${summary.passed} takeover=${summary.takeoverRequired} reprompt=${summary.repromptRequired} independentValidation=${summary.independentValidationPassed}/${summary.total}`
  );
  console.log(`Result: ${report.pass ? "PASS" : "FAIL"}`);
  if (!report.pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
