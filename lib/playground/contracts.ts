import { z } from "zod";

export const zAssistMode = z.enum(["auto", "plan", "yolo"]);
export const zOrchestrationProtocol = z.enum(["batch_v1", "tool_loop_v1"]);
export const zPlaygroundToolName = z.enum([
  "list_files",
  "read_file",
  "search_workspace",
  "get_diagnostics",
  "git_status",
  "git_diff",
  "create_checkpoint",
  "edit",
  "write_file",
  "mkdir",
  "run_command",
  "get_workspace_memory",
]);
export const zPlaygroundAdapter = z.enum(["native_tools", "text_actions", "deterministic_batch"]);

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
  source: z.enum(["cloud", "local_fallback"]).optional(),
  reason: z.string().max(240).optional(),
});

const zOpenFile = z.object({
  path: z.string().min(1).max(4096),
  language: z.string().min(1).max(64).optional(),
  excerpt: z.string().max(120_000).optional(),
});

const zRetrievalHints = z.object({
  mentionedPaths: z.array(z.string().min(1).max(4096)).max(24).optional(),
  candidateSymbols: z.array(z.string().min(1).max(256)).max(24).optional(),
  candidateErrors: z.array(z.string().min(1).max(1000)).max(24).optional(),
  preferredTargetPath: z.string().min(1).max(4096).optional(),
  recentTouchedPaths: z.array(z.string().min(1).max(4096)).max(24).optional(),
});

const zConversationTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
});

const zClientCapabilities = z.object({
  toolLoop: z.boolean().optional(),
  supportedTools: z.array(zPlaygroundToolName).max(32).optional(),
  autoExecute: z.boolean().optional(),
  supportsNativeToolResults: z.boolean().optional(),
});

export const zAssistRequest = z.object({
  mode: zAssistMode.default("auto"),
  task: z.string().min(1).max(120_000),
  stream: z.boolean().optional(),
  model: z.string().min(1).max(256).optional(),
  orchestrationProtocol: zOrchestrationProtocol.default("batch_v1").optional(),
  clientCapabilities: zClientCapabilities.optional(),
  historySessionId: z.string().uuid().optional(),
  conversationHistory: z.array(zConversationTurn).max(24).optional(),
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
  retrievalHints: zRetrievalHints.optional(),
  clientTrace: z
    .object({
      extensionVersion: z.string().max(64),
      workspaceHash: z.string().max(128),
    })
    .optional(),
});

export const zToolCall = z.object({
  id: z.string().min(1).max(120),
  name: zPlaygroundToolName,
  arguments: z.record(z.string(), z.unknown()).default({}),
  kind: z.enum(["observe", "mutate", "command"]).optional(),
  summary: z.string().max(4000).optional(),
});

export const zToolResult = z.object({
  toolCallId: z.string().min(1).max(120),
  name: zPlaygroundToolName,
  ok: z.boolean(),
  blocked: z.boolean().optional(),
  summary: z.string().min(1).max(20_000),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(4000).optional(),
  createdAt: z.string().datetime().optional(),
});

export const zToolTraceEntry = z.object({
  step: z.number().int().min(0).max(1000),
  status: z.enum(["pending", "completed", "failed", "blocked"]),
  adapter: zPlaygroundAdapter,
  summary: z.string().min(1).max(20_000),
  toolCall: zToolCall.optional(),
  toolResult: zToolResult.optional(),
  createdAt: z.string().datetime(),
});

export const zLoopState = z.object({
  protocol: zOrchestrationProtocol,
  status: z.enum(["idle", "pending_tool", "running", "completed", "failed"]),
  stepCount: z.number().int().min(0).max(1000),
  mutationCount: z.number().int().min(0).max(1000),
  repeatedCallCount: z.number().int().min(0).max(1000),
  repairCount: z.number().int().min(0).max(1000),
  maxSteps: z.number().int().min(1).max(1000),
  maxMutations: z.number().int().min(0).max(1000),
  lastToolCallKey: z.string().max(1000).optional(),
});

export const zPendingToolCall = z.object({
  step: z.number().int().min(1).max(1000),
  adapter: zPlaygroundAdapter,
  requiresClientExecution: z.boolean().default(true),
  toolCall: zToolCall,
  availableTools: z.array(zPlaygroundToolName).max(32).optional(),
  createdAt: z.string().datetime(),
});

export const zRunContinueRequest = z.object({
  toolResult: zToolResult,
});

export const zRunControlRequest = z.object({
  action: z.enum(["pause", "resume", "cancel", "repair"]),
  note: z.string().max(4000).optional(),
});

export const zWorkspaceMemoryQuery = z.object({
  workspaceFingerprint: z.string().min(1).max(256),
});

export const zWorkspaceMemoryPutRequest = z.object({
  workspaceFingerprint: z.string().min(1).max(256),
  summary: z.string().max(20_000).optional(),
  promotedMemories: z.array(z.string().min(1).max(1000)).max(50).optional(),
  touchedPaths: z.array(z.string().min(1).max(4096)).max(100).optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(4000).optional(),
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
  category: z.enum(["implementation", "validation"]).optional(),
});

const zExecuteMkdir = z.object({
  type: z.literal("mkdir"),
  path: z.string().min(1).max(4096),
});

const zExecuteWriteFile = z.object({
  type: z.literal("write_file"),
  path: z.string().min(1).max(4096),
  content: z.string().max(400_000),
  overwrite: z.boolean().optional(),
});

const zExecuteRollback = z.object({
  type: z.literal("rollback"),
  snapshotId: z.string().min(1).max(120),
});

export const zExecuteRequest = z.object({
  sessionId: z.string().uuid().optional(),
  actions: z.array(z.union([zExecuteEdit, zExecuteCommand, zExecuteMkdir, zExecuteWriteFile, zExecuteRollback])).min(1).max(100),
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
  role: z.enum(["user", "assistant"]),
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
  retrievalHints: zRetrievalHints.optional(),
});

export type AssistRequestContract = z.infer<typeof zAssistRequest>;
export type OrchestrationProtocol = z.infer<typeof zOrchestrationProtocol>;
export type PlaygroundToolName = z.infer<typeof zPlaygroundToolName>;
export type PlaygroundAdapter = z.infer<typeof zPlaygroundAdapter>;
export type ToolCallContract = z.infer<typeof zToolCall>;
export type ToolResultContract = z.infer<typeof zToolResult>;
export type ToolTraceEntryContract = z.infer<typeof zToolTraceEntry>;
export type LoopStateContract = z.infer<typeof zLoopState>;
export type PendingToolCallContract = z.infer<typeof zPendingToolCall>;
