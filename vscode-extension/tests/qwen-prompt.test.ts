import { describe, expect, it } from "vitest";
import { buildQwenPrompt } from "../src/qwen-prompt";

describe("qwen-prompt", () => {
  it("includes resolved target files and relevant snippets in the prompt", () => {
    const prompt = buildQwenPrompt({
      task: "fix route.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "app/api/v1/playground/models/route.ts",
        openFiles: ["app/api/v1/playground/models/route.ts"],
        candidateFiles: ["app/api/v1/playground/models/route.ts"],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.91,
        rationale: "single likely target",
        workspaceRoot: "c:/repo",
        snippets: [
          {
            path: "app/api/v1/playground/models/route.ts",
            source: "local_fallback",
            reason: "Matched from user request",
          },
        ],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content:
            "The path is c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
        },
        {
          id: "m-2",
          role: "user",
          content: "please keep working on route.ts",
        },
      ],
      qwenExecutablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      context: {
        activeFile: {
          path: "app/api/v1/playground/models/route.ts",
          language: "typescript",
          content: "export async function GET() {}",
        },
        indexedSnippets: [
          {
            path: "app/api/v1/playground/models/route.ts",
            content: "export async function GET() {}",
            source: "local_fallback",
            reason: "Matched from user request",
          },
        ],
      },
    });

    expect(prompt).toContain("Likely target files");
    expect(prompt).toContain("app/api/v1/playground/models/route.ts");
    expect(prompt).toContain("Relevant workspace snippets");
    expect(prompt).toContain("Intent lane");
    expect(prompt).toContain("Recent conversation lane");
    expect(prompt).toContain("please keep working on route.ts");
    expect(prompt).not.toContain("@qwen-code");
    expect(prompt).toContain("Treat c:/repo as the user's active project root.");
  });

  it("drops mixed history messages that mention both workspace root and extension runtime path", () => {
    const prompt = buildQwenPrompt({
      task: "continue with route.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "app/api/v1/playground/models/route.ts",
        openFiles: ["app/api/v1/playground/models/route.ts"],
        candidateFiles: ["app/api/v1/playground/models/route.ts"],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.91,
        rationale: "single likely target",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content:
            "Workspace root is c:/repo. The user shared a path: c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js.",
        },
        {
          id: "m-2",
          role: "assistant",
          content: "Continuing with app/api/v1/playground/models/route.ts",
        },
      ],
      qwenExecutablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      context: {
        activeFile: {
          path: "app/api/v1/playground/models/route.ts",
          language: "typescript",
          content: "export async function GET() {}",
        },
      },
    });

    expect(prompt).toContain("Recent conversation lane");
    expect(prompt).toContain("Continuing with app/api/v1/playground/models/route.ts");
    expect(prompt).not.toContain("@qwen-code");
    expect(prompt).not.toContain("The user shared a path");
  });

  it("drops runtime narrative history about .trae extension installs", () => {
    const prompt = buildQwenPrompt({
      task: "continue fixing route.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "app/api/v1/playground/models/route.ts",
        openFiles: ["app/api/v1/playground/models/route.ts"],
        candidateFiles: ["app/api/v1/playground/models/route.ts"],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "single likely target",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content:
            "This is a Windows file path (noting the backslashes). The file is part of the Qwen Code SDK and appears to be in a local .trae extension directory.",
        },
        {
          id: "m-2",
          role: "assistant",
          content: "Continuing with app/api/v1/playground/models/route.ts",
        },
      ],
      qwenExecutablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.55\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      context: {
        activeFile: {
          path: "app/api/v1/playground/models/route.ts",
          language: "typescript",
          content: "export async function GET() {}",
        },
      },
    });

    expect(prompt).toContain("Continuing with app/api/v1/playground/models/route.ts");
    expect(prompt).not.toContain("Windows file path");
    expect(prompt).not.toContain(".trae");
    expect(prompt).not.toContain("Qwen Code SDK");
  });

  it("drops speculative meta narration history about sdk installation intent", () => {
    const prompt = buildQwenPrompt({
      task: "continue fixing route.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "app/api/v1/playground/models/route.ts",
        openFiles: ["app/api/v1/playground/models/route.ts"],
        candidateFiles: ["app/api/v1/playground/models/route.ts"],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "single likely target",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content:
            "The user might be trying to confirm the environment or check if the SDK is properly installed. Since they included this path, they might be testing the CLI or checking the SDK's location.",
        },
        {
          id: "m-2",
          role: "assistant",
          content: "Continuing with app/api/v1/playground/models/route.ts",
        },
      ],
      qwenExecutablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.56\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      context: {
        activeFile: {
          path: "app/api/v1/playground/models/route.ts",
          language: "typescript",
          content: "export async function GET() {}",
        },
      },
    });

    expect(prompt).toContain("Continuing with app/api/v1/playground/models/route.ts");
    expect(prompt).not.toContain("The user might be trying");
    expect(prompt).not.toContain("SDK is properly installed");
    expect(prompt).not.toContain("included this path");
  });

  it("drops cli executable location chatter from history", () => {
    const prompt = buildQwenPrompt({
      task: "continue fixing route.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "app/api/v1/playground/models/route.ts",
        openFiles: ["app/api/v1/playground/models/route.ts"],
        candidateFiles: ["app/api/v1/playground/models/route.ts"],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "single likely target",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content:
            "This appears to be the location of the Qwen Code SDK's CLI executable. The user might be trying to check where this file is located, confirm the installation, or perhaps troubleshoot an issue related to the SDK.",
        },
        {
          id: "m-2",
          role: "assistant",
          content: "Continuing with app/api/v1/playground/models/route.ts",
        },
      ],
      qwenExecutablePath:
        "c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.57\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js",
      context: {
        activeFile: {
          path: "app/api/v1/playground/models/route.ts",
          language: "typescript",
          content: "export async function GET() {}",
        },
      },
    });

    expect(prompt).toContain("Continuing with app/api/v1/playground/models/route.ts");
    expect(prompt).not.toContain("location of the Qwen Code SDK");
    expect(prompt).not.toContain("confirm the installation");
    expect(prompt).not.toContain("troubleshoot an issue related to the SDK");
  });
});
