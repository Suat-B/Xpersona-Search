"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyLineEditsToText, computeWorkspaceRevisionId } = require("../out/cutie-file-patch.js");

test("applyLineEditsToText replaces a line using 1-based coordinates", () => {
  const before = "alpha\nbeta\ngamma\n";
  const after = applyLineEditsToText(before, [
    { startLine: 2, deleteLineCount: 1, replacement: "BETA" },
  ]);
  assert.equal(after.after, "alpha\nBETA\ngamma\n");
});

test("applyLineEditsToText inserts lines before the requested start line", () => {
  const before = "alpha\nbeta\ngamma";
  const after = applyLineEditsToText(before, [
    { startLine: 2, deleteLineCount: 0, replacement: "inserted-1\ninserted-2" },
  ]);
  assert.equal(after.after, "alpha\ninserted-1\ninserted-2\nbeta\ngamma");
});

test("applyLineEditsToText deletes lines and preserves CRLF style", () => {
  const before = "alpha\r\nbeta\r\ngamma\r\n";
  const after = applyLineEditsToText(before, [
    { startLine: 2, deleteLineCount: 1, replacement: "" },
  ]);
  assert.equal(after.after, "alpha\r\ngamma\r\n");
});

test("applyLineEditsToText rejects overlapping edits", () => {
  assert.throws(
    () =>
      applyLineEditsToText("a\nb\nc\n", [
        { startLine: 2, deleteLineCount: 1, replacement: "B" },
        { startLine: 2, deleteLineCount: 1, replacement: "C" },
      ]),
    /must not overlap/i
  );
});

test("computeWorkspaceRevisionId returns missing for absent files", () => {
  assert.equal(computeWorkspaceRevisionId("", false), "missing");
});
