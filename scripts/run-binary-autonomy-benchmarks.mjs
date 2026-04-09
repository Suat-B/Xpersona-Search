import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_HOST_URL = process.env.BINARY_IDE_HOST_URL || "http://127.0.0.1:7777";
const DEFAULT_MODEL = "Binary IDE";
const POLL_INTERVAL_MS = 1200;
const MAX_WAIT_MS = 180000;
const DEFAULT_MAX_TOOL_STEPS = 128;
const DEFAULT_MAX_WORKSPACE_MUTATIONS = 64;
const DEFAULT_RELEASE_THRESHOLDS = {
  codingCompletionRate: 0.8,
  validationSuccessRate: 0.8,
  gitCloseoutSuccessRate: 1,
  maxAvoidableTakeoverRate: 0.2,
};
const DEFAULT_LATENCY_DELTA_THRESHOLDS = {
  chatFirstToolImprovement: 0.3,
  codingTotalRunImprovement: 0.15,
  desktopElapsedImprovement: 0.2,
};

const CATEGORY_DEFS = [
  {
    id: "multi_file_project_generation",
    gateLane: "repo_scaffold",
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
    id: "single_file_edit",
    gateLane: "single_file_edit",
    task:
      "Update the existing single-file-edit/index.js file in the current workspace so formatName trims whitespace, title-cases each word, and returns 'Unknown' for empty input. Keep this as a single-file edit, then run a shell command that prints the updated file so there is proof in the trace.",
    expectedPaths: ["single-file-edit", "single-file-edit/index.js"],
    requiredContents: {
      "single-file-edit/index.js": ["Unknown", "trim"],
    },
    setupFiles: [
      {
        path: "single-file-edit/index.js",
        content: 'export function formatName(name) {\n  return String(name ?? "");\n}\n',
      },
    ],
  },
  {
    id: "trusted_workspace_command_execution",
    task:
      "Create a folder named command-proof and a file command-proof/result.txt containing the text ok. Then run a shell command that lists the file you created so there is proof in the tool trace.",
    expectedPaths: ["command-proof", "command-proof/result.txt"],
  },
  {
    id: "chat_only_probe",
    gateLane: "chat_probe",
    task: "Reply with one concise sentence confirming you're ready.",
    expectedPaths: [],
  },
  {
    id: "browser_dom_mission_probe",
    gateLane: "browser_latency_probe",
    task:
      "Open YouTube in the browser, search for Outdoor Boys, open the best matching result, then report the final page title and URL.",
    expectedPaths: [],
  },
  {
    id: "desktop_latency_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open Calculator, calculate 12*12, tell me the answer, then close Calculator before finishing.",
    expectedPaths: [],
  },
  {
    id: "desktop_notepad_draft_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open Notepad, type exactly \"groceries: milk, eggs, bread\", read back the draft text, then close Notepad before finishing.",
    expectedPaths: [],
  },
  {
    id: "desktop_calculator_division_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open Calculator, calculate 144 divided by 12, confirm the displayed result, and close Calculator before finishing.",
    expectedPaths: [],
  },
  {
    id: "desktop_explorer_drive_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open File Explorer, navigate to C:\\\\, confirm that C drive is visible, then close File Explorer before finishing.",
    expectedPaths: [],
  },
  {
    id: "desktop_mixed_app_target_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open Notepad and Calculator. Type \"Desktop mixed target proof\" in Notepad, then calculate 9*9 in Calculator, verify both outcomes, and close both apps before finishing.",
    expectedPaths: [],
  },
  {
    id: "desktop_focus_recovery_probe",
    gateLane: "desktop_latency_probe",
    task:
      "Open Calculator and Notepad. Ensure Calculator is focused for math, calculate 21+21, report the result, and close both apps before finishing.",
    expectedPaths: [],
  },
  {
    id: "long_run_task",
    gateLane: "multi_file_feature_delivery",
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
    id: "validation_repair",
    gateLane: "validation_repair",
    task:
      "Repair the existing validation-repair project in the current workspace so npm test passes without rewriting the tests or changing the package name. Stop only after the repair is complete and the validation proof exists.",
    expectedPaths: [
      "validation-repair",
      "validation-repair/package.json",
      "validation-repair/src/index.js",
      "validation-repair/test/index.test.js",
    ],
    requiredCommands: ["npm test"],
    setupFiles: [
      {
        path: "validation-repair/package.json",
        content:
          '{\n  "name": "validation-repair",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "test": "node --test"\n  }\n}\n',
      },
      {
        path: "validation-repair/src/index.js",
        content:
          'export function sum(values) {\n  return Array.isArray(values) ? values.length : 0;\n}\n',
      },
      {
        path: "validation-repair/test/index.test.js",
        content:
          'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { sum } from "../src/index.js";\n\ntest("sum adds all numeric values", () => {\n  assert.equal(sum([1, 2, 3]), 6);\n  assert.equal(sum([]), 0);\n});\n',
      },
    ],
  },
  {
    id: "git_commit_workflow",
    gateLane: "git_closeout",
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
    gateLane: "multi_file_feature_delivery",
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

async function writeSetupFiles(rootDir, setupFiles = []) {
  for (const file of setupFiles) {
    const absolute = path.join(rootDir, file.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
  }
}

function listMissingContent(requiredContents, files) {
  if (!requiredContents || typeof requiredContents !== "object") return [];
  const fileMap = new Map(files.filter((file) => file.type === "file").map((file) => [file.path, file]));
  const missing = [];
  for (const [targetPath, snippets] of Object.entries(requiredContents)) {
    const file = fileMap.get(targetPath);
    const preview = String(file?.preview || "");
    const absent = Array.isArray(snippets) ? snippets.filter((snippet) => !preview.includes(String(snippet))) : [];
    if (absent.length) {
      missing.push(`${targetPath}: ${absent.join(", ")}`);
    }
  }
  return missing;
}

function summarizeCategory(category, exportedRun, files, elapsedMs) {
  const finalEnvelope = exportedRun.finalEnvelope && typeof exportedRun.finalEnvelope === "object" ? exportedRun.finalEnvelope : {};
  const loopState = finalEnvelope.loopState && typeof finalEnvelope.loopState === "object" ? finalEnvelope.loopState : {};
  const objectiveState = finalEnvelope.objectiveState && typeof finalEnvelope.objectiveState === "object" ? finalEnvelope.objectiveState : {};
  const queueDelayMs = readLatencyMetric(exportedRun, finalEnvelope, "queueDelayMs");
  const ttfrMs = readLatencyMetric(exportedRun, finalEnvelope, "ttfrMs");
  const firstToolMs = readLatencyMetric(exportedRun, finalEnvelope, "firstToolMs");
  const plannerLatencyMs = readLatencyMetric(exportedRun, finalEnvelope, "plannerLatencyMs");
  const providerLatencyMs = readLatencyMetric(exportedRun, finalEnvelope, "providerLatencyMs");
  const totalRunMs = readLatencyMetric(exportedRun, finalEnvelope, "totalRunMs");
  const fallbackCount = readLatencyMetric(exportedRun, finalEnvelope, "fallbackCount");
  const toolResults = Array.isArray(exportedRun.toolResults) ? exportedRun.toolResults : [];
  const missingPaths = listMissing(category.expectedPaths, files);
  const missingContent = listMissingContent(category.requiredContents, files);
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
  const wrongTargetViolations = toolResults.filter((item) =>
    /wrong-target guard blocked/i.test(String(item?.summary || item?.error || ""))
  ).length;
  const desktopRecoverySuppressions = toolResults.filter(
    (item) => typeof item?.data?.recoverySuppressedReason === "string" && String(item.data.recoverySuppressedReason).trim()
  ).length;
  const timeoutDetected = /timeout|budget timeout/i.test(
    `${String(exportedRun?.error || "")} ${String(finalEnvelope?.whyBinaryIsBlocked || "")}`.trim()
  );
  const completionChecklist = Array.isArray(objectiveState.completionChecklist) ? objectiveState.completionChecklist : [];
  const completedChecklistItems = completionChecklist.filter((item) => item?.status === "completed").length;
  const requiredProof = Array.isArray(objectiveState.requiredProof) ? objectiveState.requiredProof : [];
  const observedProof = Array.isArray(objectiveState.observedProof) ? objectiveState.observedProof : [];
  const missingRequirements = Array.isArray(finalEnvelope.missingRequirements) ? finalEnvelope.missingRequirements.map((item) => String(item)) : [];
  const failureCategory =
    typeof loopState.failureCategory === "string"
      ? loopState.failureCategory
      : missingRequirements.find((item) => /failure|validation|tool_result_failed|required_git_|weak_grounding|required_artifact_missing/.test(item)) || null;
  return {
    category: category.id,
    gateLane: category.gateLane || null,
    workspace: exportedRun.workspaceRoot || null,
    status: exportedRun.status,
    finishStatus: exportedRun.status,
    eventCount: Array.isArray(exportedRun.events) ? exportedRun.events.length : 0,
    artifactCorrect: missingPaths.length === 0 && missingContent.length === 0,
    validationPassed,
    totalToolCalls,
    successfulToolCalls: toolResults.filter((item) => item?.ok === true).length,
    failedToolCalls: toolResults.filter((item) => item?.ok === false).length,
    toolCounts,
    desktopOpenAppCount: Number(toolCounts.desktop_open_app || 0),
    wrongTargetViolations,
    desktopRecoverySuppressions,
    timeoutDetected,
    autonomyLane: typeof loopState.autonomyLane === "string" ? loopState.autonomyLane : objectiveState.autonomyLane || null,
    stackSpecializer: typeof objectiveState.stackSpecializer === "string" ? objectiveState.stackSpecializer : null,
    closeoutStage: typeof loopState.closeoutStage === "string" ? loopState.closeoutStage : null,
    failureCategory,
    closurePhaseReached: typeof loopState.closurePhase === "string" ? loopState.closurePhase : null,
    checklistCompletionRatio: completionChecklist.length ? completedChecklistItems / completionChecklist.length : 0,
    proofCompletionRatio: requiredProof.length ? observedProof.length / requiredProof.length : 0,
    unfinishedChecklistItems: completionChecklist
      .filter((item) => item?.status !== "completed")
      .map((item) => String(item?.label || item?.id || "unfinished"))
      .slice(0, 12),
    repairCategoryHistogram: failureCategory ? { [failureCategory]: 1 } : {},
    firstFailureStage:
      failureCategory ||
      (completionChecklist.find((item) => item?.status !== "completed")?.id ? String(completionChecklist.find((item) => item?.status !== "completed")?.id) : null),
    finalUnfinishedRequirements: missingRequirements,
    stalledBeforeFirstTool:
      exportedRun.status === "running" &&
      totalToolCalls === 0 &&
      Array.isArray(exportedRun.events) &&
      exportedRun.events.length <= 2,
    requiredCommandProof: Array.isArray(category.requiredCommands) ? matchedCommands.length === category.requiredCommands.length : true,
    matchedCommands,
    missingPaths,
    missingContent,
    missingRequirements,
    turns: typeof loopState.stepCount === "number" ? loopState.stepCount : toolResults.length,
    repeatedCallCount: typeof loopState.repeatedCallCount === "number" ? loopState.repeatedCallCount : 0,
    repairCount: typeof loopState.repairCount === "number" ? loopState.repairCount : 0,
    takeoverRequired: exportedRun.status === "takeover_required",
    elapsedMs,
    queueDelayMs,
    ttfrMs,
    firstToolMs,
    plannerLatencyMs,
    providerLatencyMs,
    totalRunMs,
    fallbackCount,
    traceId: exportedRun.traceId,
    runId: exportedRun.id,
    hostedRunId: exportedRun.runId || null,
    files,
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)) : sorted[mid];
}

function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLatencyMetric(exportedRun, finalEnvelope, key) {
  const timingState = exportedRun?.timingState && typeof exportedRun.timingState === "object" ? exportedRun.timingState : {};
  const lastExecutionState =
    exportedRun?.lastExecutionState && typeof exportedRun.lastExecutionState === "object" ? exportedRun.lastExecutionState : {};
  return (
    numericOrNull(timingState[key]) ??
    numericOrNull(finalEnvelope?.[key]) ??
    numericOrNull(lastExecutionState?.[key]) ??
    null
  );
}

function classifyLatencyLane(item) {
  const gateLane = String(item?.gateLane || "");
  const category = String(item?.category || "");
  if (gateLane === "chat_probe" || category === "chat_only_probe") return "chat";
  if (
    gateLane === "browser_latency_probe" ||
    category === "browser_dom_mission_probe" ||
    gateLane.startsWith("browser_") ||
    category.startsWith("browser_")
  ) {
    return "browser";
  }
  if (
    gateLane === "desktop_latency_probe" ||
    category === "desktop_latency_probe" ||
    gateLane.startsWith("desktop_") ||
    category.startsWith("desktop_")
  ) {
    return "desktop";
  }
  if (
    [
      "repo_scaffold",
      "single_file_edit",
      "multi_file_feature_delivery",
      "validation_repair",
      "git_closeout",
    ].includes(gateLane)
  ) {
    return "coding";
  }
  return "other";
}

function summarizeLaneMetrics(items) {
  const ttfr = items.map((item) => numericOrNull(item.ttfrMs)).filter((item) => item !== null);
  const firstTool = items.map((item) => numericOrNull(item.firstToolMs)).filter((item) => item !== null);
  const firstVisible = items
    .map((item) => numericOrNull(item.firstToolMs) ?? numericOrNull(item.ttfrMs))
    .filter((item) => item !== null);
  const totalRun = items.map((item) => numericOrNull(item.totalRunMs)).filter((item) => item !== null);
  const elapsed = items.map((item) => numericOrNull(item.elapsedMs)).filter((item) => item !== null);
  return {
    count: items.length,
    ttfrMs: median(ttfr),
    firstToolMs: median(firstTool),
    firstVisibleMs: median(firstVisible),
    totalRunMs: median(totalRun),
    elapsedMs: median(elapsed),
  };
}

function summarizeLatency(results) {
  const lanes = {
    chat: summarizeLaneMetrics(results.filter((item) => classifyLatencyLane(item) === "chat")),
    browser: summarizeLaneMetrics(results.filter((item) => classifyLatencyLane(item) === "browser")),
    desktop: summarizeLaneMetrics(results.filter((item) => classifyLatencyLane(item) === "desktop")),
    coding: summarizeLaneMetrics(results.filter((item) => classifyLatencyLane(item) === "coding")),
  };
  const codingTargets = results.filter((item) =>
    ["complex_autonomy_delivery", "git_commit_workflow"].includes(String(item.category || ""))
  );
  return {
    laneMedians: lanes,
    chatProbeCount: lanes.chat.count,
    browserProbeCount: lanes.browser.count,
    desktopProbeCount: lanes.desktop.count,
    codingTargetCount: codingTargets.length,
    medianChatTtfrMs: lanes.chat.ttfrMs,
    medianChatFirstToolMs: lanes.chat.firstVisibleMs,
    medianBrowserElapsedMs: lanes.browser.elapsedMs,
    medianCodingElapsedMs: lanes.coding.elapsedMs,
    medianCodingTotalRunMs: lanes.coding.totalRunMs,
    medianDesktopElapsedMs: lanes.desktop.elapsedMs,
    medianFallbackCount: median(results.map((item) => numericOrNull(item.fallbackCount)).filter((item) => item !== null)),
  };
}

function summarizeLatencyByCategory(results) {
  return Object.fromEntries(
    results.map((item) => [
      item.category,
      {
        elapsedMs: numericOrNull(item.elapsedMs),
        ttfrMs: numericOrNull(item.ttfrMs),
        firstToolMs: numericOrNull(item.firstToolMs),
        totalRunMs: numericOrNull(item.totalRunMs),
        queueDelayMs: numericOrNull(item.queueDelayMs),
        plannerLatencyMs: numericOrNull(item.plannerLatencyMs),
        providerLatencyMs: numericOrNull(item.providerLatencyMs),
        fallbackCount: numericOrNull(item.fallbackCount),
      },
    ])
  );
}

function parseBaselineLatency(summary) {
  if (!summary || typeof summary !== "object") return null;
  const laneMedians = summary?.laneMedians && typeof summary.laneMedians === "object" ? summary.laneMedians : {};
  return {
    medianChatTtfrMs: numericOrNull(summary.medianChatTtfrMs),
    medianChatFirstToolMs:
      numericOrNull(summary.medianChatFirstToolMs) ??
      numericOrNull(laneMedians?.chat?.firstVisibleMs) ??
      numericOrNull(laneMedians?.chat?.firstToolMs) ??
      numericOrNull(laneMedians?.chat?.ttfrMs),
    medianBrowserElapsedMs:
      numericOrNull(summary.medianBrowserElapsedMs) ??
      numericOrNull(laneMedians?.browser?.elapsedMs),
    medianCodingElapsedMs: numericOrNull(summary.medianCodingElapsedMs) ?? numericOrNull(laneMedians?.coding?.elapsedMs),
    medianCodingTotalRunMs:
      numericOrNull(summary.medianCodingTotalRunMs) ??
      numericOrNull(laneMedians?.coding?.totalRunMs),
    medianDesktopElapsedMs:
      numericOrNull(summary.medianDesktopElapsedMs) ??
      numericOrNull(laneMedians?.desktop?.elapsedMs),
  };
}

function evaluateLatencyDeltas(current, baseline, thresholds) {
  const failingReasons = [];
  const chatFirstToolImprovement =
    typeof baseline?.medianChatFirstToolMs === "number" &&
    baseline.medianChatFirstToolMs > 0 &&
    typeof current.medianChatFirstToolMs === "number"
      ? (baseline.medianChatFirstToolMs - current.medianChatFirstToolMs) / baseline.medianChatFirstToolMs
      : null;
  const codingTotalRunImprovement =
    typeof baseline?.medianCodingTotalRunMs === "number" &&
    baseline.medianCodingTotalRunMs > 0 &&
    typeof current.medianCodingTotalRunMs === "number"
      ? (baseline.medianCodingTotalRunMs - current.medianCodingTotalRunMs) / baseline.medianCodingTotalRunMs
      : null;
  const desktopElapsedImprovement =
    typeof baseline?.medianDesktopElapsedMs === "number" &&
    baseline.medianDesktopElapsedMs > 0 &&
    typeof current.medianDesktopElapsedMs === "number"
      ? (baseline.medianDesktopElapsedMs - current.medianDesktopElapsedMs) / baseline.medianDesktopElapsedMs
      : null;
  if (baseline) {
    if (chatFirstToolImprovement === null) {
      failingReasons.push("chat first-tool delta unavailable vs baseline");
    } else if (chatFirstToolImprovement < thresholds.chatFirstToolImprovement) {
      failingReasons.push(
        `chat first-tool improvement ${(chatFirstToolImprovement * 100).toFixed(1)}% < ${(
          thresholds.chatFirstToolImprovement * 100
        ).toFixed(1)}%`
      );
    }
    if (codingTotalRunImprovement === null) {
      failingReasons.push("coding total-run delta unavailable vs baseline");
    } else if (codingTotalRunImprovement < thresholds.codingTotalRunImprovement) {
      failingReasons.push(
        `coding total-run improvement ${(codingTotalRunImprovement * 100).toFixed(1)}% < ${(
          thresholds.codingTotalRunImprovement * 100
        ).toFixed(1)}%`
      );
    }
    if (desktopElapsedImprovement === null) {
      failingReasons.push("desktop elapsed delta unavailable vs baseline");
    } else if (desktopElapsedImprovement < thresholds.desktopElapsedImprovement) {
      failingReasons.push(
        `desktop elapsed improvement ${(desktopElapsedImprovement * 100).toFixed(1)}% < ${(
          thresholds.desktopElapsedImprovement * 100
        ).toFixed(1)}%`
      );
    }
  }
  return {
    thresholds,
    baselineAvailable: Boolean(baseline),
    baseline,
    current,
    chatFirstToolImprovement,
    codingTotalRunImprovement,
    desktopElapsedImprovement,
    passing: failingReasons.length === 0,
    failingReasons,
  };
}

function buildReleaseScorecard(results, thresholds, latencyGate) {
  const codingLanes = new Set([
    "repo_scaffold",
    "single_file_edit",
    "multi_file_feature_delivery",
    "validation_repair",
    "git_closeout",
  ]);
  const avoidableFailureCategories = new Set([
    "required_artifact_missing",
    "required_validation_missing",
    "validation_command_failure",
    "wrong_target_path",
    "git_closeout_incomplete",
    "repeated_non_progress",
    "broken_test_harness",
    "language_runtime_mismatch",
    "missing_required_file",
  ]);
  const codingResults = results.filter((item) => codingLanes.has(String(item.gateLane || "")));
  const desktopResults = results.filter((item) => classifyLatencyLane(item) === "desktop");
  const completedCoding = codingResults.filter((item) => item.finishStatus === "completed" && item.artifactCorrect);
  const completedDesktop = desktopResults.filter((item) => item.finishStatus === "completed");
  const validationRelevant = codingResults.filter(
    (item) => item.gateLane === "validation_repair" || item.requiredCommandProof === false || (item.matchedCommands || []).some((command) => String(command).includes("npm test"))
  );
  const gitRelevant = codingResults.filter((item) => item.gateLane === "git_closeout");
  const avoidableTakeovers = codingResults.filter(
    (item) => item.takeoverRequired && avoidableFailureCategories.has(String(item.failureCategory || ""))
  );
  const closureCompleted = codingResults.filter((item) => item.closurePhaseReached === "complete");
  const repairRelevant = codingResults.filter((item) => Number(item.repairCount || 0) > 0);
  const repairSuccessful = repairRelevant.filter((item) => item.finishStatus === "completed");
  const desktopWrongTargetTotal = desktopResults.reduce(
    (sum, item) => sum + Number(item?.wrongTargetViolations || 0),
    0
  );
  const desktopTimeoutCount = desktopResults.filter((item) => item.timeoutDetected === true).length;
  const metrics = {
    codingCompletionRate: codingResults.length ? completedCoding.length / codingResults.length : 1,
    validationSuccessRate: validationRelevant.length
      ? validationRelevant.filter((item) => item.validationPassed).length / validationRelevant.length
      : 1,
    repairSuccessRate: repairRelevant.length ? repairSuccessful.length / repairRelevant.length : 0,
    gitCloseoutSuccessRate: gitRelevant.length
      ? gitRelevant.filter((item) => item.finishStatus === "completed" && item.requiredCommandProof).length / gitRelevant.length
      : 1,
    endToEndCompletionRate: results.length ? results.filter((item) => item.finishStatus === "completed").length / results.length : 0,
    closureCompletionRate: codingResults.length ? closureCompleted.length / codingResults.length : 1,
    meanStepsToClosure: Number(mean(completedCoding.map((item) => item.turns || 0)).toFixed(2)),
    meanRepairsToClosure: Number(mean(completedCoding.map((item) => item.repairCount || 0)).toFixed(2)),
    avoidableTakeoverRate: codingResults.length ? avoidableTakeovers.length / codingResults.length : 0,
    desktopCompletionRate: desktopResults.length ? completedDesktop.length / desktopResults.length : 1,
    desktopWrongTargetTotal,
    desktopTimeoutCount,
  };
  const failures = [];
  if (metrics.codingCompletionRate < thresholds.codingCompletionRate) {
    failures.push(`coding completion ${metrics.codingCompletionRate.toFixed(2)} < ${thresholds.codingCompletionRate.toFixed(2)}`);
  }
  if (metrics.validationSuccessRate < thresholds.validationSuccessRate) {
    failures.push(`validation success ${metrics.validationSuccessRate.toFixed(2)} < ${thresholds.validationSuccessRate.toFixed(2)}`);
  }
  if (metrics.gitCloseoutSuccessRate < thresholds.gitCloseoutSuccessRate) {
    failures.push(`git closeout ${metrics.gitCloseoutSuccessRate.toFixed(2)} < ${thresholds.gitCloseoutSuccessRate.toFixed(2)}`);
  }
  if (metrics.avoidableTakeoverRate > thresholds.maxAvoidableTakeoverRate) {
    failures.push(`avoidable takeover ${metrics.avoidableTakeoverRate.toFixed(2)} > ${thresholds.maxAvoidableTakeoverRate.toFixed(2)}`);
  }
  if (desktopResults.length >= 1 && metrics.desktopCompletionRate < 1) {
    failures.push(`desktop completion ${metrics.desktopCompletionRate.toFixed(2)} < 1.00`);
  }
  if (desktopWrongTargetTotal > 0) {
    failures.push(`desktop wrong-target violations ${desktopWrongTargetTotal} > 0`);
  }
  if (desktopTimeoutCount > 0) {
    failures.push(`desktop timeouts ${desktopTimeoutCount} > 0`);
  }
  if (latencyGate && Array.isArray(latencyGate.failingReasons) && latencyGate.failingReasons.length) {
    failures.push(...latencyGate.failingReasons);
  }
  return {
    thresholds,
    metrics,
    latency: latencyGate || null,
    codingLaneCoverage: Object.fromEntries(
      Array.from(codingLanes).map((lane) => [
        lane,
        {
          total: codingResults.filter((item) => item.gateLane === lane).length,
          completed: codingResults.filter((item) => item.gateLane === lane && item.finishStatus === "completed" && item.artifactCorrect)
            .length,
        },
      ])
    ),
    passing: failures.length === 0,
    failingReasons: failures,
  };
}

async function runCategory(baseUrl, category) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `binary-autonomy-${category.id}-`));
  await mkdir(workspace, { recursive: true });
  await writeSetupFiles(workspace, category.setupFiles);
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
  const runIdCandidates = Array.from(
    new Set(
      [started?.id, started?.runId, started?.run?.id]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  if (!runIdCandidates.length) {
    throw new Error(`Run start response did not include a usable run id: ${JSON.stringify(started)}`);
  }

  const requestRun = async (pathBuilder, options = undefined) => {
    let lastUnknown = null;
    for (const runId of runIdCandidates) {
      try {
        return await requestJson(baseUrl, pathBuilder(runId), options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "");
        if (!message.includes("Unknown Binary Host run")) {
          throw error;
        }
        lastUnknown = error;
      }
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
        body: { action: "cancel", note: "Benchmark timeout" },
      });
    } catch {
      // Keep timeout handling best-effort.
    }
  }

  const exported = await requestRun((runId) => `/v1/runs/${encodeURIComponent(runId)}/export`);
  const files = await collectFiles(workspace);
  const summary = summarizeCategory(category, exported, files, Date.now() - startedAt);
  return {
    ...summary,
    timedOut: !done,
  };
}

function isRetryableCategoryError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Unknown Binary Host run") || message.includes("fetch failed");
}

async function runCategoryWithRetries(baseUrl, category, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runCategory(baseUrl, category);
    } catch (error) {
      lastError = error;
      if (!isRetryableCategoryError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(1200 * attempt);
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Benchmark category failed."));
}

async function loadJsonIfPresent(targetPath) {
  try {
    const raw = await readFile(targetPath, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeLatencyBaseline(targetPath, snapshot) {
  const existing = await loadJsonIfPresent(targetPath);
  const priorHistory = Array.isArray(existing?.history) ? existing.history : [];
  const nextHistory = [...priorHistory, snapshot].slice(-50);
  const baseline = {
    version: "binary_autonomy_latency_baseline_v1",
    updatedAt: snapshot.createdAt,
    summary: snapshot.summary,
    categories: snapshot.categories,
    history: nextHistory,
  };
  await writeFile(targetPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const baseUrl = String(flags["host-url"] || DEFAULT_HOST_URL).replace(/\/+$/, "");
  const thresholds = {
    codingCompletionRate: Number(flags["min-coding-completion"] || DEFAULT_RELEASE_THRESHOLDS.codingCompletionRate),
    validationSuccessRate: Number(flags["min-validation-success"] || DEFAULT_RELEASE_THRESHOLDS.validationSuccessRate),
    gitCloseoutSuccessRate: Number(flags["min-git-closeout-success"] || DEFAULT_RELEASE_THRESHOLDS.gitCloseoutSuccessRate),
    maxAvoidableTakeoverRate: Number(
      flags["max-avoidable-takeover-rate"] || DEFAULT_RELEASE_THRESHOLDS.maxAvoidableTakeoverRate
    ),
  };
  const latencyThresholds = {
    chatFirstToolImprovement: Number(
      flags["min-chat-first-tool-improvement"] ||
        flags["min-chat-ttfr-improvement"] ||
        DEFAULT_LATENCY_DELTA_THRESHOLDS.chatFirstToolImprovement
    ),
    codingTotalRunImprovement: Number(
      flags["min-coding-total-run-improvement"] ||
        flags["min-coding-elapsed-improvement"] ||
        DEFAULT_LATENCY_DELTA_THRESHOLDS.codingTotalRunImprovement
    ),
    desktopElapsedImprovement: Number(
      flags["min-desktop-elapsed-improvement"] || DEFAULT_LATENCY_DELTA_THRESHOLDS.desktopElapsedImprovement
    ),
  };
  const latencyBaselinePath =
    typeof flags["latency-baseline"] === "string"
      ? path.resolve(flags["latency-baseline"])
      : path.join(process.cwd(), "binary-autonomy-latency-baseline.json");
  const enforceLatencyGates = Boolean(flags["enforce-latency-gates"]);
  const writeLatencyBaselineFlag = Boolean(flags["write-latency-baseline"]);
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
    results.push(await runCategoryWithRetries(baseUrl, category));
  }
  const latencySummary = summarizeLatency(results);
  const loadedBaseline = await loadJsonIfPresent(latencyBaselinePath);
  const baselineSummary = parseBaselineLatency(loadedBaseline?.summary);
  const latencyGate = evaluateLatencyDeltas(latencySummary, baselineSummary, latencyThresholds);
  if (enforceLatencyGates && !latencyGate.baselineAvailable) {
    latencyGate.passing = false;
    latencyGate.failingReasons = [...latencyGate.failingReasons, "latency baseline missing"];
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
      latency: latencySummary,
      scorecard: buildReleaseScorecard(results, thresholds, latencyGate),
    },
  };

  const outputPath =
    typeof flags.output === "string"
      ? path.resolve(flags.output)
      : path.join(process.cwd(), "binary-autonomy-benchmarks.json");
  const scorecardPath =
    typeof flags["scorecard-output"] === "string"
      ? path.resolve(flags["scorecard-output"])
      : path.join(process.cwd(), "binary-autonomy-scorecard.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(scorecardPath, `${JSON.stringify(report.summary.scorecard, null, 2)}\n`, "utf8");
  if (writeLatencyBaselineFlag) {
    await writeLatencyBaseline(latencyBaselinePath, {
      createdAt: report.createdAt,
      summary: latencySummary,
      categories: summarizeLatencyByCategory(results),
    });
  }
  console.log(`Host: ${baseUrl}`);
  console.log(`Report: ${outputPath}`);
  console.log(`Scorecard: ${scorecardPath}`);
  console.log(`Latency baseline: ${latencyBaselinePath}${writeLatencyBaselineFlag ? " (updated)" : ""}`);
  console.log(`Benchmarks: ${results.length}`);
  console.log(
    `Release gate: ${report.summary.scorecard.passing ? "PASS" : "FAIL"}${
      report.summary.scorecard.failingReasons.length ? ` (${report.summary.scorecard.failingReasons.join("; ")})` : ""
    }`
  );

  if (flags["enforce-gates"] && !report.summary.scorecard.passing) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
