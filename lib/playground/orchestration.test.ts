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
  buildObjectiveState,
  buildPlan,
  buildTargetInference,
  buildValidationPlan,
  inferIntent,
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
  it("classifies what-is questions about a file as unknown, not code_edit", () => {
    const intent = inferIntent({
      mode: "auto",
      task: "what is my main.py about",
      targetInference: { path: "main.py", confidence: 0.9, source: "mention" },
    });
    expect(intent.type).toBe("unknown");
  });

  it("still classifies explicit fix requests with a target path as code_edit", () => {
    const intent = inferIntent({
      mode: "auto",
      task: "fix the import in main.py",
      targetInference: { path: "main.py", confidence: 0.9, source: "mention" },
    });
    expect(intent.type).toBe("code_edit");
  });

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

  it("renders browser context into a prompt-friendly summary", () => {
    const prompt = buildContextPrompt({
      browser: {
        mode: "attached",
        browserName: "Google Chrome",
        activePage: {
          id: "page_1",
          title: "Inbox",
          url: "https://mail.google.com/mail/u/0/#inbox",
          origin: "https://mail.google.com",
          browserName: "Google Chrome",
        },
        openPages: [
          {
            id: "page_1",
            title: "Inbox",
            url: "https://mail.google.com/mail/u/0/#inbox",
            origin: "https://mail.google.com",
            browserName: "Google Chrome",
          },
        ],
        visibleInteractiveElements: [
          {
            id: "element_1",
            selector: "#compose",
            label: "Compose",
            role: "button",
            tagName: "button",
          },
        ],
      },
    });

    expect(prompt).toContain("Browser state:");
    expect(prompt).toContain("Inbox");
    expect(prompt).toContain("#compose");
  });

  it("renders repo cognition and verification context into the prompt", () => {
    const prompt = buildContextPrompt({
      repoModel: {
        contextVersion: 7,
        workspaceRoot: "c:/repo",
        summary: "Workspace stack: node js ts | Primary validation: npm test",
        stack: "node_js_ts",
        primaryValidationCommand: "npm test",
        hotspots: ["src/index.ts"],
        routeHints: {
          preferredRoute: "shell_route",
          reason: "Recent successful verification used npm test.",
          informedBy: ["repo_memory", "terminal_first_policy"],
        },
        symbolIndex: [{ name: "greet", kind: "function", path: "src/index.ts", line: 1 }],
      },
      verificationPlan: {
        status: "pending",
        primaryCommand: "npm test",
        checks: [{ id: "node:test", label: "Run project tests", command: "npm test", kind: "test" }],
        receipts: ["passed: npm test passed cleanly"],
      },
    });

    expect(prompt).toContain("Repo model:");
    expect(prompt).toContain("Preferred coding route");
    expect(prompt).toContain("Verification plan:");
    expect(prompt).toContain("npm test");
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
    expect(plan.checks).toContain("python -m pytest");
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

  it("anchors bare task file mentions into the requested project folder", () => {
    const target = buildTargetInference({
      task: "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json.",
    });
    const selection = buildContextSelection({
      task: "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json.",
      targetInference: target,
      retrievalHints: {
        mentionedPaths: ["README.md", "src/index.js", "test/index.test.js", "package.json"],
      },
    });
    const plan = buildPlan({
      task: "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json.",
      targetInference: target,
      contextSelection: selection,
    });

    expect(target.path).toBe("repo-proof/README.md");
    expect(plan.files).toContain("repo-proof/README.md");
    expect(plan.files).toContain("repo-proof/src/index.js");
    expect(plan.files).toContain("repo-proof/test/index.test.js");
    expect(plan.files).toContain("repo-proof/package.json");
  });

  it("builds lane, specializer, and checklist metadata for a git-heavy node task", () => {
    const task =
      "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json. Run tests until they pass. Then initialize git inside repo-proof, create a feature branch named feat/autonomy-proof, and create a commit.";
    const target = buildTargetInference({ task });
    const selection = buildContextSelection({
      task,
      targetInference: target,
      retrievalHints: {
        mentionedPaths: ["README.md", "src/index.js", "test/index.test.js", "package.json"],
      },
    });
    const plan = buildPlan({
      task,
      targetInference: target,
      contextSelection: selection,
    });
    const objective = buildObjectiveState({
      request: {
        mode: "auto",
        task,
      },
      intent: inferIntent({
        mode: "auto",
        task,
        targetInference: target,
      }),
      targetInference: target,
      contextSelection: selection,
      actions: [
        {
          type: "write_file",
          path: "repo-proof/package.json",
          content: '{\n  "name": "repo-proof"\n}\n',
          overwrite: true,
        },
      ],
      missingRequirements: ["required_validation_missing", "required_git_commit_missing"],
      plan,
      final: "Prepared the project files.",
      observedProof: ["target_resolved", "target_grounded", "workspace_change_prepared"],
    });

    expect(objective.autonomyLane).toBe("git_completion");
    expect(objective.stackSpecializer).toBe("node_js_ts");
    expect(objective.requiredArtifacts).toContain("repo-proof/package.json");
    expect(objective.completionChecklist?.some((item) => item.id === "validation" && item.status === "pending")).toBe(true);
    expect(objective.completionChecklist?.some((item) => item.id === "git-closeout" && item.status === "pending")).toBe(true);
  });

  it("promotes repo route and verification context into objective metadata", () => {
    const task = "Fix greet in src/index.ts and run tests.";
    const target = buildTargetInference({ task });
    const selection = buildContextSelection({
      task,
      targetInference: target,
      context: {
        repoModel: {
          contextVersion: 99,
          routeHints: {
            preferredRoute: "shell_route",
            reason: "Repo cognition prefers the terminal verifier path.",
          },
          hotspots: ["src/index.ts"],
        },
        verificationPlan: {
          status: "pending",
          primaryCommand: "npm test",
          receipts: ["passed: npm test passed cleanly"],
        },
      },
    });
    const objective = buildObjectiveState({
      request: {
        mode: "auto",
        task,
        context: {
          repoModel: {
            contextVersion: 99,
            routeHints: {
              preferredRoute: "shell_route",
              reason: "Repo cognition prefers the terminal verifier path.",
            },
            hotspots: ["src/index.ts"],
          },
          verificationPlan: {
            status: "pending",
            primaryCommand: "npm test",
            receipts: ["passed: npm test passed cleanly"],
          },
        },
      },
      intent: inferIntent({ mode: "auto", task, targetInference: target }),
      targetInference: target,
      contextSelection: selection,
      actions: [],
      missingRequirements: ["required_mutation_missing:src/index.ts"],
      plan: null,
      final: "",
      observedProof: ["target_resolved"],
    });

    expect(objective.chosenRoute).toBe("shell_route");
    expect(objective.routeReason).toContain("terminal");
    expect(objective.verificationStatus).toBe("pending");
    expect(objective.repoContextVersion).toBe(99);
    expect(objective.workerAssignments?.some((item) => item.role === "Scout")).toBe(true);
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

  it("parses plan-mode clarification questions into a structured user input request", () => {
    const parsed = parseStructuredAssistResponse({
      raw: JSON.stringify({
        final: "I need a bit more context before I can finish the plan.",
        plan: null,
        userInputRequest: {
          requestId: "plan_req_1",
          questions: [
            {
              header: "Scope",
              id: "scope",
              question: "Which area should we prioritize first?",
              options: [
                { label: "Desktop bridge", description: "Land the desktop compat plumbing first." },
                { label: "Host API", description: "Start with the persisted resume endpoint." },
              ],
            },
          ],
        },
        actions: [],
      }),
      mode: "plan",
      targetPath: "apps/binary-ide-desktop/src/main.ts",
      fallbackPlan: {
        objective: "align desktop compat plan mode",
        files: ["apps/binary-ide-desktop/src/main.ts"],
        steps: ["inspect the desktop bridge"],
        acceptanceTests: ["pnpm test"],
        risks: [],
      },
    });

    expect(parsed.userInputRequest?.requestId).toBe("plan_req_1");
    expect(parsed.userInputRequest?.questions).toHaveLength(1);
    expect(parsed.plan).toBeNull();
    expect(parsed.actions).toEqual([]);
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

  it("marks plan runs with user-input requests as incomplete", async () => {
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
                  final: "I need a bit more context before I can finish the plan.",
                  plan: null,
                  userInputRequest: {
                    requestId: "plan_req_2",
                    questions: [
                      {
                        header: "Entry",
                        id: "entry",
                        question: "How should the user enter plan mode?",
                        options: [
                          { label: "/plan only", description: "Trigger plan mode only from the slash command." },
                          { label: "UI and /plan", description: "Honor both the UI mode and the slash command." },
                        ],
                      },
                    ],
                  },
                  actions: [],
                }),
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "plan",
      task: "make desktop plan mode work",
    });

    expect(result.userInputRequest?.requestId).toBe("plan_req_2");
    expect(result.missingRequirements).toContain("user_input_required");
    expect(result.completionStatus).toBe("incomplete");
  });
});
