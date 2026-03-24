"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") {
    return {
      workspace: {
        getConfiguration() {
          return {
            get(_key, fallback) {
              return fallback;
            },
          };
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { resolveBinaryStreamTransport, resolveBinaryStreamUrl } = require("../out/binary-api-client.js");
Module._load = originalLoad;

function makeBuild(overrides = {}) {
  return {
    id: "build_1",
    userId: "user_1",
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "running",
    intent: "Build a portable starter bundle",
    workspaceFingerprint: "workspace_1",
    targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
    logs: [],
    stream: {
      enabled: true,
      transport: "sse",
      streamPath: "/api/v1/binary/builds/stream",
      eventsPath: "/api/v1/binary/builds/build_1/events",
      controlPath: "/api/v1/binary/builds/build_1/control",
      lastEventId: null,
    },
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    ...overrides,
  };
}

test("resolveBinaryStreamTransport returns websocket when advertised", () => {
  assert.equal(resolveBinaryStreamTransport(makeBuild({ stream: { enabled: true, transport: "websocket", streamPath: "", eventsPath: "", controlPath: "" } }).stream), "websocket");
});

test("resolveBinaryStreamUrl resolves websocket URLs with resume metadata", () => {
  const build = makeBuild({
    stream: {
      enabled: true,
      transport: "websocket",
      streamPath: "",
      eventsPath: "/api/v1/binary/builds/build_1/events",
      controlPath: "/api/v1/binary/builds/build_1/control",
      wsPath: "wss://binary.example/ws/session_123",
      resumeToken: "resume_abc",
      streamSessionId: "session_123",
      lastEventId: "event_99",
    },
  });

  const url = resolveBinaryStreamUrl("https://example.com", build, "cursor_42");
  assert.equal(
    url,
    "wss://binary.example/ws/session_123?cursor=cursor_42&resumeToken=resume_abc&streamSessionId=session_123&buildId=build_1"
  );
});

test("resolveBinaryStreamUrl falls back to the SSE events path", () => {
  const build = makeBuild({
    stream: {
      enabled: true,
      transport: "sse",
      streamPath: "/api/v1/binary/builds/stream",
      eventsPath: "/api/v1/binary/builds/build_1/events",
      controlPath: "/api/v1/binary/builds/build_1/control",
      lastEventId: "event_9",
    },
  });

  const url = resolveBinaryStreamUrl("https://example.com", build, null);
  assert.equal(
    url,
    "https://example.com/api/v1/binary/builds/build_1/events?cursor=event_9&buildId=build_1"
  );
});
