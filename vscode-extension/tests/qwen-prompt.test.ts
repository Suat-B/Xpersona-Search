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

  it("anchors current-context requests to the active workspace file instead of inviting path confusion", () => {
    const prompt = buildQwenPrompt({
      task: "expand on my current files integration plan please",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "Binary IDE Plan.md",
        openFiles: ["Binary IDE Plan.md"],
        candidateFiles: ["Binary IDE Plan.md"],
        attachedFiles: ["Binary IDE Plan.md"],
        memoryFiles: [],
        resolvedFiles: ["Binary IDE Plan.md"],
        selectedFiles: ["Binary IDE Plan.md"],
        diagnostics: [],
        intent: "explain",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "active file inferred",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      context: {
        activeFile: {
          path: "Binary IDE Plan.md",
          language: "markdown",
          content: "# Binary IDE Plan",
        },
      },
    });

    expect(prompt).toContain("The user is referring to the current workspace context.");
    expect(prompt).toContain("Default to the active file");
    expect(prompt).toContain("Binary IDE Plan.md");
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

  it("keeps legitimate Qwen workspace history when the current file is about Qwen integration", () => {
    const prompt = buildQwenPrompt({
      task: "expand the qwen adapter logic in qwen-client.ts",
      mode: "auto",
      workspaceRoot: "c:/repo",
      preview: {
        activeFile: "src/qwen-client.ts",
        openFiles: ["src/qwen-client.ts"],
        candidateFiles: ["src/qwen-client.ts"],
        attachedFiles: ["src/qwen-client.ts"],
        memoryFiles: [],
        resolvedFiles: ["src/qwen-client.ts"],
        selectedFiles: ["src/qwen-client.ts"],
        diagnostics: [],
        intent: "explain",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "active file inferred",
        workspaceRoot: "c:/repo",
        snippets: [],
      },
      history: [
        {
          id: "m-1",
          role: "assistant",
          content: "Let's expand src/qwen-client.ts by improving the Qwen adapter and retry handling.",
        },
      ],
      context: {
        activeFile: {
          path: "src/qwen-client.ts",
          language: "typescript",
          content: "export function createQwenClient() {}",
        },
      },
    });

    expect(prompt).toContain("src/qwen-client.ts");
    expect(prompt).toContain("Qwen adapter and retry handling");
    expect(prompt).not.toContain("SDK's CLI executable");
  });
});
