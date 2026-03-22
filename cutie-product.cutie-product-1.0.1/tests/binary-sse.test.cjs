"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseBinarySseEventDataJson } = require("../out/binary-sse-parse.js");

test("parseBinarySseEventDataJson returns JSON payload from data: line", () => {
  assert.equal(parseBinarySseEventDataJson("data: {\"type\":\"ping\"}\n"), '{"type":"ping"}');
});

test("parseBinarySseEventDataJson concatenates multiple data: lines", () => {
  assert.equal(
    parseBinarySseEventDataJson("data: {\"a\":1}\ndata: {\"b\":2}\n"),
    '{"a":1}{"b":2}'
  );
});

test("parseBinarySseEventDataJson returns null for [DONE]", () => {
  assert.equal(parseBinarySseEventDataJson("data: [DONE]\n"), null);
});

test("parseBinarySseEventDataJson returns null for empty payload", () => {
  assert.equal(parseBinarySseEventDataJson("event: ping\n"), null);
});
