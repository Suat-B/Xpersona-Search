"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appendDeadEndMemory,
  batchNeedsMoreAutonomy,
  getCurrentStrategyLabel,
  getStallLabel,
  hasCompletedTargetInspection,
  hasCodeChangeCompletionProof,
  isMeaningfulProgressReceipt,
  requiresCodeChangeVerification,
  resolveRetryStrategy,
} = require("../out/cutie-autonomy-controller.js");

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

test("code change completion proof requires mutation plus verification evidence", () => {
  const mutationOnlyRun = makeRun({
    receipts: [
      {
        id: "tool_1",
        step: 1,
        toolName: "patch_file",
        kind: "mutate",
        domain: "workspace",
        status: "completed",
        summary: "Patched src/app.ts.",
        startedAt: "2026-03-22T00:00:00.000Z",
        finishedAt: "2026-03-22T00:00:01.000Z",
      },
    ],
  });
  assert.equal(hasCodeChangeCompletionProof(mutationOnlyRun), false);
  assert.equal(requiresCodeChangeVerification(mutationOnlyRun), true);

  const verifiedRun = makeRun({
    receipts: [
      {
        id: "tool_1",
        step: 1,
        toolName: "patch_file",
        kind: "mutate",
        domain: "workspace",
        status: "completed",
        summary: "Patched src/app.ts.",
        startedAt: "2026-03-22T00:00:00.000Z",
        finishedAt: "2026-03-22T00:00:01.000Z",
      },
      {
        id: "tool_2",
        step: 2,
        toolName: "run_command",
        kind: "command",
        domain: "workspace",
        status: "completed",
        summary: "Command completed.",
        startedAt: "2026-03-22T00:00:02.000Z",
        finishedAt: "2026-03-22T00:00:03.000Z",
        data: { command: "npm run typecheck" },
      },
    ],
    lastVerifiedOutcome: "Verified by running: npm run typecheck",
  });
  assert.equal(hasCodeChangeCompletionProof(verifiedRun), true);
  assert.equal(requiresCodeChangeVerification(verifiedRun), false);
});

test("batchNeedsMoreAutonomy blocks weak post-read and post-mutation batches", () => {
  const readOnlyRun = makeRun({
    receipts: [
      {
        id: "tool_1",
        step: 1,
        toolName: "read_file",
        kind: "observe",
        domain: "workspace",
        status: "completed",
        summary: "Read src/app.ts lines 1-20.",
        startedAt: "2026-03-22T00:00:00.000Z",
        finishedAt: "2026-03-22T00:00:01.000Z",
      },
    ],
  });
  assert.equal(
    batchNeedsMoreAutonomy({
      goal: "code_change",
      run: readOnlyRun,
      batch: [{ name: "search_workspace", arguments: { query: "foo" } }],
    }),
    "missing_mutation"
  );

  const mutationRun = makeRun({
    receipts: [
      {
        id: "tool_1",
        step: 1,
        toolName: "patch_file",
        kind: "mutate",
        domain: "workspace",
        status: "completed",
        summary: "Patched src/app.ts.",
        startedAt: "2026-03-22T00:00:00.000Z",
        finishedAt: "2026-03-22T00:00:01.000Z",
      },
    ],
  });
  assert.equal(
    batchNeedsMoreAutonomy({
      goal: "code_change",
      run: mutationRun,
      batch: [{ name: "search_workspace", arguments: { query: "foo" } }],
    }),
    "missing_verification"
  );
});

test("batchNeedsMoreAutonomy allows first target inspection before requiring a mutation", () => {
  const inspectionRun = makeRun({
    preferredTargetPath: "src/app.ts",
    targetAcquisitionPhase: "target_inspection",
    currentRepairTactic: "read_target",
  });

  assert.equal(
    batchNeedsMoreAutonomy({
      goal: "code_change",
      run: inspectionRun,
      batch: [{ name: "read_file", arguments: { path: "src/app.ts", startLine: 1, endLine: 4000 } }],
    }),
    "ok"
  );
});

test("resolveRetryStrategy escalates direct code-change repair tactics", () => {
  assert.equal(resolveRetryStrategy({ run: makeRun({ repairAttemptCount: 0 }), reason: "missing_mutation" }), "force_mutation");
  assert.equal(resolveRetryStrategy({ run: makeRun({ repairAttemptCount: 1 }), reason: "missing_mutation" }), "alternate_mutation");
  assert.equal(resolveRetryStrategy({ run: makeRun({ repairAttemptCount: 2 }), reason: "missing_mutation" }), "command_repair");
  assert.equal(resolveRetryStrategy({ run: makeRun({ repairAttemptCount: 3 }), reason: "missing_mutation" }), "full_rewrite");
});

test("appendDeadEndMemory keeps a capped ordered memory", () => {
  let memory = [];
  for (let index = 0; index < 12; index += 1) {
    memory = appendDeadEndMemory(memory, `dead-end-${index}`);
  }
  assert.equal(memory.length, 8);
  assert.deepEqual(memory, [
    "dead-end-4",
    "dead-end-5",
    "dead-end-6",
    "dead-end-7",
    "dead-end-8",
    "dead-end-9",
    "dead-end-10",
    "dead-end-11",
  ]);
});

test("first successful read of the preferred target counts as meaningful progress", () => {
  const run = makeRun({
    preferredTargetPath: "src/app.ts",
  });
  const receipt = {
    id: "tool_1",
    step: 1,
    toolName: "read_file",
    kind: "observe",
    domain: "workspace",
    status: "completed",
    summary: "Read src/app.ts lines 1-40.",
    startedAt: "2026-03-22T00:00:00.000Z",
    finishedAt: "2026-03-22T00:00:01.000Z",
    data: { path: "src/app.ts", range: "1-40" },
  };

  assert.equal(hasCompletedTargetInspection(run), false);
  assert.equal(isMeaningfulProgressReceipt("code_change", run, receipt), true);
});

test("generic observe commands do not count as meaningful code-change progress", () => {
  const run = makeRun({
    preferredTargetPath: "src/app.ts",
    receipts: [
      {
        id: "tool_1",
        step: 1,
        toolName: "read_file",
        kind: "observe",
        domain: "workspace",
        status: "completed",
        summary: "Read src/app.ts lines 1-40.",
        startedAt: "2026-03-22T00:00:00.000Z",
        finishedAt: "2026-03-22T00:00:01.000Z",
        data: { path: "src/app.ts", range: "1-40" },
      },
    ],
  });
  const receipt = {
    id: "tool_2",
    step: 2,
    toolName: "run_command",
    kind: "command",
    domain: "workspace",
    status: "completed",
    summary: "Command completed.",
    startedAt: "2026-03-22T00:00:02.000Z",
    finishedAt: "2026-03-22T00:00:03.000Z",
    data: { command: "git status --short" },
  };

  assert.equal(isMeaningfulProgressReceipt("code_change", run, receipt), false);
});

test("command-assisted recovery commands count as meaningful progress when the strategy called for them", () => {
  const run = makeRun({
    retryStrategy: "command_repair",
  });
  const receipt = {
    id: "tool_2",
    step: 2,
    toolName: "run_command",
    kind: "command",
    domain: "workspace",
    status: "completed",
    summary: "Command completed.",
    startedAt: "2026-03-22T00:00:02.000Z",
    finishedAt: "2026-03-22T00:00:03.000Z",
    data: { command: "python fix_strategy.py" },
  };

  assert.equal(isMeaningfulProgressReceipt("code_change", run, receipt), true);
});

test("semantic search receipts count as meaningful progress during semantic recovery", () => {
  const run = makeRun({
    currentRepairTactic: "semantic_search",
  });
  const receipt = {
    id: "tool_3",
    step: 3,
    toolName: "search_workspace",
    kind: "observe",
    domain: "workspace",
    status: "completed",
    summary: "Found 3 workspace matches.",
    startedAt: "2026-03-22T00:00:04.000Z",
    finishedAt: "2026-03-22T00:00:05.000Z",
    data: { query: "trail_points" },
  };

  assert.equal(isMeaningfulProgressReceipt("code_change", run, receipt), true);
});

test("verified no-op conclusions satisfy code-change completion proof without inventing a mutation", () => {
  const run = makeRun({
    noOpConclusion: "Verified that trailing stop loss is not present in src/app.ts, so no file change was needed.",
    lastVerifiedOutcome: "Verified that trailing stop loss is not present in src/app.ts, so no file change was needed.",
    receipts: [
      {
        id: "tool_2",
        step: 2,
        toolName: "run_command",
        kind: "command",
        domain: "workspace",
        status: "completed",
        summary: "Command completed.",
        startedAt: "2026-03-22T00:00:02.000Z",
        finishedAt: "2026-03-22T00:00:03.000Z",
        data: { command: "Select-String ...", stdout: "CUTIE_ENTITY_NOT_FOUND" },
      },
    ],
  });

  assert.equal(hasCodeChangeCompletionProof(run), true);
  assert.equal(requiresCodeChangeVerification(run), false);
});

test("strategy and stall labels describe capability escalation clearly", () => {
  const run = makeRun({
    retryStrategy: "full_rewrite",
    noProgressTurns: 4,
    stallLevel: "severe",
    stallSinceStep: 14,
  });

  assert.equal(getCurrentStrategyLabel(run), "Escalating to a full-file rewrite");
  assert.equal(getStallLabel(run), "Severely stalled since step 14");
});

test("conversation runs do not inherit code-change strategy labels", () => {
  const run = makeRun({
    goal: "conversation",
    goalSatisfied: true,
    strategyPhase: "verify",
    retryStrategy: "none",
  });

  assert.equal(getCurrentStrategyLabel(run), "");
  assert.equal(hasCodeChangeCompletionProof(run), false);
});
