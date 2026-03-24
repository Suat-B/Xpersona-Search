"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeTargetContent,
  buildCodeTaskFrame,
  buildEntityPresenceProbeCommand,
  buildTargetCandidates,
  inferNoOpConclusionFromCommandResult,
  summarizeTaskFrame,
} = require("../out/cutie-code-intelligence.js");

test("buildCodeTaskFrame normalizes remove trailing stop loss requests against the current file", () => {
  const frame = buildCodeTaskFrame({
    prompt: "please remove the trailing stop loss in this file",
    mentionedPaths: [],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });

  assert.equal(frame.action, "remove");
  assert.equal(frame.entity, "trailing_stop_loss");
  assert.equal(frame.targetMode, "implied_current_file");
  assert.equal(frame.confidence, "high");
  assert.ok(frame.semanticQueries.includes("trail_points"));
  assert.match(String(summarizeTaskFrame(frame)), /remove trailing stop loss/i);
});

test("buildTargetCandidates preserves preferred, active, open, and recent runtime targets in priority order", () => {
  const candidates = buildTargetCandidates({
    preferredTargetPath: "src/main.ts",
    preferredTargetSource: "mentioned_path",
    preferredTargetConfidence: "trusted",
    activeFilePath: "src/secondary.ts",
    openFilePaths: ["src/secondary.ts", "src/helper.ts"],
    latestRuntimePath: "src/archived.ts",
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.path),
    ["src/main.ts", "src/secondary.ts", "src/helper.ts", "src/archived.ts"]
  );
});

test("analyzeTargetContent finds trailing-stop evidence and can also prove likely absence", () => {
  const frame = buildCodeTaskFrame({
    prompt: "remove the trailing stop loss",
    mentionedPaths: ["src/app.ts"],
    preferredTargetPath: "src/app.ts",
    targetConfidence: "trusted",
  });
  const withTrail = analyzeTargetContent({
    taskFrame: frame,
    content: [
      "strategy.exit(\"Long Exit\", from_entry=\"Long\", trail_points=atrValue, trail_offset=atrValue)",
      "plot(close)",
    ].join("\n"),
  });
  assert.equal(withTrail.found, true);
  assert.match(withTrail.summary, /Found trailing stop loss evidence/i);

  const withoutTrail = analyzeTargetContent({
    taskFrame: frame,
    content: ["strategy.entry(\"Long\", strategy.long)", "plot(close)"].join("\n"),
  });
  assert.equal(withoutTrail.found, false);
  assert.equal(withoutTrail.confidentAbsent, true);
});

test("buildEntityPresenceProbeCommand emits the no-match sentinel and inferNoOpConclusionFromCommandResult recognizes it", () => {
  const frame = buildCodeTaskFrame({
    prompt: "remove the trailing stop loss",
    mentionedPaths: ["src/app.ts"],
    preferredTargetPath: "src/app.ts",
    targetConfidence: "trusted",
  });
  const command = buildEntityPresenceProbeCommand("src/app.ts", frame.semanticQueries);
  assert.match(command, /CUTIE_ENTITY_NOT_FOUND/);

  const noOp = inferNoOpConclusionFromCommandResult({
    taskFrame: frame,
    preferredTargetPath: "src/app.ts",
    command,
    stdout: "CUTIE_ENTITY_NOT_FOUND",
  });
  assert.match(String(noOp), /no file change was needed/i);
});
