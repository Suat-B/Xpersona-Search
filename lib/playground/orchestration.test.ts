import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/playground/auth", () => ({
  hasUnlimitedPlaygroundAccess: () => false,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  checkRateLimits: async () => ({ allowed: true, limits: { maxOutputTokens: 2048 } }),
  getUserPlan: async () => ({ isActive: true }),
}));

let composeWarmAssistantResponse: typeof import("@/lib/playground/orchestration").composeWarmAssistantResponse;
let contextToPrompt: typeof import("@/lib/playground/orchestration").contextToPrompt;
let resolveIntentRouting: typeof import("@/lib/playground/orchestration").resolveIntentRouting;
let synthesizeDeterministicActions: typeof import("@/lib/playground/orchestration").synthesizeDeterministicActions;
let runAssist: typeof import("@/lib/playground/orchestration").runAssist;

beforeAll(async () => {
  const mod = await import("@/lib/playground/orchestration");
  composeWarmAssistantResponse = mod.composeWarmAssistantResponse;
  contextToPrompt = mod.contextToPrompt;
  resolveIntentRouting = mod.resolveIntentRouting;
  synthesizeDeterministicActions = mod.synthesizeDeterministicActions;
  runAssist = mod.runAssist;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HF_ROUTER_TOKEN;
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_TOKEN;
});

describe("playground orchestration intent routing", () => {
  it("routes direct informational question to conversation intent", () => {
    const routed = resolveIntentRouting({
      task: "What is my AI model based on?",
      forceLegacy: false,
    });
    expect(routed.intent).toBe("conversation");
    expect(routed.confidence).toBeGreaterThan(0.4);
  });

  it("routes file-creation ask to code_edit intent", () => {
    const routed = resolveIntentRouting({
      task: "Create AI sample code in hello.py",
      forceLegacy: false,
      context: {
        activeFile: { path: "hello.py", language: "python" },
      },
    });
    expect(routed.intent).toBe("code_edit");
    expect(routed.reasonCodes).toContain("path_mentioned");
  });

  it("routes typo-heavy implementation ask to code_edit intent", () => {
    const routed = resolveIntentRouting({
      task: "Cretae a trailing stop loss",
      forceLegacy: false,
    });
    expect(routed.intent).toBe("code_edit");
    expect(routed.reasonCodes).toContain("explicit_edit_request");
  });

  it("uses follow-up history to keep file-target continuity", () => {
    const routed = resolveIntentRouting({
      task: "inside my hello.py please",
      forceLegacy: false,
      conversationHistory: [
        { role: "assistant", content: "{\"final\":\"Done\",\"edits\":[{\"path\":\"hello.py\",\"patch\":\"diff --git a/hello.py b/hello.py\"}],\"commands\":[]}" },
      ],
    });
    expect(routed.intent).toBe("code_edit");
    expect(routed.reasonCodes).toContain("followup_bound_to_previous_edit");
  });
});

describe("playground response composer", () => {
  it("strips JSON wrappers and adds warm structured response", () => {
    const out = composeWarmAssistantResponse({
      final: "{\"final\":\"Hello!\\n\\nThinking...\",\"edits\":[],\"commands\":[]}",
      task: "say hi",
      decisionMode: "generate",
      intent: "conversation",
      edits: [],
      commands: [],
      autonomyDecision: { mode: "no_actions" },
    });
    expect(out).toContain("Hello!");
    expect(out).not.toContain("\"final\"");
    expect(out).not.toContain("Thinking...");
  });

  it("uses concrete prepared-edit wording instead of draft narration for file actions", () => {
    const out = composeWarmAssistantResponse({
      final: "Added trailing stop support.",
      task: "add trailing stop support",
      decisionMode: "generate",
      intent: "code_edit",
      edits: [{ path: "One/strategies/pending/Emergent_Swarm_Intelligence.pine", patch: "diff --git a/x b/x" }],
      commands: [],
      actions: [{ type: "edit", path: "One/strategies/pending/Emergent_Swarm_Intelligence.pine", patch: "diff --git a/x b/x" }],
      autonomyDecision: { mode: "auto_apply_and_validate" },
    });
    expect(out).toContain("Prepared file edits for One/strategies/pending/Emergent_Swarm_Intelligence.pine.");
    expect(out).not.toContain("I drafted a proposed update");
  });

  it("includes active file content and open file excerpts in context prompt", () => {
    const out = contextToPrompt({
      activeFile: {
        path: "vitest.config.ts",
        language: "ts",
        selection: "export default {}",
        content: "export default { test: { environment: 'node' } }",
      },
      openFiles: [
        {
          path: "src/example.ts",
          language: "ts",
          excerpt: "export function hello() { return 'hi'; }",
        },
      ],
      indexedSnippets: [{ path: "README.md", score: 0.5, content: "Hello world" }],
    });

    expect(out).toContain("Active file:");
    expect(out).toContain("Selection:");
    expect(out).toContain("Content:");
    expect(out).toContain("environment");
    expect(out).toContain("Open files:");
    expect(out).toContain("src/example.ts");
    expect(out).toContain("export function hello");
  });
});

describe("playground deterministic actions", () => {
  it("synthesizes mkdir action for direct folder request", () => {
    const actions = synthesizeDeterministicActions({
      task: "create a folder called vs_code_test",
      edits: [],
      commands: [],
    });
    expect(actions).toContainEqual({ type: "mkdir", path: "vs_code_test" });
  });
});

describe("playground identity guardrail", () => {
  it("answers country-of-origin probes with the configured country", async () => {
    const result = await runAssist({
      mode: "auto",
      task: "What country were u made in?",
    });
    expect(result.final).toBe("United States of America");
    expect(result.edits).toHaveLength(0);
    expect(result.commands).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
    expect(result.decision.mode).toBe("generate");
  });

  it("denies Qwen identity probes and redirects to Playground 1", async () => {
    const result = await runAssist({
      mode: "auto",
      task: "are you qwen?",
    });
    expect(result.final).toContain("Playground 1");
    expect(result.final).toContain("not Qwen");
    expect(result.final).toContain("not nscale");
    expect(result.edits).toHaveLength(0);
    expect(result.commands).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
    expect(result.decision.mode).toBe("generate");
  });

  it("handles n-scale formatting variants", async () => {
    const result = await runAssist({
      mode: "auto",
      task: "what is n-scale for your model?",
    });
    expect(result.final).toContain("Playground 1");
    expect(result.final).toContain("not nscale");
    expect(result.actions).toHaveLength(0);
  });

  it("does not inject identity denial for unrelated plan requests", async () => {
    const result = await runAssist({
      mode: "plan",
      task: "create a simple hello.py with tests",
    });
    expect(result.final).not.toContain("I'm Playground 1. I'm not Qwen");
    expect(result.decision.mode).toBe("plan");
  });
});

describe("playground conversational guardrails", () => {
  it("answers year questions deterministically", async () => {
    const expectedYear = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(
      new Date()
    );
    const result = await runAssist({
      mode: "auto",
      task: "what year is it",
    });
    expect(result.final).toContain(expectedYear);
    expect(result.reasonCodes).toContain("conversation_deterministic_reply");
  });

  it("handles short acknowledgements without random identity output", async () => {
    const result = await runAssist({
      mode: "auto",
      task: "nice",
    });
    expect(result.final).toBe("Happy to help. Tell me what you'd like to do next.");
    expect(result.final.toLowerCase()).not.toContain("china");
    expect(result.reasonCodes).toContain("conversation_deterministic_reply");
  });
});

describe("playground agentic behavior", () => {
  it("keeps greeting requests conversational without fake actions", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "Hey! What can I help you build today?" } }] }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "hi",
    });
    expect(result.intent.type).toBe("conversation");
    expect(result.actions).toHaveLength(0);
    expect(result.final.toLowerCase()).not.toContain("i prepared the requested update");
  });

  it("runs recovery passes and falls back without asking for path when target is already inferable", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssist({
      mode: "auto",
      task: "create a hello.py script with a greet function",
    });
    expect(result.repromptStage).toBe("fallback");
    expect(result.reasonCodes).toContain("reprompt_repair_pass_2");
    expect(result.reasonCodes).toContain("reprompt_tool_enforcement_pass_3");
    expect(result.reasonCodes).toContain("reprompt_context_assumption_pass_4");
    expect(result.reasonCodes).toContain("reprompt_fallback_to_clarification");
    expect(result.actionability.summary).toBe("clarification_needed");
    expect(result.final.toLowerCase()).toContain("hello.py");
    expect(result.final.toLowerCase()).not.toContain("please share the exact file path");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("falls back to IDE-context targeting text when path is not inferable but context exists", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssist({
      mode: "auto",
      task: "update this component to use memoized props",
      context: {
        activeFile: {
          path: "C:/Users/suatb/Desktop/Frieren/Xpersona/components/chat/ChatApp.tsx",
          language: "tsx",
          content: "export const label = 'old';",
        },
      },
    });
    expect(result.repromptStage).toBe("fallback");
    expect(result.reasonCodes).toContain("reprompt_context_assumption_pass_4");
    expect(result.final.toLowerCase()).toContain("active ide context");
    expect(result.final.toLowerCase()).not.toContain("please share the exact file path");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("self-reprompts on zero-action typo request in full-auto mode", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssist({
      mode: "auto",
      task: "Cretae a trailing stop loss",
      executionPolicy: "full_auto",
    });
    expect(result.reasonCodes).toContain("explicit_edit_request");
    expect(result.reasonCodes).toContain("reprompt_repair_pass_2");
    expect(result.reasonCodes).toContain("reprompt_tool_enforcement_pass_3");
    expect(result.repromptStage).toBe("fallback");
    expect(result.final.toLowerCase()).not.toContain("i'm here and ready to help");
    expect(result.actionability.summary).toBe("clarification_needed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses IDE context to recover from clarification-style outputs and produce edits", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [{ message: { content: "{\"final\":\"Which file should I edit?\",\"edits\":[],\"commands\":[]}" } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "{\"final\":\"Updated component\",\"edits\":[{\"path\":\"components/chat/ChatApp.tsx\",\"patch\":\"diff --git a/components/chat/ChatApp.tsx b/components/chat/ChatApp.tsx\\n--- a/components/chat/ChatApp.tsx\\n+++ b/components/chat/ChatApp.tsx\\n@@ -1 +1 @@\\n-export const label = 'old';\\n+export const label = 'new';\"}],\"commands\":[]}",
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssist({
      mode: "auto",
      task: "edit this component so the chat label says new",
      context: {
        activeFile: { path: "components/chat/ChatApp.tsx", language: "tsx", selection: "export const label = 'old';" },
      },
    });
    expect(result.reasonCodes).toContain("clarification_overridden_by_context");
    expect(result.reasonCodes).toContain("reprompt_context_assumption_pass_4");
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actionability.summary).toBe("valid_actions");
    expect(result.repromptStage).not.toBe("fallback");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("biases auto mode toward auto-apply-and-validate for valid low-risk edits", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "{\"final\":\"Created update\",\"edits\":[{\"path\":\"hello.py\",\"patch\":\"diff --git a/hello.py b/hello.py\\nnew file mode 100644\\n--- /dev/null\\n+++ b/hello.py\\n@@ -0,0 +1 @@\\n+print('hi')\"}],\"commands\":[]}",
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "create hello.py with a simple print",
    });
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.autonomyDecision.mode).toBe("auto_apply_and_validate");
  });

  it("infers apply_patch output into edit actions", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  "*** Begin Patch",
                  "*** Update File: hello.py",
                  "@@",
                  "-print('hi')",
                  "+print('hello')",
                  "*** End Patch",
                ].join("\n"),
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "update hello.py to print hello",
    });

    expect(result.actions.some((action) => action.type === "edit" && action.path === "hello.py")).toBe(true);
    expect(result.actionability.summary).toBe("valid_actions");
  });

  it("does not claim completion when no actions were produced", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "{\"final\":\"Updated the K-Theory strategy to use an input length of 20 instead of 10.\",\"edits\":[],\"commands\":[]}",
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "can you increase the input length to 20",
    });
    expect(result.actions).toHaveLength(0);
    expect(result.actionability.summary).toBe("clarification_needed");
    expect(result.completionStatus).toBe("incomplete");
    expect(result.missingRequirements).toContain("actionable_actions_required");
    expect(result.final).toContain("No repository changes were applied yet");
    expect(result.final.toLowerCase()).not.toContain("updated the k-theory strategy");
  });

  it("marks edit-intent command-only output as incomplete for forced reprompt handling", async () => {
    process.env.HF_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          choices: [
            {
              message: {
                content: "{\"final\":\"done\",\"edits\":[],\"commands\":[\"npm run lint\"]}",
              },
            },
          ],
        }),
      }))
    );

    const result = await runAssist({
      mode: "auto",
      task: "edit hello.py to add logging",
      executionPolicy: "full_auto",
    });

    expect(result.actions.some((action) => action.type === "command")).toBe(true);
    expect(result.actions.some((action) => action.type === "edit")).toBe(false);
    expect(result.repromptStage).toBe("tool_enforcement");
    expect(result.completionStatus).toBe("incomplete");
    expect(result.missingRequirements).toContain("file_edit_actions_required");
    expect(result.missingRequirements).toContain("command_only_output_for_edit_intent");
  });

  it("respects no-clarify autonomy profile by returning autonomous retry text instead of user clarification", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ choices: [{ message: { content: "{\"final\":\"done\",\"edits\":[],\"commands\":[]}" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssist({
      mode: "auto",
      task: "create hello.py script with greet function",
      autonomy: {
        mode: "unbounded",
        maxCycles: 0,
        noClarifyToUser: true,
        commandPolicy: "run_until_done",
        safetyFloor: "allow_everything",
        failsafe: "disabled",
      },
    });

    expect(result.completionStatus).toBe("incomplete");
    expect(result.reasonCodes).toContain("autonomy_no_clarify_enabled");
    expect(result.final.toLowerCase()).toContain("autonomous retry required");
    expect(result.final.toLowerCase()).not.toContain("please share the exact file path");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
