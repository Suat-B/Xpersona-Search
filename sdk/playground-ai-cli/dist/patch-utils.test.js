import { describe, expect, it } from "vitest";
import { applyUnifiedDiff } from "./patch-utils.js";
describe("applyUnifiedDiff", () => {
    it("applies a fenced unified diff", () => {
        const original = ["one", "two", "three"].join("\n");
        const patch = [
            "```diff",
            "--- a/demo.txt",
            "+++ b/demo.txt",
            "@@ -1,3 +1,3 @@",
            " one",
            "-two",
            "+TWO",
            " three",
            "```",
        ].join("\n");
        const result = applyUnifiedDiff(original, patch);
        expect(result.status).toBe("applied");
        expect(result.content).toBe(["one", "TWO", "three"].join("\n"));
        expect(result.targetPath).toBe("demo.txt");
        expect(result.hunksApplied).toBe(1);
    });
    it("returns a partial result when a later hunk cannot be matched", () => {
        const original = ["alpha", "beta", "gamma", "delta"].join("\n");
        const patch = [
            "@@ -1,2 +1,2 @@",
            " alpha",
            "-beta",
            "+BETA",
            "@@ -4,1 +4,1 @@",
            "-missing",
            "+DELTA",
        ].join("\n");
        const result = applyUnifiedDiff(original, patch);
        expect(result.status).toBe("partial");
        expect(result.reason).toContain("Some hunks applied");
        expect(result.content).toBe(["alpha", "BETA", "gamma", "delta"].join("\n"));
        expect(result.hunksApplied).toBe(1);
        expect(result.totalHunks).toBe(2);
    });
    it("rejects patches that do not contain line changes", () => {
        const result = applyUnifiedDiff("hello\n", ["@@ -1,1 +1,1 @@", " hello"].join("\n"));
        expect(result.status).toBe("rejected_invalid_patch");
        expect(result.reason).toContain("no line changes");
        expect(result.hunksApplied).toBe(0);
    });
});
