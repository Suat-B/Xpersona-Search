"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVisibleAssistantText,
  looksLikeCutieToolArtifactText,
  resolveNativeNextToolHints,
  selectCodeChangeAutonomyMode,
} = require("../out/cutie-native-autonomy.js");
const { CUTIE_MAX_MODEL_MESSAGES, limitCutieModelMessages } = require("../out/cutie-policy.js");

test("selectCodeChangeAutonomyMode chooses direct mode for a single mentioned file change", () => {
  const mode = selectCodeChangeAutonomyMode({
    goal: "code_change",
    prompt:
      'please create a tp3 in this file @"trading/ai-trading-research/Math-Foundations One/strategies/pending/FractalDimensionOscillator.pine"',
    mentionedPaths: ["trading/ai-trading-research/Math-Foundations One/strategies/pending/FractalDimensionOscillator.pine"],
    activeFilePath: null,
    openFilePaths: [],
    objectiveBasedRuns: true,
  });

  assert.equal(mode, "direct");
});

test("selectCodeChangeAutonomyMode keeps broad multi-file requests in objective mode", () => {
  const mode = selectCodeChangeAutonomyMode({
    goal: "code_change",
    prompt: "update this feature across the whole workspace and fix every related file",
    mentionedPaths: [],
    activeFilePath: "src/app.ts",
    openFilePaths: ["src/app.ts", "src/lib.ts"],
    objectiveBasedRuns: true,
  });

  assert.equal(mode, "objective");
});

test("selectCodeChangeAutonomyMode chooses direct mode for a simple trusted single-target edit without explicit file wording", () => {
  const mode = selectCodeChangeAutonomyMode({
    goal: "code_change",
    prompt: "please create a trailing stop loss",
    mentionedPaths: [],
    activeFilePath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    openFilePaths: ["trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine"],
    preferredTargetPath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    resolvedTargetCount: 1,
    trustedTargetCount: 1,
    concreteEntityResolved: true,
    objectiveBasedRuns: true,
  });

  assert.equal(mode, "direct");
});

test("selectCodeChangeAutonomyMode keeps simple outcome-style single-target edits in direct mode", () => {
  const mode = selectCodeChangeAutonomyMode({
    goal: "code_change",
    prompt:
      'I need a trailing stop loss in @"trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine"',
    mentionedPaths: ["trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine"],
    activeFilePath: null,
    openFilePaths: [],
    preferredTargetPath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    resolvedTargetCount: 1,
    trustedTargetCount: 1,
    concreteEntityResolved: true,
    objectiveBasedRuns: true,
  });

  assert.equal(mode, "direct");
});

test("selectCodeChangeAutonomyMode keeps single-file removal follow-ups in direct mode", () => {
  const mode = selectCodeChangeAutonomyMode({
    goal: "code_change",
    prompt: "remove the memory window",
    mentionedPaths: [],
    activeFilePath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    openFilePaths: ["trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine"],
    preferredTargetPath: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    resolvedTargetCount: 1,
    trustedTargetCount: 1,
    concreteEntityResolved: true,
    objectiveBasedRuns: true,
  });

  assert.equal(mode, "direct");
});

test("resolveNativeNextToolHints pushes direct single-file runs toward mutation after read_file", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
    targetAcquisitionPhase: "mutation",
    currentRepairTactic: "patch_mutation",
    hasCompletedRead: true,
    hasCompletedMutation: false,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["patch_file", "run_command", "write_file"]);
});

test("resolveNativeNextToolHints prefers read_file first when the target is known but not inspected yet", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
    targetAcquisitionPhase: "target_inspection",
    currentRepairTactic: "read_target",
    hasCompletedRead: false,
    hasCompletedMutation: false,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["read_file"]);
});

test("resolveNativeNextToolHints pushes verified-needed runs toward verification after mutation", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
    targetAcquisitionPhase: "verification",
    currentRepairTactic: "verification",
    hasCompletedRead: true,
    hasCompletedMutation: true,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["run_command", "get_diagnostics"]);
});

test("resolveNativeNextToolHints prefers semantic recovery tools after the target has been inspected", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
    targetAcquisitionPhase: "semantic_recovery",
    currentRepairTactic: "semantic_search",
    hasCompletedRead: true,
    hasCompletedMutation: false,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["run_command", "search_workspace", "patch_file", "write_file"]);
});

test("resolveNativeNextToolHints falls back to target acquisition tools when no target is known", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: null,
    targetAcquisitionPhase: "target_acquisition",
    currentRepairTactic: "infer_target",
    hasCompletedRead: false,
    hasCompletedMutation: false,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["search_workspace", "list_files"]);
});

test("looksLikeCutieToolArtifactText detects raw tool markup and strips it from visible assistant text", () => {
  const raw =
    'I am reading the file now.\n\n[TOOL_CALL]\n{tool_call: "read_file", args: {"path":"src/app.ts"}}\n[/TOOL_CALL]';

  assert.equal(looksLikeCutieToolArtifactText(raw), true);
  assert.equal(extractVisibleAssistantText(raw), "I am reading the file now.");
});

test("looksLikeCutieToolArtifactText detects top-level toolName json and strips it from visible assistant text", () => {
  const raw =
    'I am applying the trailing stop update now.\n\n{"toolName":"patch_file","arguments":{"path":"src/app.ts","baseRevision":"sha1:abc","edits":[]}}';

  assert.equal(looksLikeCutieToolArtifactText(raw), true);
  assert.equal(extractVisibleAssistantText(raw), "I am applying the trailing stop update now.");
});

test("looksLikeCutieToolArtifactText ignores normal assistant prose", () => {
  const raw = "I am updating the trailing stop logic now and will verify it next.";

  assert.equal(looksLikeCutieToolArtifactText(raw), false);
  assert.equal(extractVisibleAssistantText(raw), raw);
});

test("limitCutieModelMessages keeps the newest turns while preserving system messages and staying under the API cap", () => {
  const messages = [
    { role: "system", content: "initial system" },
    ...Array.from({ length: 88 }, (_, index) => ({
      role: index % 11 === 0 ? "system" : index % 2 === 0 ? "user" : "assistant",
      content: `message-${index + 1}`,
    })),
  ];

  const limited = limitCutieModelMessages(messages, CUTIE_MAX_MODEL_MESSAGES);

  assert.ok(limited.length <= CUTIE_MAX_MODEL_MESSAGES);
  assert.equal(limited[0].role, "system");
  assert.equal(limited[0].content, "initial system");
  assert.equal(limited.at(-1).content, "message-88");
  assert.ok(limited.some((message) => message.role === "system" && message.content === "message-12"));
});
