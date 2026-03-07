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

  it("runs 3-pass reprompt loop and falls back to clarification when tool output is unusable", async () => {
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
    expect(result.reasonCodes).toContain("reprompt_fallback_to_clarification");
    expect(result.actionability.summary).toBe("clarification_needed");
    expect(result.final.toLowerCase()).toContain("please share");
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
});
