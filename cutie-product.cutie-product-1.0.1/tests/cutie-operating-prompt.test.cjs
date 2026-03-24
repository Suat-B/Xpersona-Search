"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  buildComposedCutieSystemPrompt,
  normalizeOperatingPromptMarkdown,
  resolveBundledOperatingPromptMarkdownPath,
  resolveOperatingPromptMarkdownPath,
} = require("../out/cutie-operating-prompt.js");

test("normalizeOperatingPromptMarkdown trims and normalizes newlines", () => {
  assert.equal(normalizeOperatingPromptMarkdown("\r\nHello\r\nWorld\r\n"), "Hello\nWorld");
});

test("resolveOperatingPromptMarkdownPath resolves workspace-relative paths", () => {
  const result = resolveOperatingPromptMarkdownPath("docs/cutie-agent-operating-prompt.md", "C:\\repo");
  assert.equal(result.configuredPath, "docs/cutie-agent-operating-prompt.md");
  assert.equal(result.resolvedPath, path.resolve("C:\\repo", "docs/cutie-agent-operating-prompt.md"));
  assert.equal(result.error, undefined);
});

test("resolveOperatingPromptMarkdownPath accepts absolute paths", () => {
  const absolute = path.resolve("C:\\repo", "docs", "prompt.md");
  const result = resolveOperatingPromptMarkdownPath(absolute, "C:\\repo");
  assert.equal(result.resolvedPath, absolute);
  assert.equal(result.error, undefined);
});

test("resolveOperatingPromptMarkdownPath explains missing workspace roots for relative paths", () => {
  const result = resolveOperatingPromptMarkdownPath("docs/prompt.md", null);
  assert.equal(result.resolvedPath, null);
  assert.match(String(result.error || ""), /workspace-relative/i);
});

test("resolveBundledOperatingPromptMarkdownPath finds the packaged prompt markdown", () => {
  const bundled = resolveBundledOperatingPromptMarkdownPath();
  assert.ok(bundled);
  assert.match(bundled, /cutie-agent-operating-prompt\.md$/);
});

test("buildComposedCutieSystemPrompt keeps the core contract when no markdown is provided", () => {
  const result = buildComposedCutieSystemPrompt({
    coreContract: "core contract",
  });
  assert.equal(result, "core contract");
});

test("buildComposedCutieSystemPrompt appends the workspace operating prompt section", () => {
  const result = buildComposedCutieSystemPrompt({
    coreContract: "core contract",
    operatingPromptMarkdown: "# Prompt\nBe agentic.",
    promptMarkdownPath: "docs/cutie-agent-operating-prompt.md",
  });
  assert.match(result, /core contract/);
  assert.match(result, /Workspace operating prompt/);
  assert.match(result, /Prompt markdown path: docs\/cutie-agent-operating-prompt\.md/);
  assert.match(result, /Be agentic\./);
});
