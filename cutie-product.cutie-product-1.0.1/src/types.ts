import type { HostedAuthState } from "@xpersona/vscode-core";
import type { BinaryPanelState } from "./binary-types";

export type CutieToolName =
  | "list_files"
  | "read_file"
  | "search_workspace"
  | "get_diagnostics"
  | "git_status"
  | "git_diff"
  | "desktop_capture_screen"
  | "desktop_get_active_window"
  | "desktop_list_windows"
  | "create_checkpoint"
  /** Legacy receipt/tool name retained for older sessions; not exposed in cutie_tools_v2. */
  | "edit_file"
  | "patch_file"
  | "write_file"
  | "mkdir"
  | "run_command"
  | "desktop_open_app"
  | "desktop_open_url"
  | "desktop_focus_window"
  | "desktop_click"
  | "desktop_type"
  | "desktop_keypress"
  | "desktop_scroll"
  | "desktop_wait";

export type CutieToolKind = "observe" | "mutate" | "command";
export type CutieToolDomain = "workspace" | "desktop";
export type CutieTaskGoal = "conversation" | "code_change" | "workspace_investigation" | "desktop_action";
export type CutieEscalationState = "none" | "needs_guidance";
export type CutieAutonomyMode = "direct" | "objective";
export type CutieStrategyPhase = "inspect" | "mutate" | "verify" | "repair" | "fallback" | "blocked";
export type CutieProgressConfidence = "low" | "medium" | "high";
export type CutieBlockerCategory = "planning" | "validation" | "tooling" | "environment" | "impossible";
export type CutieStallLevel = "none" | "warning" | "severe";
export type CutieSubmitState = "idle" | "submitting" | "starting" | "running" | "stopping" | "settled";
export type CutieTargetConfidence = "trusted" | "untrusted" | "none";
export type CutieModelToolSupport = "none" | "partial" | "reliable";
export type CutieModelStreamSupport = "none" | "partial" | "reliable";
export type CutieAssistantDeltaReliability = "low" | "medium" | "high";
export type CutieMaxToolsPerTurnPolicy = "single_only" | "allow_parallel" | "prefer_serial";
export type CutieProtocolMode = "native_tools" | "text_extraction" | "final_only";
export type CutieModelAdapterKind = "capability_negotiated_v1" | "canonical_portability_v1";
export type CutieOrchestratorContractVersion = "canonical_portability_v1";
export type CutiePortabilityMode = "canonical_default";
export type CutieNormalizationTier =
  | "transport_normalized"
  | "artifact_rescue"
  | "plain_final"
  | "deterministic_recovery"
  | "validation_coercion";
export type CutieRepairTierEntered =
  | "none"
  | "artifact_rescue"
  | "payload_validation"
  | "deterministic_recovery";
export type CutieNormalizationSource =
  | "upstream_tool_calls"
  | "streamed_tool_calls"
  | "text_tool_artifact"
  | "plain_final"
  | "deterministic_bootstrap";
export type CutieArtifactExtractionShape =
  | "tool_call_wrapper"
  | "tool_calls_wrapper"
  | "top_level_tool_name"
  | "top_level_name"
  | "top_level_tool";
export type CutiePromptSource = "builtin_only" | "external_markdown" | "bundled_markdown" | "external_fallback";

export type CutieMutationCoercionMode =
  | "none"
  | "artifact_rescue"
  | "patch_argument_coercion"
  | "force_write_file"
  | "patch_disabled_write_mode";
export type CutieFallbackModeUsed = "none" | "text_extraction" | "tool_forcing" | "deterministic_bootstrap";

export type CutieCompletionPath = "fast_integrity" | "verified" | "blocked";

export type CutieModelTurnLatencySummary = {
  count: number;
  total: number;
  average: number;
  last: number;
  max: number;
};
export type CutieTargetSource =
  | "mentioned_path"
  | "active_file"
  | "visible_editor"
  | "latest_runtime_state"
  | "latest_read"
  | "stale_session_target"
  | "none";
export type CutieTaskFrameAction = "add" | "remove" | "update" | "verify";
export type CutieTaskTargetMode = "mentioned" | "implied_current_file" | "inferred_candidate" | "unknown";
export type CutieGoalClassificationSource =
  | "small_talk"
  | "mentioned_file_entity"
  | "trusted_target_entity"
  | "explicit_workspace_change"
  | "desktop_request"
  | "workspace_investigation"
  | "fallback_conversation"
  | "sanity_upgrade";
export type CutieTargetAcquisitionPhase =
  | "none"
  | "target_acquisition"
  | "target_inspection"
  | "semantic_recovery"
  | "mutation"
  | "verification";
export type CutieRepairTactic =
  | "infer_target"
  | "read_target"
  | "semantic_search"
  | "example_search"
  | "command_assisted_repair"
  | "patch_mutation"
  | "full_rewrite"
  | "verification";
export type CutieRetryStrategy =
  | "none"
  | "force_mutation"
  | "alternate_mutation"
  | "refresh_state"
  | "full_rewrite"
  | "command_repair"
  | "verification_repair"
  | "fallback_strategy";

export type CutieObjectiveStatus = "pending" | "done" | "blocked";

export type CutieRunObjective = {
  id: string;
  text: string;
  status: CutieObjectiveStatus;
  note?: string;
};

export type CutieTaskFrame = {
  action: CutieTaskFrameAction;
  entity: string;
  entityLabel: string;
  targetMode: CutieTaskTargetMode;
  confidence: CutieProgressConfidence;
  evidence: string[];
  semanticQueries: string[];
};

export type CutieEditScope = "single_file" | "multi_file";
export type CutieEditPlanStatus =
  | "intent_resolved"
  | "anchors_resolved"
  | "plan_synthesized"
  | "realized_patch"
  | "realized_write"
  | "failed";
export type CutieEditPlanConfidence = "low" | "medium" | "high";
export type CutieEditRealizationMode = "patch_file" | "write_file" | "unrealizable";
export type CutieEditAnchor = {
  kind: "line_contains" | "line_regex";
  query: string;
  occurrence?: "first" | "last";
};
export type CutieEditOperation = {
  kind: "insert_before" | "insert_after" | "replace_block" | "extend_call_args" | "remove_block" | "replace_value";
  description: string;
  anchor: CutieEditAnchor;
  text?: string;
  argsToAdd?: string[];
  deleteLineCount?: number;
  searchValue?: string;
  replaceValue?: string;
};
export type CutieEditTarget = {
  path: string;
  revisionId?: string;
  operations: CutieEditOperation[];
  verificationHints?: string[];
};
export type CutieEditIntent = {
  action: CutieTaskFrameAction;
  entity: string;
  entityLabel: string;
  scope: CutieEditScope;
  confidence: CutieProgressConfidence;
  requestedOutcomes: string[];
  inferredConstraints: string[];
  targetPaths: string[];
};
export type CutieEditPlan = {
  targets: CutieEditTarget[];
  realizationPreference: "patch_first" | "rewrite_allowed";
  verificationHints: string[];
  confidence: CutieEditPlanConfidence;
  fallbackReason?: string;
};
export type CutieEditRealizationResult = {
  mode: CutieEditRealizationMode;
  toolCall: CutieToolCall | null;
  realizedTargetPaths: string[];
  failedTargetPaths?: string[];
  failureReason?: string;
};

export type CutieTargetCandidate = {
  path: string;
  source: CutieTargetSource;
  confidence: CutieTargetConfidence;
  note?: string;
};

export type CutieModelCapabilityProfile = {
  profileId: string;
  modelPattern: string;
  nativeTools: CutieModelToolSupport;
  streamStructured: CutieModelStreamSupport;
  parallelTools: boolean;
  assistantDeltaReliability: CutieAssistantDeltaReliability;
  maxToolsPerTurnPolicy: CutieMaxToolsPerTurnPolicy;
  textExtractionFallback: boolean;
};

export type CutieObjectivesPhase = "off" | "decomposing" | "active" | "completed";

export type CutieToolCall = {
  id: string;
  name: CutieToolName;
  arguments: Record<string, unknown>;
  summary?: string;
};

export type CutieToolInputSchema = Record<string, unknown>;

export type CutieProtocolToolDefinition = {
  name: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  description: string;
  inputSchema: CutieToolInputSchema;
};

export type CutieToolReceipt = {
  id: string;
  step: number;
  toolName: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  status: "completed" | "blocked" | "failed";
  summary: string;
  startedAt: string;
  finishedAt: string;
  data?: Record<string, unknown>;
  error?: string;
};

export type CutieCheckpoint = {
  id: string;
  createdAt: string;
  reason?: string;
  trackedPaths: string[];
};

/** Live bubble while a portable bundle streams (mirrors Binary IDE live assistant). */
export type CutieBinaryLiveBubbleState = {
  mode: "shell" | "answer" | "build";
  status: "pending" | "streaming" | "done" | "failed" | "canceled";
  phase: string;
  transport: "local" | "binary";
  progress?: number;
  buildId?: string;
  latestActivity?: string;
  latestLog?: string;
  latestFile?: string;
  startedAt: string;
  updatedAt: string;
};

export type CutieBinaryLiveBubbleView = {
  messageId: string;
  sessionId?: string | null;
  content: string;
  createdAt: string;
  live: CutieBinaryLiveBubbleState;
};

export type CutieBackgroundActivityView = {
  kind: "cutie" | "binary";
  sessionId: string | null;
  sessionTitle: string;
  label: string;
  detail?: string;
};

export type CutieChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  runId?: string;
  presentation?: "plain" | "live_binary" | "run_transcript" | "run_change_recap";
  live?: CutieBinaryLiveBubbleState;
};

export type CutieTranscriptEventKind =
  | "assistant_text"
  | "status"
  | "tool_call"
  | "tool_result"
  | "repair"
  | "artifact_rescue"
  | "final";

export type CutieTranscriptEvent = {
  id: string;
  kind: CutieTranscriptEventKind;
  text: string;
  createdAt: string;
  runId?: string;
  slot?: string;
  dedupeKey?: string;
};

export type CutieMentionSuggestion = {
  kind: "file" | "window";
  label: string;
  insertText: string;
  detail?: string;
};

export type DesktopDisplay = {
  id: string;
  label: string;
  width: number;
  height: number;
  isPrimary?: boolean;
  scaleFactor?: number;
  left?: number;
  top?: number;
};

export type DesktopWindow = {
  id?: string;
  title?: string;
  app?: string;
  displayId?: string;
};

export type DesktopSnapshotRef = {
  snapshotId: string;
  displayId?: string;
  width: number;
  height: number;
  mimeType: string;
  capturedAt: string;
  filePath?: string;
  activeWindow?: DesktopWindow | null;
};

export type DesktopContextState = {
  platform: string;
  displays: DesktopDisplay[];
  activeWindow?: DesktopWindow | null;
  recentSnapshots: DesktopSnapshotRef[];
  capabilities: {
    windowsSupported: boolean;
    experimentalAdaptersEnabled: boolean;
  };
};

export type CutieRunState = {
  id: string;
  sessionId: string;
  status: "idle" | "running" | "needs_guidance" | "completed" | "failed" | "canceled";
  phase:
    | "idle"
    | "collecting_context"
    | "planning"
    | "repairing"
    | "executing_tool"
    | "saving_session"
    | "needs_guidance"
    | "completed"
    | "failed"
    | "canceled";
  goal: CutieTaskGoal;
  goalClassificationSource?: CutieGoalClassificationSource;
  goalClassificationEvidence?: string[];
  goalReclassifiedFrom?: CutieTaskGoal;
  goalSatisfied: boolean;
  lastMeaningfulProgressAtStep?: number;
  lastMeaningfulProgressSummary?: string;
  repairAttemptCount: number;
  escalationState: CutieEscalationState;
  stuckReason?: string;
  suggestedNextAction?: string;
  stepCount: number;
  maxSteps: number;
  workspaceMutationCount: number;
  maxWorkspaceMutations: number;
  desktopMutationCount: number;
  maxDesktopMutations: number;
  lastToolName?: CutieToolName;
  startedAt: string;
  endedAt?: string;
  error?: string;
  receipts: CutieToolReceipt[];
  checkpoint?: CutieCheckpoint | null;
  repeatedCallCount: number;
  /** Strict checklist: model must mark each done or blocked before a final answer is accepted. */
  objectives?: CutieRunObjective[];
  objectivesPhase?: CutieObjectivesPhase;
  objectiveRepairCount?: number;
  autonomyMode?: CutieAutonomyMode;
  preferredTargetPath?: string;
  targetConfidence?: CutieTargetConfidence;
  targetSource?: CutieTargetSource;
  targetPromotionSource?: CutieTargetSource;
  taskFrame?: CutieTaskFrame;
  editIntent?: CutieEditIntent;
  editPlan?: CutieEditPlan;
  editPlanStatus?: CutieEditPlanStatus;
  editPlanConfidence?: CutieEditPlanConfidence;
  editPlanRepairCount?: number;
  editPlanRealizationMode?: CutieEditRealizationMode;
  editPlanFailureReason?: string;
  plannedTargetPaths?: string[];
  remainingPlannedTargets?: string[];
  entityRefinementApplied?: boolean;
  refinedEntityLabel?: string;
  targetCandidates?: CutieTargetCandidate[];
  targetAcquisitionPhase?: CutieTargetAcquisitionPhase;
  currentRepairTactic?: CutieRepairTactic;
  lastNewEvidence?: string;
  noOpConclusion?: string;
  fastIntegrityProof?: string | null;
  fastCompletionUsed?: boolean;
  completionPath?: CutieCompletionPath;
  modelAdapter?: CutieModelAdapterKind;
  modelCapabilities?: CutieModelCapabilityProfile;
  protocolMode?: CutieProtocolMode;
  orchestratorContractVersion?: CutieOrchestratorContractVersion;
  portabilityMode?: CutiePortabilityMode;
  transportModeUsed?: CutieProtocolMode;
  normalizationSource?: CutieNormalizationSource;
  normalizationTier?: CutieNormalizationTier;
  artifactExtractionShape?: CutieArtifactExtractionShape;
  fallbackModeUsed?: CutieFallbackModeUsed;
  repairTierEntered?: CutieRepairTierEntered;
  batchCollapsedToSingleAction?: boolean;
  simpleTaskFastPath?: boolean;
  objectiveSuspendedForDirectRecovery?: boolean;
  nextDeterministicAction?: string;
  postInspectionRecoveryActive?: boolean;
  postInspectionRecoveryAttempted?: boolean;
  postInspectionFailureReason?: string;
  suppressedToolRescued?: boolean;
  suppressedToolName?: CutieToolName;
  suppressedToolRejectedReason?: string;
  lastMutationValidationError?: string;
  validatedSearchQuery?: string;
  blockedInvalidSearchQuery?: string;
  patchDisabledForRun?: boolean;
  mutationCoercionMode?: CutieMutationCoercionMode;
  executedRecoveredArtifact?: boolean;
  promptSource?: CutiePromptSource;
  promptMarkdownPath?: string;
  promptLoaded?: boolean;
  promptLoadError?: string;
  promptLastLoadedAt?: string;
  strategyPhase?: CutieStrategyPhase;
  progressConfidence?: CutieProgressConfidence;
  lastActionAtStep?: number;
  lastActionSummary?: string;
  lastStrategyShiftAtStep?: number;
  noProgressTurns?: number;
  noToolPlanningCycles?: number;
  stallSinceStep?: number;
  stallSinceSummary?: string;
  stallLevel?: CutieStallLevel;
  stallReason?: string;
  stallNextAction?: string;
  lastVerifiedOutcome?: string;
  blockerCategory?: CutieBlockerCategory;
  retryStrategy?: CutieRetryStrategy;
  loopPreventionTrigger?: string;
  deadEndMemory?: string[];
  modelTurnLatencyMs?: CutieModelTurnLatencySummary;
};

export type CutieSessionRecord = {
  id: string;
  workspaceHash: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CutieChatMessage[];
  runs: CutieRunState[];
  snapshots: DesktopSnapshotRef[];
  /** Xpersona playground assist session id (UUID); local `id` is not accepted as historySessionId. */
  playgroundHistorySessionId?: string;
  /** OpenCode session id for the current workspace chat when the OpenCode runtime is active. */
  openCodeSessionId?: string;
};

export type CutieSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  lastStatus: CutieRunState["status"] | "idle";
};

/** Unified diff patch shown inline in the chat webview after patch_file / write_file. */
export type CutieChatDiffItem = {
  id: string;
  createdAt: string;
  runId?: string | null;
  relativePath: string;
  toolName: "write_file" | "patch_file" | "edit_file";
  /** Unified diff text (may be truncated for very large files). */
  patch: string;
  /** Stable receipt id when this diff came from a persisted run receipt. */
  receiptId?: string;
  /** Tool step index when available (helps dedupe live + receipt replay). */
  step?: number;
  source?: "live_callback" | "receipt_backfill";
};

/** Model + reasoning controls under the chat composer (synced with workspace settings). */
export type CutieComposerPrefs = {
  selectedModel: string;
  modelOptions: string[];
  reasoningLevel: string;
};

export type CutieWarmStartViewState = {
  localReady: boolean;
  hostReady: boolean | null;
  warming: boolean;
  lastWarmAt?: string;
  requestAuthReady?: boolean;
  warmFailureSummary?: string;
  subsystemReady?: {
    authState: boolean;
    requestAuth: boolean;
    desktop: boolean;
    gitStatus: boolean;
    mentionIndex: boolean;
    editorContext: boolean;
    diagnostics: boolean;
    settings: boolean;
    hostProbe: boolean;
  };
};

export type CutiePromptViewState = {
  promptSource: CutiePromptSource;
  promptMarkdownPath?: string;
  promptLoaded: boolean;
  promptLoadError?: string;
  promptLastLoadedAt?: string;
};

export type CutieViewState = {
  authState: HostedAuthState;
  sessions: CutieSessionSummary[];
  activeSessionId: string | null;
  messages: CutieChatMessage[];
  /** Workspace edits in the active session, merged into the chat timeline by `createdAt`. */
  chatDiffs: CutieChatDiffItem[];
  /** Live per-run action transcript shown while Cutie is actively working. */
  liveActionLog: string[];
  /** Unified live transcript rendered in the main assistant bubble while a run is active. */
  liveTranscript: CutieTranscriptEvent[];
  status: string;
  submitState: CutieSubmitState;
  running: boolean;
  activeRun: CutieRunState | null;
  visibleSessionRun: CutieRunState | null;
  activeRunSessionId: string | null;
  viewingActiveRun: boolean;
  backgroundActivity: CutieBackgroundActivityView | null;
  desktop: DesktopContextState;
  progress: CutieProgressViewModel | null;
  /** Portable starter bundle (Binary IDE API) panel state. */
  binary: BinaryPanelState;
  binaryActivity: string[];
  /** Ephemeral streaming assistant row for bundle generation (not persisted until resolved). */
  binaryLiveBubble: CutieBinaryLiveBubbleView | null;
  composerPrefs: CutieComposerPrefs;
  warmStartState: CutieWarmStartViewState | null;
  promptState: CutiePromptViewState | null;
};

export type CutieProgressViewModel = {
  goal: CutieTaskGoal;
  goalLabel: string;
  phaseLabel: string;
  pursuingLabel: string;
  lastMeaningfulProgressSummary?: string;
  lastActionSummary?: string;
  taskFrameSummary?: string;
  targetSummary?: string;
  repairLabel?: string;
  objectiveRepairLabel?: string;
  repairTacticLabel?: string;
  currentStrategyLabel?: string;
  stallLabel?: string;
  stallReason?: string;
  stallNextAction?: string;
  lastNewEvidence?: string;
  noOpConclusion?: string;
  modelStrategySummary?: string;
  escalationMessage?: string;
  suggestedNextAction?: string;
  goalSatisfied: boolean;
  escalationState: CutieEscalationState;
  objectives?: CutieRunObjective[];
  objectivesPhase?: CutieObjectivesPhase;
};

export type CutieModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CutieStructuredFinal = {
  type: "final";
  final: string;
  /** When task objectives are active, must include one entry per objective id with status done or blocked. */
  objectives?: Array<{ id: string; status: "done" | "blocked"; note?: string }>;
};

export type CutieStructuredToolCall = {
  type: "tool_call";
  tool_call: {
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  };
};

/** Multiple tools in one planning response (observe tools first, at most one mutation last). */
export type CutieStructuredToolCalls = {
  type: "tool_calls";
  tool_calls: Array<{
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  }>;
};

export type CutieStructuredResponse = CutieStructuredFinal | CutieStructuredToolCall | CutieStructuredToolCalls;

export type CutieProtocolFinalPayload = {
  type: "final";
  text: string;
  objectives?: Array<{ id: string; status: "done" | "blocked"; note?: string }>;
};

export type CutieProtocolToolBatchPayload = {
  type: "tool_batch";
  toolCalls: Array<{
    id: string;
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  }>;
};

export type CutieProtocolResponsePayload = CutieProtocolFinalPayload | CutieProtocolToolBatchPayload;

export type CutieModelTurnResult = {
  response: CutieStructuredResponse;
  assistantText: string;
  suppressedAssistantArtifact?: string;
  usage?: Record<string, unknown> | null;
  model?: string;
  modelAdapter?: CutieModelAdapterKind;
  modelCapabilities?: CutieModelCapabilityProfile;
  protocolMode?: CutieProtocolMode;
  orchestratorContractVersion?: CutieOrchestratorContractVersion;
  portabilityMode?: CutiePortabilityMode;
  transportModeUsed?: CutieProtocolMode;
  normalizationSource?: CutieNormalizationSource;
  normalizationTier?: CutieNormalizationTier;
  artifactExtractionShape?: CutieArtifactExtractionShape;
  fallbackModeUsed?: CutieFallbackModeUsed;
  repairTierEntered?: CutieRepairTierEntered;
  batchCollapsedToSingleAction?: boolean;
};

export type CutieToolResult = {
  toolName: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  checkpoint?: CutieCheckpoint | null;
  snapshot?: DesktopSnapshotRef | null;
};

export type CutieWorkspaceMutationInfo = {
  sessionId: string;
  runId: string;
  relativePath: string;
  toolName: "write_file" | "patch_file" | "edit_file";
  receiptId?: string;
  step?: number;
  /** Snapshot immediately before this mutation (empty string if the file did not exist). */
  previousContent: string;
  /** Snapshot immediately after this mutation when available (can be empty for an empty file). */
  nextContent?: string;
  revisionId?: string;
};

export type CutieRuntimeCallbacks = {
  onSessionChanged?: (session: CutieSessionRecord, run?: CutieRunState | null) => void | Promise<void>;
  onStatusChanged?: (status: string, run: CutieRunState | null) => void | Promise<void>;
  onAssistantDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onSuppressedAssistantArtifact?: (artifact: string) => void | Promise<void>;
  /** Fired after a successful workspace file write or edit so the host can open the file and surface UX cues. */
  onWorkspaceFileMutated?: (info: CutieWorkspaceMutationInfo) => void | Promise<void>;
};
