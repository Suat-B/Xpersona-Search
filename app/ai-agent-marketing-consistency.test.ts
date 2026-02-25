import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REQUIRED_CTA = "1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide";

function readUtf8(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function normalizeCta(text: string): string {
  return text.replaceAll("&gt;", ">").replaceAll("&lt;", "<");
}

describe("AI marketing consistency", () => {
  it("marketed AI endpoints/routes exist", () => {
    const required = [
      "app/api/v1/search/ai/route.ts",
      "app/api/v1/agents/[slug]/snapshot/route.ts",
      "app/api/v1/agents/[slug]/contract/route.ts",
      "app/api/v1/agents/[slug]/trust/route.ts",
      "app/api/v1/search/policy/route.ts",
      "app/(marketing)/for-agents/page.tsx",
      "app/llms.txt/route.ts",
      "app/llms-full.txt/route.ts",
    ];

    for (const rel of required) {
      expect(existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  it("unified CTA appears across all AI-facing surfaces", () => {
    const files = [
      "app/(marketing)/for-agents/page.tsx",
      "app/llms.txt/route.ts",
      "app/llms-full.txt/route.ts",
      "app/docs/page.tsx",
      "app/api/page.tsx",
    ];

    for (const rel of files) {
      const text = normalizeCta(readUtf8(rel));
      expect(text).toContain(REQUIRED_CTA);
    }
  });

  it("forbidden hype wording does not appear in canonical AI surfaces", () => {
    const forbidden = [
      "always accurate",
      "guaranteed",
      "zero risk",
      "never fails",
      "best possible",
      "fully verified everywhere",
    ];
    const files = [
      "app/(marketing)/for-agents/page.tsx",
      "app/llms.txt/route.ts",
      "app/llms-full.txt/route.ts",
      "app/docs/page.tsx",
    ];

    const corpus = files.map(readUtf8).join("\n").toLowerCase();
    for (const token of forbidden) {
      expect(corpus.includes(token)).toBe(false);
    }
  });

  it("crawl surfaces include required AI onboarding URLs", () => {
    const robots = readUtf8("app/robots.ts");
    const sitemap = readUtf8("app/sitemap.ts");

    for (const url of ["/for-agents", "/llms.txt", "/llms-full.txt", "/docs", "/api"]) {
      expect(robots).toContain(url);
      expect(sitemap).toContain(url);
    }
  });
});
