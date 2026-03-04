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

beforeAll(async () => {
  const mod = await import("@/lib/playground/orchestration");
  composeWarmAssistantResponse = mod.composeWarmAssistantResponse;
  resolveIntentRouting = mod.resolveIntentRouting;
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
