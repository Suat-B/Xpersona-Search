"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBootstrapToolCall,
  classifyTaskGoalWithContext,
  describePlanningFailureAfterInspection,
  promoteTrustedSingleTarget,
  tryRescueStructuredFromSuppressedArtifact,
  validateAndNormalizeToolCall,
  validateAndCoerceMutationToolCall,
} = require("../out/cutie-runtime.js");
const { buildCodeTaskFrame, buildTargetCandidates } = require("../out/cutie-code-intelligence.js");

function makeRun(overrides = {}) {
  return {
    id: "run_1",
    sessionId: "session_1",
    status: "running",
    phase: "planning",
    goal: "code_change",
    goalSatisfied: false,
    repairAttemptCount: 0,
    escalationState: "none",
    stepCount: 1,
    maxSteps: 48,
    workspaceMutationCount: 0,
    maxWorkspaceMutations: 24,
    desktopMutationCount: 0,
    maxDesktopMutations: 20,
    startedAt: new Date().toISOString(),
    receipts: [],
    repeatedCallCount: 0,
    objectivesPhase: "off",
    deadEndMemory: [],
    objectiveRepairCount: 0,
    noProgressTurns: 0,
    stallLevel: "none",
    ...overrides,
  };
}

test("tryRescueStructuredFromSuppressedArtifact rescues top-level write_file payloads", () => {
  const rescued = tryRescueStructuredFromSuppressedArtifact({
    artifact:
      '{"toolName":"write_file","arguments":{"path":"src/app.ts","content":"next","overwrite":true,"baseRevision":"sha1:abc"}}',
    allowedToolNames: ["write_file", "patch_file"],
  });

  assert.equal("structured" in rescued, true);
  assert.equal(rescued.toolName, "write_file");
  assert.equal(rescued.artifactExtractionShape, "top_level_tool_name");
  assert.equal(rescued.structured.type, "tool_call");
});

test("tryRescueStructuredFromSuppressedArtifact rescues partial tool_call wrappers for verification tools", () => {
  const rescued = tryRescueStructuredFromSuppressedArtifact({
    artifact: '{"type":"tool_call","tool_call":{"name":"get_diagnostics","arguments":{}}',
    allowedToolNames: ["get_diagnostics", "run_command"],
  });

  assert.equal("structured" in rescued, true);
  assert.equal(rescued.toolName, "get_diagnostics");
  assert.equal(rescued.artifactExtractionShape, "tool_call_wrapper");
  assert.deepEqual(rescued.structured, {
    type: "tool_call",
    tool_call: {
      name: "get_diagnostics",
      arguments: {},
    },
  });
});

test("validateAndCoerceMutationToolCall coerces numeric-string patch arguments", () => {
  const result = validateAndCoerceMutationToolCall({
    toolCall: {
      id: "tool_1",
      name: "patch_file",
      arguments: {
        path: "src/app.ts",
        baseRevision: "sha1:abc",
        edits: {
          startLine: "10",
          deleteLineCount: "0",
          replacement: "next",
        },
      },
    },
    run: makeRun({ currentRepairTactic: "patch_mutation" }),
  });

  assert.ok(result.toolCall);
  assert.equal(result.coercionMode, "patch_argument_coercion");
  assert.deepEqual(result.toolCall.arguments.edits, [
    {
      startLine: 10,
      deleteLineCount: 0,
      replacement: "next",
    },
  ]);
});

test("validateAndCoerceMutationToolCall blocks patch_file in full rewrite mode", () => {
  const result = validateAndCoerceMutationToolCall({
    toolCall: {
      id: "tool_1",
      name: "patch_file",
      arguments: {
        path: "src/app.ts",
        baseRevision: "sha1:abc",
        edits: [{ startLine: 10, deleteLineCount: 0, replacement: "next" }],
      },
    },
    run: makeRun({ currentRepairTactic: "full_rewrite", patchDisabledForRun: true }),
  });

  assert.equal(result.toolCall, null);
  assert.equal(result.coercionMode, "patch_disabled_write_mode");
  assert.match(String(result.error || ""), /write_file/i);
});

test("describePlanningFailureAfterInspection explains post-read recovery failures", () => {
  const reason = describePlanningFailureAfterInspection(
    makeRun({
      preferredTargetPath: "src/app.ts",
      receipts: [
        {
          id: "receipt_1",
          step: 1,
          toolName: "read_file",
          kind: "observe",
          domain: "workspace",
          status: "completed",
          summary: "Read src/app.ts lines 1-40.",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          data: { path: "src/app.ts" },
        },
      ],
      postInspectionRecoveryAttempted: true,
      postInspectionFailureReason:
        "Cutie inspected src/app.ts, but deterministic post-inspection recovery still could not produce a usable next action.",
    }),
    "Cutie could not get a usable planning response from the model."
  );

  assert.match(reason, /deterministic post-inspection recovery/i);
  assert.match(reason, /src\/app\.ts/i);
});

test("classifyTaskGoalWithContext treats mentioned-file outcome requests as code changes", () => {
  const prompt =
    'I need a traling stop loss in @"trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine"';
  const preferredTargetPath =
    "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine";
  const taskFrame = buildCodeTaskFrame({
    prompt,
    mentionedPaths: [preferredTargetPath],
    preferredTargetPath,
    targetConfidence: "trusted",
  });
  const targetCandidates = buildTargetCandidates({
    preferredTargetPath,
    preferredTargetSource: "mentioned_path",
    preferredTargetConfidence: "trusted",
    activeFilePath: null,
    openFilePaths: [],
    latestRuntimePath: null,
  });

  const result = classifyTaskGoalWithContext({
    prompt,
    mentionContext: { mentionedPaths: [preferredTargetPath], mentionedWindows: [] },
    preferredTargetPath,
    targetCandidates,
    taskFrame,
  });

  assert.equal(result.goal, "code_change");
  assert.equal(result.source, "mentioned_file_entity");
});

test("classifyTaskGoalWithContext treats trusted-target outcome requests as code changes", () => {
  const prompt = "I need a trailing stop loss";
  const preferredTargetPath =
    "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine";
  const taskFrame = buildCodeTaskFrame({
    prompt,
    mentionedPaths: [],
    preferredTargetPath,
    targetConfidence: "trusted",
  });
  const targetCandidates = buildTargetCandidates({
    preferredTargetPath,
    preferredTargetSource: "active_file",
    preferredTargetConfidence: "trusted",
    activeFilePath: preferredTargetPath,
    openFilePaths: [preferredTargetPath],
    latestRuntimePath: null,
  });

  const result = classifyTaskGoalWithContext({
    prompt,
    mentionContext: { mentionedPaths: [], mentionedWindows: [] },
    preferredTargetPath,
    targetCandidates,
    taskFrame,
  });

  assert.equal(result.goal, "code_change");
  assert.equal(result.source, "trusted_target_entity");
});

test("classifyTaskGoalWithContext keeps true greetings in conversation mode", () => {
  const result = classifyTaskGoalWithContext({
    prompt: "hello",
    mentionContext: { mentionedPaths: [], mentionedWindows: [] },
    preferredTargetPath: null,
    targetCandidates: [],
    taskFrame: buildCodeTaskFrame({
      prompt: "hello",
      mentionedPaths: [],
      preferredTargetPath: null,
      targetConfidence: "none",
    }),
  });

  assert.equal(result.goal, "conversation");
  assert.equal(result.source, "small_talk");
});

test("buildBootstrapToolCall refuses to read files for conversation runs", () => {
  const tool = buildBootstrapToolCall({
    prompt: 'hello @"src/app.ts"',
    context: {},
    mentionContext: { mentionedPaths: ["src/app.ts"], mentionedWindows: [] },
    run: makeRun({
      goal: "conversation",
      goalSatisfied: true,
      preferredTargetPath: "src/app.ts",
      stepCount: 0,
      receipts: [],
    }),
  });

  assert.equal(tool, null);
});

test("promoteTrustedSingleTarget upgrades a lone trusted active file into the preferred target", () => {
  const promoted = promoteTrustedSingleTarget({
    prompt: "remove the memory window",
    mentionContext: { mentionedPaths: [], mentionedWindows: [] },
    preferredTargetPath: null,
    targetCandidates: [
      {
        path: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
        source: "active_file",
        confidence: "trusted",
      },
    ],
  });

  assert.deepEqual(promoted, {
    path: "trading/ai-trading-research/Math-Foundations One/strategies/pending/CMMI_Strategy_6.pine",
    source: "active_file",
    confidence: "trusted",
  });
});

test("validateAndNormalizeToolCall blocks empty search queries before tool execution", () => {
  const result = validateAndNormalizeToolCall({
    toolCall: {
      id: "tool_1",
      name: "search_workspace",
      arguments: { query: "   " },
    },
    run: makeRun(),
  });

  assert.equal(result.toolCall, null);
  assert.match(String(result.error || ""), /non-empty string/i);
});
