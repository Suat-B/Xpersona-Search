export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  isAvailable(): boolean;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbedResult {
  vectors: number[][];
  provider: string;
  model: string;
  dimensions: number;
}

export function vectorToSqlLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

