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
        resolvedFiles: ["app/api/v1/playground/models/route.ts"],
        selectedFiles: ["app/api/v1/playground/models/route.ts"],
        diagnostics: [],
        snippets: [
          {
            path: "app/api/v1/playground/models/route.ts",
            source: "local_fallback",
            reason: "Matched from user request",
          },
        ],
      },
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
    expect(prompt).toContain("Treat c:/repo as the user's active project root.");
  });
});
