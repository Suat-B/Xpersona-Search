import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/playground/auth", () => ({
  hasUnlimitedPlaygroundAccess: () => false,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  checkRateLimits: async () => ({ allowed: true, limits: { maxOutputTokens: 2048 } }),
  getUserPlan: async () => ({ isActive: true }),
}));

let composeWarmAssistantResponse: typeof import("@/lib/playground/orchestration").composeWarmAssistantResponse;
let resolveIntentRouting: typeof import("@/lib/playground/orchestration").resolveIntentRouting;
let synthesizeDeterministicActions: typeof import("@/lib/playground/orchestration").synthesizeDeterministicActions;
let runAssist: typeof import("@/lib/playground/orchestration").runAssist;

beforeAll(async () => {
  const mod = await import("@/lib/playground/orchestration");
  composeWarmAssistantResponse = mod.composeWarmAssistantResponse;
  resolveIntentRouting = mod.resolveIntentRouting;
  synthesizeDeterministicActions = mod.synthesizeDeterministicActions;
  runAssist = mod.runAssist;
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
