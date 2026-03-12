export type CapabilityRecord = Record<string, unknown>;

export type LocalCheckpointRecord = {
  id: string;
  summary: string;
  createdAt: string;
  touchedFiles: string[];
  source: "auto" | "manual";
  undoSummary?: string;
  runId?: string | null;
};

export type CapabilityOperations = {
  collectContext: (query: string) => Promise<CapabilityRecord>;
  queryIndex: (query: string, limit?: number) => Promise<CapabilityRecord>;
  applyPatch: (path: string, patch: string) => Promise<CapabilityRecord>;
  writeFile: (path: string, content: string, overwrite?: boolean) => Promise<CapabilityRecord>;
  runValidation: (path: string) => Promise<CapabilityRecord>;
  createCheckpoint: (input?: { summary?: string; touchedFiles?: string[]; runId?: string | null }) => Promise<LocalCheckpointRecord>;
  undoCheckpoint: (checkpointId?: string) => Promise<CapabilityRecord>;
  openReview: (input?: { sessionId?: string; runId?: string }) => Promise<CapabilityRecord>;
  resumeRun: (runId: string) => Promise<CapabilityRecord>;
};

export class PlaygroundCapabilityRegistry {
  constructor(private readonly operations: CapabilityOperations) {}

  collectContext(query: string) {
    return this.operations.collectContext(query);
  }

  queryIndex(query: string, limit?: number) {
    return this.operations.queryIndex(query, limit);
  }

  applyPatch(path: string, patch: string) {
    return this.operations.applyPatch(path, patch);
  }

  writeFile(path: string, content: string, overwrite?: boolean) {
    return this.operations.writeFile(path, content, overwrite);
  }

  runValidation(path: string) {
    return this.operations.runValidation(path);
  }

  createCheckpoint(input?: { summary?: string; touchedFiles?: string[]; runId?: string | null }) {
    return this.operations.createCheckpoint(input);
  }

  undoCheckpoint(checkpointId?: string) {
    return this.operations.undoCheckpoint(checkpointId);
  }

  openReview(input?: { sessionId?: string; runId?: string }) {
    return this.operations.openReview(input);
  }

  resumeRun(runId: string) {
    return this.operations.resumeRun(runId);
  }
}

export function capabilityRecordToMarkdown(title: string, payload: unknown): string {
  const body =
    typeof payload === "string"
      ? payload
      : JSON.stringify(payload, null, 2);
  return `### ${title}\n\n\`\`\`json\n${body}\n\`\`\``;
}
