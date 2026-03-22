"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVisibleAssistantText,
  looksLikeCutieToolArtifactText,
  resolveNativeNextToolHints,
  selectCodeChangeAutonomyMode,
} = require("../out/cutie-native-autonomy.js");

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

test("resolveNativeNextToolHints pushes direct single-file runs toward mutation after read_file", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
    hasCompletedRead: true,
    hasCompletedMutation: false,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["patch_file", "write_file", "run_command"]);
});

test("resolveNativeNextToolHints prefers read_file first when the target is known but not inspected yet", () => {
  const hints = resolveNativeNextToolHints({
    goal: "code_change",
    autonomyMode: "direct",
    preferredTargetPath: "src/app.ts",
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
    hasCompletedRead: true,
    hasCompletedMutation: true,
    hasVerifiedOutcome: false,
  });

  assert.deepEqual(hints, ["run_command", "get_diagnostics"]);
});

test("looksLikeCutieToolArtifactText detects raw tool markup and strips it from visible assistant text", () => {
  const raw =
    'I am reading the file now.\n\n[TOOL_CALL]\n{tool_call: "read_file", args: {"path":"src/app.ts"}}\n[/TOOL_CALL]';

  assert.equal(looksLikeCutieToolArtifactText(raw), true);
  assert.equal(extractVisibleAssistantText(raw), "I am reading the file now.");
});

test("looksLikeCutieToolArtifactText ignores normal assistant prose", () => {
  const raw = "I am updating the trailing stop logic now and will verify it next.";

  assert.equal(looksLikeCutieToolArtifactText(raw), false);
  assert.equal(extractVisibleAssistantText(raw), raw);
});
