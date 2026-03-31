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
  "binary_start_build",
  "binary_refine_build",
  "binary_cancel_build",
  "binary_branch_build",
  "binary_rewind_build",
  "binary_validate_build",
  "binary_execute_build",
  "binary_publish_build",
  "desktop_capture_screen",
  "desktop_list_apps",
  "desktop_get_active_window",
  "desktop_list_windows",
  "desktop_open_app",
  "desktop_open_url",
  "desktop_focus_window",
  "desktop_click",
  "desktop_type",
  "desktop_keypress",
  "desktop_scroll",
  "desktop_wait",
  "browser_list_pages",
  "browser_get_active_page",
  "browser_open_page",
  "browser_focus_page",
  "browser_navigate",
  "browser_snapshot_dom",
  "browser_query_elements",
  "browser_click",
  "browser_type",
  "browser_press_keys",
  "browser_scroll",
  "browser_wait_for",
  "browser_read_text",
  "browser_read_form_state",
  "browser_capture_page",
  "browser_get_network_activity",
  "browser_get_console_messages",
  "world_get_summary",
  "world_get_active_context",
  "world_query_graph",
  "world_get_neighbors",
  "world_get_recent_changes",
  "world_get_affordances",
  "world_find_routine",
  "world_record_observation",
  "world_record_proof",
  "world_commit_memory",
  "world_score_route",
]);
export const zPlaygroundAdapter = z.enum(["native_tools", "text_actions", "deterministic_batch"]);
export const zExecutionVisibility = z.enum(["background", "low_focus", "visible_required"]);
export const zForegroundDisruptionRisk = z.enum(["none", "low", "medium", "high"]);
export const zInteractionMode = z.enum([
  "terminal",
  "structured_desktop",
  "managed_browser",
  "attached_browser",
  "visible_desktop",
]);
export const zFocusPolicy = z.enum(["never_steal", "avoid_if_possible", "allowed"]);
export const zSessionPolicy = z.enum(["attach_carefully", "managed_only", "live_session"]);

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

const zDesktopDisplay = z.object({
  id: z.string().min(1).max(120),
  label: z.string().max(240).optional(),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  scaleFactor: z.number().finite().min(0.1).max(20).optional(),
  isPrimary: z.boolean().optional(),
});

const zDesktopWindow = z.object({
  id: z.string().min(1).max(240).optional(),
  title: z.string().max(2000).optional(),
  app: z.string().max(240).optional(),
  displayId: z.string().max(120).optional(),
});

const zDesktopDiscoveredApp = z.object({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(512),
  aliases: z.array(z.string().min(1).max(240)).max(20).optional(),
  source: z.string().min(1).max(120).optional(),
});

const zDesktopSnapshotRef = z.object({
  snapshotId: z.string().min(1).max(120),
  displayId: z.string().max(120).optional(),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
  mimeType: z.string().max(120).optional(),
  capturedAt: z.string().datetime().optional(),
});

const zBrowserPage = z.object({
  id: z.string().min(1).max(240),
  title: z.string().max(2000).optional(),
  url: z.string().max(4000).optional(),
  origin: z.string().max(1000).optional(),
  browserName: z.string().max(240).optional(),
});

const zBrowserSnapshotRef = z.object({
  snapshotId: z.string().min(1).max(120),
  pageId: z.string().max(240).optional(),
  url: z.string().max(4000).optional(),
  title: z.string().max(2000).optional(),
  capturedAt: z.string().datetime().optional(),
});

const zBrowserInteractiveElement = z.object({
  id: z.string().min(1).max(240),
  selector: z.string().min(1).max(4000),
  label: z.string().max(2000),
  role: z.string().max(240).optional(),
  tagName: z.string().max(120).optional(),
});

const zBrowserNetworkEntry = z.object({
  at: z.string().datetime().optional(),
  phase: z.enum(["request", "response", "failed"]).optional(),
  url: z.string().max(4000),
  method: z.string().max(40).optional(),
  status: z.number().int().min(0).max(999).optional(),
  resourceType: z.string().max(120).optional(),
  errorText: z.string().max(2000).optional(),
});

const zBrowserConsoleEntry = z.object({
  at: z.string().datetime().optional(),
  level: z.string().max(120).optional(),
  text: z.string().max(4000),
});

const zTerminalState = z.object({
  cwd: z.string().max(4096).optional(),
  preferredTerminalCwd: z.string().max(4096).optional(),
  projectRoot: z.string().max(4096).optional(),
  stack: z.enum(["node_js_ts", "python", "generic"]).optional(),
  terminalObjective: z.string().max(2000).optional(),
  terminalProof: z.string().max(20_000).optional(),
  lastCommand: z.string().max(2000).optional(),
  lastCommandOutcome: z.enum(["idle", "running", "succeeded", "failed"]).optional(),
});

const zWorldModelChange = z.object({
  id: z.string().min(1).max(120).optional(),
  at: z.string().datetime().optional(),
  kind: z.string().min(1).max(120).optional(),
  summary: z.string().min(1).max(4000),
});

const zWorldModelAffordances = z.object({
  actionsAvailable: z.array(z.string().min(1).max(240)).max(40).optional(),
  backgroundSafe: z.array(z.string().min(1).max(240)).max(40).optional(),
  visibleRequired: z.array(z.string().min(1).max(240)).max(40).optional(),
  blocked: z.array(z.string().min(1).max(240)).max(40).optional(),
  highConfidence: z.array(z.string().min(1).max(240)).max(40).optional(),
});

const zWorldModelContext = z.object({
  graphVersion: z.number().int().min(0).max(10_000_000).optional(),
  sliceId: z.string().min(1).max(240).optional(),
  summary: z.string().max(20_000).optional(),
  activeContext: z
    .object({
      activeWindow: z.string().max(4000).optional(),
      activePage: z.string().max(4000).optional(),
      activeWorkspace: z.string().max(4000).optional(),
      activeRepo: z.string().max(4000).optional(),
      browserMode: z.string().max(120).optional(),
      focusLeaseActive: z.boolean().optional(),
    })
    .optional(),
  recentChanges: z.array(zWorldModelChange).max(20).optional(),
  affordanceSummary: zWorldModelAffordances.optional(),
  environmentFreshness: z
    .object({
      lastUpdatedAt: z.string().datetime().optional(),
      stale: z.boolean().optional(),
    })
    .optional(),
  machineRoutineIds: z.array(z.string().min(1).max(240)).max(20).optional(),
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
  supportedTools: z.array(zPlaygroundToolName).max(64).optional(),
  autoExecute: z.boolean().optional(),
  supportsNativeToolResults: z.boolean().optional(),
});

const zAssistTomConfig = z.object({
  enabled: z.boolean().optional(),
});

export const zAssistRequest = z.object({
  mode: zAssistMode.default("auto"),
  task: z.string().min(1).max(120_000),
  stream: z.boolean().optional(),
  model: z.string().min(1).max(256).optional(),
  interactionKind: z.enum(["chat", "repo_code"]).optional(),
  chatModelSource: z.enum(["platform", "user_connected"]).optional(),
  orchestratorModelSource: z.enum(["platform_owned", "user_connected"]).optional(),
  fallbackToPlatformModel: z.boolean().optional(),
  orchestrationProtocol: zOrchestrationProtocol.default("tool_loop_v1").optional(),
  clientCapabilities: zClientCapabilities.optional(),
  tom: zAssistTomConfig.optional(),
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
      desktop: z
        .object({
          platform: z.string().max(120).optional(),
          displays: z.array(zDesktopDisplay).max(12).optional(),
          activeWindow: zDesktopWindow.optional(),
          visibleWindows: z.array(zDesktopWindow).max(40).optional(),
          recentSnapshots: z.array(zDesktopSnapshotRef).max(12).optional(),
          discoveredApps: z.array(zDesktopDiscoveredApp).max(60).optional(),
        })
        .optional(),
      browser: z
        .object({
          mode: z.enum(["unavailable", "attached", "managed"]).optional(),
          browserName: z.string().max(240).optional(),
          activePage: zBrowserPage.optional(),
          openPages: z.array(zBrowserPage).max(30).optional(),
          recentSnapshots: z.array(zBrowserSnapshotRef).max(12).optional(),
          visibleInteractiveElements: z.array(zBrowserInteractiveElement).max(60).optional(),
          recentNetworkActivity: z.array(zBrowserNetworkEntry).max(30).optional(),
          recentConsoleMessages: z.array(zBrowserConsoleEntry).max(30).optional(),
          sessionHint: z
            .object({
              attachedToExistingSession: z.boolean().optional(),
              authenticatedLikely: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
      worldModel: zWorldModelContext.optional(),
    })
    .optional(),
  retrievalHints: zRetrievalHints.optional(),
  clientTrace: z
    .object({
      extensionVersion: z.string().max(64),
      workspaceHash: z.string().max(128),
      maxToolSteps: z.number().int().min(8).max(128).optional(),
      maxWorkspaceMutations: z.number().int().min(2).max(64).optional(),
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
  autonomyLane: z.string().min(1).max(120).optional(),
  failureCategory: z.string().min(1).max(120).optional(),
  repairDirective: z.string().max(20_000).optional(),
  closeoutStage: z.string().min(1).max(120).optional(),
  executionVisibility: zExecutionVisibility.optional(),
  foregroundDisruptionRisk: zForegroundDisruptionRisk.optional(),
  interactionMode: zInteractionMode.optional(),
  focusPolicy: zFocusPolicy.optional(),
  sessionPolicy: zSessionPolicy.optional(),
  visibleFallbackReason: z.string().max(2000).optional(),
  terminalState: zTerminalState.optional(),
  worldContextVersion: z.number().int().min(0).max(10_000_000).optional(),
  worldModelSliceId: z.string().max(240).optional(),
  affordanceSummary: zWorldModelAffordances.optional(),
  environmentFreshness: z
    .object({
      lastUpdatedAt: z.string().datetime().optional(),
      stale: z.boolean().optional(),
    })
    .optional(),
  machineRoutineIds: z.array(z.string().min(1).max(240)).max(20).optional(),
});

export const zPendingToolCall = z.object({
  step: z.number().int().min(1).max(1000),
  adapter: zPlaygroundAdapter,
  requiresClientExecution: z.boolean().default(true),
  toolCall: zToolCall,
  availableTools: z.array(zPlaygroundToolName).max(64).optional(),
  createdAt: z.string().datetime(),
  executionVisibility: zExecutionVisibility.optional(),
  foregroundDisruptionRisk: zForegroundDisruptionRisk.optional(),
  interactionMode: zInteractionMode.optional(),
  focusPolicy: zFocusPolicy.optional(),
  sessionPolicy: zSessionPolicy.optional(),
  visibleFallbackReason: z.string().max(2000).optional(),
  worldContextVersion: z.number().int().min(0).max(10_000_000).optional(),
  worldModelSliceId: z.string().max(240).optional(),
});

export const zProgressState = z.object({
  status: z.enum(["running", "stalled", "repairing", "completed", "failed"]),
  lastMeaningfulProgressAtStep: z.number().int().min(0).max(1000),
  lastMeaningfulProgressSummary: z.string().min(1).max(20_000),
  stallCount: z.number().int().min(0).max(1000),
  stallReason: z.string().max(20_000).optional(),
  nextDeterministicAction: z.string().max(20_000).optional(),
  pendingToolCallSignature: z.string().max(4000).optional(),
  executionVisibility: zExecutionVisibility.optional(),
  interactionMode: zInteractionMode.optional(),
  visibleFallbackReason: z.string().max(2000).optional(),
  terminalState: zTerminalState.optional(),
  worldContextVersion: z.number().int().min(0).max(10_000_000).optional(),
  worldModelSliceId: z.string().max(240).optional(),
  affordanceSummary: zWorldModelAffordances.optional(),
  environmentFreshness: z
    .object({
      lastUpdatedAt: z.string().datetime().optional(),
      stale: z.boolean().optional(),
    })
    .optional(),
  machineRoutineIds: z.array(z.string().min(1).max(240)).max(20).optional(),
});

const zCompletionChecklistItem = z.object({
  id: z.string().min(1).max(240),
  label: z.string().min(1).max(1000),
  category: z.enum(["grounding", "implementation", "validation", "closeout", "summary"]),
  status: z.enum(["pending", "completed", "blocked"]),
  detail: z.string().max(2000).optional(),
});

export const zObjectiveState = z.object({
  status: z.enum(["in_progress", "satisfied", "blocked"]),
  goalType: z.enum(["code_edit", "command_run", "plan", "unknown"]),
  targetPath: z.string().min(1).max(4096).optional(),
  autonomyLane: z.string().min(1).max(120).optional(),
  executionVisibility: zExecutionVisibility.optional(),
  interactionMode: zInteractionMode.optional(),
  focusPolicy: zFocusPolicy.optional(),
  sessionPolicy: zSessionPolicy.optional(),
  terminalState: zTerminalState.optional(),
  stackSpecializer: z.string().min(1).max(120).optional(),
  worldContextVersion: z.number().int().min(0).max(10_000_000).optional(),
  worldModelSliceId: z.string().max(240).optional(),
  affordanceSummary: zWorldModelAffordances.optional(),
  environmentFreshness: z
    .object({
      lastUpdatedAt: z.string().datetime().optional(),
      stale: z.boolean().optional(),
    })
    .optional(),
  machineRoutineIds: z.array(z.string().min(1).max(240)).max(20).optional(),
  requiredArtifacts: z.array(z.string().min(1).max(4096)).max(40).optional(),
  requiredProof: z.array(z.string().min(1).max(240)).max(20),
  observedProof: z.array(z.string().min(1).max(240)).max(20),
  missingProof: z.array(z.string().min(1).max(240)).max(20),
  completionChecklist: z.array(zCompletionChecklistItem).max(40).optional(),
});

export const zRunContinueRequest = z.object({
  toolResult: zToolResult,
  /** Playground session UUID from assist; used to resume if URL runId is stale or mismatched. */
  sessionId: z.string().uuid().optional(),
});

export const zRunControlRequest = z.object({
  action: z.enum(["pause", "resume", "cancel", "repair", "takeover", "retry_last_turn"]),
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

const zDesktopViewport = z.object({
  displayId: z.string().min(1).max(120),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
});

const zExecuteDesktopOpenApp = z.object({
  type: z.literal("desktop_open_app"),
  app: z.string().min(1).max(512),
  args: z.array(z.string().max(1000)).max(24).optional(),
});

const zExecuteDesktopOpenUrl = z.object({
  type: z.literal("desktop_open_url"),
  url: z.string().url().max(4000),
});

const zExecuteDesktopFocusWindow = z.object({
  type: z.literal("desktop_focus_window"),
  windowId: z.string().min(1).max(240).optional(),
  title: z.string().max(2000).optional(),
  app: z.string().max(240).optional(),
});

const zExecuteDesktopClick = z.object({
  type: z.literal("desktop_click"),
  displayId: z.string().min(1).max(120),
  viewport: zDesktopViewport,
  normalizedX: z.number().finite().min(0).max(1),
  normalizedY: z.number().finite().min(0).max(1),
  button: z.enum(["left", "right", "middle"]).optional(),
  clickCount: z.number().int().min(1).max(4).optional(),
});

const zExecuteDesktopType = z.object({
  type: z.literal("desktop_type"),
  text: z.string().min(1).max(4000),
  delayMs: z.number().int().min(0).max(2000).optional(),
});

const zExecuteDesktopKeypress = z.object({
  type: z.literal("desktop_keypress"),
  keys: z.array(z.string().min(1).max(60)).min(1).max(8),
});

const zExecuteDesktopScroll = z.object({
  type: z.literal("desktop_scroll"),
  displayId: z.string().min(1).max(120).optional(),
  viewport: zDesktopViewport.optional(),
  normalizedX: z.number().finite().min(0).max(1).optional(),
  normalizedY: z.number().finite().min(0).max(1).optional(),
  deltaX: z.number().int().min(-20_000).max(20_000).optional(),
  deltaY: z.number().int().min(-20_000).max(20_000).optional(),
});

const zExecuteDesktopWait = z.object({
  type: z.literal("desktop_wait"),
  durationMs: z.number().int().min(0).max(120_000),
});

export const zExecuteRequest = z.object({
  sessionId: z.string().uuid().optional(),
  actions: z
    .array(
      z.union([
        zExecuteEdit,
        zExecuteCommand,
        zExecuteMkdir,
        zExecuteWriteFile,
        zExecuteRollback,
        zExecuteDesktopOpenApp,
        zExecuteDesktopOpenUrl,
        zExecuteDesktopFocusWindow,
        zExecuteDesktopClick,
        zExecuteDesktopType,
        zExecuteDesktopKeypress,
        zExecuteDesktopScroll,
        zExecuteDesktopWait,
      ])
    )
    .min(1)
    .max(100),
  workspaceFingerprint: z.string().min(4).max(256),
});

export const zDesktopSnapshotUploadRequest = z.object({
  sessionId: z.string().uuid().optional(),
  displayId: z.string().min(1).max(120).optional(),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  mimeType: z.string().min(1).max(120).default("image/png"),
  dataBase64: z.string().min(8).max(8_000_000),
  activeWindow: zDesktopWindow.optional(),
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
export type ExecutionVisibility = z.infer<typeof zExecutionVisibility>;
export type ForegroundDisruptionRisk = z.infer<typeof zForegroundDisruptionRisk>;
export type InteractionMode = z.infer<typeof zInteractionMode>;
export type FocusPolicy = z.infer<typeof zFocusPolicy>;
export type SessionPolicy = z.infer<typeof zSessionPolicy>;
export type ToolCallContract = z.infer<typeof zToolCall>;
export type ToolResultContract = z.infer<typeof zToolResult>;
export type ToolTraceEntryContract = z.infer<typeof zToolTraceEntry>;
export type LoopStateContract = z.infer<typeof zLoopState>;
export type PendingToolCallContract = z.infer<typeof zPendingToolCall>;
export type ProgressStateContract = z.infer<typeof zProgressState>;
export type ObjectiveStateContract = z.infer<typeof zObjectiveState>;
export type ExecuteRequestContract = z.infer<typeof zExecuteRequest>;
export type DesktopSnapshotUploadRequestContract = z.infer<typeof zDesktopSnapshotUploadRequest>;
