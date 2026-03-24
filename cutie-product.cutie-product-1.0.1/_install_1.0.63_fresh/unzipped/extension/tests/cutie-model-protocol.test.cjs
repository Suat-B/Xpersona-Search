"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CutieStructuredProtocolError,
  normalizeProtocolResponsePayload,
  parseStructuredStreamEvent,
} = require("../out/cutie-model-protocol.js");

test("normalizeProtocolResponsePayload maps final payloads into internal final responses", () => {
  const result = normalizeProtocolResponsePayload({
    type: "final",
    text: "Done",
    objectives: [{ id: "1", status: "done", note: "patched" }],
  });

  assert.deepEqual(result, {
    type: "final",
    final: "Done",
    objectives: [{ id: "1", status: "done", note: "patched" }],
  });
});

test("normalizeProtocolResponsePayload allows empty final text so runtime recovery can continue", () => {
  const result = normalizeProtocolResponsePayload({
    type: "final",
    objectives: [{ id: "1", status: "done" }],
  });

  assert.deepEqual(result, {
    type: "final",
    final: "",
    objectives: [{ id: "1", status: "done" }],
  });
});

test("normalizeProtocolResponsePayload maps single tool batches into tool_call", () => {
  const result = normalizeProtocolResponsePayload({
    type: "tool_batch",
    toolCalls: [
      {
        id: "call_1",
        name: "patch_file",
        arguments: {
          path: "src/app.ts",
          baseRevision: "sha1:abc",
          edits: [{ startLine: 1, deleteLineCount: 1, replacement: "next" }],
        },
        summary: "patch the file",
      },
    ],
  });

  assert.deepEqual(result, {
    type: "tool_call",
    tool_call: {
      name: "patch_file",
      arguments: {
        path: "src/app.ts",
        baseRevision: "sha1:abc",
        edits: [{ startLine: 1, deleteLineCount: 1, replacement: "next" }],
      },
      summary: "patch the file",
    },
  });
});

test("normalizeProtocolResponsePayload maps multi-call tool batches into tool_calls", () => {
  const result = normalizeProtocolResponsePayload({
    type: "tool_batch",
    toolCalls: [
      { id: "call_1", name: "read_file", arguments: { path: "src/a.ts" } },
      { id: "call_2", name: "git_status", arguments: {} },
    ],
  });

  assert.equal(result.type, "tool_calls");
  assert.deepEqual(result.tool_calls.map((item) => item.name), ["read_file", "git_status"]);
});

test("normalizeProtocolResponsePayload rejects unknown tool names", () => {
  assert.throws(
    () =>
      normalizeProtocolResponsePayload({
        type: "tool_batch",
        toolCalls: [{ id: "call_1", name: "edit_file", arguments: { path: "src/a.ts" } }],
      }),
    CutieStructuredProtocolError
  );
});

test("parseStructuredStreamEvent parses assistant deltas and tool batches", () => {
  const delta = parseStructuredStreamEvent("assistant_delta", { text: "Hello" });
  assert.deepEqual(delta, { type: "assistant_delta", text: "Hello" });

  const deltaAlias = parseStructuredStreamEvent("delta", { content: " there" });
  assert.deepEqual(deltaAlias, { type: "assistant_delta", text: " there" });

  const response = parseStructuredStreamEvent("tool_batch", {
    toolCalls: [{ id: "call_1", name: "read_file", arguments: { path: "src/a.ts" } }],
  });

  assert.equal(response.type, "response");
  assert.deepEqual(response.response, {
    type: "tool_call",
    tool_call: { name: "read_file", arguments: { path: "src/a.ts" } },
  });
});

test("parseStructuredStreamEvent accepts final events with no text", () => {
  const response = parseStructuredStreamEvent("final", {
    objectives: [{ id: "1", status: "done" }],
  });

  assert.equal(response.type, "response");
  assert.deepEqual(response.response, {
    type: "final",
    final: "",
    objectives: [{ id: "1", status: "done" }],
  });
});

test("parseStructuredStreamEvent ignores server control frames like ack", () => {
  assert.deepEqual(parseStructuredStreamEvent("ack", { requestId: "req_1" }), { type: "noop" });
  assert.deepEqual(parseStructuredStreamEvent("heartbeat", {}), { type: "noop" });
});

test("parseStructuredStreamEvent preserves capability negotiation metadata from meta frames", () => {
  const meta = parseStructuredStreamEvent("meta", {
    model: "openai/gpt-oss-120b:fastest",
    modelAdapter: "capability_negotiated_v1",
    modelCapabilities: {
      profileId: "router-open-weights",
      modelPattern: "gpt-oss/llama/mistral/qwen/deepseek/gemma",
      nativeTools: "partial",
      streamStructured: "partial",
      parallelTools: true,
      assistantDeltaReliability: "medium",
      maxToolsPerTurnPolicy: "prefer_serial",
      textExtractionFallback: true,
    },
    protocolMode: "text_extraction",
    normalizationSource: "text_tool_artifact",
    fallbackModeUsed: "text_extraction",
  });

  assert.equal(meta.type, "meta");
  assert.equal(meta.modelAdapter, "capability_negotiated_v1");
  assert.equal(meta.protocolMode, "text_extraction");
  assert.equal(meta.normalizationSource, "text_tool_artifact");
  assert.equal(meta.fallbackModeUsed, "text_extraction");
});

test("parseStructuredStreamEvent rejects unknown SSE event types", () => {
  assert.throws(() => parseStructuredStreamEvent("weird_event", {}), CutieStructuredProtocolError);
});
