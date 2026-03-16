import { describe, expect, it } from "vitest";
import { sanitizeQwenAssistantOutput, shouldSuppressQwenPartialOutput } from "../src/qwen-ux";

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
    expect(result).toContain("user's workspace code");
  });

  it("filters runtime path chatter even when the response also mentions workspace root", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "fix route.ts",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "Workspace root is c:/repo. The user shared a path: c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js.",
    });

    expect(result).not.toContain("@qwen-code");
    expect(result).toContain("user's workspace code");
    expect(result).toContain("c:/repo");
  });

  it("does not treat an incidental leaked runtime path in task text as an explicit runtime request", () => {
    const result = sanitizeQwenAssistantOutput({
      task:
        "continue fixing route.ts c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "Okay, let me unpack this. The user shared a path: c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js.",
    });

    expect(result).not.toContain("@qwen-code");
    expect(result).toContain("user's workspace code");
  });

  it("filters runtime narrative chatter even without a full sdk path token", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "fix route.ts",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "This is a Windows file path (noting the backslashes). This is the path to a JavaScript file that seems to be part of the Qwen Code SDK for the CLI interface. The file is located in a user's local installation in the .trae extension directory.",
    });

    expect(result).not.toContain("Qwen Code SDK");
    expect(result).not.toContain(".trae");
    expect(result).toContain("user's workspace code");
    expect(result).toContain("c:/repo");
  });

  it("filters speculative meta narration about sdk path intent", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "continue with route.ts",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.56\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "The user might be trying to confirm the environment or check if the SDK is properly installed. Since they included this path, they might be testing the CLI or checking the SDK's location.",
    });

    expect(result).not.toContain("SDK is properly installed");
    expect(result).not.toContain("included this path");
    expect(result).toContain("user's workspace code");
    expect(result).toContain("c:/repo");
  });

  it("filters cli executable location chatter and redirects to workspace files", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "continue with route.ts",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["app/api/v1/playground/models/route.ts"],
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.57\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "This appears to be the location of the Qwen Code SDK's CLI executable. The user might be trying to check where this file is located, confirm the installation, or perhaps troubleshoot an issue related to the SDK.",
    });

    expect(result).not.toContain("CLI executable");
    expect(result).not.toContain("confirm the installation");
    expect(result).toContain("workspace code");
    expect(result).toContain("app/api/v1/playground/models/route.ts");
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

  it("filters the shared-file-path sdk extension phrasing that was slipping through", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "fix route.ts",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["app/api/v1/playground/models/route.ts"],
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.59\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text:
        "I notice you've shared a file path related to a Qwen Code SDK extension. I'll inspect that runtime first.",
    });

    expect(result).not.toContain("Qwen Code SDK extension");
    expect(result).not.toContain("runtime first");
    expect(result).toContain("workspace code");
    expect(result).toContain("app/api/v1/playground/models/route.ts");
  });

  it("strips pseudo tool-call markup instead of showing fake tool usage in chat", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "fix route.ts",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["app/api/v1/playground/models/route.ts"],
      text: [
        "Let me know how I can assist you further.",
        "<tool_call>",
        "<function=todo_write>",
        "<parameter=content>",
        "Investigate route.ts",
        "</parameter>",
        "</function>",
        "</tool_call>",
      ].join("\n"),
    });

    expect(result).toContain("Let me know how I can assist you further.");
    expect(result).not.toContain("<tool_call>");
    expect(result).not.toContain("todo_write");
    expect(result).not.toContain("Investigate route.ts");
  });

  it("suppresses runtime-chatter partials before they reach the chat UI", () => {
    const suppressed = shouldSuppressQwenPartialOutput({
      task: "expand on Binary IDE Plan.md",
      workspaceRoot: "c:/repo",
      executablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.59\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      text: "I notice you've shared a file path related to a Qwen Code SDK extension.",
    });

    expect(suppressed).toBe(true);
  });

  it("does not suppress normal workspace-grounded partials", () => {
    const suppressed = shouldSuppressQwenPartialOutput({
      task: "expand on Binary IDE Plan.md",
      workspaceRoot: "c:/repo",
      text: "I can expand the current Binary IDE plan and focus on the active markdown file.",
    });

    expect(suppressed).toBe(false);
  });

  it("filters the shared-path-to-sdk-installation phrasing too", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "expand on Binary IDE Plan.md",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["Binary IDE Plan.md"],
      text: "It looks like you shared a path to the Qwen Code SDK installation, so I should inspect that environment first.",
    });

    expect(result).not.toContain("Qwen Code SDK installation");
    expect(result).not.toContain("inspect that environment first");
    expect(result).toContain("workspace code");
    expect(result).toContain("Binary IDE Plan.md");
  });

  it("filters plain Qwen Code runtime chatter too", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "expand on Binary IDE Plan.md",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["Binary IDE Plan.md"],
      text: "I will inspect the Qwen Code runtime and model behavior before expanding your plan.",
    });

    expect(result).not.toContain("Qwen Code runtime");
    expect(result).not.toContain("model behavior");
    expect(result).toContain("workspace code");
    expect(result).toContain("Binary IDE Plan.md");
  });

  it("preserves legitimate Qwen workspace topics when the active files are actually about Qwen", () => {
    const result = sanitizeQwenAssistantOutput({
      task: "expand the qwen adapter logic in qwen-client.ts",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["src/qwen-client.ts"],
      text: "I can expand src/qwen-client.ts by tightening the Qwen adapter and normalizing router errors.",
    });

    expect(result).toContain("src/qwen-client.ts");
    expect(result).toContain("Qwen adapter");
    expect(result).not.toContain("user's workspace code at c:/repo");
  });

  it("does not suppress Qwen-related partials when they are grounded in workspace files", () => {
    const suppressed = shouldSuppressQwenPartialOutput({
      task: "expand the qwen adapter logic in qwen-client.ts",
      workspaceRoot: "c:/repo",
      workspaceTargets: ["src/qwen-client.ts"],
      text: "I can update src/qwen-client.ts to make the Qwen adapter more reliable.",
    });

    expect(suppressed).toBe(false);
  });
});
