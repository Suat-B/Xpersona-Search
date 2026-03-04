"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const patch_utils_1 = require("./patch-utils");
(0, vitest_1.describe)("patch utils", () => {
    (0, vitest_1.it)("extracts target path from unified diff", () => {
        const patch = [
            "diff --git a/hello.py b/hello.py",
            "--- a/hello.py",
            "+++ b/hello.py",
            "@@ -1,1 +1,2 @@",
            "-print('hi')",
            "+print('hello')",
            "+print('there')",
        ].join("\n");
        (0, vitest_1.expect)((0, patch_utils_1.extractPatchTargetPath)(patch)).toBe("hello.py");
    });
    (0, vitest_1.it)("applies a modify hunk", () => {
        const patch = [
            "diff --git a/hello.py b/hello.py",
            "--- a/hello.py",
            "+++ b/hello.py",
            "@@ -1,1 +1,2 @@",
            "-print('hi')",
            "+print('hello')",
            "+print('there')",
        ].join("\n");
        const result = (0, patch_utils_1.applyUnifiedDiff)("print('hi')\n", patch);
        (0, vitest_1.expect)(result.status).toBe("applied");
        (0, vitest_1.expect)(result.content).toContain("print('hello')");
    });
    (0, vitest_1.it)("returns partial when one hunk fails after previous hunk applied", () => {
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
        const result = (0, patch_utils_1.applyUnifiedDiff)("one\ntwo\nthree\n", patch);
        (0, vitest_1.expect)(result.status).toBe("partial");
        (0, vitest_1.expect)(result.hunksApplied).toBe(1);
        (0, vitest_1.expect)(result.content).toContain("ONE");
    });
    (0, vitest_1.it)("rejects invalid patch text", () => {
        const result = (0, patch_utils_1.applyUnifiedDiff)("a\n", "not a diff");
        (0, vitest_1.expect)(result.status).toBe("rejected_invalid_patch");
    });
});
//# sourceMappingURL=patch-utils.test.js.map