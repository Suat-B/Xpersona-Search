"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CutieBinaryDebugTracker,
} = require("../out/cutie-binary-debug.js");

test("CutieBinaryDebugTracker records stream lifecycle, counters, and events", () => {
  const tracker = new CutieBinaryDebugTracker();

  tracker.noteStreamAttempt({ kind: "resume", buildId: "build_1", cursorUsed: "evt_2" });
  tracker.noteChosenTransport("websocket");
  tracker.noteStreamConnected();
  tracker.noteCursorPersisted("evt_3");
  tracker.noteDuplicateEvent();
  tracker.noteFallbackToPolling("websocket closed");
  tracker.noteControlAction("generate", "requested", { buildId: "build_1", message: "start" });
  tracker.noteBuildRecord({
    id: "build_1",
    userId: "user_1",
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "running",
    phase: "planning",
    progress: 12,
    intent: "build it",
    workspaceFingerprint: "workspace_1",
    targetEnvironment: { runtime: "node20", platform: "portable", packageManager: "npm" },
    logs: [],
    stream: {
      enabled: true,
      transport: "websocket",
      streamPath: "/stream",
      eventsPath: "/events",
      controlPath: "/control",
      lastEventId: "evt_4",
      streamSessionId: "stream_1",
      wsPath: "ws://localhost/ws/stream_1",
    },
    createdAt: "2026-03-25T10:00:00.000Z",
    updatedAt: "2026-03-25T10:00:05.000Z",
  });
  tracker.noteEvent({
    id: "evt_4",
    buildId: "build_1",
    timestamp: "2026-03-25T10:00:05.000Z",
    type: "phase.changed",
    data: { status: "running", phase: "planning", progress: 12, message: "Planning app" },
  });
  tracker.noteStreamError("Binary websocket stream failed.");
  tracker.noteStreamDisconnected();

  const snapshot = tracker.getSnapshot();

  assert.equal(snapshot.resumeCount, 1);
  assert.equal(snapshot.duplicateEventCount, 1);
  assert.equal(snapshot.pollFallbackCount, 1);
  assert.equal(snapshot.streamLifecycle.cursorUsed, "evt_2");
  assert.equal(snapshot.streamLifecycle.cursorPersisted, "evt_4");
  assert.equal(snapshot.streamLifecycle.lastFallbackToPollingReason, "websocket closed");
  assert.equal(snapshot.streamLifecycle.lastStreamError, "Binary websocket stream failed.");
  assert.equal(snapshot.eventTypeCounts["phase.changed"], 1);
  assert.equal(snapshot.eventTimeline[0].summary, "Planning app");
  assert.equal(snapshot.controlActions[0].action, "generate");
});
