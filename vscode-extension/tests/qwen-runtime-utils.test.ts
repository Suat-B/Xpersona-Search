import { describe, expect, it } from "vitest";
import { getAutoApprovedQwenTools, isSafeInspectionToolRequest } from "../src/qwen-runtime-utils";

describe("qwen-runtime-utils", () => {
  it("allows safe inspection shell commands", () => {
    expect(
      isSafeInspectionToolRequest("run_terminal_cmd", {
        command: "Get-ChildItem -Recurse | Select-String -Pattern route.ts",
      })
    ).toBe(true);

    expect(
      isSafeInspectionToolRequest("run_terminal_cmd", {
        command: "rg --files app/api/v1/playground",
      })
    ).toBe(true);
  });

  it("blocks mutating or chained shell commands", () => {
    expect(
      isSafeInspectionToolRequest("run_terminal_cmd", {
        command: "rg route.ts && del route.ts",
      })
    ).toBe(false);

    expect(
      isSafeInspectionToolRequest("run_terminal_cmd", {
        command: "Set-Content foo.txt hi",
      })
    ).toBe(false);
  });

  it("includes common safe shell prefixes in the auto-approved tool list", () => {
    expect(getAutoApprovedQwenTools()).toContain("ShellTool(rg )");
    expect(getAutoApprovedQwenTools()).toContain("ShellTool(Get-ChildItem)");
  });
});
