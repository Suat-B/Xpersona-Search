import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/playground/auth", () => ({
  hasUnlimitedPlaygroundAccess: () => false,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  checkRateLimits: async () => ({ allowed: true, limits: { maxOutputTokens: 2048 } }),
  getUserPlan: async () => ({ plan: "builder", isActive: true }),
}));

import {
  buildContextPrompt,
  buildContextSelection,
  buildPlan,
  buildTargetInference,
  buildValidationPlan,
  parseStructuredAssistResponse,
  runAssist,
  synthesizeDeterministicActions,
} from "@/lib/playground/orchestration";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HF_ROUTER_TOKEN;
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_TOKEN;
});

describe("playground orchestration", () => {
  it("infers the preferred target from retrieval hints first", () => {
    const target = buildTargetInference({
      task: "fix the route",
      retrievalHints: { preferredTargetPath: "app/api/v1/playground/assist/route.ts" },
    });
    expect(target).toEqual({
      path: "app/api/v1/playground/assist/route.ts",
      confidence: 0.98,
      source: "mention",
    });
  });

  it("builds compact context selection from active file and indexed snippets", () => {
    const selection = buildContextSelection({
      targetInference: {
        path: "src/main.ts",
        confidence: 0.9,
        source: "active_file",
      },
      context: {
        activeFile: { path: "src/main.ts", content: "export const x = 1;" },
        indexedSnippets: [
          { path: "README.md", content: "hello", source: "cloud", reason: "Cloud index hit", score: 3.2 },
        ],
      },
    });
    expect(selection.files[0]?.path).toBe("src/main.ts");
    expect(selection.usedCloudIndex).toBe(true);
  });

  it("renders IDE context into a prompt-friendly summary", () => {
    const prompt = buildContextPrompt({
      activeFile: {
        path: "src/main.ts",
        selection: "export const x = 1;",
      },
      openFiles: [
        {
          path: "src/other.ts",
          excerpt: "export const y = 2;",
        },
      ],
    });
    expect(prompt).toContain("Active file:");
    expect(prompt).toContain("src/main.ts");
    expect(prompt).toContain("Open files:");
  });

  it("builds a targeted validation plan from file actions", () => {
    const plan = buildValidationPlan({
      actions: [
        { type: "edit", path: "src/app.ts", patch: "@@ -1,1 +1,1 @@\n-old\n+new" },
        { type: "write_file", path: "bot/main.py", content: "print('hi')", overwrite: true },
      ],
    });
    expect(plan.scope).toBe("targeted");
    expect(plan.checks).toContain("npm run lint -- src/app.ts");
    expect(plan.checks).toContain("python -m py_compile bot/main.py");
  });

  it("produces a concrete plan from target and context", () => {
    const plan = buildPlan({
      task: "fix the playground route",
      targetInference: {
        path: "app/api/v1/playground/assist/route.ts",
        confidence: 0.95,
        source: "mention",
      },
      contextSelection: {
        files: [{ path: "app/api/v1/playground/assist/route.ts", reason: "Primary inferred target" }],
        snippets: 1,
        usedCloudIndex: true,
      },
    });
    expect(plan.files).toContain("app/api/v1/playground/assist/route.ts");
    expect(plan.acceptanceTests).toContain("git diff --check -- app/api/v1/playground/assist/route.ts");
  });

  it("parses normalized JSON model output into actions", () => {
    const parsed = parseStructuredAssistResponse({
      raw: JSON.stringify({
        final: "Prepared the fix.",
        actions: [
          { type: "edit", path: "hello.py", patch: "@@ -1,1 +1,1 @@\n-old\n+new" },
          { type: "command", command: "python -m py_compile hello.py", category: "validation" },
        ],
      }),
      mode: "auto",
      targetPath: "hello.py",
      fallbackPlan: {
        objective: "fix hello.py",
        files: ["hello.py"],
        steps: ["edit hello.py"],
        acceptanceTests: ["python -m py_compile hello.py"],
        risks: [],
      },
    });
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.final).toContain("Prepared");
  });

  it("falls back to deterministic mkdir actions for simple folder requests", () => {
    const actions = synthesizeDeterministicActions({
      task: "create a folder called vscode_extension_backup",
      mode: "auto",
    });
    expect(actions).toEqual([{ type: "mkdir", path: "vscode_extension_backup" }]);
  });

  it("returns a deterministic plan when no model token is configured", async () => {
    const result = await runAssist({
      mode: "plan",
      task: "refactor the active route",
      context: {
        activeFile: { path: "app/api/v1/playground/assist/route.ts" },
      },
    });
    expect(result.plan?.files).toContain("app/api/v1/playground/assist/route.ts");
    expect(result.actions).toEqual([]);
    expect(result.completionStatus).toBe("complete");
  });

  it("uses the default model output for auto mode when the provider returns JSON", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  final: "Prepared the route update.",
                  actions: [
                    {
                      type: "edit",
                      path: "app/api/v1/playground/assist/route.ts",
                      patch: "@@ -1,1 +1,1 @@\n-old\n+new",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "update the assist route",
      retrievalHints: {
        preferredTargetPath: "app/api/v1/playground/assist/route.ts",
      },
    });

    expect(result.actions).toHaveLength(1);
    expect(result.validationPlan.scope).toBe("targeted");
    expect(result.completionStatus).toBe("complete");
  });
});
