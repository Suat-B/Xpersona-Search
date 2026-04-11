import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_HOST_URL = process.env.BINARY_IDE_HOST_URL || "http://127.0.0.1:7777";
const DEFAULT_MODEL = "Binary IDE";
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_CATEGORIES = [
  "complex_autonomy_delivery",
  "git_commit_workflow",
  "long_run_task",
  "validation_repair",
  "multi_file_project_generation",
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

function toPositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnNode(args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd,
        env: {
          ...process.env,
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolve({ code: -1, stdout: "", stderr: `spawn_error: ${message}` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      settle({ code: -1, stdout, stderr: `${stderr}\nspawn_error: ${message}`.trim() });
    });
    child.on("close", (code) => {
      settle({ code: code ?? 0, stdout, stderr });
    });
  });
}

function median(values) {
  const items = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (items.length === 0) return null;
  const middle = Math.floor(items.length / 2);
  if (items.length % 2 === 0) {
    return Math.round((items[middle - 1] + items[middle]) / 2);
  }
  return Math.round(items[middle]);
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  return `${hours}h ${minutes}m ${remainSeconds}s`;
}

async function loadJsonIfExists(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const durationMinutes = toPositiveInt(flags["duration-minutes"], DEFAULT_DURATION_MINUTES);
  const targetDurationMs = durationMinutes * 60_000;
  const cooldownMs = toPositiveInt(flags["cooldown-ms"], 500);
  const maxCycles = flags["max-cycles"] ? toPositiveInt(flags["max-cycles"], Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const stopOnFirstInterrupt = Boolean(flags["stop-on-first-interrupt"]);
  const enforceStrictExit = Boolean(flags["enforce-strict-exit"]);
  const categories = String(flags.categories || DEFAULT_CATEGORIES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const hostUrl = String(flags["host-url"] || DEFAULT_HOST_URL);
  const model = String(flags.model || DEFAULT_MODEL);
  const runStartedAt = Date.now();
  const deadlineAt = runStartedAt + targetDurationMs;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "binary-autonomy-time-soak-"));
  const reportDir = path.join(tempRoot, "cycles");
  await mkdir(reportDir, { recursive: true });

  const stats = {
    cycleCount: 0,
    categoryRunCount: 0,
    completedCount: 0,
    takeoverCount: 0,
    repromptRequiredCount: 0,
    failedCount: 0,
    infraFailureCount: 0,
    elapsedSamplesMs: [],
    firstToolSamplesMs: [],
    firstInterruptAtMs: null,
    firstInterruptCycle: null,
    firstInterruptCategory: null,
  };

  const cycleLogs = [];
  const benchScript = path.resolve(process.cwd(), "scripts/run-binary-autonomy-benchmarks.mjs");

  while (Date.now() < deadlineAt && stats.cycleCount < maxCycles) {
    const cycleIndex = stats.cycleCount + 1;
    const cycleOutputPath = path.join(reportDir, `cycle-${String(cycleIndex).padStart(3, "0")}.json`);
    const cycleScorePath = path.join(reportDir, `cycle-${String(cycleIndex).padStart(3, "0")}-scorecard.json`);
    const args = [
      benchScript,
      "--categories",
      categories.join(","),
      "--output",
      cycleOutputPath,
      "--scorecard-output",
      cycleScorePath,
      "--host-url",
      hostUrl,
      "--model",
      model,
    ];

    const cycleStart = Date.now();
    const child = await spawnNode(args, process.cwd());
    const cycleWallMs = Date.now() - cycleStart;
    const cycleReport = await loadJsonIfExists(cycleOutputPath);
    const categoryItems = Array.isArray(cycleReport?.categories) ? cycleReport.categories : [];
    const infraCycleFailure = categoryItems.length === 0 || child.code !== 0;

    let cycleCompleted = 0;
    let cycleTakeovers = 0;
    let cycleReprompt = 0;
    let cycleFailed = 0;
    for (const item of categoryItems) {
      const status = String(item?.status || item?.finishStatus || "unknown");
      const completed = status === "completed";
      const takeover = status === "takeover_required" || item?.takeoverRequired === true;
      const reprompt = !completed;
      stats.categoryRunCount += 1;
      if (completed) stats.completedCount += 1;
      if (takeover) stats.takeoverCount += 1;
      if (reprompt) stats.repromptRequiredCount += 1;
      if (status === "failed" || status === "cancelled") stats.failedCount += 1;
      if (completed) cycleCompleted += 1;
      if (takeover) cycleTakeovers += 1;
      if (reprompt) cycleReprompt += 1;
      if (status === "failed" || status === "cancelled") cycleFailed += 1;
      const elapsedMs = Number(item?.elapsedMs);
      if (Number.isFinite(elapsedMs)) stats.elapsedSamplesMs.push(Math.round(elapsedMs));
      const firstToolMs = Number(item?.firstToolMs);
      if (Number.isFinite(firstToolMs)) stats.firstToolSamplesMs.push(Math.round(firstToolMs));
      if (reprompt && stats.firstInterruptAtMs === null) {
        stats.firstInterruptAtMs = Date.now() - runStartedAt;
        stats.firstInterruptCycle = cycleIndex;
        stats.firstInterruptCategory = String(item?.category || "unknown");
      }
    }
    if (infraCycleFailure) {
      stats.infraFailureCount += 1;
      stats.repromptRequiredCount += 1;
      cycleReprompt += 1;
      if (stats.firstInterruptAtMs === null) {
        stats.firstInterruptAtMs = Date.now() - runStartedAt;
        stats.firstInterruptCycle = cycleIndex;
        stats.firstInterruptCategory = "infra_failure";
      }
    }

    stats.cycleCount = cycleIndex;
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    const cycleLog = {
      cycle: cycleIndex,
      wallMs: cycleWallMs,
      runs: categoryItems.length,
      completed: cycleCompleted,
      takeover: cycleTakeovers,
      repromptRequired: cycleReprompt,
      failed: cycleFailed,
      exitCode: child.code,
      infraCycleFailure,
      stderrSnippet: String(child.stderr || "").trim().slice(0, 240),
      remainingMs,
      releaseGate:
        infraCycleFailure
          ? "ERROR"
          : cycleReport?.summary?.scorecard?.passing === true
          ? "PASS"
          : cycleReport?.summary?.scorecard?.passing === false
            ? "FAIL"
            : "UNKNOWN",
    };
    cycleLogs.push(cycleLog);

    process.stdout.write(
      `[cycle ${cycleIndex}] runs=${cycleLog.runs} completed=${cycleLog.completed} takeover=${cycleLog.takeover} reprompt=${cycleLog.repromptRequired} wall=${Math.round(
        cycleWallMs / 1000
      )}s remaining=${formatDuration(remainingMs)} gate=${cycleLog.releaseGate}\n`
    );

    if (stopOnFirstInterrupt && (cycleReprompt > 0 || cycleTakeovers > 0 || infraCycleFailure)) {
      process.stdout.write(
        `[cycle ${cycleIndex}] stop-on-first-interrupt triggered (takeover=${cycleTakeovers}, reprompt=${cycleReprompt}, infra=${infraCycleFailure ? 1 : 0})\n`
      );
      break;
    }

    if (Date.now() >= deadlineAt || stats.cycleCount >= maxCycles) break;
    await sleep(cooldownMs);
  }

  const completedAt = Date.now();
  const observedDurationMs = completedAt - runStartedAt;
  const strictPass =
    observedDurationMs >= targetDurationMs && stats.takeoverCount === 0 && stats.repromptRequiredCount === 0;

  const summary = {
    startedAt: new Date(runStartedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    targetDurationMs,
    observedDurationMs,
    targetDurationHuman: formatDuration(targetDurationMs),
    observedDurationHuman: formatDuration(observedDurationMs),
    hostUrl,
    model,
    categories,
    strictPass,
    requirements: {
      takeoverCountMustBeZero: true,
      repromptRequiredCountMustBeZero: true,
      durationMustMeetTarget: true,
    },
    metrics: {
      cycleCount: stats.cycleCount,
      categoryRunCount: stats.categoryRunCount,
      completedCount: stats.completedCount,
      takeoverCount: stats.takeoverCount,
      repromptRequiredCount: stats.repromptRequiredCount,
      failedCount: stats.failedCount,
      infraFailureCount: stats.infraFailureCount,
      completionRate:
        stats.categoryRunCount > 0 ? Number((stats.completedCount / stats.categoryRunCount).toFixed(4)) : 0,
      medianElapsedMs: median(stats.elapsedSamplesMs),
      medianFirstToolMs: median(stats.firstToolSamplesMs),
      firstInterruptAtMs: stats.firstInterruptAtMs,
      firstInterruptCycle: stats.firstInterruptCycle,
      firstInterruptCategory: stats.firstInterruptCategory,
    },
    cycleLogs,
    tempRoot,
  };

  const outputPath = typeof flags.output === "string" ? path.resolve(flags.output) : path.join(tempRoot, "soak-report.json");
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  process.stdout.write(`\nAutonomy time soak report: ${outputPath}\n`);
  process.stdout.write(
    `Strict requirement result: ${strictPass ? "PASS" : "FAIL"} (takeover=${stats.takeoverCount}, reprompt=${stats.repromptRequiredCount}, duration=${formatDuration(
      observedDurationMs
    )})\n`
  );
  if (enforceStrictExit && !strictPass) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
