import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, extractPatchTargetPath } from "../src/patch-utils";

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
});
