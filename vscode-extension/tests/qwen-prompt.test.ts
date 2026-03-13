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
});
