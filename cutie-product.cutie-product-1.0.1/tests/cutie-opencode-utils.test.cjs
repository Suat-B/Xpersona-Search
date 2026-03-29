"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CUTIE_OPENCODE_PROVIDER_ID,
  buildOpenCodeConfigTemplate,
  buildOpenCodeModelRef,
  extractAssistantTextFromOpenCodeParts,
  isLocalOpenCodeServerUrl,
  normalizeOpenCodeServerUrl,
} = require("../out/cutie-opencode-utils.js");

test("normalizeOpenCodeServerUrl adds a protocol and strips trailing slash", () => {
  assert.equal(normalizeOpenCodeServerUrl("127.0.0.1:4096/"), "http://127.0.0.1:4096");
  assert.equal(normalizeOpenCodeServerUrl("https://example.com/path/"), "https://example.com");
});

test("buildOpenCodeModelRef prefixes the Cutie provider id when needed", () => {
  assert.equal(
    buildOpenCodeModelRef("moonshotai/Kimi-K2.5:fastest"),
    `${CUTIE_OPENCODE_PROVIDER_ID}/moonshotai/Kimi-K2.5:fastest`
  );
  assert.equal(
    buildOpenCodeModelRef(`${CUTIE_OPENCODE_PROVIDER_ID}/custom-model`),
    `${CUTIE_OPENCODE_PROVIDER_ID}/custom-model`
  );
});

test("buildOpenCodeConfigTemplate emits a safe starter config", () => {
  const config = buildOpenCodeConfigTemplate({
    serverUrl: "http://127.0.0.1:4096",
    model: "moonshotai/Kimi-K2.5:fastest",
    openAiBaseUrl: "http://localhost:3000/api/v1/hf",
  });

  assert.equal(config.$schema, "https://opencode.ai/config.json");
  assert.deepEqual(config.server, { hostname: "127.0.0.1", port: 4096 });
  assert.equal(config.model, `${CUTIE_OPENCODE_PROVIDER_ID}/moonshotai/Kimi-K2.5:fastest`);
  assert.equal(config.permission.edit, "ask");
  assert.equal(config.permission.bash, "ask");
  assert.equal(config.provider[CUTIE_OPENCODE_PROVIDER_ID].options.baseURL, "http://localhost:3000/api/v1/hf");
});

test("extractAssistantTextFromOpenCodeParts concatenates non-ignored text parts", () => {
  const text = extractAssistantTextFromOpenCodeParts([
    { type: "text", text: "hello " },
    { type: "text", text: "world" },
    { type: "text", text: " ignored", ignored: true },
    { type: "tool", text: "nope" },
  ]);

  assert.equal(text, "hello world");
});

test("isLocalOpenCodeServerUrl only accepts loopback hosts", () => {
  assert.equal(isLocalOpenCodeServerUrl("http://127.0.0.1:4096"), true);
  assert.equal(isLocalOpenCodeServerUrl("http://localhost:4096"), true);
  assert.equal(isLocalOpenCodeServerUrl("https://example.com"), false);
});
