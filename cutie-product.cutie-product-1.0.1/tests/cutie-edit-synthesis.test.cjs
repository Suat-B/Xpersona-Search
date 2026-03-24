"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCodeTaskFrame } = require("../out/cutie-code-intelligence.js");
const { buildEditIntent, realizeEditPlan, synthesizeEditPlan } = require("../out/cutie-edit-synthesis.js");

test("buildEditIntent marks single-file and multi-file scopes correctly", () => {
  const taskFrame = buildCodeTaskFrame({
    prompt: "please create a trailing stop loss",
    mentionedPaths: ["src/app.ts"],
    preferredTargetPath: "src/app.ts",
    targetConfidence: "trusted",
  });
  const single = buildEditIntent({
    prompt: "please create a trailing stop loss",
    taskFrame,
    targetPaths: ["src/app.ts"],
  });
  const multi = buildEditIntent({
    prompt: "update these files",
    taskFrame,
    targetPaths: ["src/app.ts", "src/lib.ts"],
  });

  assert.equal(single.scope, "single_file");
  assert.equal(multi.scope, "multi_file");
});

test("synthesizeEditPlan builds anchor-based operations for Pine trailing stop requests", () => {
  const taskFrame = buildCodeTaskFrame({
    prompt: 'create a trailing stop loss in @"strategies/CMMI_Strategy_6.pine"',
    mentionedPaths: ["strategies/CMMI_Strategy_6.pine"],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });
  const result = synthesizeEditPlan({
    prompt: 'create a trailing stop loss in @"strategies/CMMI_Strategy_6.pine"',
    taskFrame,
    targets: [
      {
        path: "strategies/CMMI_Strategy_6.pine",
        revisionId: "sha1:abc",
        content: [
          "//@version=6",
          'strategy("Example", overlay=true)',
          'trade_qty = input.int(1, "Trade Quantity", minval=1)',
          "if barstate.isconfirmed",
          '    strategy.entry("Long", strategy.long, qty=trade_qty)',
          '    strategy.entry("Short", strategy.short, qty=trade_qty)',
        ].join("\n"),
      },
    ],
  });

  assert.ok(result.plan);
  assert.equal(result.plan.targets[0].operations[0].kind, "insert_after");
  assert.ok(result.plan.targets[0].operations.some((op) => op.kind === "insert_after" && /Long/.test(op.text || "")));
});

test("realizeEditPlan prefers patch_file when anchor edits can be realized cleanly", () => {
  const taskFrame = buildCodeTaskFrame({
    prompt: "please create a trailing take profit",
    mentionedPaths: ["strategies/CMMI_Strategy_6.pine"],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });
  const content = [
    "//@version=6",
    'strategy("Example", overlay=true)',
    "",
    'trade_qty = input.int(1, "Trade Quantity", minval=1)',
    'trail_points = input.float(0.5, "Trailing Stop Distance (points)", minval=0.0)',
    "",
    "if barstate.isconfirmed",
    '    strategy.entry("Long", strategy.long, qty=trade_qty)',
    '    strategy.exit("LongTrail", from_entry="Long", trail_points=trail_points, trail_offset=trail_points)',
    '    strategy.entry("Short", strategy.short, qty=trade_qty)',
    '    strategy.exit("ShortTrail", from_entry="Short", trail_points=trail_points, trail_offset=trail_points)',
  ].join("\n");
  const synthesized = synthesizeEditPlan({
    prompt: "please create a trailing take profit",
    taskFrame,
    targets: [{ path: "strategies/CMMI_Strategy_6.pine", revisionId: "sha1:abc", content }],
  });

  assert.ok(synthesized.plan);
  const realized = realizeEditPlan({
    plan: synthesized.plan,
    latestFileStates: new Map([
      [
        "strategies/CMMI_Strategy_6.pine",
        {
          path: "strategies/CMMI_Strategy_6.pine",
          content,
          revisionId: "sha1:abc",
          full: true,
        },
      ],
    ]),
  });

  assert.equal(realized.mode, "patch_file");
  assert.equal(realized.toolCall.name, "patch_file");
  assert.ok(Array.isArray(realized.toolCall.arguments.edits));
});

test("realizeEditPlan reports anchor failures instead of fabricating a mutation", () => {
  const taskFrame = buildCodeTaskFrame({
    prompt: "remove the memory window",
    mentionedPaths: ["strategies/CMMI_Strategy_6.pine"],
    preferredTargetPath: "strategies/CMMI_Strategy_6.pine",
    targetConfidence: "trusted",
  });
  const synthesized = synthesizeEditPlan({
    prompt: "remove the memory window",
    taskFrame,
    targets: [
      {
        path: "strategies/CMMI_Strategy_6.pine",
        revisionId: "sha1:abc",
        content: ['//@version=6', 'strategy("Example", overlay=true)', "plot(close)"].join("\n"),
      },
    ],
  });

  assert.ok(synthesized.plan);
  const realized = realizeEditPlan({
    plan: synthesized.plan,
    latestFileStates: new Map([
      [
        "strategies/CMMI_Strategy_6.pine",
        {
          path: "strategies/CMMI_Strategy_6.pine",
          content: ['//@version=6', 'strategy("Example", overlay=true)', "plot(close)"].join("\n"),
          revisionId: "sha1:abc",
          full: true,
        },
      ],
    ]),
  });

  assert.equal(realized.mode, "unrealizable");
  assert.match(String(realized.failureReason || ""), /anchor/i);
});
