import { describe, expect, it } from "vitest";
import { buildIndexChunkMetadata, rankPlaygroundIndexRows } from "@/lib/playground/index-ranking";

describe("playground index ranking", () => {
  it("extracts lightweight metadata from indexed chunks", () => {
    const metadata = buildIndexChunkMetadata({
      pathDisplay: "src/features/chat/route.ts",
      language: "ts",
      content: [
        "# Chat Route",
        "export async function GET() {",
        "  return Response.json({ ok: true });",
        "}",
      ].join("\n"),
      source: "cloud",
      reason: "Cloud index hit",
    });

    expect(metadata.pathTokens).toContain("route");
    expect(metadata.symbolNames).toContain("GET");
    expect(metadata.headings).toContain("Chat Route");
    expect(metadata.summary).toContain("Chat Route");
    expect(metadata.reason).toBe("Cloud index hit");
  });

  it("prefers mentioned and target-matching files over generic lexical hits", () => {
    const rows = [
      {
        pathDisplay: "src/routes/route.ts",
        content: "route handler with generic chat helpers",
        metadata: buildIndexChunkMetadata({
          pathDisplay: "src/routes/route.ts",
          content: "route handler with generic chat helpers",
        }),
        updatedAt: new Date("2026-03-10T12:00:00.000Z"),
      },
      {
        pathDisplay: "app/api/v1/playground/models/route.ts",
        content: "playground models route with model registry serialization",
        metadata: buildIndexChunkMetadata({
          pathDisplay: "app/api/v1/playground/models/route.ts",
          content: "playground models route with model registry serialization",
        }),
        updatedAt: new Date("2026-03-12T12:00:00.000Z"),
      },
    ];

    const ranked = rankPlaygroundIndexRows({
      rows,
      query: "improve models route serialization",
      limit: 2,
      hints: {
        mentionedPaths: ["app/api/v1/playground/models/route.ts"],
        preferredTargetPath: "app/api/v1/playground/models/route.ts",
      },
    });

    expect(ranked[0]?.pathDisplay).toBe("app/api/v1/playground/models/route.ts");
    expect(ranked[0]?.explanations.join(" ")).toContain("mentioned path boost");
    expect(ranked[0]?.explanations.join(" ")).toContain("preferred target boost");
  });

  it("boosts symbol and diagnostic overlap without requiring embeddings", () => {
    const rows = [
      {
        pathDisplay: "src/playground/router.ts",
        content: "export function resolveModelSelection() { throw new Error('quota exceeded'); }",
        metadata: buildIndexChunkMetadata({
          pathDisplay: "src/playground/router.ts",
          content: "export function resolveModelSelection() { throw new Error('quota exceeded'); }",
        }),
        updatedAt: new Date("2026-03-12T09:00:00.000Z"),
      },
      {
        pathDisplay: "src/playground/history.ts",
        content: "export function listHistory() { return []; }",
        metadata: buildIndexChunkMetadata({
          pathDisplay: "src/playground/history.ts",
          content: "export function listHistory() { return []; }",
        }),
        updatedAt: new Date("2026-03-12T09:00:00.000Z"),
      },
    ];

    const ranked = rankPlaygroundIndexRows({
      rows,
      query: "fix model selection error",
      limit: 2,
      hints: {
        candidateSymbols: ["resolveModelSelection"],
        candidateErrors: ["quota exceeded"],
      },
    });

    expect(ranked[0]?.pathDisplay).toBe("src/playground/router.ts");
    expect(ranked[0]?.usedEmbedding).toBe(false);
    expect(ranked[0]?.explanations.join(" ")).toContain("symbol match");
    expect(ranked[0]?.explanations.join(" ")).toContain("diagnostic overlap");
  });
});
