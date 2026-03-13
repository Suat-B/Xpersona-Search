import { describe, expect, it } from "vitest";
import { sanitizeQwenAssistantOutput } from "../src/qwen-ux";

describe("qwen-ux", () => {
  it("filters stale extension runtime chatter from assistant output", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "what does route.ts do?",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "Okay, let me process what's going on here. The user is showing me a file path related to the Qwen Code SDK, specifically c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js.",
    });

    expect(result).not.toContain("@qwen-code");
    expect(result).toContain("current workspace");
  });

  it("preserves runtime discussion when the user explicitly asks about it", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "why is cli.js inside @qwen-code/sdk being used?",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "The path c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js is the bundled SDK CLI entrypoint.",
    });

    expect(result).toContain("@qwen-code");
    expect(result).toContain("bundled SDK CLI");
  });
});
