"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveBinaryNaturalLanguageAction,
} = require("../out/cutie-binary-nl-router.js");

test("classifies deterministic binary NL actions", () => {
  assert.deepEqual(resolveBinaryNaturalLanguageAction("cancel this build now"), {
    type: "cancel",
  });
  assert.deepEqual(resolveBinaryNaturalLanguageAction("validate the current build"), {
    type: "validate",
  });
  assert.deepEqual(resolveBinaryNaturalLanguageAction("publish this app"), {
    type: "publish",
  });
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("rewind to checkpoint cp_42"),
    { type: "rewind", checkpointId: "cp_42" }
  );
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("branch from save point save_99 and add auth"),
    { type: "branch", intent: "from save point save_99 and add auth", checkpointId: "save_99" }
  );
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("execute handler"),
    { type: "execute", entryPoint: "handler" }
  );
});

test("honors action precedence on ambiguous prompts", () => {
  assert.deepEqual(resolveBinaryNaturalLanguageAction("cancel and publish this build"), {
    type: "cancel",
  });
  assert.deepEqual(resolveBinaryNaturalLanguageAction("validate and publish this build"), {
    type: "validate",
  });
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("publish then rewind to checkpoint cp_77"),
    { type: "publish" }
  );
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("branch this and then execute main"),
    { type: "branch", intent: "this and then execute main" }
  );
});

test("defaults to refine when active build exists and generate otherwise", () => {
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("add a login screen", { hasActiveBuild: true }),
    { type: "refine", intent: "add a login screen" }
  );
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("add a login screen", { hasActiveBuild: false }),
    { type: "generate", intent: "add a login screen" }
  );
});

test("routes explicit new-build requests to generate even with an active build", () => {
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("create a new app for inventory tracking", { hasActiveBuild: true }),
    { type: "generate", intent: "a new app for inventory tracking" }
  );
});

test("extracts checkpoint ids and entrypoints from natural language", () => {
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("rewind to save point save-point_123"),
    { type: "rewind", checkpointId: "save-point_123" }
  );
  assert.deepEqual(
    resolveBinaryNaturalLanguageAction("run handler_v2"),
    { type: "execute", entryPoint: "handler_v2" }
  );
});
