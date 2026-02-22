/**
 * Hugging Face Spaces crawler — discovers AI agents/demos from Hugging Face Spaces.
 * API: https://huggingface.co/api/spaces
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const HF_API_BASE = "https://huggingface.co/api/spaces";
const PAGE_SIZE = 100;

const SEARCH_TERMS = [
  "agent",
  "chat",
  "llm",
  "mcp",
  "assistant",
  "chatbot",
  "ai assistant",
  "langchain",
  "openai",
  "claude",
  "gradio",
  "streamlit",
  "text generation",
  "image generation",
  "translation",
  "summarization",
  "rag",
  "embedding",
  "whisper",
  "stable diffusion",
  "flan",
  "llama",
  "mistral",
  "gpt",
  "bert",
  "transformers",
  "fine tuning",
  "question answering",
  "sentiment",
  "ner",
  "ocr",
  "speech to text",
  "text to speech",
  "code generation",
  "sql",
  "data science",
  "machine learning",
  "deep learning",
  "computer vision",
  "nlp",
  "recommendation",
];

interface HfSpace {
  id: string;
  likes?: number;
  private?: boolean;
  sdk?: string;
  tags?: string[];
  createdAt?: string;
}

async function fetchSpaces(
  search: string,
  limit: number,
  token?: string
): Promise<HfSpace[]> {
  const url = new URL(HF_API_BASE);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "likes");
  url.searchParams.set("search", search);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return [];
  return (await res.json()) as HfSpace[];
}

export async function crawlHuggingFaceSpaces(
  maxResults: number = 10000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "HUGGINGFACE",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const token = process.env.HUGGINGFACE_TOKEN;
  const seenIds = new Set<string>();
  let totalFound = 0;

  try {
    for (const term of SEARCH_TERMS) {
      if (totalFound >= maxResults) break;

      const spaces = await fetchSpaces(term, PAGE_SIZE, token);

      for (const space of spaces) {
        if (totalFound >= maxResults) break;
        if (!space.id || space.private) continue;
        if (seenIds.has(space.id)) continue;
        seenIds.add(space.id);

        const sourceId = `hf:${space.id}`;
        const slug =
          generateSlug(`hf-${space.id.replace(/\//g, "-")}`) ||
          `hf-${totalFound}`;
        const url = `https://huggingface.co/spaces/${space.id}`;

        const tags = space.tags ?? [];
        const popularityScore = Math.min(100, Math.round((space.likes ?? 0) / 100));
        const createdAt = space.createdAt ? new Date(space.createdAt) : new Date();
        const daysSince =
          (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
        const freshnessScore = Math.round(100 * Math.exp(-daysSince / 180));

        const agentData = {
          sourceId,
          source: "HUGGINGFACE" as const,
          name: space.id.split("/").pop() ?? space.id,
          slug,
          description: `Hugging Face Space: ${space.id}. SDK: ${space.sdk ?? "unknown"}. Likes: ${space.likes ?? 0}.`,
          url,
          homepage: url,
          capabilities: tags.filter((t) => !t.startsWith("region:")).slice(0, 15),
          protocols: [] as string[],
          languages: [] as string[],
          npmData: null,
          openclawData: {
            huggingface: true,
            sdk: space.sdk,
            likes: space.likes,
            tags: space.tags,
          } as Record<string, unknown>,
          readme: "",
          safetyScore: 65,
          popularityScore,
          freshnessScore,
          performanceScore: 0,
          overallRank: Math.round(
            (65 * 0.3 + popularityScore * 0.3 + freshnessScore * 0.2) * 10
          ) / 10,
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };

        await db
          .insert(agents)
          .values(agentData)
          .onConflictDoUpdate({
            target: agents.sourceId,
            set: {
              name: agentData.name,
              description: agentData.description,
              url: agentData.url,
              homepage: agentData.homepage,
              openclawData: agentData.openclawData,
              popularityScore: agentData.popularityScore,
              freshnessScore: agentData.freshnessScore,
              overallRank: agentData.overallRank,
              lastCrawledAt: agentData.lastCrawledAt,
              nextCrawlAt: agentData.nextCrawlAt,
              updatedAt: new Date(),
            },
          });

        totalFound++;
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }

  return { total: totalFound, jobId };
}
