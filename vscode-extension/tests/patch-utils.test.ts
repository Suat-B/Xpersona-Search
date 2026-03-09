import { describe, expect, it } from "vitest";
import {
  applyUnifiedDiff,
  extractPatchTargetPath,
  patchContainsLeakedPatchArtifacts,
  patchContainsWrappedToolPayload,
  recoverUnifiedDiffFromWrappedPayload,
  textContainsLeakedPatchArtifacts,
} from "../src/patch-utils";

describe("patch utils", () => {
  it("extracts target path from unified diff", () => {
    const patch = [
      "diff --git a/hello.py b/hello.py",
      "--- a/hello.py",
      "+++ b/hello.py",
      "@@ -1,1 +1,2 @@",
      "-print('hi')",
      "+print('hello')",
      "+print('there')",
    ].join("\n");
    expect(extractPatchTargetPath(patch)).toBe("hello.py");
  });

  it("extracts target path when diff headers include timestamps", () => {
    const patch = [
      "diff --git a/hello.py b/hello.py",
      "--- a/hello.py\t2026-03-07 10:00:00",
      "+++ b/hello.py\t2026-03-07 10:01:00",
      "@@ -1,1 +1,1 @@",
      "-print('hi')",
      "+print('hey')",
    ].join("\n");
    expect(extractPatchTargetPath(patch)).toBe("hello.py");
  });

  it("applies a modify hunk", () => {
    const patch = [
      "diff --git a/hello.py b/hello.py",
      "--- a/hello.py",
      "+++ b/hello.py",
      "@@ -1,1 +1,2 @@",
      "-print('hi')",
      "+print('hello')",
      "+print('there')",
    ].join("\n");
    const result = applyUnifiedDiff("print('hi')\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toContain("print('hello')");
  });

  it("applies headerless mini-diffs when anchored by removed lines", () => {
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "-one",
      "+two",
    ].join("\n");
    const result = applyUnifiedDiff("one\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("two\n");
  });

  it("returns partial when one hunk fails after previous hunk applied", () => {
    const patch = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      "-one",
      "+ONE",
      "@@ -3,1 +3,1 @@",
      "-missing",
      "+MISSING",
    ].join("\n");
    const result = applyUnifiedDiff("one\ntwo\nthree\n", patch);
    expect(result.status).toBe("partial");
    expect(result.hunksApplied).toBe(1);
    expect(result.content).toContain("ONE");
  });

  it("applies hunks without file headers", () => {
    const patch = [
      "@@ -1,1 +1,1 @@",
      "-alpha",
      "+beta",
    ].join("\n");
    const result = applyUnifiedDiff("alpha\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("beta\n");
  });

  it("applies hunks inside fenced diff blocks", () => {
    const patch = [
      "```diff",
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      "-one",
      "+two",
      "```",
    ].join("\n");
    const result = applyUnifiedDiff("one\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("two\n");
  });

  it("applies apply_patch-style hunks with bare @@ headers", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: a.txt",
      "@@",
      "-one",
      "+two",
      "*** End Patch",
    ].join("\n");
    const result = applyUnifiedDiff("one\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("two\n");
  });

  it("applies multiple apply_patch-style bare @@ hunks in order", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: a.txt",
      "@@",
      "-two",
      "+TWO",
      "@@",
      "-four",
      "+FOUR",
      "*** End Patch",
    ].join("\n");
    const result = applyUnifiedDiff("one\ntwo\nthree\nfour\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("one\nTWO\nthree\nFOUR\n");
  });

  it("applies hunks when context has trailing whitespace differences", () => {
    const patch = [
      "@@ -1,2 +1,2 @@",
      "-alpha",
      "+beta",
      " gamma",
    ].join("\n");
    const result = applyUnifiedDiff("alpha  \n gamma\n", patch);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("beta\n gamma\n");
  });

  it("rejects invalid patch text", () => {
    const result = applyUnifiedDiff("a\n", "not a diff");
    expect(result.status).toBe("rejected_invalid_patch");
  });

  it("rejects unanchored addition-only headerless patches", () => {
    const patch = [
      "+++ b/a.txt",
      "+brand new line",
    ].join("\n");
    const result = applyUnifiedDiff("a\n", patch);
    expect(result.status).toBe("rejected_invalid_patch");
  });

  it("detects wrapped tool payload artifacts embedded in added diff lines", () => {
    const patch = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,2 @@",
      "-alpha",
      "+{\"final\":\"Updated a.txt\",\"edits\":[{\"path\":\"a.txt\",\"patch\":\"@@ -1,1 +1,1 @@\"}],\"commands\":[]}",
      "+beta",
    ].join("\n");
    expect(patchContainsWrappedToolPayload(patch)).toBe(true);
  });

  it("rejects patches that contain wrapped tool payload artifacts", () => {
    const patch = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,2 @@",
      "-alpha",
      "+{\"final\":\"Updated a.txt\",\"edits\":[{\"path\":\"a.txt\",\"patch\":\"@@ -1,1 +1,1 @@\"}],\"commands\":[]}",
      "+beta",
    ].join("\n");
    const result = applyUnifiedDiff("alpha\n", patch);
    expect(result.status).toBe("rejected_invalid_patch");
    expect(result.reason).toContain("wrapped tool payload");
  });

  it("recovers inner unified diff from wrapped tool payload", () => {
    const innerPatch = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      "-alpha",
      "+beta",
    ].join("\n");
    const wrapped = JSON.stringify({
      final: "Applied change",
      edits: [{ path: "a.txt", patch: innerPatch }],
      commands: [],
    });
    expect(recoverUnifiedDiffFromWrappedPayload(wrapped)).toBe(innerPatch);
  });

  it("applies patch after recovering wrapped tool payload", () => {
    const innerPatch = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,1 +1,1 @@",
      "-alpha",
      "+beta",
    ].join("\n");
    const wrapped = JSON.stringify({
      final: "Applied change",
      edits: [{ path: "a.txt", patch: innerPatch }],
      commands: [],
    });
    const result = applyUnifiedDiff("alpha\n", wrapped);
    expect(result.status).toBe("applied");
    expect(result.content).toBe("beta\n");
  });

  it("detects leaked apply_patch markers in added patch lines", () => {
    const patch = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,6 @@",
      "-const x = 1;",
      "+const x = 1;",
      "+*** Begin Patch",
      "+*** Update File: a.ts",
      "+@@ -1,1 +1,1 @@",
      "+-const x = 1;",
      "++const x = 2;",
      "+*** End Patch",
    ].join("\n");
    expect(patchContainsLeakedPatchArtifacts(patch)).toBe(true);
  });

  it("rejects patches that leak diff/apply_patch markers into file content", () => {
    const patch = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,5 @@",
      "-const value = 1;",
      "+const value = 1;",
      "+diff --git a/a.ts b/a.ts",
      "+--- a/a.ts",
      "++++ b/a.ts",
      "+@@ -1,1 +1,1 @@",
    ].join("\n");
    const result = applyUnifiedDiff("const value = 1;\n", patch);
    expect(result.status).toBe("rejected_invalid_patch");
    expect(result.reason).toContain("leak diff");
  });

  it("detects leaked patch artifacts in raw write_file content", () => {
    const content = [
      "const one = 1;",
      "*** Begin Patch",
      "*** Update File: demo.ts",
      "@@ -1,1 +1,1 @@",
      "-const one = 1;",
      "+const one = 2;",
      "*** End Patch",
    ].join("\n");
    expect(textContainsLeakedPatchArtifacts(content)).toBe(true);
  });
});
