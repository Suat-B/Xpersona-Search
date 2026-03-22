"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appendDeadEndMemory,
  batchNeedsMoreAutonomy,
  hasCodeChangeCompletionProof,
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
