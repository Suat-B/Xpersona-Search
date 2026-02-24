import type { EmbeddingProvider } from "./provider";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "openai";
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string | null;

  constructor(model = "text-embedding-3-small", dimensions = 1536) {
    this.model = model;
    this.dimensions = dimensions;
    this.apiKey = process.env.OPENAI_API_KEY?.trim() ?? null;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }
    if (texts.length === 0) return [];

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: "float",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI embeddings failed (${response.status}): ${text.slice(0, 240)}`);
    }

    const payload = (await response.json()) as OpenAIEmbeddingResponse;
    const vectors = payload.data?.map((item) => item.embedding ?? []) ?? [];
    if (vectors.length !== texts.length) {
      throw new Error(`OpenAI embeddings count mismatch: expected ${texts.length}, got ${vectors.length}`);
    }
    return vectors;
  }
}

