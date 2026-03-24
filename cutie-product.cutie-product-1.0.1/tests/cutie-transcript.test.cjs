"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOperationalTranscriptText,
  buildVisibleTranscriptText,
  humanizeSuppressedAssistantArtifact,
  mergeTranscriptIntoAssistantContent,
} = require("../out/cutie-transcript.js");

test("humanizeSuppressedAssistantArtifact names rescued tools", () => {
  const line = humanizeSuppressedAssistantArtifact(
    '{"toolName":"write_file","arguments":{"path":"src/app.ts","content":"next"}}'
  );

  assert.equal(line, "Recovered `write_file` action from model output.");
});

test("buildVisibleTranscriptText hides low-signal conversation statuses", () => {
  const text = buildVisibleTranscriptText(
    [
      { id: "1", kind: "status", text: "Cutie is replying.", createdAt: "2026-03-23T00:00:00.000Z" },
      { id: "2", kind: "assistant_text", text: "Hello there!", createdAt: "2026-03-23T00:00:01.000Z" },
    ],
    "conversation"
  );

  assert.equal(text, "Hello there!");
});

test("mergeTranscriptIntoAssistantContent keeps one unified assistant message", () => {
  const content = mergeTranscriptIntoAssistantContent({
    goal: "code_change",
    assistantContent: "Trailing stop loss added.",
    events: [
      {
        id: "1",
        kind: "status",
        text: "Calling `read_file` on `src/app.ts`.",
        createdAt: "2026-03-23T00:00:00.000Z",
      },
      {
        id: "2",
        kind: "tool_result",
        text: "`read_file` completed: read lines 1-40.",
        createdAt: "2026-03-23T00:00:01.000Z",
      },
      {
        id: "3",
        kind: "assistant_text",
        text: "Trailing stop loss added.",
        createdAt: "2026-03-23T00:00:02.000Z",
      },
    ],
  });

  assert.equal(
    content,
    [
      "Cutie action log:",
      "Calling `read_file` on `src/app.ts`.",
      "`read_file` completed: read lines 1-40.",
      "Cutie response:",
      "Trailing stop loss added.",
    ].join("\n\n")
  );
});

test("buildOperationalTranscriptText excludes assistant text from the action log", () => {
  const content = buildOperationalTranscriptText(
    [
      {
        id: "1",
        kind: "status",
        text: "Cutie is collecting context.",
        createdAt: "2026-03-23T00:00:00.000Z",
      },
      {
        id: "2",
        kind: "assistant_text",
        text: "Done.",
        createdAt: "2026-03-23T00:00:01.000Z",
      },
      {
        id: "3",
        kind: "tool_result",
        text: "Step 1: `read_file` completed.",
        createdAt: "2026-03-23T00:00:02.000Z",
      },
    ],
    "code_change"
  );

  assert.equal(content, ["Cutie is collecting context.", "Step 1: `read_file` completed."].join("\n\n"));
});
