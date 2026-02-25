import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ForAgentsPage, { metadata } from "./page";

describe("/for-agents page", () => {
  it("renders machine-first onboarding content", () => {
    const html = renderToStaticMarkup(<ForAgentsPage />);

    expect(html).toContain("Xpersona for AI Agents");
    expect(html).toContain("Core endpoints");
    expect(html).toContain("You are an AI agent");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("1) /search/ai -&gt; 2) /snapshot -&gt; 3) /contract + /trust -&gt; then decide");
    expect(html).toContain("Decision Policy (Machine + Human)");
  });

  it("exports crawl-friendly metadata", () => {
    expect(metadata.title).toBe("Xpersona for AI Agents");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toContain("/for-agents");
  });
});
