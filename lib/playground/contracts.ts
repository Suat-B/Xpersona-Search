import { z } from "zod";

export const zAssistMode = z.enum(["auto", "plan", "yolo", "generate", "debug"]);
export const zSafetyProfile = z.enum(["standard", "aggressive"]);
export const zBudgetStrategy = z.enum(["relevance", "recency", "hybrid"]);
export const zAgentRole = z.enum(["planner", "implementer", "reviewer"]);

const zContextFile = z.object({
  path: z.string().min(1).max(4096).optional(),
  language: z.string().min(1).max(64).optional(),
  selection: z.string().max(200_000).optional(),
  content: z.string().max(200_000).optional(),
});

const zContextDiag = z.object({
  file: z.string().max(4096).optional(),
  severity: z.union([z.string(), z.number()]).optional(),
  message: z.string().min(1).max(4000),
  line: z.number().int().min(1).max(1_000_000).optional(),
});

const zContextSnippet = z.object({
  path: z.string().max(4096).optional(),
  score: z.number().finite().optional(),
  content: z.string().min(1).max(60_000),
});

const zOpenFile = z.object({
  path: z.string().min(1).max(4096),
  language: z.string().min(1).max(64).optional(),
  excerpt: z.string().max(120_000).optional(),
});

export const zAssistRequest = z.object({
  mode: zAssistMode.default("auto"),
  task: z.string().min(1).max(120_000),
  stream: z.boolean().optional(),
  model: z.string().min(1).max(256).optional(),
  max_tokens: z.number().int().min(64).max(262_144).optional(),
  context: z
    .object({
      activeFile: zContextFile.optional(),
      openFiles: z.array(zOpenFile).max(40).optional(),
      diagnostics: z.array(zContextDiag).max(200).optional(),
      git: z
        .object({
          status: z.array(z.string().max(200)).max(200).optional(),
          diffSummary: z.string().max(120_000).optional(),
        })
        .optional(),
      indexedSnippets: z.array(zContextSnippet).max(120).optional(),
    })
    .optional(),
  attachments: z
    .array(
      z.object({
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        name: z.string().max(255).optional(),
        dataUrl: z.string().max(8_000_000).optional(),
      })
    )
    .max(6)
    .optional(),
  historySessionId: z.string().uuid().optional(),
  agentConfig: z
    .object({
      strategy: z.enum(["single", "parallel"]).optional(),
      roles: z.array(zAgentRole).max(3).optional(),
    })
    .optional(),
  workflowIntentId: z.string().min(1).max(120).optional(),
  contextBudget: z
    .object({
      maxTokens: z.number().int().min(512).max(262_144).default(16_384),
      strategy: zBudgetStrategy.default("hybrid"),
    })
    .optional(),
  safetyProfile: zSafetyProfile.default("standard").optional(),
  clientTrace: z
    .object({
      extensionVersion: z.string().max(64),
      workspaceHash: z.string().max(128),
    })
    .optional(),
});

const zExecuteEdit = z.object({
  type: z.literal("edit"),
  path: z.string().min(1).max(4096),
  patch: z.string().max(400_000).optional(),
  diff: z.string().max(400_000).optional(),
});

const zExecuteCommand = z.object({
  type: z.literal("command"),
  command: z.string().min(1).max(2000),
  cwd: z.string().max(4096).optional(),
  timeoutMs: z.number().int().min(100).max(300_000).optional(),
});

const zExecuteRollback = z.object({
  type: z.literal("rollback"),
  snapshotId: z.string().min(1).max(120),
});

export const zExecuteRequest = z.object({
  sessionId: z.string().uuid().optional(),
  actions: z.array(z.union([zExecuteEdit, zExecuteCommand, zExecuteRollback])).min(1).max(100),
  workspaceFingerprint: z.string().min(4).max(256),
});

export const zSessionsListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  mode: zAssistMode.optional(),
  search: z.string().max(120).optional(),
});

export const zCreateSessionRequest = z.object({
  title: z.string().max(200).optional(),
  mode: zAssistMode.optional(),
  workspaceFingerprint: z.string().max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const zMessagesGetQuery = z.object({
  includeAgentEvents: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
  fromTimestamp: z.string().datetime().optional(),
});

export const zAppendMessageRequest = z.object({
  role: z.enum(["system", "user", "assistant", "agent"]),
  kind: z.string().max(40).optional(),
  content: z.string().min(1).max(120_000),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const zIndexUpsertRequest = z.object({
  projectKey: z.string().min(1).max(255),
  chunks: z
    .array(
      z.object({
        pathHash: z.string().min(4).max(128),
        chunkHash: z.string().min(4).max(128),
        pathDisplay: z.string().max(4096).optional(),
        content: z.string().min(1).max(120_000),
        embedding: z.array(z.number().finite()).max(4096).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(500),
  cursor: z.string().max(255).optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
});

export const zIndexQueryRequest = z.object({
  projectKey: z.string().min(1).max(255),
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
});

export const zAgentsRunRequest = z.object({
  sessionId: z.string().uuid().optional(),
  task: z.string().min(1).max(120_000),
  model: z.string().max(256).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  roles: z.array(zAgentRole).max(3).optional(),
});

export const zReplayRequest = z.object({
  sessionId: z.string().uuid(),
  workspaceFingerprint: z.string().min(4).max(256),
  mode: zAssistMode.default("plan"),
});
