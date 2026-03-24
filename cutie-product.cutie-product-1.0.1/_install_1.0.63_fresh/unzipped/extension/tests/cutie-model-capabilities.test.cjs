"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCutieModelCapabilities,
  resolveMaxToolsPerBatch,
  resolveProtocolMode,
} = require("../out/cutie-model-capabilities.js");

test("resolveCutieModelCapabilities recognizes strong native tool models", () => {
  const profile = resolveCutieModelCapabilities("openai/gpt-5");
  assert.equal(profile.nativeTools, "reliable");
  assert.equal(profile.parallelTools, true);
});

test("resolveCutieModelCapabilities falls back conservatively for unknown text models", () => {
  const profile = resolveCutieModelCapabilities("some-random-text-model-v1");
  assert.equal(profile.textExtractionFallback, true);
  assert.equal(profile.nativeTools, "partial");
});

test("resolveProtocolMode downgrades weak native-tool requests into text extraction", () => {
  const profile = resolveCutieModelCapabilities("openai/gpt-oss-120b:fastest");
  assert.equal(
    resolveProtocolMode({
      desiredMode: "native_tools",
      capabilities: profile,
    }),
    "text_extraction"
  );
});

test("resolveMaxToolsPerBatch respects conservative serial policies", () => {
  const profile = resolveCutieModelCapabilities("unknown-model");
  assert.equal(
    resolveMaxToolsPerBatch({
      requested: 4,
      capabilities: profile,
    }),
    1
  );
});
