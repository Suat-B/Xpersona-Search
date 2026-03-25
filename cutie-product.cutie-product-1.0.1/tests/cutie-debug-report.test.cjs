"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCutieDebugReportV2,
} = require("../out/cutie-debug-report.js");

function makeDesktop() {
  return {
    platform: "win32",
    displays: [{ id: "display-1", label: "Primary", width: 1920, height: 1080, isPrimary: true }],
    activeWindow: { id: "win-1", title: "Editor", app: "Code" },
    recentSnapshots: [{ snapshotId: "snap-1", width: 1920, height: 1080, mimeType: "image/png", capturedAt: "2026-03-25T10:00:00.000Z" }],
    capabilities: { windowsSupported: true, experimentalAdaptersEnabled: false },
  };
}

function makeRun(overrides = {}) {
  return {
    id: "run_1",
    sessionId: "session_1",
    status: "completed",
    phase: "completed",
    goal: "code_change",
    goalSatisfied: true,
    repairAttemptCount: 0,
    escalationState: "none",
    stepCount: 2,
    maxSteps: 18,
    workspaceMutationCount: 1,
    maxWorkspaceMutations: 8,
    desktopMutationCount: 0,
    maxDesktopMutations: 8,
    startedAt: "2026-03-25T10:00:00.000Z",
    endedAt: "2026-03-25T10:01:00.000Z",
    receipts: [
      {
        id: "receipt_1",
        step: 1,
        toolName: "read_file",
        kind: "observe",
        domain: "workspace",
        status: "completed",
        summary: "Read C:\\repo\\src\\app.ts",
        startedAt: "2026-03-25T10:00:01.000Z",
        finishedAt: "2026-03-25T10:00:02.000Z",
        data: { path: "C:\\repo\\src\\app.ts" },
      },
      {
        id: "receipt_2",
        step: 2,
        toolName: "patch_file",
        kind: "mutate",
        domain: "workspace",
        status: "completed",
        summary: "Patched C:\\repo\\src\\app.ts",
        startedAt: "2026-03-25T10:00:03.000Z",
        finishedAt: "2026-03-25T10:00:05.000Z",
        data: { path: "C:\\repo\\src\\app.ts", replacement: "const token='sk-super-secret-value';" },
      },
    ],
    repeatedCallCount: 0,
    noProgressTurns: 0,
    noToolPlanningCycles: 0,
    stallLevel: "none",
    deadEndMemory: [],
    ...overrides,
  };
}

function makeBinaryPanelState(overrides = {}) {
  return {
    targetEnvironment: { runtime: "node20", platform: "portable", packageManager: "npm" },
    activeBuild: {
      id: "build_1",
      userId: "user_1",
      workflow: "binary_generate",
      artifactKind: "package_bundle",
      status: "completed",
      phase: "completed",
      progress: 100,
      intent: "Build a dashboard using C:\\repo\\src\\app.ts",
      workspaceFingerprint: "workspace_1",
      targetEnvironment: { runtime: "node20", platform: "portable", packageManager: "npm" },
      logs: ["OPENAI_API_KEY=abc123", "done"],
      stream: {
        enabled: true,
        transport: "websocket",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/events",
        controlPath: "/api/v1/binary/builds/control",
        lastEventId: "evt_4",
        wsPath: "ws://localhost:3000/ws/build_1",
        resumeToken: "secret-token",
        streamSessionId: "stream_1",
      },
      preview: {
        plan: null,
        files: [
          {
            path: "C:\\repo\\src\\app.ts",
            preview: "const apiKey = 'sk-super-secret-value';",
            hash: "hash_1",
            completed: true,
            updatedAt: "2026-03-25T10:00:30.000Z",
          },
        ],
        recentLogs: ["Authorization: Bearer token-1234567890"],
      },
      cancelable: false,
      reliability: {
        status: "pass",
        score: 92,
        summary: "All good",
        targetEnvironment: { runtime: "node20", platform: "portable", packageManager: "npm" },
        issues: [],
        warnings: [],
        generatedAt: "2026-03-25T10:00:40.000Z",
      },
      liveReliability: null,
      artifactState: null,
      sourceGraph: null,
      execution: { runnable: true, mode: "native", availableFunctions: [], updatedAt: "2026-03-25T10:00:45.000Z" },
      astState: null,
      runtimeState: null,
      snapshots: [],
      checkpoints: [],
      createdAt: "2026-03-25T10:00:00.000Z",
      updatedAt: "2026-03-25T10:01:00.000Z",
    },
    busy: false,
    phase: "completed",
    progress: 100,
    streamConnected: false,
    lastEventId: "evt_4",
    previewFiles: [],
    recentLogs: ["Authorization: Bearer token-1234567890"],
    reliability: null,
    liveReliability: null,
    artifactState: null,
    sourceGraph: null,
    astState: null,
    execution: null,
    runtimeState: null,
    checkpoints: [],
    snapshots: [],
    pendingRefinement: null,
    canCancel: false,
    lastAction: "generate",
    ...overrides,
  };
}

function makeBinaryDebug(overrides = {}) {
  return {
    streamLifecycle: {
      lastCreateAttempt: { kind: "create", startedAt: "2026-03-25T10:00:00.000Z", buildId: null, cursorUsed: null },
      lastResumeAttempt: null,
      chosenTransport: "websocket",
      cursorUsed: null,
      cursorPersisted: "evt_4",
      connectedAt: "2026-03-25T10:00:01.000Z",
      disconnectedAt: "2026-03-25T10:00:50.000Z",
      lastFallbackToPollingReason: null,
      lastStreamError: null,
    },
    controlActions: [{ action: "generate", timestamp: "2026-03-25T10:00:00.000Z", result: "succeeded", buildId: "build_1", message: "completed" }],
    eventTimeline: [{ id: "evt_1", timestamp: "2026-03-25T10:00:05.000Z", type: "phase.changed", phase: "planning", progress: 10, summary: "Planning", latestFile: null, latestLog: null }],
    eventTypeCounts: { "phase.changed": 1 },
    duplicateEventCount: 0,
    resumeCount: 0,
    pollFallbackCount: 0,
    ...overrides,
  };
}

test("buildCutieDebugReportV2 includes rich cutie and binary sections", () => {
  const report = buildCutieDebugReportV2({
    generatedAt: "2026-03-25T10:02:00.000Z",
    extensionVersion: "1.0.77",
    runtime: "cutie",
    workspaceHash: "workspace_hash",
    workspaceRootPath: "C:\\repo",
    submitState: "settled",
    status: "Done",
    auth: { kind: "browser", label: "Signed in" },
    warmStartState: { localReady: true, hostReady: true },
    promptState: { promptLoaded: true, promptSource: "builtin_only" },
    dynamicSettings: { maxToolSteps: 18, maxWorkspaceMutations: 8 },
    desktop: makeDesktop(),
    session: { id: "session_1", title: "Fix app", updatedAt: "2026-03-25T10:02:00.000Z", snapshotCount: 1 },
    activeRun: makeRun(),
    binaryPanelState: makeBinaryPanelState(),
    binaryDebug: makeBinaryDebug(),
    liveActionLog: ["Read src/app.ts", "Patched src/app.ts"],
    liveTranscript: [{ id: "tx_1", kind: "tool_result", text: "Patched src/app.ts", createdAt: "2026-03-25T10:00:05.000Z", runId: "run_1" }],
    recentMessages: [{ id: "m_1", role: "user", content: "Please fix it", createdAt: "2026-03-25T10:00:00.000Z" }],
    suppressedAssistantArtifactText: null,
  });

  assert.equal(report.reportVersion, 2);
  assert.equal(report.product.runtime, "cutie");
  assert.equal(report.cutie.session.id, "session_1");
  assert.equal(report.binary.activeBuild.id, "build_1");
  assert.equal(report.summary.terminalStates.cutie.status, "completed");
  assert.equal(report.summary.terminalStates.binary.status, "completed");
});

test("buildCutieDebugReportV2 flags stalled planning loops", () => {
  const report = buildCutieDebugReportV2({
    generatedAt: "2026-03-25T10:02:00.000Z",
    extensionVersion: "1.0.77",
    runtime: "cutie",
    workspaceHash: "workspace_hash",
    workspaceRootPath: "C:\\repo",
    submitState: "running",
    status: "Still planning",
    auth: { kind: "browser", label: "Signed in" },
    warmStartState: null,
    promptState: { promptLoaded: true, promptSource: "builtin_only" },
    dynamicSettings: null,
    desktop: makeDesktop(),
    session: null,
    activeRun: makeRun({
      status: "running",
      phase: "planning",
      goalSatisfied: false,
      workspaceMutationCount: 0,
      noProgressTurns: 3,
      noToolPlanningCycles: 2,
      repeatedCallCount: 2,
      stallLevel: "warning",
    }),
    binaryPanelState: makeBinaryPanelState({ activeBuild: null }),
    binaryDebug: makeBinaryDebug(),
    liveActionLog: [],
    liveTranscript: [],
    recentMessages: [],
    suppressedAssistantArtifactText: null,
  });

  assert.ok(report.summary.suspectedProblemAreas.includes("stall_or_loop"));
  assert.ok(report.summary.suspectedProblemAreas.includes("tool_planning"));
});

test("buildCutieDebugReportV2 captures transport fallback and redacts secrets", () => {
  const report = buildCutieDebugReportV2({
    generatedAt: "2026-03-25T10:02:00.000Z",
    extensionVersion: "1.0.77",
    runtime: "cutie",
    workspaceHash: "workspace_hash",
    workspaceRootPath: "C:\\repo",
    submitState: "settled",
    status: "Binary failed",
    auth: { kind: "browser", label: "Signed in" },
    warmStartState: null,
    promptState: { promptLoaded: true, promptSource: "builtin_only" },
    dynamicSettings: null,
    desktop: makeDesktop(),
    session: null,
    activeRun: makeRun({
      status: "failed",
      phase: "failed",
      goalSatisfied: false,
      workspaceMutationCount: 0,
      lastMutationValidationError: "No mutation landed.",
    }),
    binaryPanelState: makeBinaryPanelState({
      activeBuild: makeBinaryPanelState().activeBuild,
      recentLogs: ["Authorization: Bearer token-abcdef", "OPENAI_API_KEY=abc123"],
    }),
    binaryDebug: makeBinaryDebug({
      streamLifecycle: {
        lastCreateAttempt: { kind: "create", startedAt: "2026-03-25T10:00:00.000Z", buildId: null, cursorUsed: null },
        lastResumeAttempt: { kind: "resume", startedAt: "2026-03-25T10:00:20.000Z", buildId: "build_1", cursorUsed: "evt_2" },
        chosenTransport: "websocket",
        cursorUsed: "evt_2",
        cursorPersisted: "evt_4",
        connectedAt: "2026-03-25T10:00:01.000Z",
        disconnectedAt: "2026-03-25T10:00:10.000Z",
        lastFallbackToPollingReason: "websocket closed",
        lastStreamError: "Binary websocket stream failed.",
      },
      resumeCount: 1,
      pollFallbackCount: 1,
    }),
    liveActionLog: [],
    liveTranscript: [],
    recentMessages: [
      { id: "m_1", role: "user", content: "OPENAI_API_KEY=abc123", createdAt: "2026-03-25T10:00:00.000Z" },
    ],
    suppressedAssistantArtifactText: "Authorization: Bearer token-abcdef",
  });

  assert.ok(report.summary.suspectedProblemAreas.includes("binary_stream_transport"));
  assert.ok(report.summary.suspectedProblemAreas.includes("binary_stream_resume"));
  assert.ok(report.summary.suspectedProblemAreas.includes("workspace_mutation"));
  assert.match(JSON.stringify(report), /\[REDACTED_/);
});

test("buildCutieDebugReportV2 handles empty state", () => {
  const report = buildCutieDebugReportV2({
    generatedAt: "2026-03-25T10:02:00.000Z",
    extensionVersion: "1.0.77",
    runtime: "cutie",
    workspaceHash: "workspace_hash",
    workspaceRootPath: "C:\\repo",
    submitState: "idle",
    status: "Ready",
    auth: { kind: "none", label: "Signed out" },
    warmStartState: null,
    promptState: null,
    dynamicSettings: null,
    desktop: makeDesktop(),
    session: null,
    activeRun: null,
    binaryPanelState: makeBinaryPanelState({ activeBuild: null, recentLogs: [], previewFiles: [] }),
    binaryDebug: makeBinaryDebug({ controlActions: [], eventTimeline: [] }),
    liveActionLog: [],
    liveTranscript: [],
    recentMessages: [],
    suppressedAssistantArtifactText: null,
  });

  assert.equal(report.summary.headline, "No Cutie run or streaming binary build has been captured yet.");
  assert.ok(report.summary.suspectedProblemAreas.includes("auth"));
});
