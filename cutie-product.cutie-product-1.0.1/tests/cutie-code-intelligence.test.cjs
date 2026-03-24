"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeTargetContent,
  buildCodeTaskFrame,
  buildEntityPresenceProbeCommand,
  buildTargetCandidates,
  inferNoOpConclusionFromCommandResult,
  refineTaskFrameFromTargetContent,
  synthesizeDeterministicRewriteFromTargetContent,
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

test("analyzeTargetContent does not treat generic strategy.exit lines as take-profit evidence", () => {
  const frame = buildCodeTaskFrame({
    prompt: "please add a take profit",
    mentionedPaths: ["src/app.ts"],
    preferredTargetPath: "src/app.ts",
    targetConfidence: "trusted",
  });
  const result = analyzeTargetContent({
    taskFrame: frame,
    content: [
      'strategy.exit("LongTrail", from_entry="Long", trail_points=trail_points, trail_offset=trail_points)',
      "plot(close)",
    ].join("\n"),
  });

  assert.equal(result.found, false);
  assert.equal(result.confidentAbsent, true);
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

test("buildCodeTaskFrame preserves identifier-style remove requests as useful semantic queries", () => {
  const frame = buildCodeTaskFrame({
    prompt: "remove the memory window",
    mentionedPaths: [],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });

  assert.equal(frame.action, "remove");
  assert.equal(frame.entity, "memory_window");
  assert.equal(frame.entityLabel, "memory window");
  assert.equal(frame.confidence, "high");
  assert.ok(frame.semanticQueries.includes("memory_window"));
  assert.ok(frame.semanticQueries.includes("memory window"));
});

test("buildCodeTaskFrame tolerates common trailing-stop typos", () => {
  const frame = buildCodeTaskFrame({
    prompt: "please create a traling stop loss in this file",
    mentionedPaths: [],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });

  assert.equal(frame.action, "add");
  assert.equal(frame.entity, "trailing_stop_loss");
  assert.ok(frame.semanticQueries.includes("trail_offset"));
});

test("refineTaskFrameFromTargetContent snaps fuzzy entity labels to identifiers found in the file", () => {
  const taskFrame = {
    action: "remove",
    entity: "memory_window",
    entityLabel: "memory window",
    targetMode: "implied_current_file",
    confidence: "low",
    evidence: ["action:remove"],
    semanticQueries: ["memory window"],
  };

  const refined = refineTaskFrameFromTargetContent({
    taskFrame,
    content: "memory_window = input.int(30, \"Memory Window\")\nplot(close)",
  });

  assert.equal(refined.entity, "memory_window");
  assert.equal(refined.entityLabel, "memory window");
  assert.equal(refined.confidence, "high");
  assert.ok(refined.semanticQueries.includes("memory_window"));
  assert.ok(refined.evidence.some((item) => /refinedEntity:memory_window/.test(item)));
});

test("synthesizeDeterministicRewriteFromTargetContent adds Pine trailing exits for simple stop-loss requests", () => {
  const frame = buildCodeTaskFrame({
    prompt: "please create a traling stop loss",
    mentionedPaths: ["strategies/CMMI_Strategy_6.pine"],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });

  const rewritten = synthesizeDeterministicRewriteFromTargetContent({
    taskFrame: frame,
    content: [
      "//@version=6",
      'strategy("Example", overlay=true)',
      "",
      "trade_qty = input.int(1, \"Trade Quantity\", minval=1)",
      "",
      "if barstate.isconfirmed",
      "    if long_condition",
      '        strategy.entry("Long", strategy.long, qty=trade_qty)',
      "    if short_condition",
      '        strategy.entry("Short", strategy.short, qty=trade_qty)',
    ].join("\n"),
  });

  assert.ok(rewritten);
  assert.match(rewritten.content, /trail_points = input\.float/);
  assert.match(rewritten.content, /strategy\.exit\("LongTrail".*trail_points=trail_points.*trail_offset=trail_points\)/);
  assert.match(rewritten.content, /strategy\.exit\("ShortTrail".*trail_points=trail_points.*trail_offset=trail_points\)/);
});

test("synthesizeDeterministicRewriteFromTargetContent adds Pine take-profit limits to existing exits", () => {
  const frame = buildCodeTaskFrame({
    prompt: "please create a trailing take profit",
    mentionedPaths: ["strategies/CMMI_Strategy_6.pine"],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });

  const rewritten = synthesizeDeterministicRewriteFromTargetContent({
    taskFrame: frame,
    content: [
      "//@version=6",
      'strategy("Example", overlay=true)',
      "",
      "trade_qty = input.int(1, \"Trade Quantity\", minval=1)",
      "// Trailing stop distance in price points.",
      'trail_points = input.float(0.5, "Trailing Stop Distance (points)", minval=0.0)',
      "",
      "if barstate.isconfirmed",
      "    if long_condition",
      '        strategy.entry("Long", strategy.long, qty=trade_qty)',
      '        strategy.exit("LongTrail", from_entry="Long", trail_points=trail_points, trail_offset=trail_points)',
      "    if short_condition",
      '        strategy.entry("Short", strategy.short, qty=trade_qty)',
      '        strategy.exit("ShortTrail", from_entry="Short", trail_points=trail_points, trail_offset=trail_points)',
    ].join("\n"),
  });

  assert.ok(rewritten);
  assert.match(rewritten.content, /take_profit_points = input\.float/);
  assert.match(rewritten.content, /LongTrail.*limit=strategy\.position_avg_price \+ take_profit_points/);
  assert.match(rewritten.content, /ShortTrail.*limit=strategy\.position_avg_price - take_profit_points/);
});
