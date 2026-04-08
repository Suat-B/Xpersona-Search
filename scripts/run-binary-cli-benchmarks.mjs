import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPackageRoot = path.join(repoRoot, "sdk", "playground-ai-cli");
const cliDistPath = path.join(cliPackageRoot, "dist", "tool-executor.js");

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function ensureCliBuild() {
  if (!(await fs.stat(cliDistPath).catch(() => null))) {
    execSync("npm --prefix sdk/playground-ai-cli run build", {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function pending(step, name, args = {}) {
  return {
    step,
    adapter: "cli-benchmark",
    requiresClientExecution: true,
    createdAt: nowIso(),
    toolCall: {
      id: `${String(name)}-${step}`,
      name,
      arguments: args,
    },
  };
}

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
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
    const content = await fs.readFile(absolute).catch(() => Buffer.alloc(0));
    results.push({
      path: relative,
      type: "file",
      size: content.length,
      preview: content.subarray(0, 400).toString("utf8"),
    });
  }
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function findFile(files, relativePath) {
  return files.find((file) => file.path === relativePath) || null;
}

function computeScenarioScore(checks) {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.filter((check) => check.pass).reduce((sum, check) => sum + check.weight, 0);
  return totalWeight ? Math.round((earned / totalWeight) * 100) : 0;
}

function buildScorecard(results) {
  const overallScore = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(1, results.length));
  return {
    overallScore,
    passed: results.filter((result) => result.score >= 80).length,
    failed: results.filter((result) => result.score < 80).length,
    validationPassRate:
      results.filter((result) => result.metrics.validationRelevant).length
        ? Number(
            (
              results.filter((result) => result.metrics.validationRelevant && result.metrics.validationPassed).length /
              results.filter((result) => result.metrics.validationRelevant).length
            ).toFixed(2)
          )
        : 1,
    binarySafetyPassRate:
      results.filter((result) => result.metrics.binarySafetyRelevant).length
        ? Number(
            (
              results.filter((result) => result.metrics.binarySafetyRelevant && result.metrics.binarySafetyPassed).length /
              results.filter((result) => result.metrics.binarySafetyRelevant).length
            ).toFixed(2)
          )
        : 1,
    gitPassRate:
      results.filter((result) => result.metrics.gitRelevant).length
        ? Number(
            (
              results.filter((result) => result.metrics.gitRelevant && result.metrics.gitPassed).length /
              results.filter((result) => result.metrics.gitRelevant).length
            ).toFixed(2)
          )
        : 1,
  };
}

async function loadBaseline(baselinePath) {
  if (!baselinePath) return null;
  const raw = await fs.readFile(baselinePath, "utf8").catch(() => null);
  if (!raw) return null;
  return JSON.parse(raw);
}

function compareReports(currentReport, baselineReport) {
  if (!baselineReport?.summary?.scorecard) {
    return {
      available: false,
      message: "No previous CLI benchmark report was available. This run becomes the baseline.",
    };
  }
  const baselineById = new Map(
    Array.isArray(baselineReport.categories) ? baselineReport.categories.map((category) => [category.id, category]) : []
  );
  return {
    available: true,
    overallScoreDelta: currentReport.summary.scorecard.overallScore - Number(baselineReport.summary.scorecard.overallScore || 0),
    perScenario: currentReport.categories.map((category) => ({
      id: category.id,
      scoreDelta: category.score - Number(baselineById.get(category.id)?.score || 0),
    })),
  };
}

async function createContext(CliToolExecutor, scenarioId) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `binary-cli-bench-${scenarioId}-`));
  return {
    workspace,
    executor: new CliToolExecutor(workspace),
    step: 0,
    results: [],
    checks: [],
    notes: [],
  };
}

async function runTool(context, name, args = {}) {
  context.step += 1;
  const result = await context.executor.execute(pending(context.step, name, args));
  context.results.push(result);
  return result;
}

function addCheck(context, name, pass, weight, detail) {
  context.checks.push({ name, pass: Boolean(pass), weight, detail });
}

const SCENARIOS = [
  {
    id: "personal_notes_workflow",
    title: "Organize personal notes and find the right file",
    async run(context) {
      await runTool(context, "mkdir", { path: "family-hub" });
      await runTool(context, "write_file", {
        path: "family-hub/checklist.txt",
        content: "Pack passport\nPack charger\nCall hotel\n",
      });
      await runTool(context, "write_file", {
        path: "family-hub/day1.md",
        content: "# Day 1\nBreakfast at 9\nMuseum at 11\n",
      });
      const listed = await runTool(context, "list_files", { query: "family-hub" });
      const searched = await runTool(context, "search_workspace", { query: "passport" });
      const read = await runTool(context, "read_file", { path: "family-hub/checklist.txt", startLine: 1, endLine: 3 });
      const files = await collectFiles(context.workspace);
      addCheck(context, "created expected files", Boolean(findFile(files, "family-hub/checklist.txt") && findFile(files, "family-hub/day1.md")), 30);
      addCheck(
        context,
        "listed workspace files",
        listed.ok && Array.isArray(listed.data?.files) && listed.data.files.some((item) => String(item).includes("family-hub/checklist.txt")),
        20
      );
      addCheck(
        context,
        "search found the needed note",
        searched.ok && Array.isArray(searched.data?.matches) && searched.data.matches.some((item) => String(item.path).includes("checklist.txt")),
        25
      );
      addCheck(context, "read returned friendly content", read.ok && String(read.data?.content || "").includes("Pack passport"), 25);
      return {
        files,
        metrics: {
          validationRelevant: false,
          validationPassed: false,
          gitRelevant: false,
          gitPassed: false,
          binarySafetyRelevant: false,
          binarySafetyPassed: false,
        },
      };
    },
  },
  {
    id: "repair_and_validation",
    title: "Repair a broken project and prove it with tests",
    async run(context) {
      await runTool(context, "mkdir", { path: "budget-helper" });
      await runTool(context, "write_file", {
        path: "budget-helper/package.json",
        content: JSON.stringify(
          {
            name: "budget-helper",
            version: "1.0.0",
            type: "module",
            scripts: { test: "node --test" },
          },
          null,
          2
        ),
      });
      await runTool(context, "write_file", {
        path: "budget-helper/src/index.js",
        content: [
          "export function total(values) {",
          "  return Array.isArray(values) ? values.length : 0;",
          "}",
          "",
        ].join("\n"),
      });
      await runTool(context, "write_file", {
        path: "budget-helper/test/index.test.js",
        content: [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { total } from '../src/index.js';",
          "",
          "test('total adds all values', () => {",
          "  assert.equal(total([4, 6, 10]), 20);",
          "  assert.equal(total([]), 0);",
          "});",
          "",
        ].join("\n"),
      });
      const failing = await runTool(context, "run_command", { command: "npm test --silent" });
      const beforeRead = await runTool(context, "read_file", { path: "budget-helper/src/index.js", startLine: 1, endLine: 4 });
      const edited = await runTool(context, "edit", {
        path: "budget-helper/src/index.js",
        patch: [
          "@@ -1,3 +1,3 @@",
          " export function total(values) {",
          "-  return Array.isArray(values) ? values.length : 0;",
          "+  return Array.isArray(values) ? values.reduce((sum, value) => sum + Number(value || 0), 0) : 0;",
          " }",
        ].join("\n"),
      });
      const passing = await runTool(context, "run_command", { command: "npm test --silent" });
      const files = await collectFiles(context.workspace);
      addCheck(context, "detected the original failure", failing.ok === false, 20);
      addCheck(context, "read showed the buggy implementation", beforeRead.ok && String(beforeRead.data?.content || "").includes("values.length"), 15);
      addCheck(context, "edit repaired the code", edited.ok === true, 20);
      addCheck(context, "tests passed after repair", passing.ok === true && `${String(passing.data?.stdout || "")}\n${String(passing.data?.stderr || "")}`.toLowerCase().includes("pass"), 30);
      addCheck(context, "project files exist", Boolean(findFile(files, "budget-helper/src/index.js") && findFile(files, "budget-helper/test/index.test.js")), 15);
      return {
        files,
        metrics: {
          validationRelevant: true,
          validationPassed: passing.ok === true,
          gitRelevant: false,
          gitPassed: false,
          binarySafetyRelevant: false,
          binarySafetyPassed: false,
        },
      };
    },
  },
  {
    id: "git_closeout_workflow",
    title: "Create, review, and close out a small git change",
    async run(context) {
      await runTool(context, "mkdir", { path: "home-manual/docs" });
      await runTool(context, "write_file", {
        path: "home-manual/docs/tips.md",
        content: "Morning checklist\n- Open the blinds\n",
      });
      await runTool(context, "run_command", { command: "git init", cwd: "home-manual" });
      await runTool(context, "run_command", { command: 'git config user.email "binary@example.test"', cwd: "home-manual" });
      await runTool(context, "run_command", { command: 'git config user.name "Binary CLI Bench"', cwd: "home-manual" });
      await runTool(context, "run_command", { command: "git add .", cwd: "home-manual" });
      await runTool(context, "run_command", { command: 'git commit -m "docs: seed home manual"', cwd: "home-manual" });
      const checkpoint = await runTool(context, "create_checkpoint", { reason: "Before weekend routine update" });
      const branch = await runTool(context, "run_command", { command: "git checkout -b feat/weekend-routine", cwd: "home-manual" });
      const edit = await runTool(context, "edit", {
        path: "home-manual/docs/tips.md",
        patch: [
          "@@ -1,2 +1,4 @@",
          " Morning checklist",
          " - Open the blinds",
          "+",
          "+Weekend routine",
          "+- Water the plants",
        ].join("\n"),
      });
      const diff = await runTool(context, "git_diff", { path: "docs/tips.md", cwd: "home-manual" });
      await runTool(context, "run_command", { command: "git add docs/tips.md", cwd: "home-manual" });
      const commit = await runTool(context, "run_command", { command: 'git commit -m "docs: add weekend routine"', cwd: "home-manual" });
      const status = await runTool(context, "git_status", { cwd: "home-manual" });
      const branchName = await runTool(context, "run_command", { command: "git branch --show-current", cwd: "home-manual" });
      addCheck(context, "checkpoint worked", checkpoint.ok === true, 15);
      addCheck(context, "created a feature branch", branch.ok === true && String(branchName.data?.stdout || "").trim() === "feat/weekend-routine", 25);
      addCheck(context, "edited the file", edit.ok === true, 15);
      addCheck(context, "git diff showed the change", diff.ok === true && String(diff.data?.stdout || "").includes("Weekend routine"), 20);
      addCheck(context, "commit succeeded", commit.ok === true, 15);
      addCheck(context, "repo is clean after commit", status.ok === true && String(status.data?.stdout || "").trim() === "", 10);
      return {
        files: await collectFiles(context.workspace),
        metrics: {
          validationRelevant: false,
          validationPassed: false,
          gitRelevant: true,
          gitPassed: commit.ok === true && status.ok === true && String(status.data?.stdout || "").trim() === "",
          binarySafetyRelevant: false,
          binarySafetyPassed: false,
        },
      };
    },
  },
  {
    id: "binary_inspection_and_patch",
    title: "Inspect and safely patch a regular binary file",
    async run(context) {
      await runTool(context, "mkdir", { path: "downloads" });
      const originalBytes = Buffer.from("BINARY\0receipt:42\0DONE", "utf8");
      const written = await runTool(context, "write_binary_file", {
        path: "downloads/receipt-cache.bin",
        bytesBase64: originalBytes.toString("base64"),
      });
      const statResult = await runTool(context, "stat_binary", { path: "downloads/receipt-cache.bin" });
      const hashBefore = await runTool(context, "hash_binary", { path: "downloads/receipt-cache.bin" });
      const analyzed = await runTool(context, "analyze_binary", { path: "downloads/receipt-cache.bin" });
      const chunk = await runTool(context, "read_binary_chunk", { path: "downloads/receipt-cache.bin", offset: 0, length: 64 });
      const search = await runTool(context, "search_binary", { path: "downloads/receipt-cache.bin", pattern: "receipt:42" });
      const dryRun = await runTool(context, "patch_binary", {
        path: "downloads/receipt-cache.bin",
        dryRun: true,
        operations: [
          {
            offset: 15,
            deleteLength: 2,
            bytesBase64: Buffer.from("84", "utf8").toString("base64"),
          },
        ],
      });
      const patched = await runTool(context, "patch_binary", {
        path: "downloads/receipt-cache.bin",
        approved: true,
        operations: [
          {
            offset: 15,
            deleteLength: 2,
            bytesBase64: Buffer.from("84", "utf8").toString("base64"),
          },
        ],
      });
      const hashAfter = await runTool(context, "hash_binary", { path: "downloads/receipt-cache.bin" });
      addCheck(context, "binary file was written", written.ok === true, 15);
      addCheck(
        context,
        "metadata identifies a low-risk regular file",
        statResult.ok === true && statResult.data?.isRegularFile === true && statResult.data?.riskClass === "low",
        15
      );
      addCheck(context, "analysis surfaced strings", analyzed.ok === true && Array.isArray(analyzed.data?.stringsSample) && analyzed.data.stringsSample.some((item) => String(item).includes("receipt:42")), 15);
      addCheck(context, "chunk preview is available", chunk.ok === true && String(chunk.data?.asciiPreview || "").includes("receipt:42"), 15);
      addCheck(context, "search found the byte pattern", search.ok === true && Array.isArray(search.data?.matches) && search.data.matches.length > 0, 15);
      addCheck(context, "dry run produced a patch plan", dryRun.ok === true && Boolean(dryRun.data?.patchPlan), 10);
      addCheck(context, "approved patch changed the hash", patched.ok === true && hashBefore.ok === true && hashAfter.ok === true && hashBefore.data?.sha256 !== hashAfter.data?.sha256, 15);
      return {
        files: await collectFiles(context.workspace),
        metrics: {
          validationRelevant: false,
          validationPassed: false,
          gitRelevant: false,
          gitPassed: false,
          binarySafetyRelevant: false,
          binarySafetyPassed: false,
        },
      };
    },
  },
  {
    id: "binary_safety_guardrails",
    title: "Block unsafe binary behavior and steer the user to safe tools",
    async run(context) {
      await runTool(context, "mkdir", { path: "safe-downloads" });
      await runTool(context, "write_binary_file", {
        path: "safe-downloads/photo-cache.bin",
        bytesBase64: Buffer.from("PHOTO\0cache\0frame", "utf8").toString("base64"),
      });
      const textRead = await runTool(context, "read_file", { path: "safe-downloads/photo-cache.bin" });
      const executableInfo = await runTool(context, "stat_binary", { path: process.execPath });
      const blockedPatch = await runTool(context, "patch_binary", {
        path: process.execPath,
        dryRun: true,
        operations: [{ offset: 0, deleteLength: 1, bytesHex: "90" }],
      });
      addCheck(context, "text tools refuse binary files", textRead.ok === false && textRead.blocked === true, 40);
      addCheck(
        context,
        "binary redirect suggests safer tools",
        Array.isArray(textRead.data?.recommendedTools) && textRead.data.recommendedTools.includes("analyze_binary"),
        20
      );
      addCheck(context, "high-risk executable patch is blocked", executableInfo.ok === true && blockedPatch.ok === false && blockedPatch.blocked === true, 40);
      return {
        files: await collectFiles(context.workspace),
        metrics: {
          validationRelevant: false,
          validationPassed: false,
          gitRelevant: false,
          gitPassed: false,
          binarySafetyRelevant: true,
          binarySafetyPassed: textRead.ok === false && blockedPatch.ok === false,
        },
      };
    },
  },
];

async function runScenario(CliToolExecutor, scenario, keepWorkspaces) {
  const context = await createContext(CliToolExecutor, scenario.id);
  const startedAt = Date.now();
  try {
    const outcome = await scenario.run(context);
    const score = computeScenarioScore(context.checks);
    return {
      id: scenario.id,
      title: scenario.title,
      score,
      elapsedMs: Date.now() - startedAt,
      toolCalls: context.results.length,
      failedToolCalls: context.results.filter((result) => result.ok === false).length,
      checks: context.checks,
      metrics: outcome.metrics,
      files: outcome.files,
      workspace: keepWorkspaces ? context.workspace : null,
    };
  } catch (error) {
    return {
      id: scenario.id,
      title: scenario.title,
      score: 0,
      elapsedMs: Date.now() - startedAt,
      toolCalls: context.results.length,
      failedToolCalls: context.results.filter((result) => result.ok === false).length + 1,
      checks: [
        ...context.checks,
        {
          name: "scenario completed",
          pass: false,
          weight: 100,
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
      metrics: {
        validationRelevant: false,
        validationPassed: false,
        gitRelevant: false,
        gitPassed: false,
        binarySafetyRelevant: false,
        binarySafetyPassed: false,
      },
      files: await collectFiles(context.workspace),
      workspace: keepWorkspaces ? context.workspace : null,
    };
  } finally {
    if (!keepWorkspaces) {
      await fs.rm(context.workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  await ensureCliBuild();
  const { CliToolExecutor } = await import(pathToFileURL(cliDistPath).href);
  const keepWorkspaces = flags["keep-workspaces"] === true;
  const requestedIds =
    typeof flags.scenarios === "string"
      ? flags.scenarios.split(",").map((value) => value.trim()).filter(Boolean)
      : SCENARIOS.map((scenario) => scenario.id);
  const selected = SCENARIOS.filter((scenario) => requestedIds.includes(scenario.id));
  if (!selected.length) {
    throw new Error(`No CLI benchmark scenarios matched: ${requestedIds.join(", ")}`);
  }

  const results = [];
  for (const scenario of selected) {
    results.push(await runScenario(CliToolExecutor, scenario, keepWorkspaces));
  }

  const report = {
    version: "binary_cli_benchmark_v1",
    createdAt: nowIso(),
    runtime: {
      node: process.version,
      platform: process.platform,
      cliDistPath,
    },
    categories: results,
    summary: {
      total: results.length,
      averageToolCalls: Math.round(results.reduce((sum, result) => sum + result.toolCalls, 0) / Math.max(1, results.length)),
      scorecard: buildScorecard(results),
    },
  };

  const outputPath =
    typeof flags.output === "string"
      ? path.resolve(flags.output)
      : path.join(repoRoot, "binary-cli-benchmarks.json");
  const scorecardPath =
    typeof flags["scorecard-output"] === "string"
      ? path.resolve(flags["scorecard-output"])
      : path.join(repoRoot, "binary-cli-scorecard.json");
  const baselinePath =
    typeof flags.baseline === "string"
      ? path.resolve(flags.baseline)
      : (await fs.stat(outputPath).catch(() => null))
        ? outputPath
        : null;

  const baselineReport = await loadBaseline(baselinePath);
  report.comparison = compareReports(report, baselineReport);

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(scorecardPath, `${JSON.stringify(report.summary.scorecard, null, 2)}\n`, "utf8");

  console.log(`CLI benchmark report: ${outputPath}`);
  console.log(`CLI benchmark scorecard: ${scorecardPath}`);
  console.log(`Scenarios: ${results.length}`);
  console.log(`Overall score: ${report.summary.scorecard.overallScore}/100`);
  console.log(`Validation pass rate: ${(report.summary.scorecard.validationPassRate * 100).toFixed(0)}%`);
  console.log(`Git pass rate: ${(report.summary.scorecard.gitPassRate * 100).toFixed(0)}%`);
  console.log(`Binary safety pass rate: ${(report.summary.scorecard.binarySafetyPassRate * 100).toFixed(0)}%`);
  if (report.comparison.available) {
    console.log(`Change vs baseline: ${report.comparison.overallScoreDelta >= 0 ? "+" : ""}${report.comparison.overallScoreDelta}`);
  } else {
    console.log(report.comparison.message);
  }
  for (const result of results) {
    const failedChecks = result.checks.filter((check) => !check.pass).map((check) => check.name);
    console.log(`- ${result.id}: ${result.score}/100${failedChecks.length ? ` (needs work: ${failedChecks.join(", ")})` : ""}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
