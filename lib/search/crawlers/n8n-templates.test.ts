import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

import { normalizeN8nWorkflow } from "./n8n-templates";

describe("normalizeN8nWorkflow", () => {
  it("maps n8n workflow templates into canonical marketplace agents", () => {
    const normalized = normalizeN8nWorkflow({
      id: 6270,
      name: "Build Your First AI Agent",
      description: "Launch your first AI agent with tools and memory.",
      totalViews: 99862,
      createdAt: "2025-07-22T12:14:21.343Z",
      user: { username: "lucaspeyrin", verified: true },
      nodes: [
        { displayName: "AI Agent", name: "@n8n/n8n-nodes-langchain.agent", nodeCategories: [{ name: "AI" }] },
        { displayName: "Google Gemini Chat Model", name: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini" },
      ],
    });

    expect(normalized.source).toBe("N8N_TEMPLATES");
    expect(normalized.sourceId).toBe("n8n:6270");
    expect(normalized.url).toContain("https://n8n.io/workflows/6270-");
    expect(normalized.capabilities).toContain("ai agent");
    expect(normalized.openclawData).toMatchObject({
      discoverySignals: {
        installCount: 99862,
        verified: true,
        hasManifest: true,
      },
    });
    expect(normalized.popularityScore).toBeGreaterThan(0);
  });
});
