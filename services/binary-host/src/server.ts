import { existsSync, statSync, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import {
  AutomationRuntime,
  automationToLegacyAgent,
  legacyAgentToAutomation,
  type BinaryAutomationDefinition,
  type BinaryAutomationTriggerKind,
  type BinaryWebhookSubscription,
} from "./automation-runtime.js";
import {
  AgentJobManager,
} from "./agent-job-manager.js";
import { continueHostedRun, runHostedAgentProbe, streamHostedAssist } from "./hosted-transport.js";
import { decorateUiEvent } from "./ui-events.js";
import {
  AutonomyExecutionController,
  type ExecutionPolicyDecision,
  type FocusLease,
} from "./autonomy-execution-controller.js";
import { collectBrowserContext } from "./browser-tool-executor.js";
import { BrowserToolExecutor } from "./browser-tool-executor.js";
import { BrowserRuntimeController } from "./browser-runtime.js";
import { DesktopToolExecutor, collectDesktopContext } from "./desktop-tool-executor.js";
import { NativeAppRuntime } from "./native-app-runtime.js";
import { InteractiveTerminalRuntime } from "./interactive-terminal-runtime.js";
import {
  MachineAutonomyController,
  defaultMachineAutonomyPolicy,
  findBestAppMatch,
  parseMachineAutonomyTask,
  type MachineAutonomyPolicy,
} from "./machine-autonomy.js";
import { MachineWorldModelService } from "./machine-world-model.js";
import { RepoModelService } from "./repo-model.js";
import { RepoToolExecutor } from "./repo-tool-executor.js";
import { WorldToolExecutor } from "./world-tool-executor.js";
import {
  getRemoteRuntimeHealth,
  resolveExecutionLane,
  resolveOpenHandsPluginPacks,
  resolveOpenHandsSkillSources,
  shouldEnableSampledTracing,
  type BinaryExecutionLane,
  type BinaryPluginPack,
  type BinarySkillSource,
} from "./openhands-capabilities.js";
import {
  buildConnectionView,
  buildOpenHandsMcpConfig,
  connectionHasRequiredSecret,
  getConnectionStatus,
  importConnectionsFromMcpJson,
  validateConnectionDraft,
  type BinaryConnectionRecord,
  type BinaryConnectionSecretRecord,
  type BinaryConnectionView,
  type BinaryProviderId,
  type ConnectionDraftInput,
} from "./connections.js";
import {
  buildUserConnectedModelCandidates,
  getProviderCatalogEntry,
  getProviderConnectionName,
  isProviderConnection,
  listProviderCatalog,
  listProviderProfiles,
  type BinaryProviderCatalogEntry,
  type BinaryUserConnectedModelCandidate,
} from "./providers.js";
import {
  OAuthSessionManager,
  type OAuthProviderRuntimeConfig,
  type StoredOAuthSession,
} from "./oauth-session-manager.js";
import {
  BrowserSessionManager,
  type BrowserProviderSessionView,
  type ImportedBrowserProviderAuth,
} from "./browser-session-manager.js";
import {
  OpenHandsRuntimeSupervisor,
  inferOpenHandsRuntimeProfile,
  resolveNativeTerminalAvailability,
  type OpenHandsRuntimeStatus,
} from "./openhands-runtime.js";
import { AgentProbeManager } from "./agent-probe-manager.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
loadEnv({ quiet: true });

type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
type BinaryAssistSpeedProfile = "fast" | "balanced" | "thorough";
type BinaryLatencyTier = "fast" | "balanced" | "thorough";
type BinaryAdapterMode = "auto" | "force_binary_tool_adapter";
type BinaryLatencyPolicy = "default" | "detached_15s_cap";
type BinaryTimeoutPolicy = "default_retry" | "detached_no_timeout_retry_single_non_timeout_fallback";
type BinaryModelRoutingMode = "single_fixed_free";
type BinaryDesktopProofMode = "adaptive" | "strict";
type BinaryTerminalBackendMode = "strict_openhands_native" | "allow_host_fallback";
type BinaryPromptLane = "chat" | "coding" | "desktop" | "browser";
type BinaryOrchestrationLatencyBudgets = {
  interactive: number;
  desktop: number;
  deepCode: number;
};
type BinaryOrchestrationPolicy = {
  mode: "force_binary_tool_adapter";
  detachedFirstTurnBudgetMs: number;
  smallModelAllowlist: string[];
  modelRoutingMode: BinaryModelRoutingMode;
  fixedModelAlias?: string;
  fallbackEnabled: boolean;
  latencyBudgetsMs: BinaryOrchestrationLatencyBudgets;
  desktopProofMode: BinaryDesktopProofMode;
  terminalBackendMode: BinaryTerminalBackendMode;
  requireNativeTerminalTool: boolean;
};
type BinaryIntendedUse = "chat" | "action" | "repair";
type BinaryStartupPhase = "fast_start" | "context_enrichment" | "full_run";
type BinaryTaskSpeedClass = "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
type BinaryDesktopIntentKind = "open" | "draft_text" | "compute" | "navigate_path" | "verify" | "cleanup";
type BinaryBrowserIntentKind =
  | "open_site"
  | "search"
  | "login"
  | "fill_form"
  | "extract"
  | "recover"
  | "verify"
  | "cleanup";
type BinaryIntentKind = BinaryDesktopIntentKind | BinaryBrowserIntentKind;
type BinaryScreenshotReason = "explicit_user_request" | "debug_mode" | "proof_fallback";
type BinaryQualityGateState = "pending" | "satisfied" | "blocked";
type BinaryQualityBlockedReason =
  | "missing_validation_proof"
  | "missing_artifact_proof"
  | "verification_failed"
  | "repair_exhausted"
  | "missing_semantic_completion_proof";
type BinaryProofRequirement = {
  id: string;
  lane: "coding" | "desktop" | "browser" | "chat_research";
  description: string;
};
type BinaryProofArtifact = {
  id: string;
  kind: string;
  source: "tool_result" | "host_inference" | "gateway_contract";
  summary: string;
  toolName?: string;
  status?: "passed" | "failed" | "unknown";
  capturedAt?: string;
};
type BinaryQualityLane = "coding" | "desktop" | "browser" | "chat_research";
type BinaryQualityGateEvaluation = {
  lane: BinaryQualityLane;
  qualityGateState: BinaryQualityGateState;
  requiredProofs: BinaryProofRequirement[];
  satisfiedProofs: string[];
  missingProofs: string[];
  qualityBlockedReason?: BinaryQualityBlockedReason;
  repairAttemptCount: number;
  maxRepairAttempts: number;
  finalizationBlocked: boolean;
  proofArtifactsDetailed: BinaryProofArtifact[];
  legacyMissingRequirements: string[];
};
type BinaryHostRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "takeover_required";
type BinaryHostWorkspaceTrustMode =
  | "untrusted"
  | "trusted_read_only"
  | "trusted_full_access"
  | "trusted_prompt_commands";
type BinaryHostRunControlAction =
  | "pause"
  | "resume"
  | "cancel"
  | "repair"
  | "takeover"
  | "retry_last_turn";

const RESPONSE_CORS_ORIGIN = Symbol("binaryResponseCorsOrigin");

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind?: "observe" | "mutate" | "command";
  summary?: string;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

type AssistRunEnvelope = {
  sessionId?: string;
  traceId?: string;
  policyLane?: BinaryPromptLane;
  intentStepId?: string;
  intentKind?: BinaryIntentKind;
  executionMode?: "background_safe" | "foreground_lease" | "takeover";
  windowAffinityToken?: string;
  targetAppIntent?: string;
  targetResolvedApp?: string;
  targetConfidence?: number;
  pageLeaseId?: string;
  targetOrigin?: string;
  focusRecoveryAttempted?: boolean;
  focusModeApplied?: "background_safe" | "foreground_lease";
  foregroundLeaseMs?: number;
  focusLeaseRestored?: boolean;
  recoverySuppressedReason?: string;
  relaunchAttempt?: number;
  relaunchSuppressed?: boolean;
  relaunchSuppressionReason?: string;
  verificationRequired?: boolean;
  verificationPassed?: boolean;
  domProofArtifacts?: string[];
  screenshotCaptured?: boolean;
  screenshotReason?: BinaryScreenshotReason;
  proofProgress?: number;
  proofArtifacts?: string[];
  proofArtifactsDetailed?: BinaryProofArtifact[];
  qualityGateState?: BinaryQualityGateState;
  requiredProofs?: BinaryProofRequirement[];
  satisfiedProofs?: string[];
  missingProofs?: string[];
  qualityBlockedReason?: BinaryQualityBlockedReason;
  repairAttemptCount?: number;
  maxRepairAttempts?: number;
  finalizationBlocked?: boolean;
  cleanupClosedCount?: number;
  cleanupSkippedPreExistingCount?: number;
  cleanupErrors?: number;
  adapterMode?: BinaryAdapterMode;
  latencyPolicy?: BinaryLatencyPolicy;
  smallModelForced?: boolean;
  modelRoutingMode?: BinaryModelRoutingMode;
  fixedModelAlias?: string;
  fallbackEnabled?: boolean;
  budgetProfile?: string;
  firstTurnBudgetMs?: number;
  timeoutPolicy?: BinaryTimeoutPolicy | string;
  terminalBackend?: "openhands_native" | "blocked";
  terminalStrictMode?: boolean;
  terminalHealthReason?: string;
  nativeTerminalAvailable?: boolean;
  terminalBackendMode?: BinaryTerminalBackendMode;
  requireNativeTerminalTool?: boolean;
  coercionApplied?: boolean;
  seedToolInjected?: boolean;
  invalidToolNameRecovered?: boolean;
  executionLane?: BinaryExecutionLane;
  pluginPacks?: BinaryPluginPack[];
  skillSources?: BinarySkillSource[];
  conversationId?: string | null;
  persistenceDir?: string | null;
  jsonlPath?: string | null;
  final?: string;
  closureSummary?: string;
  unfinishedChecklistItems?: string[];
  lastMeaningfulProof?: string;
  whyBinaryIsBlocked?: string;
  completionStatus?: "complete" | "incomplete";
  runId?: string;
  adapter?: string;
  pendingToolCall?: PendingToolCall | null;
  receipt?: Record<string, unknown> | null;
  escalationStage?: string;
  escalationReason?: string;
  plannerLatencyMs?: number;
  providerLatencyMs?: number;
  actionLatencyMs?: number;
  queueDelayMs?: number;
  ttfrMs?: number;
  firstToolMs?: number;
  totalRunMs?: number;
  fallbackCount?: number;
  reviewState?: Record<string, unknown> | null;
  loopState?: {
    stepCount?: number;
    mutationCount?: number;
    maxSteps?: number;
    maxMutations?: number;
    repeatedCallCount?: number;
    repairCount?: number;
    status?: string;
    closurePhase?: string;
    closureBudgetRemaining?: number;
    closureStallCount?: number;
    blockingRequirementIds?: string[];
  } | null;
  progressState?: {
    status?: string;
    stallReason?: string;
    nextDeterministicAction?: string;
    executionVisibility?: string;
    interactionMode?: string;
    visibleFallbackReason?: string;
    startupPhase?: BinaryStartupPhase;
    selectedSpeedProfile?: BinaryAssistSpeedProfile;
    selectedLatencyTier?: BinaryLatencyTier;
    taskSpeedClass?: BinaryTaskSpeedClass;
    terminalState?: Record<string, unknown> | null;
  } | null;
  timingState?: BinaryHostRunTimingState | null;
  missingRequirements?: string[];
  [key: string]: unknown;
};

type LocalGatewayAssistInput = {
  run: StoredHostRun;
  modelCandidate: BinaryUserConnectedModelCandidate;
  modelCandidates: BinaryUserConnectedModelCandidate[];
  desktopContext: Record<string, unknown>;
  browserContext: Record<string, unknown>;
  worldContext?: Record<string, unknown>;
  repoContext?: Record<string, unknown>;
  verificationPlan?: Record<string, unknown>;
  mcp?: MaterializedMcpConfig;
  latestToolResult?: ToolResult | null;
  gatewayRunId?: string;
  startupPhase: BinaryStartupPhase;
  taskSpeedClass: BinaryTaskSpeedClass;
  gatewayBaseUrl?: string;
  executionLane: BinaryExecutionLane;
  pluginPacks: BinaryPluginPack[];
  skillSources: BinarySkillSource[];
  traceId: string;
  traceSampled: boolean;
  policyLane?: BinaryPromptLane;
  adapterMode?: BinaryAdapterMode;
  latencyPolicy?: BinaryLatencyPolicy;
  timeoutPolicy?: BinaryTimeoutPolicy;
  modelRoutingMode?: BinaryModelRoutingMode;
  fixedModelAlias?: string;
  fallbackEnabled?: boolean;
  budgetProfile?: string;
  firstTurnBudgetMs?: number;
  smallModelForced?: boolean;
  terminalBackendMode?: BinaryTerminalBackendMode;
  requireNativeTerminalTool?: boolean;
  forcedSmallModelAliases?: string[];
  routePolicy?: Partial<BinaryTurnRoutePolicy>;
  repairDirective?: {
    stage:
      | "post_inspection_mutation_required"
      | "target_path_repair"
      | "patch_repair"
      | "single_file_rewrite"
      | "pine_specialization";
    reason?: string;
  } | null;
  onEvent?: (event: Record<string, unknown>) => Promise<void> | void;
};

type BinaryHostTrustGrant = {
  path: string;
  mutate: boolean;
  commands: "allow" | "prompt";
  network: "allow" | "deny";
  elevated: "allow" | "deny";
  grantedAt: string;
};

type BinaryMachineRootMode = "home_root" | "hybrid_root";
type BinaryMachineTrustMode = "observe_first" | "home_mutate" | "full_machine_mutate";
type BinarySystemPathScope = "excluded" | "included" | "prompt";

type BinaryHostPreferences = {
  baseUrl: string;
  trustedWorkspaces: BinaryHostTrustGrant[];
  recentSessions: Array<{ sessionId: string; runId?: string; updatedAt: string; workspaceRoot?: string }>;
  artifactHistory: Array<{ id: string; label: string; url?: string; createdAt: string }>;
  preferredTransport: "host" | "direct";
  orchestrationPolicy: BinaryOrchestrationPolicy;
  defaultPluginPacks: Array<BinaryPluginPack["id"]>;
  defaultProviderId?: BinaryProviderId;
  machineAutonomy: MachineAutonomyPolicy;
  backgroundAgents: BinaryHostBackgroundAgent[];
  automations: BinaryAutomationDefinition[];
  webhookSubscriptions: BinaryWebhookSubscription[];
  connections: BinaryConnectionRecord[];
  machineRootPath: string;
  machineRootMode: BinaryMachineRootMode;
  machineTrustMode: BinaryMachineTrustMode;
  systemPathScope: BinarySystemPathScope;
  focusWorkspaceRoot?: string;
  focusRepoRoot?: string;
};

type BinaryHostBackgroundAgent = {
  id: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification";
  scheduleMinutes?: number;
  workspaceRoot?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
};

type BinaryHostClientInfo = {
  surface: "desktop" | "cli" | "vsix" | "unknown";
  version?: string;
};

type BinaryOpenHandsOffering = {
  id:
    | "conversation_orchestrator"
    | "terminal_tool"
    | "file_editor"
    | "browser_use"
    | "headless_jobs"
    | "probe_sessions";
  title: string;
  description: string;
  status: "available" | "limited";
  detail?: string;
};

type BinaryImageInput = {
  mimeType?: string;
  dataUrl?: string;
  base64?: string;
  url?: string;
  caption?: string;
  name?: string;
  source?: string;
};

type AssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  speedProfile?: BinaryAssistSpeedProfile;
  chatModelSource?: "platform" | "user_connected";
  fallbackToPlatformModel?: boolean;
  historySessionId?: string;
  tom?: {
    enabled?: boolean;
  };
  workspaceRoot?: string;
  machineRootPath?: string;
  focusWorkspaceRoot?: string;
  focusRepoRoot?: string;
  rootResolutionReason?: string;
  detach?: boolean;
  automationId?: string;
  automationTriggerKind?: BinaryAutomationTriggerKind;
  automationEventId?: string;
  executionLane?: BinaryExecutionLane;
  pluginPacks?: Array<BinaryPluginPack["id"]>;
  expectedLongRun?: boolean;
  requireIsolation?: boolean;
  debugTracing?: boolean;
  routePolicy?: {
    fastTurnBudget?: number;
    browserMissionFirst?: boolean;
    turnBudgetMs?: number;
    maxIterations?: number;
    stallTimeoutMs?: number;
    missionFirstBrowser?: boolean;
  };
  imageInputs?: BinaryImageInput[];
  client?: BinaryHostClientInfo;
  userConnectedModels?: BinaryUserConnectedModelCandidate[];
};

type BinaryTurnRoutePolicy = {
  turnBudgetMs: number;
  maxIterations: number;
  stallTimeoutMs: number;
  missionFirstBrowser: boolean;
};

type MaterializedMcpConfig = {
  mcpServers: Record<string, Record<string, unknown>>;
};

type BinaryHostSecretStore = {
  apiKey?: string;
  connections?: Record<string, BinaryConnectionSecretRecord>;
};

type BinaryHostBudgetState = {
  maxSteps?: number;
  usedSteps: number;
  remainingSteps?: number;
  maxMutations?: number;
  usedMutations: number;
  remainingMutations?: number;
  exhausted: boolean;
  reason?: string;
};

type BinaryHostRunTimingState = {
  startedAt: string;
  firstVisibleTextAt?: string;
  firstToolRequestAt?: string;
  firstToolResultAt?: string;
  finalAt?: string;
  queueDelayMs?: number;
  ttfrMs?: number;
  firstToolMs?: number;
  totalRunMs?: number;
  fallbackCount?: number;
  plannerLatencyMs?: number;
  providerLatencyMs?: number;
  actionLatencyMs?: number;
  selectedSpeedProfile: BinaryAssistSpeedProfile;
  selectedLatencyTier?: BinaryLatencyTier;
  taskSpeedClass?: BinaryTaskSpeedClass;
  startupPhase: BinaryStartupPhase;
  startupPhaseDurations: Record<string, number>;
  escalatedRoute?: boolean;
  escalationCount?: number;
};

type BinaryHostCheckpointState = {
  count: number;
  lastCheckpointAt?: string;
  lastCheckpointSummary?: string;
};

type BinaryHostLeaseState = {
  leaseId: string;
  workerId: string;
  startedAt: string;
  heartbeatAt: string;
  lastToolAt?: string;
};

type BinaryHostTerminalState = {
  sessionId?: string;
  cwd?: string;
  preferredTerminalCwd?: string;
  projectRoot?: string;
  stack?: "node_js_ts" | "python" | "generic";
  terminalObjective?: string;
  terminalProof?: string;
  lastCommand?: string;
  lastCommandOutcome?: "idle" | "running" | "succeeded" | "failed";
};

type BinaryHostExecutionState = {
  lane?: string;
  executionLane?: BinaryExecutionLane;
  speedProfile?: BinaryAssistSpeedProfile;
  latencyTier?: BinaryLatencyTier;
  intendedUse?: BinaryIntendedUse;
  startupPhase?: BinaryStartupPhase;
  taskSpeedClass?: BinaryTaskSpeedClass;
  chosenRoute?: string;
  routeReason?: string;
  escalationStage?: string;
  escalationReason?: string;
  executionVisibility?: string;
  foregroundDisruptionRisk?: string;
  interactionMode?: string;
  focusPolicy?: string;
  sessionPolicy?: string;
  visibleFallbackReason?: string;
  focusLeaseActive?: boolean;
  focusSuppressed?: boolean;
  backgroundSafe?: boolean;
  requiresVisibleInteraction?: boolean;
  pluginPacks?: BinaryPluginPack[];
  skillSources?: BinarySkillSource[];
  traceSampled?: boolean;
  policyLane?: BinaryPromptLane;
  adapterMode?: BinaryAdapterMode;
  latencyPolicy?: BinaryLatencyPolicy;
  timeoutPolicy?: BinaryTimeoutPolicy | string;
  budgetProfile?: string;
  firstTurnBudgetMs?: number;
  smallModelForced?: boolean;
  terminalBackend?: "openhands_native" | "blocked";
  terminalStrictMode?: boolean;
  terminalHealthReason?: string;
  nativeTerminalAvailable?: boolean;
  terminalBackendMode?: BinaryTerminalBackendMode;
  requireNativeTerminalTool?: boolean;
  modelRoutingMode?: BinaryModelRoutingMode;
  fixedModelAlias?: string;
  fallbackEnabled?: boolean;
  coercionApplied?: boolean;
  seedToolInjected?: boolean;
  invalidToolNameRecovered?: boolean;
  jsonlPath?: string | null;
  intentStepId?: string;
  intentKind?: BinaryIntentKind;
  executionMode?: "background_safe" | "foreground_lease" | "takeover";
  windowAffinityToken?: string;
  targetAppIntent?: string;
  targetResolvedApp?: string;
  targetConfidence?: number;
  pageLeaseId?: string;
  targetOrigin?: string;
  focusRecoveryAttempted?: boolean;
  focusModeApplied?: "background_safe" | "foreground_lease";
  foregroundLeaseMs?: number;
  focusLeaseRestored?: boolean;
  recoverySuppressedReason?: string;
  relaunchAttempt?: number;
  relaunchSuppressed?: boolean;
  relaunchSuppressionReason?: string;
  verificationRequired?: boolean;
  verificationPassed?: boolean;
  domProofArtifacts?: string[];
  screenshotCaptured?: boolean;
  screenshotReason?: BinaryScreenshotReason;
  proofProgress?: number;
  proofArtifacts?: string[];
  proofArtifactsDetailed?: BinaryProofArtifact[];
  qualityGateState?: BinaryQualityGateState;
  requiredProofs?: BinaryProofRequirement[];
  satisfiedProofs?: string[];
  missingProofs?: string[];
  qualityBlockedReason?: BinaryQualityBlockedReason;
  repairAttemptCount?: number;
  maxRepairAttempts?: number;
  finalizationBlocked?: boolean;
  cleanupClosedCount?: number;
  cleanupSkippedPreExistingCount?: number;
  cleanupErrors?: number;
  terminalState?: BinaryHostTerminalState | null;
  selectedContextTier?: "minimal" | "standard" | "full";
  decisionFeatures?: Record<string, unknown> | null;
  historicalSuccessWeight?: number;
  freshnessPenalty?: number;
  contradictionPenalty?: number;
  proofBoost?: number;
  goalAlignmentBoost?: number;
  plannerLatencyMs?: number;
  providerLatencyMs?: number;
  actionLatencyMs?: number;
  queueDelayMs?: number;
  ttfrMs?: number;
  firstToolMs?: number;
  totalRunMs?: number;
  fallbackCount?: number;
};

type StoredEvent = {
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
};

type StoredHostRun = {
  id: string;
  status: BinaryHostRunStatus;
  createdAt: string;
  updatedAt: string;
  client: BinaryHostClientInfo;
  request: AssistRequest;
  workspaceRoot?: string;
  machineRootPath?: string;
  focusedWorkspaceRoot?: string;
  focusedRepoRoot?: string;
  rootResolutionReason?: string;
  workspaceTrustMode: BinaryHostWorkspaceTrustMode;
  traceId: string;
  sessionId?: string;
  runId?: string;
  executionLane?: BinaryExecutionLane;
  pluginPacks?: BinaryPluginPack[];
  skillSources?: BinarySkillSource[];
  conversationId?: string | null;
  persistenceDir?: string | null;
  automationId?: string;
  automationTriggerKind?: BinaryAutomationTriggerKind;
  automationEventId?: string;
  leaseId?: string;
  heartbeatAt?: string;
  lastToolAt?: string;
  resumeToken: string;
  budgetState?: BinaryHostBudgetState | null;
  checkpointState?: BinaryHostCheckpointState | null;
  leaseState?: BinaryHostLeaseState | null;
  lastPendingToolCallSignature?: string;
  repeatedPendingSignatureCount?: number;
  observationOnlyStreak?: number;
  takeoverReason?: string;
  controlHistory: Array<{ action: BinaryHostRunControlAction; note?: string | null; at: string }>;
  toolResults: ToolResult[];
  checkpoints: Array<{ capturedAt: string; summary: string; step?: number }>;
  events: StoredEvent[];
  timingState?: BinaryHostRunTimingState;
  finalEnvelope?: AssistRunEnvelope;
  lastExecutionState?: BinaryHostExecutionState | null;
  worldRouteDecisionId?: string;
  worldRouteKind?: string;
  worldContextTier?: "minimal" | "standard" | "full";
  error?: string;
};

type HostRunSummary = Omit<
  StoredHostRun,
  "events" | "toolResults" | "checkpoints" | "controlHistory" | "finalEnvelope"
> & {
  eventCount: number;
};

type RunControllerState = {
  pauseRequested: boolean;
  cancelRequested: boolean;
};

const HOST_VERSION = "0.2.0";
const HOST = process.env.BINARY_IDE_HOST_BIND || "127.0.0.1";
const PORT = Number(process.env.BINARY_IDE_HOST_PORT || "7777");
const CONFIG_DIR = path.join(os.homedir(), ".binary-ide");
const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const HOST_DIR = path.join(CONFIG_DIR, "host");
const STATE_PATH = path.join(HOST_DIR, "state.json");
const SECRET_FALLBACK_PATH = path.join(HOST_DIR, "secrets.json");
const WORLD_MODEL_PATH = path.join(HOST_DIR, "world-model.json");
const REPO_MODEL_PATH = path.join(HOST_DIR, "repo-model.json");
const AUTOMATION_STATE_PATH = path.join(HOST_DIR, "automation-runtime.json");
const OPENHANDS_RUNTIME_STATE_PATH = path.join(HOST_DIR, "openhands-runtime.json");
const AGENT_PROBE_STATE_PATH = path.join(HOST_DIR, "agent-probe-sessions.json");
const AGENT_JOB_STATE_PATH = path.join(HOST_DIR, "agent-jobs.json");
const RUNS_DIR = path.join(HOST_DIR, "runs");
const JSON_LIMIT_BYTES = 1_500_000;
const MAX_EVENT_HISTORY = 4_000;
const MAX_TOOL_RESULT_HISTORY = 400;
const MAX_CHECKPOINT_HISTORY = 100;
const HEARTBEAT_INTERVAL_MS = 4_000;
const STALE_LEASE_MS = 20_000;
const MAX_OBSERVATION_ONLY_STREAK = 8;
const MAX_PENDING_SIGNATURE_REPEATS = 3;
const QUALITY_GATE_MAX_REPAIR_ATTEMPTS = 2;
const FAST_TURN_BUDGET_MS = 35_000;
const FAST_FIRST_TURN_BUDGET_MS = 20_000;
const BALANCED_TURN_BUDGET_MS = 75_000;
const THOROUGH_TURN_BUDGET_MS = 90_000;
const FORCED_SMALL_MODEL_FIRST_TURN_BUDGET_MS = 15_000;
const FORCED_SMALL_MODEL_DEEP_CODE_FIRST_TURN_BUDGET_MS = 45_000;
const FORCED_SMALL_MODEL_CONTINUE_TURN_BUDGET_MS = 75_000;
const FORCED_SMALL_MODEL_DEEP_CODE_CONTINUE_TURN_BUDGET_MS = 60_000;
const LATENCY_POLICY_INTERACTIVE_FIRST_TURN_BUDGET_MS = 8_000;
const LATENCY_POLICY_DESKTOP_FIRST_TURN_BUDGET_MS = 12_000;
const LATENCY_POLICY_DEEP_CODE_FIRST_TURN_BUDGET_MS = 30_000;
const FIRST_RESPONSE_PROGRESS_INTERVAL_MS = 3_000;
const FAST_TURN_MAX_ITERATIONS = 10;
const BALANCED_TURN_MAX_ITERATIONS = 20;
const THOROUGH_TURN_MAX_ITERATIONS = 80;
const FAST_STALL_TIMEOUT_MS = 10_000;
const FAST_FIRST_TURN_STALL_TIMEOUT_MS = 6_500;
const BALANCED_STALL_TIMEOUT_MS = 18_000;
const THOROUGH_STALL_TIMEOUT_MS = 30_000;
const BROWSER_MICRO_STALL_REPEATS = 2;
const OAUTH_REFRESH_SKEW_MS = 90_000;
const DEFAULT_FIXED_FREE_MODEL_ALIAS = "openai/gpt-oss-20b:free";
const DEFAULT_SMALL_MODEL_ALLOWLIST = [
  "alias:user:openrouter",
  "alias:openrouter",
  "alias:openrouter_*",
  "display:*openrouter*free*",
  "display:openrouter free*",
  "model:*:free",
  "model:*gpt-oss-20b*",
  "model:*qwen*coder*",
  "model:*step-3.5*",
];
const oauthSessionManager = new OAuthSessionManager();
const browserSessionManager = new BrowserSessionManager();
const interactiveTerminalRuntime = new InteractiveTerminalRuntime();
const HOST_WORKSPACE_TOOLS = [
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
  "terminal_start_session",
  "terminal_send_input",
  "terminal_read_output",
  "terminal_list_sessions",
  "terminal_terminate_session",
  "get_workspace_memory",
] as const;
const HOST_BINARY_TOOLS = [
  "stat_binary",
  "read_binary_chunk",
  "search_binary",
  "analyze_binary",
  "patch_binary",
  "write_binary_file",
  "hash_binary",
] as const;
const HOST_DESKTOP_TOOLS = [
  "desktop_list_apps",
  "desktop_get_active_window",
  "desktop_list_windows",
  "desktop_open_app",
  "desktop_open_url",
  "desktop_focus_window",
  "desktop_query_controls",
  "desktop_read_control",
  "desktop_invoke_control",
  "desktop_type_into_control",
  "desktop_select_control_option",
  "desktop_toggle_control",
  "desktop_send_shortcut",
  "desktop_wait_for_control",
  "desktop_wait",
] as const;
const HOST_BROWSER_TOOLS = [
  "browser_list_pages",
  "browser_get_active_page",
  "browser_open_page",
  "browser_search_and_open_best_result",
  "browser_login_and_continue",
  "browser_complete_form",
  "browser_extract_and_decide",
  "browser_recover_workflow",
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
] as const;
const HOST_WORLD_TOOLS = [
  "world_get_summary",
  "world_get_active_context",
  "world_get_beliefs",
  "world_get_goals",
  "world_query_episodes",
  "world_register_goal",
  "world_query_graph",
  "world_get_neighbors",
  "world_get_recent_changes",
  "world_get_attention_queue",
  "world_get_route_stats",
  "world_get_affordances",
  "world_find_routine",
  "world_record_observation",
  "world_record_proof",
  "world_commit_memory",
  "world_predict_outcomes",
  "world_explain_route",
  "world_record_route_outcome",
  "world_score_route",
] as const;
const HOST_REPO_TOOLS = [
  "repo_get_summary",
  "repo_query_symbols",
  "repo_find_references",
  "repo_get_change_impact",
  "repo_get_validation_plan",
  "repo_record_verification",
] as const;

const activeExecutions = new Map<string, Promise<void>>();
const runControllers = new Map<string, RunControllerState>();
const machineAutonomyController = new MachineAutonomyController();
const browserRuntimeController = new BrowserRuntimeController();
const nativeAppRuntime = new NativeAppRuntime();
const worldModelService = new MachineWorldModelService(WORLD_MODEL_PATH);
const repoModelService = new RepoModelService(REPO_MODEL_PATH);
const agentProbeManager = new AgentProbeManager(AGENT_PROBE_STATE_PATH);
const agentJobManager = new AgentJobManager(AGENT_JOB_STATE_PATH);
const openHandsRuntimeSupervisor = new OpenHandsRuntimeSupervisor({
  statePath: OPENHANDS_RUNTIME_STATE_PATH,
  repoRoot: process.cwd(),
});
let activeFocusLease: FocusLease | null = null;
const automationRuntime = new AutomationRuntime({
  storagePath: AUTOMATION_STATE_PATH,
  readConfig: async () => {
    const preferences = await loadPreferences();
    return {
      automations: preferences.automations,
      webhookSubscriptions: preferences.webhookSubscriptions,
      trustedWorkspaceRoots: preferences.trustedWorkspaces.map((item) => normalizeWorkspacePath(item.path)),
    };
  },
  writeConfig: async (config) => {
    const preferences = await loadPreferences();
    await savePreferences({
      ...preferences,
      automations: config.automations,
      webhookSubscriptions: config.webhookSubscriptions,
    });
  },
  queueAutomationRun: async (input) => {
    const preferences = await loadPreferences();
    const resolvedRoots = inferFocusedRoots({
      preferences,
      workspaceRoot: input.workspaceRoot,
      focusWorkspaceRoot: input.workspaceRoot,
      focusRepoRoot: input.workspaceRoot,
    });
    const trustGrant = resolvedRoots.focusedWorkspaceRoot ? isWorkspaceTrusted(preferences, resolvedRoots.focusedWorkspaceRoot) : null;
    const request: AssistRequest = {
      task: input.automation.prompt,
      mode: "auto",
      model: input.automation.model || "Binary IDE",
      workspaceRoot: resolvedRoots.focusedWorkspaceRoot,
      machineRootPath: resolvedRoots.machineRootPath,
      focusWorkspaceRoot: resolvedRoots.focusedWorkspaceRoot,
      focusRepoRoot: resolvedRoots.focusedRepoRoot,
      rootResolutionReason: resolvedRoots.rootResolutionReason,
      detach: true,
      automationId: input.automation.id,
      automationTriggerKind: input.triggerKind,
      automationEventId: input.eventId,
      client: {
        surface: "desktop",
        version: `automation:${input.automation.id}`,
      },
    };
    const run = await createQueuedRun({
      request,
      workspaceTrustMode: deriveEffectiveTrustMode(preferences, request.workspaceRoot),
    });
    void startRunExecution(run.id);
    return {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  },
  getDesktopSnapshot: async () => {
    const preferences = await loadPreferences();
    const desktopContext = await collectDesktopContext({
      machineAutonomyController,
      policy: preferences.machineAutonomy,
      appLimit: 8,
      windowLimit: 8,
    }).catch(() => ({}) as Awaited<ReturnType<typeof collectDesktopContext>>);
    return {
      activeWindow: desktopContext.activeWindow,
    };
  },
});

type LocalToolExecutor = {
  execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult>;
  cleanup?: () => Promise<{
    attempted: number;
    closed: number;
    failed: Array<{ pid: number; error: string }>;
    skipped: boolean;
    skippedPreExistingCount: number;
    cleanupErrors: number;
  }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFocusLease(lease: FocusLease | null): FocusLease | null {
  if (!lease) return null;
  if (new Date(lease.expiresAt).getTime() <= Date.now()) {
    activeFocusLease = null;
    return null;
  }
  return lease;
}

function detectTerminalStack(command: string, workspaceRoot?: string): "node_js_ts" | "python" | "generic" {
  const normalized = String(command || "").toLowerCase();
  if (
    normalized.includes("npm ") ||
    normalized.includes("pnpm ") ||
    normalized.includes("yarn ") ||
    normalized.includes("node ") ||
    normalized.includes("npx ")
  ) {
    return "node_js_ts";
  }
  if (normalized.includes("python") || normalized.includes("pytest") || normalized.includes("pip ")) {
    return "python";
  }
  if (workspaceRoot) {
    if (existsSync(path.join(workspaceRoot, "package.json"))) return "node_js_ts";
    if (existsSync(path.join(workspaceRoot, "pyproject.toml")) || existsSync(path.join(workspaceRoot, "requirements.txt"))) {
      return "python";
    }
  }
  return "generic";
}

function buildTerminalState(run: StoredHostRun, pendingToolCall: PendingToolCall, toolResult?: ToolResult | null): BinaryHostTerminalState | null {
  if (!isTerminalToolName(String(pendingToolCall.toolCall.name || ""))) return null;
  const toolName = String(pendingToolCall.toolCall.name || "");
  const sessionRecord =
    toolResult?.data && typeof toolResult.data === "object" && toolResult.data.session && typeof toolResult.data.session === "object"
      ? (toolResult.data.session as Record<string, unknown>)
      : null;
  const command =
    toolName === "run_command"
      ? String(pendingToolCall.toolCall.arguments.command || "").trim()
      : toolName === "terminal_send_input"
        ? String(pendingToolCall.toolCall.arguments.input || "").trim()
        : toolName === "terminal_start_session"
          ? String(pendingToolCall.toolCall.arguments.shell || "interactive shell").trim()
          : toolName === "terminal_read_output"
            ? "read terminal output"
            : "terminate terminal session";
  const preferredProjectRoot = extractRequestedProjectRoot(run.request.task);
  const cwd =
    typeof sessionRecord?.cwd === "string"
      ? String(sessionRecord.cwd).trim()
      : typeof pendingToolCall.toolCall.arguments.cwd === "string" && pendingToolCall.toolCall.arguments.cwd.trim()
        ? String(pendingToolCall.toolCall.arguments.cwd).trim()
      : run.workspaceRoot || run.focusedWorkspaceRoot || run.machineRootPath;
  const projectRoot =
    cwd ||
    (preferredProjectRoot && (run.focusedRepoRoot || run.workspaceRoot)
      ? path.join((run.focusedRepoRoot || run.workspaceRoot)!, preferredProjectRoot.replace(/\//g, path.sep))
      : run.focusedRepoRoot || run.workspaceRoot || run.machineRootPath);
  return {
    sessionId:
      typeof sessionRecord?.sessionId === "string"
        ? sessionRecord.sessionId
        : typeof pendingToolCall.toolCall.arguments.sessionId === "string"
          ? pendingToolCall.toolCall.arguments.sessionId
          : undefined,
    cwd,
    preferredTerminalCwd: cwd,
    projectRoot,
    stack: detectTerminalStack(command, run.focusedRepoRoot || run.workspaceRoot),
    terminalObjective:
      typeof pendingToolCall.toolCall.summary === "string" && pendingToolCall.toolCall.summary.trim()
        ? pendingToolCall.toolCall.summary.trim()
        : "Use the shell to inspect, build, or validate the workspace without stealing focus.",
    terminalProof:
      typeof toolResult?.data?.output === "string" && toolResult.data.output.trim()
        ? truncateText(toolResult.data.output, 2_000)
        : toolResult?.summary,
    lastCommand: command,
    lastCommandOutcome: !toolResult
      ? "running"
      : toolResult.ok
        ? "succeeded"
        : "failed",
  };
}

function buildExecutionState(
  decision: ExecutionPolicyDecision | null | undefined,
  run: StoredHostRun,
  pendingToolCall?: PendingToolCall | null,
  toolResult?: ToolResult | null
): BinaryHostExecutionState | null {
  if (!decision) return null;
  const terminalState = pendingToolCall ? buildTerminalState(run, pendingToolCall, toolResult) : null;
  return {
    lane: decision.lane,
    executionVisibility: decision.executionVisibility,
    foregroundDisruptionRisk: decision.foregroundDisruptionRisk,
    interactionMode: decision.interactionMode,
    focusPolicy: decision.focusPolicy,
    sessionPolicy: decision.sessionPolicy,
    ...(decision.visibleFallbackReason ? { visibleFallbackReason: decision.visibleFallbackReason } : {}),
    focusLeaseActive: decision.focusLeaseActive,
    focusSuppressed: decision.focusSuppressed,
    backgroundSafe: decision.backgroundSafe,
    requiresVisibleInteraction: decision.requiresVisibleInteraction,
    ...(terminalState ? { terminalState } : {}),
  };
}

function buildWorldSummaryText(summary: {
  activeContext?: Record<string, unknown>;
  routineCount?: number;
  nodeCount?: number;
  proofCount?: number;
  affordanceSummary?: Record<string, unknown>;
  routeRecommendations?: Array<Record<string, unknown>>;
}): string {
  const parts: string[] = [];
  const activeContext = summary.activeContext || {};
  const machineRoot = typeof activeContext.machineRoot === "string" ? activeContext.machineRoot : "";
  const focusedWorkspace = typeof activeContext.focusedWorkspace === "string" ? activeContext.focusedWorkspace : "";
  const focusedRepo = typeof activeContext.focusedRepo === "string" ? activeContext.focusedRepo : "";
  const activeWorkspace = typeof activeContext.activeWorkspace === "string" ? activeContext.activeWorkspace : "";
  const activePage = typeof activeContext.activePage === "string" ? activeContext.activePage : "";
  const activeWindow = typeof activeContext.activeWindow === "string" ? activeContext.activeWindow : "";
  if (machineRoot) parts.push(`machine_home=${machineRoot}`);
  if (focusedRepo) parts.push(`focus_repo=${focusedRepo}`);
  if (focusedWorkspace) parts.push(`focus_workspace=${focusedWorkspace}`);
  if (activeWorkspace) parts.push(`workspace=${activeWorkspace}`);
  if (activePage) parts.push(`page=${activePage}`);
  if (activeWindow) parts.push(`window=${activeWindow}`);
  if (typeof summary.routineCount === "number") parts.push(`routines=${summary.routineCount}`);
  if (typeof summary.nodeCount === "number") parts.push(`nodes=${summary.nodeCount}`);
  if (typeof summary.proofCount === "number") parts.push(`proofs=${summary.proofCount}`);
  const affordanceSummary = summary.affordanceSummary || {};
  const backgroundSafe = Array.isArray(affordanceSummary.backgroundSafe) ? affordanceSummary.backgroundSafe.length : 0;
  if (backgroundSafe > 0) parts.push(`background_safe=${backgroundSafe}`);
  const topRoute = Array.isArray(summary.routeRecommendations) ? summary.routeRecommendations[0] : null;
  if (topRoute && typeof topRoute.kind === "string") {
    const score = typeof topRoute.score === "number" ? topRoute.score.toFixed(2) : null;
    parts.push(`preferred_route=${topRoute.kind}${score ? `(${score})` : ""}`);
  }
  return parts.join(" | ");
}

async function buildWorldContextSlice(input?: {
  tier?: "minimal" | "standard" | "full";
  task?: string;
  taskSpeedClass?: BinaryTaskSpeedClass;
  toolFamily?: string;
}): Promise<Record<string, unknown>> {
  return (await worldModelService.getContextSlice({
    tier: input?.tier,
    task: input?.task,
    taskSpeedClass: input?.taskSpeedClass,
    toolFamily: input?.toolFamily,
  })) as Record<string, unknown>;
}

async function buildRepoContextSlice(workspaceRoot: string | undefined, task: string): Promise<Record<string, unknown> | undefined> {
  if (!workspaceRoot) return undefined;
  return (await repoModelService.getSummary(workspaceRoot, task)) as unknown as Record<string, unknown>;
}

async function buildVerificationPlanSlice(
  workspaceRoot: string | undefined,
  paths?: string[]
): Promise<Record<string, unknown> | undefined> {
  if (!workspaceRoot) return undefined;
  return (await repoModelService.getValidationPlan(workspaceRoot, { paths })) as unknown as Record<string, unknown>;
}

function normalizeSpeedProfile(value: unknown): BinaryAssistSpeedProfile {
  return value === "balanced" || value === "thorough" ? value : "fast";
}

function isExplicitMachineShortcutTask(task: string): boolean {
  const normalized = String(task || "").trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes(" and ") ||
    normalized.includes(" then ") ||
    normalized.includes(" after ") ||
    normalized.includes(" also ") ||
    normalized.includes(" tell me ") ||
    normalized.includes(" explain ") ||
    normalized.includes(" summarize ") ||
    normalized.includes("?")
  ) {
    return false;
  }
  if (extractInteractiveTerminalShortcutPlan(task)) return true;
  if (looksLikeWebAutomationIntent(task)) return false;
  if (extractOpenFolderQuery(task) || extractDirectOpenTarget(task)) return true;
  const parsedAction = parseMachineAutonomyTask(task);
  return parsedAction?.kind === "launch_app";
}

function classifyTaskSpeed(task: string, workspaceRoot?: string): BinaryTaskSpeedClass {
  const normalized = String(task || "").trim().toLowerCase();
  if (!normalized) return "chat_only";
  const deepCodeSignals = [
    "refactor",
    "implement",
    "feature",
    "multi-file",
    "scaffold",
    "benchmark",
    "test suite",
    "repair",
    "fix failing",
    "git",
    "commit",
  ];
  if (deepCodeSignals.some((signal) => normalized.includes(signal))) return "deep_code";
  if (isExplicitMachineShortcutTask(task)) return "simple_action";
  const actionVerbs = "(open|launch|click|search|go to|navigate|close|show|focus|start|run)";
  const directActionPattern = new RegExp(`^(please\\s+)?${actionVerbs}\\b`);
  const politeActionPatterns = [
    new RegExp(`^(can|could|would|will)\\s+you\\s+(please\\s+)?${actionVerbs}\\b`),
    new RegExp(`^(please\\s+)?help\\s+me\\s+${actionVerbs}\\b`),
    new RegExp(`^(i\\s+need\\s+you\\s+to|i\\s+want\\s+you\\s+to)\\s+${actionVerbs}\\b`),
  ];
  if (
    (directActionPattern.test(normalized) || politeActionPatterns.some((pattern) => pattern.test(normalized))) &&
    isExplicitMachineShortcutTask(task)
  ) {
    return "simple_action";
  }
  const chatOnlySignals = [
    "what is ",
    "what's ",
    "who is ",
    "who's ",
    "explain ",
    "tell me ",
    "summarize ",
    "define ",
    "why is ",
    "how many ",
    "how much ",
  ];
  if (normalized.endsWith("?") || chatOnlySignals.some((signal) => normalized.startsWith(signal))) return "chat_only";
  const simpleActionSignals = [
    "open ",
    "launch ",
    "click ",
    "search ",
    "go to ",
    "navigate ",
    "close ",
    "show ",
    "focus ",
  ];
  if (simpleActionSignals.some((signal) => normalized.startsWith(signal)) && isExplicitMachineShortcutTask(task)) {
    return "simple_action";
  }
  if (normalized.includes("browser") || normalized.includes("desktop") || normalized.includes("terminal")) {
    return "tool_heavy";
  }
  if (
    workspaceRoot &&
    (normalized.includes("file") ||
      normalized.includes("repo") ||
      normalized.includes("code") ||
      normalized.includes("project") ||
      normalized.includes("workspace"))
  ) {
    return "tool_heavy";
  }
  return "chat_only";
}

function selectInitialWorldContextTier(taskSpeedClass: BinaryTaskSpeedClass): "minimal" | "standard" | "full" {
  if (taskSpeedClass === "deep_code") return "full";
  if (taskSpeedClass === "tool_heavy") return "standard";
  return "minimal";
}

function extractWorldRouteDiagnostics(worldContext?: Record<string, unknown> | null): {
  topRoute?: Record<string, unknown>;
  uncertain: boolean;
  contradictory: boolean;
  stale: boolean;
  blockedGoal: boolean;
} {
  const topRoute =
    worldContext && Array.isArray(worldContext.routeRecommendations) && worldContext.routeRecommendations[0] && typeof worldContext.routeRecommendations[0] === "object"
      ? (worldContext.routeRecommendations[0] as Record<string, unknown>)
      : undefined;
  const confidence = typeof topRoute?.confidence === "number" ? topRoute.confidence : 0;
  const attentionQueue = worldContext && Array.isArray(worldContext.attentionQueue) ? worldContext.attentionQueue : [];
  const contradictory = attentionQueue.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "contradiction");
  const stale = attentionQueue.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "stale_belief");
  const blockedGoal = attentionQueue.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "blocked_goal");
  const uncertain = confidence > 0 && confidence < 0.72;
  return { topRoute, uncertain, contradictory, stale, blockedGoal };
}

function selectNextWorldContextTier(input: {
  currentTier: "minimal" | "standard" | "full";
  worldContext?: Record<string, unknown>;
  taskSpeedClass: BinaryTaskSpeedClass;
  hasPendingToolCall?: boolean;
}): "minimal" | "standard" | "full" {
  const diagnostics = extractWorldRouteDiagnostics(input.worldContext);
  if (input.currentTier === "full") return "full";
  if (input.taskSpeedClass === "deep_code") return "full";
  if (input.currentTier === "minimal" && input.hasPendingToolCall) {
    return diagnostics.uncertain || diagnostics.contradictory || diagnostics.stale || diagnostics.blockedGoal ? "full" : "standard";
  }
  if (input.currentTier === "standard" && (diagnostics.uncertain || diagnostics.contradictory || diagnostics.stale || diagnostics.blockedGoal)) {
    return "full";
  }
  return input.currentTier;
}

function shouldDeferRepoContext(taskSpeedClass: BinaryTaskSpeedClass): boolean {
  return taskSpeedClass !== "deep_code";
}

function shouldDeferVerificationPlan(taskSpeedClass: BinaryTaskSpeedClass): boolean {
  return taskSpeedClass !== "deep_code";
}

function inferReasoningEffort(
  speedProfile: BinaryAssistSpeedProfile,
  taskSpeedClass: BinaryTaskSpeedClass,
  candidate: BinaryUserConnectedModelCandidate,
  initialTurn: boolean
): "low" | "medium" | "high" {
  if (speedProfile === "thorough") return "high";
  if (speedProfile === "balanced" || taskSpeedClass === "deep_code" || !initialTurn) {
    return candidate.reasoningDefault || "medium";
  }
  return "low";
}

function latencyTierWeight(value: BinaryLatencyTier | undefined): number {
  switch (value) {
    case "fast":
      return 3;
    case "balanced":
      return 2;
    case "thorough":
      return 1;
    default:
      return 2;
  }
}

function intendedUseWeight(
  value: BinaryIntendedUse | undefined,
  taskSpeedClass: BinaryTaskSpeedClass,
  initialTurn: boolean
): number {
  if (taskSpeedClass === "chat_only") return value === "chat" ? 3 : value === "action" ? 1 : 0;
  if (taskSpeedClass === "deep_code") return value === "repair" ? 3 : value === "action" ? 2 : 1;
  if (!initialTurn) return value === "action" ? 3 : value === "repair" ? 2 : 1;
  return value === "action" ? 3 : value === "chat" ? 2 : 1;
}

function rankModelCandidateForStartup(input: {
  candidate: BinaryUserConnectedModelCandidate;
  requestedModel: string;
  speedProfile: BinaryAssistSpeedProfile;
  taskSpeedClass: BinaryTaskSpeedClass;
  initialTurn: boolean;
}): number {
  const { candidate, requestedModel, speedProfile, taskSpeedClass, initialTurn } = input;
  const normalizedRequested = String(requestedModel || "").trim().toLowerCase();
  const explicitMatch =
    normalizedRequested &&
    normalizedRequested !== "binary ide" &&
    (candidate.alias.toLowerCase() === normalizedRequested ||
      candidate.provider.toLowerCase() === normalizedRequested ||
      candidate.displayName.toLowerCase() === normalizedRequested ||
      (Array.isArray(candidate.modelFamilies) &&
        candidate.modelFamilies.some((family) => family.toLowerCase() === normalizedRequested)));
  if (explicitMatch) return 10_000;
  let score = candidate.preferred ? 25 : 0;
  score += intendedUseWeight(candidate.intendedUse, taskSpeedClass, initialTurn) * 10;
  if (speedProfile === "fast" && initialTurn) {
    score += latencyTierWeight(candidate.latencyTier) * 20;
  } else if (speedProfile === "balanced") {
    score += latencyTierWeight(candidate.latencyTier) * 10;
  }
  return score;
}

function orderUserConnectedModelsForRun(input: {
  requestedModel: string;
  candidates: BinaryUserConnectedModelCandidate[];
  speedProfile: BinaryAssistSpeedProfile;
  taskSpeedClass: BinaryTaskSpeedClass;
  initialTurn: boolean;
}): BinaryUserConnectedModelCandidate[] {
  return [...input.candidates].sort((left, right) => {
    const leftScore = rankModelCandidateForStartup({
      candidate: left,
      requestedModel: input.requestedModel,
      speedProfile: input.speedProfile,
      taskSpeedClass: input.taskSpeedClass,
      initialTurn: input.initialTurn,
    });
    const rightScore = rankModelCandidateForStartup({
      candidate: right,
      requestedModel: input.requestedModel,
      speedProfile: input.speedProfile,
      taskSpeedClass: input.taskSpeedClass,
      initialTurn: input.initialTurn,
    });
    return rightScore - leftScore;
  });
}

function resolveTurnBudgetMs(speedProfile: BinaryAssistSpeedProfile, taskSpeedClass: BinaryTaskSpeedClass): number {
  if (speedProfile === "fast") {
    if (taskSpeedClass === "chat_only" || taskSpeedClass === "simple_action") return FAST_TURN_BUDGET_MS;
    if (taskSpeedClass === "tool_heavy") return BALANCED_TURN_BUDGET_MS;
  }
  if (speedProfile === "balanced") return BALANCED_TURN_BUDGET_MS;
  return THOROUGH_TURN_BUDGET_MS;
}

function resolveTurnMaxIterations(speedProfile: BinaryAssistSpeedProfile, taskSpeedClass: BinaryTaskSpeedClass): number {
  if (speedProfile === "fast") {
    if (taskSpeedClass === "chat_only" || taskSpeedClass === "simple_action") return FAST_TURN_MAX_ITERATIONS;
    if (taskSpeedClass === "tool_heavy") return BALANCED_TURN_MAX_ITERATIONS;
  }
  if (speedProfile === "balanced") return BALANCED_TURN_MAX_ITERATIONS;
  return THOROUGH_TURN_MAX_ITERATIONS;
}

function resolveTurnStallTimeoutMs(speedProfile: BinaryAssistSpeedProfile, taskSpeedClass: BinaryTaskSpeedClass): number {
  if (speedProfile === "fast") {
    if (taskSpeedClass === "chat_only" || taskSpeedClass === "simple_action") return FAST_STALL_TIMEOUT_MS;
    if (taskSpeedClass === "tool_heavy") return BALANCED_STALL_TIMEOUT_MS;
  }
  if (speedProfile === "balanced") return BALANCED_STALL_TIMEOUT_MS;
  return THOROUGH_STALL_TIMEOUT_MS;
}

function toFinitePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

function normalizeRoutingMode(value: unknown, fallback: BinaryModelRoutingMode): BinaryModelRoutingMode {
  return value === "single_fixed_free" ? "single_fixed_free" : fallback;
}

function normalizeDesktopProofMode(value: unknown, fallback: BinaryDesktopProofMode): BinaryDesktopProofMode {
  return value === "strict" ? "strict" : fallback;
}

function normalizeTerminalBackendMode(
  value: unknown,
  fallback: BinaryTerminalBackendMode
): BinaryTerminalBackendMode {
  return value === "allow_host_fallback" ? "allow_host_fallback" : value === "strict_openhands_native" ? "strict_openhands_native" : fallback;
}

function defaultTerminalBackendMode(): BinaryTerminalBackendMode {
  return "strict_openhands_native";
}

function defaultRequireNativeTerminalTool(): boolean {
  return true;
}

function normalizeOrchestrationLatencyBudgets(
  value: Partial<BinaryOrchestrationLatencyBudgets> | null | undefined,
  fallback: BinaryOrchestrationLatencyBudgets
): BinaryOrchestrationLatencyBudgets {
  const interactive = toFinitePositiveNumber(value?.interactive);
  const desktop = toFinitePositiveNumber(value?.desktop);
  const deepCode = toFinitePositiveNumber(value?.deepCode);
  return {
    interactive: Math.max(2_000, Math.min(120_000, Math.round(interactive || fallback.interactive))),
    desktop: Math.max(2_000, Math.min(120_000, Math.round(desktop || fallback.desktop))),
    deepCode: Math.max(2_000, Math.min(180_000, Math.round(deepCode || fallback.deepCode))),
  };
}

function defaultOrchestrationPolicy(): BinaryOrchestrationPolicy {
  return {
    mode: "force_binary_tool_adapter",
    detachedFirstTurnBudgetMs: FORCED_SMALL_MODEL_FIRST_TURN_BUDGET_MS,
    smallModelAllowlist: [...DEFAULT_SMALL_MODEL_ALLOWLIST],
    modelRoutingMode: "single_fixed_free",
    fixedModelAlias: DEFAULT_FIXED_FREE_MODEL_ALIAS,
    fallbackEnabled: false,
    latencyBudgetsMs: {
      interactive: LATENCY_POLICY_INTERACTIVE_FIRST_TURN_BUDGET_MS,
      desktop: LATENCY_POLICY_DESKTOP_FIRST_TURN_BUDGET_MS,
      deepCode: LATENCY_POLICY_DEEP_CODE_FIRST_TURN_BUDGET_MS,
    },
    desktopProofMode: "adaptive",
    terminalBackendMode: defaultTerminalBackendMode(),
    requireNativeTerminalTool: defaultRequireNativeTerminalTool(),
  };
}

function normalizeOrchestrationPolicy(
  value: Partial<BinaryOrchestrationPolicy> | null | undefined,
  fallback: BinaryOrchestrationPolicy = defaultOrchestrationPolicy()
): BinaryOrchestrationPolicy {
  const detachedFirstTurnBudgetMs = toFinitePositiveNumber(value?.detachedFirstTurnBudgetMs);
  const allowlist = Array.isArray(value?.smallModelAllowlist)
    ? value!.smallModelAllowlist
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 200)
    : fallback.smallModelAllowlist;
  const modelRoutingMode = normalizeRoutingMode(value?.modelRoutingMode, fallback.modelRoutingMode);
  const fixedModelAliasRaw = typeof value?.fixedModelAlias === "string" ? value.fixedModelAlias.trim() : fallback.fixedModelAlias || "";
  const fixedModelAlias =
    modelRoutingMode === "single_fixed_free"
      ? fixedModelAliasRaw || DEFAULT_FIXED_FREE_MODEL_ALIAS
      : fixedModelAliasRaw;
  const fallbackEnabled = Object.prototype.hasOwnProperty.call(value || {}, "fallbackEnabled")
    ? value?.fallbackEnabled === true
    : fallback.fallbackEnabled === true;
  const latencyBudgetsMs = normalizeOrchestrationLatencyBudgets(value?.latencyBudgetsMs, fallback.latencyBudgetsMs);
  const desktopProofMode = normalizeDesktopProofMode(value?.desktopProofMode, fallback.desktopProofMode);
  const terminalBackendMode = normalizeTerminalBackendMode(value?.terminalBackendMode, fallback.terminalBackendMode);
  const requireNativeTerminalTool = Object.prototype.hasOwnProperty.call(value || {}, "requireNativeTerminalTool")
    ? value?.requireNativeTerminalTool !== false
    : fallback.requireNativeTerminalTool !== false;
  return {
    mode: "force_binary_tool_adapter",
    detachedFirstTurnBudgetMs: Math.max(
      5_000,
      Math.min(120_000, Math.round(detachedFirstTurnBudgetMs || fallback.detachedFirstTurnBudgetMs))
    ),
    smallModelAllowlist: allowlist.length ? allowlist : [...DEFAULT_SMALL_MODEL_ALLOWLIST],
    modelRoutingMode,
    ...(fixedModelAlias ? { fixedModelAlias } : {}),
    fallbackEnabled,
    latencyBudgetsMs,
    desktopProofMode,
    terminalBackendMode,
    requireNativeTerminalTool,
  };
}

function wildcardPatternToRegex(value: string): RegExp | null {
  const source = String(value || "").trim();
  if (!source) return null;
  const escaped = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`, "i");
  } catch {
    return null;
  }
}

function matchPattern(value: string, pattern: string): boolean {
  const left = String(value || "").trim().toLowerCase();
  const right = String(pattern || "").trim().toLowerCase();
  if (!left || !right) return false;
  const wildcard = wildcardPatternToRegex(right);
  if (wildcard) return wildcard.test(left);
  return left.includes(right);
}

function candidateMatchesSmallModelPattern(
  candidate: BinaryUserConnectedModelCandidate,
  rawPattern: string
): boolean {
  const pattern = String(rawPattern || "").trim();
  if (!pattern) return false;
  const colon = pattern.indexOf(":");
  const scoped = colon > 0 ? pattern.slice(0, colon).trim().toLowerCase() : "";
  const scopedPattern = colon > 0 ? pattern.slice(colon + 1).trim() : pattern;
  if (!scopedPattern) return false;
  if (scoped === "alias") return matchPattern(candidate.alias, scopedPattern);
  if (scoped === "model") return matchPattern(candidate.model, scopedPattern);
  if (scoped === "provider") return matchPattern(candidate.provider, scopedPattern);
  if (scoped === "display") return matchPattern(candidate.displayName, scopedPattern);
  const targets = [
    candidate.alias,
    candidate.displayName,
    candidate.model,
    candidate.provider,
    ...(Array.isArray(candidate.modelFamilies) ? candidate.modelFamilies : []),
  ];
  return targets.some((target) => matchPattern(target, scopedPattern));
}

function isSmallModelForcedCandidate(
  candidate: BinaryUserConnectedModelCandidate | null,
  policy: BinaryOrchestrationPolicy
): boolean {
  if (!candidate) return false;
  if (policy.mode !== "force_binary_tool_adapter") return false;
  if (policy.smallModelAllowlist.some((pattern) => candidateMatchesSmallModelPattern(candidate, pattern))) {
    return true;
  }
  // Safety net: free-tier OpenRouter models should stay deterministic even if operator allowlists drift.
  const provider = String(candidate.provider || "").trim().toLowerCase();
  const model = String(candidate.model || "").trim().toLowerCase();
  if (provider === "openrouter" && model.includes(":free")) {
    return true;
  }
  return false;
}

function buildTurnRoutePolicy(input: {
  speedProfile: BinaryAssistSpeedProfile;
  taskSpeedClass: BinaryTaskSpeedClass;
  request: AssistRequest;
  override?: Partial<BinaryTurnRoutePolicy>;
}): BinaryTurnRoutePolicy {
  const requestPolicy =
    input.request.routePolicy && typeof input.request.routePolicy === "object" ? input.request.routePolicy : {};
  const override = input.override || {};
  const turnBudgetMs =
    toFinitePositiveNumber(override.turnBudgetMs) ||
    toFinitePositiveNumber(requestPolicy.turnBudgetMs) ||
    toFinitePositiveNumber(requestPolicy.fastTurnBudget) ||
    resolveTurnBudgetMs(input.speedProfile, input.taskSpeedClass);
  const maxIterations =
    toFinitePositiveNumber(override.maxIterations) ||
    toFinitePositiveNumber(requestPolicy.maxIterations) ||
    resolveTurnMaxIterations(input.speedProfile, input.taskSpeedClass);
  const stallTimeoutMs =
    toFinitePositiveNumber(override.stallTimeoutMs) ||
    toFinitePositiveNumber(requestPolicy.stallTimeoutMs) ||
    resolveTurnStallTimeoutMs(input.speedProfile, input.taskSpeedClass);
  const missionFirstBrowser =
    typeof override.missionFirstBrowser === "boolean"
      ? override.missionFirstBrowser
      : typeof requestPolicy.missionFirstBrowser === "boolean"
        ? requestPolicy.missionFirstBrowser
        : requestPolicy.browserMissionFirst !== false;
  return {
    turnBudgetMs: Math.max(5_000, Math.round(turnBudgetMs)),
    maxIterations: Math.max(1, Math.min(200, Math.round(maxIterations))),
    stallTimeoutMs: Math.max(3_000, Math.round(stallTimeoutMs)),
    missionFirstBrowser,
  };
}

function tightenFirstTurnRoutePolicy(
  routePolicy: BinaryTurnRoutePolicy,
  taskSpeedClass: BinaryTaskSpeedClass
): BinaryTurnRoutePolicy {
  if (taskSpeedClass !== "chat_only" && taskSpeedClass !== "simple_action") {
    return routePolicy;
  }
  return {
    ...routePolicy,
    turnBudgetMs: Math.max(5_000, Math.min(routePolicy.turnBudgetMs, FAST_FIRST_TURN_BUDGET_MS)),
    maxIterations: Math.max(1, Math.min(routePolicy.maxIterations, 8)),
    stallTimeoutMs: Math.max(3_000, Math.min(routePolicy.stallTimeoutMs, FAST_FIRST_TURN_STALL_TIMEOUT_MS)),
  };
}

function buildGatewayRuntimeModelCandidate(
  runtimeStatus: OpenHandsRuntimeStatus | null,
  fallbackApiKey?: string | null
): BinaryUserConnectedModelCandidate | null {
  const raw =
    runtimeStatus?.currentModelCandidate && typeof runtimeStatus.currentModelCandidate === "object"
      ? (runtimeStatus.currentModelCandidate as Record<string, unknown>)
      : null;
  if (!raw) return null;
  const alias = String(raw.alias || raw.requested || raw.model || "").trim();
  const model = String(raw.model || "").trim();
  const provider = String(raw.provider || "").trim();
  const baseUrl = String(raw.baseUrl || "").trim();
  if (!alias || !model || !provider || !baseUrl) return null;
  return {
    alias,
    provider,
    displayName: String(raw.displayName || alias).trim() || alias,
    model,
    baseUrl,
    apiKey: String(raw.apiKey || fallbackApiKey || "").trim(),
    authSource: "user_connected",
    candidateSource: "user_connected",
    preferred: true,
    ...(String(raw.routeKind || "").trim() ? { routeKind: String(raw.routeKind).trim() } : {}),
    ...(String(raw.routeLabel || "").trim() ? { routeLabel: String(raw.routeLabel).trim() } : {}),
    ...(String(raw.routeReason || "").trim() ? { routeReason: String(raw.routeReason).trim() } : {}),
    ...(Array.isArray(raw.modelFamilies)
      ? {
          modelFamilies: raw.modelFamilies.filter(
            (value): value is string => typeof value === "string" && Boolean(value.trim())
          ),
        }
      : {}),
    ...(raw.extraHeaders && typeof raw.extraHeaders === "object"
      ? { extraHeaders: raw.extraHeaders as Record<string, string> }
      : {}),
    ...(raw.latencyTier === "fast" || raw.latencyTier === "balanced" || raw.latencyTier === "thorough"
      ? { latencyTier: raw.latencyTier }
      : {}),
    ...(raw.reasoningDefault === "low" || raw.reasoningDefault === "medium" || raw.reasoningDefault === "high"
      ? { reasoningDefault: raw.reasoningDefault }
      : {}),
    ...(raw.intendedUse === "chat" || raw.intendedUse === "action" || raw.intendedUse === "repair"
      ? { intendedUse: raw.intendedUse }
      : {}),
  };
}

function isBrowserMissionToolName(name: string): boolean {
  return (
    name === "browser_search_and_open_best_result" ||
    name === "browser_login_and_continue" ||
    name === "browser_complete_form" ||
    name === "browser_extract_and_decide" ||
    name === "browser_recover_workflow"
  );
}

function isBrowserMicroToolName(name: string): boolean {
  return name.startsWith("browser_") && !isBrowserMissionToolName(name);
}

function inferBrowserMissionUrl(task: string): string | undefined {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("youtube")) return "https://www.youtube.com/";
  if (normalized.includes("google")) return "https://www.google.com/";
  if (normalized.includes("github")) return "https://github.com/";
  if (normalized.includes("wikipedia")) return "https://www.wikipedia.org/";
  if (normalized.includes("amazon")) return "https://www.amazon.com/";
  return undefined;
}

function inferBrowserMissionQuery(task: string): string {
  const source = String(task || "").trim();
  if (!source) return "";
  const cleanQuery = (value: string): string =>
    String(value || "")
      .replace(/\b(?:on|in)\s+(?:youtube|google|github|wikipedia|amazon)\b/gi, " ")
      .replace(/[,;]\s*(?:and\s+)?(?:open|click|select)\b.*$/i, " ")
      .replace(/\b(?:and|then)\s+(?:open|click|select)\b.*$/i, " ")
      .replace(/[,;]\s*(?:and|then)\s+(?:report|return|tell|summari[sz]e|describe)\b.*$/i, " ")
      .replace(/\b(?:and|then)\s+(?:report|return|tell|summari[sz]e|describe)\b.*$/i, " ")
      .replace(/[.?!]+$/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const searchMatch =
    source.match(/\bsearch\s+(?:for\s+)?(.+?)(?:\s+(?:and|then)\s+(?:open|click|select)\b|$)/i) ||
    source.match(/\blook\s+up\s+(.+?)(?:\s+(?:and|then)\s+(?:open|click|select)\b|$)/i) ||
    source.match(/\bfind\s+(.+?)(?:\s+(?:and|then)\s+(?:open|click|select)\b|$)/i);
  if (searchMatch?.[1]) {
    return cleanQuery(String(searchMatch[1] || ""));
  }
  const compact = cleanQuery(
    source
    .replace(/\b(?:please\s+)?(?:open|go\s+to|navigate\s+to)\b/gi, " ")
    .replace(/\b(?:youtube|google|github|wikipedia|amazon)\b/gi, " ")
    .replace(/\b(?:and|then)\s+(?:open|click|select)\b/gi, " ")
    .replace(/\b(?:the|a|an|result|results|most|likely|matching|that|query)\b/gi, " ")
  );
  return compact;
}

function looksLikeWebAutomationIntent(task: string): boolean {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return false;
  if (/https?:\/\//.test(normalized) || normalized.includes("www.")) return true;
  const webSiteHint = /(youtube|google|wikipedia|github|amazon|reddit|discord|x\.com|twitter|chatgpt|gemini|qwen)/.test(
    normalized
  );
  const webActionHint =
    /\b(search|find|click|result|browser|website|web page|page|tab|navigate|open url|open site)\b/.test(normalized);
  return webSiteHint || webActionHint;
}

function buildBrowserMissionToolCall(task: string, step: number): PendingToolCall | null {
  const query = inferBrowserMissionQuery(task);
  if (!query) return null;
  const url = inferBrowserMissionUrl(task);
  return {
    step,
    adapter: "host_mission_escalation",
    requiresClientExecution: true,
    toolCall: {
      id: `mission_${Date.now().toString(36)}`,
      name: "browser_search_and_open_best_result",
      arguments: {
        query,
        ...(url ? { url } : {}),
        executionMode: "foreground_lease",
        forceForeground: true,
      },
      kind: "mutate",
      summary: "Mission-first browser recovery: open/search/click best match in one host-side flow.",
    },
    availableTools: [...HOST_BROWSER_TOOLS],
    createdAt: nowIso(),
  };
}

function taskLikelyRequiresWorkspaceAction(task: string): boolean {
  return /\b(fix|implement|edit|write|create|update|refactor|patch|modify|run tests?|test|verify|validation|lint)\b/i.test(
    task
  );
}

function taskLikelyRequiresDesktopVerification(task: string): boolean {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return false;
  return /\b(type|write|draft|message|send|calculate|compute|divide|times|multiply|plus|minus|result|navigate|go to|select|read)\b/i.test(
    normalized
  );
}

function taskLikelyTargetsDesktop(task: string): boolean {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return false;
  return /\b(desktop|window|windows|notepad|calculator|calc|file explorer|explorer|discord|slack|outlook|mail)\b/i.test(
    normalized
  );
}

function taskLikelyNeedsRichSurfaceContext(task: string, taskSpeedClass: BinaryTaskSpeedClass): boolean {
  if (taskSpeedClass === "chat_only") return false;
  if (looksLikeWebAutomationIntent(task)) return true;
  if (taskLikelyTargetsDesktop(task)) return true;
  if (taskLikelyRequiresDesktopVerification(task)) return true;
  // Deep code / workspace-heavy requests should not pay machine/browser context tax on first turn.
  if (taskSpeedClass === "deep_code") return false;
  return taskSpeedClass === "tool_heavy";
}

function taskLikelyReferencesWorkspaceArtifacts(task: string): boolean {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return false;
  if (
    /\b(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|readme\.md|tsconfig\.json|pyproject\.toml|requirements\.txt|dockerfile|makefile|\.gitignore|\.env)\b/i.test(
      normalized
    )
  ) {
    return true;
  }
  if (/\b([a-z0-9._-]+(?:\/[a-z0-9._-]+)+|[a-z0-9._-]+\.(?:json|md|markdown|yaml|yml|toml|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|ps1|sql|xml))\b/i.test(normalized)) {
    return true;
  }
  return /\b(create|edit|write|update|fix|implement|refactor|patch|modify|run tests?|test|verify|validation|lint|module|function|class|script)\b/i.test(
    normalized
  );
}

function taskLikelyTargetsBrowser(task: string): boolean {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return false;
  if (taskLikelyTargetsDesktop(task)) return false;
  if (taskLikelyRequiresWorkspaceAction(task) || taskLikelyReferencesWorkspaceArtifacts(task)) return false;
  return looksLikeWebAutomationIntent(task);
}

function resolvePromptLane(task: string, taskSpeedClass: BinaryTaskSpeedClass): BinaryPromptLane {
  if (taskLikelyTargetsDesktop(task)) return "desktop";
  if (taskLikelyTargetsBrowser(task)) return "browser";
  if (
    taskSpeedClass === "deep_code" ||
    taskLikelyRequiresWorkspaceAction(task) ||
    taskLikelyReferencesWorkspaceArtifacts(task)
  ) {
    return "coding";
  }
  return "chat";
}

function runLikelyDesktopTask(run: StoredHostRun): boolean {
  const policyLane = String(run.lastExecutionState?.policyLane || "").toLowerCase();
  if (policyLane === "desktop") return true;
  if (policyLane === "coding" || policyLane === "browser" || policyLane === "chat") return false;
  if (taskLikelyTargetsDesktop(run.request.task)) return true;
  if (run.toolResults.some((toolResult) => String(toolResult.name || "").startsWith("desktop_"))) return true;
  return false;
}

function shouldForceInitialWorkspaceBootstrap(input: {
  task: string;
  taskSpeedClass: BinaryTaskSpeedClass;
  workspaceRoot?: string;
  completionStatus?: "complete" | "incomplete";
  hasPendingToolCall: boolean;
  priorToolResultCount: number;
}): boolean {
  if (!input.workspaceRoot) return false;
  if (input.hasPendingToolCall) return false;
  if (input.priorToolResultCount > 0) return false;
  if (input.completionStatus !== "complete") return false;
  if (input.taskSpeedClass === "chat_only") return false;
  if (taskRequestsValidation(input.task)) return false;
  if (taskLikelyRequiresWorkspaceAction(input.task)) return true;
  return input.taskSpeedClass === "tool_heavy" || input.taskSpeedClass === "deep_code";
}

function buildWorkspaceBootstrapToolCall(input: {
  task: string;
  workspaceRoot: string;
  step: number;
  adapter: string;
}): PendingToolCall | null {
  const requiredArtifacts = extractRequiredArtifacts(input.task);
  for (const relativePath of requiredArtifacts) {
    const absolutePath = path.join(input.workspaceRoot, relativePath.replace(/\//g, path.sep));
    try {
      const stats = statSync(absolutePath);
      if (stats.isFile()) {
        return {
          step: input.step,
          adapter: input.adapter,
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `bootstrap_read_${randomUUID()}`,
            name: "read_file",
            kind: "observe",
            summary: `Read ${relativePath} to bootstrap deterministic execution.`,
            arguments: { path: relativePath },
          },
        };
      }
    } catch {
      // Try the next artifact.
    }
  }
  return {
    step: input.step,
    adapter: input.adapter,
    requiresClientExecution: true,
    createdAt: nowIso(),
    toolCall: {
      id: `bootstrap_list_${randomUUID()}`,
      name: "list_files",
      kind: "observe",
      summary: "Enumerate workspace files before planning the next deterministic action.",
      arguments: { query: "", limit: 200 },
    },
  };
}

type InteractiveTerminalShortcutPlan = {
  shell?: string;
  inputs: string[];
  objective: string;
};

function looksLikeInteractiveTerminalShortcut(task: string): boolean {
  const normalized = task.trim().toLowerCase();
  if (!normalized) return false;
  if (/\binteractive terminal\b/.test(normalized)) return true;
  if (/\bterminal session\b/.test(normalized)) return true;
  if (/\bpersistent shell\b/.test(normalized)) return true;
  if (/\binteractive shell\b/.test(normalized)) return true;
  if (/\bpython repl\b/.test(normalized)) return true;
  if (/\bnode repl\b/.test(normalized)) return true;
  return /\b(start|open|launch|use)\b/.test(normalized) && /\b(?:terminal|shell|repl)\b/.test(normalized);
}

function inferInteractiveTerminalShortcutShell(task: string): string | undefined {
  if (/\bpwsh(?:\.exe)?\b/i.test(task)) return "pwsh";
  if (/\bpowershell(?:\.exe)?\b/i.test(task)) return "powershell";
  if (/\bcmd(?:\.exe)?\b/i.test(task) || /\bcommand prompt\b/i.test(task)) return "cmd";
  return undefined;
}

function cleanInteractiveTerminalShortcutInput(input: string): string {
  const trimmed = input.trim();
  const quotedMatch = trimmed.match(/^['"`](.*)['"`]$/);
  return quotedMatch ? quotedMatch[1].trim() : trimmed;
}

function extractInteractiveTerminalShortcutPlan(task: string): InteractiveTerminalShortcutPlan | null {
  if (!looksLikeInteractiveTerminalShortcut(task)) return null;
  const inputs: string[] = [];
  const normalized = task.toLowerCase();
  if (/\bpython(?:\s+repl|\s+interactive|\s+shell)?\b/i.test(task)) {
    inputs.push("python");
  } else if (/\bnode(?:\s+repl|\s+interactive)?\b/i.test(task)) {
    inputs.push("node");
  }
  const runMatch = task.match(/\brun\s+(.+?)(?=(?:,|\s+and\s+(?:tell|say|report|show|then)\b|$))/i);
  const evalMatch = task.match(/\b(?:evaluate|execute)\s+(.+?)(?=(?:,|\s+and\s+(?:tell|say|report|show|then)\b|$))/i);
  const extraInputs = [runMatch?.[1], evalMatch?.[1]]
    .map((value) => (typeof value === "string" ? cleanInteractiveTerminalShortcutInput(value) : ""))
    .filter(Boolean);
  for (const candidate of extraInputs) {
    if (!inputs.some((existing) => existing.toLowerCase() === candidate.toLowerCase())) {
      inputs.push(candidate);
    }
  }
  const objective = normalized.includes("python repl")
    ? "Start a persistent Python REPL in the terminal."
    : normalized.includes("node repl")
      ? "Start a persistent Node REPL in the terminal."
      : "Start a persistent interactive terminal session and run the requested input.";
  return {
    shell: inferInteractiveTerminalShortcutShell(task),
    inputs,
    objective,
  };
}

function normalizeInteractiveTerminalShortcutOutput(output: string | undefined, recentInput?: string): string {
  const raw = String(output || "")
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\r/g, "")
    .trim();
  if (!raw) return "";
  const normalizedInput = String(recentInput || "").trim().toLowerCase();
  const lines = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (normalizedInput && trimmed.toLowerCase() === normalizedInput) return false;
      if (/^(?:PS\s+[A-Z]:\\.*>|[A-Z]:\\.*>|.*[>$#])$/i.test(trimmed) && trimmed.length <= 180) return false;
      return true;
    });
  return lines.join("\n").trim();
}

function isTurnBudgetTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /turn budget exceeded|timed out waiting|timed out/i.test(message);
}

function isTransientNetworkTurnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /transient_api_failure|fetch failed|econn|connection refused|enotfound|socket|network|service unavailable|bad gateway|gateway timeout/i.test(
    message
  );
}

function isRecoverableLocalGatewayTurnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  if (isTurnBudgetTimeoutError(error)) return true;
  return /provider_credits_exhausted|router_blocked|tool_schema_incompatible|transient_api_failure|unknown_provider_failure|usage limit has been reached|usage_limit_reached|insufficient_quota|rate.?limit|gateway unreachable|connection refused/i.test(
    message
  );
}

function markEscalation(run: StoredHostRun, stage: string, reason: string): void {
  run.lastExecutionState = {
    ...(run.lastExecutionState || {}),
    escalationStage: stage,
    escalationReason: reason,
  };
  if (run.timingState) {
    run.timingState.escalatedRoute = true;
    run.timingState.escalationCount = (run.timingState.escalationCount || 0) + 1;
  }
}

function buildEscalationBlockedEnvelope(input: {
  run: StoredHostRun;
  reason: string;
  nextDeterministicAction: string;
  stage: string;
}): AssistRunEnvelope {
  return attachHostMetadata(
    {
      adapter: "host_escalation_blocked",
      final:
        "Binary paused because this turn exceeded the fast execution budget and deterministic fallback routes were exhausted.",
      completionStatus: "incomplete",
      missingRequirements: [input.reason],
      unfinishedChecklistItems: [input.reason],
      whyBinaryIsBlocked: input.reason,
      closureSummary: "Binary could not safely complete this run inside the fast-turn policy.",
      lastMeaningfulProof:
        typeof input.run.finalEnvelope?.lastMeaningfulProof === "string" && input.run.finalEnvelope.lastMeaningfulProof.trim()
          ? input.run.finalEnvelope.lastMeaningfulProof
          : "No fresh proof was produced before the turn budget was exhausted.",
      progressState: {
        status: "blocked",
        stallReason: input.reason,
        nextDeterministicAction: input.nextDeterministicAction,
        startupPhase: "full_run",
        selectedSpeedProfile: normalizeSpeedProfile(input.run.request.speedProfile),
        selectedLatencyTier: input.run.lastExecutionState?.latencyTier,
        taskSpeedClass: classifyTaskSpeed(input.run.request.task),
      },
      escalationStage: input.stage,
      escalationReason: input.reason,
    },
    input.run
  );
}

function selectNextModelCandidate(
  current: BinaryUserConnectedModelCandidate | null,
  candidates: BinaryUserConnectedModelCandidate[],
  attemptedAliases: Set<string>
): BinaryUserConnectedModelCandidate | null {
  for (const candidate of candidates) {
    if (current && candidate.alias === current.alias) continue;
    if (attemptedAliases.has(candidate.alias)) continue;
    return candidate;
  }
  return null;
}

function isFreeModelCandidate(candidate: BinaryUserConnectedModelCandidate): boolean {
  const alias = String(candidate.alias || "").toLowerCase();
  const model = String(candidate.model || "").toLowerCase();
  const display = String(candidate.displayName || "").toLowerCase();
  return alias.includes(":free") || model.includes(":free") || display.includes(" free");
}

function resolveFixedPolicyCandidate(
  candidates: BinaryUserConnectedModelCandidate[],
  fixedModelAlias: string | undefined
): BinaryUserConnectedModelCandidate | null {
  if (!candidates.length) return null;
  const fixed = String(fixedModelAlias || "").trim().toLowerCase();
  if (fixed) {
    const exact = candidates.find((candidate) => String(candidate.alias || "").trim().toLowerCase() === fixed);
    if (exact) return exact;
    const scoped = candidates.find((candidate) => {
      const alias = String(candidate.alias || "").toLowerCase();
      const model = String(candidate.model || "").toLowerCase();
      const display = String(candidate.displayName || "").toLowerCase();
      return alias.includes(fixed) || model.includes(fixed) || display.includes(fixed);
    });
    if (scoped) return scoped;
  }
  return candidates.find((candidate) => isFreeModelCandidate(candidate)) || candidates[0] || null;
}

function resolvePolicyFirstTurnBudgetMs(
  policy: BinaryOrchestrationPolicy,
  taskSpeedClass: BinaryTaskSpeedClass,
  task: string
): number {
  if (taskLikelyNeedsTerminalRuntime(task)) {
    return Math.max(policy.latencyBudgetsMs.deepCode, 45_000);
  }
  if (taskSpeedClass === "deep_code") return policy.latencyBudgetsMs.deepCode;
  if (taskLikelyTargetsDesktop(task)) return policy.latencyBudgetsMs.desktop;
  return policy.latencyBudgetsMs.interactive;
}

function taskLikelyNeedsTerminalRuntime(task: string): boolean {
  return /\b(terminal|shell|command(?:\s+line)?|run(?:\s+the)?\s+tests?|npm\s+test|pnpm\s+test|yarn\s+test|lint|build)\b/i.test(
    String(task || "")
  );
}

function buildGatewayExecutionHints(input: {
  run: StoredHostRun;
  candidate: BinaryUserConnectedModelCandidate | null;
  orchestrationPolicy: BinaryOrchestrationPolicy;
  taskSpeedClass: BinaryTaskSpeedClass;
  initialTurn: boolean;
}): {
  adapterMode: BinaryAdapterMode;
  latencyPolicy: BinaryLatencyPolicy;
  timeoutPolicy: BinaryTimeoutPolicy;
  modelRoutingMode: BinaryModelRoutingMode;
  fixedModelAlias?: string;
  fallbackEnabled: boolean;
  budgetProfile: string;
  firstTurnBudgetMs?: number;
  smallModelForced: boolean;
  policyLane: BinaryPromptLane;
  terminalBackendMode: BinaryTerminalBackendMode;
  requireNativeTerminalTool: boolean;
  terminalStrictMode: boolean;
} {
  const policy = input.orchestrationPolicy;
  const policyLane = resolvePromptLane(input.run.request.task, input.taskSpeedClass);
  const configuredDetachedCapMs = Math.max(
    5_000,
    Math.round(toFinitePositiveNumber(policy.detachedFirstTurnBudgetMs) || FORCED_SMALL_MODEL_FIRST_TURN_BUDGET_MS)
  );
  const laneBudgetMs = resolvePolicyFirstTurnBudgetMs(policy, input.taskSpeedClass, input.run.request.task);
  const detachedStrictLatencyLane = policyLane === "desktop" || policyLane === "browser";
  const firstTurnBudgetMs =
    input.run.request.detach === true && detachedStrictLatencyLane
      ? Math.min(laneBudgetMs, configuredDetachedCapMs)
      : laneBudgetMs;
  const modelRoutingMode = policy.modelRoutingMode;
  const fixedModelAlias = typeof policy.fixedModelAlias === "string" && policy.fixedModelAlias.trim() ? policy.fixedModelAlias.trim() : undefined;
  const smallModelForced =
    modelRoutingMode === "single_fixed_free" || isSmallModelForcedCandidate(input.candidate, input.orchestrationPolicy);
  const adapterMode: BinaryAdapterMode =
    smallModelForced && (policyLane === "desktop" || policyLane === "browser" || policyLane === "chat")
      ? "force_binary_tool_adapter"
      : "auto";
  const detachedForced = input.run.request.detach === true && detachedStrictLatencyLane;
  const budgetProfile = detachedForced
    ? `single_fixed_detached_${Math.round(firstTurnBudgetMs / 1000)}s`
    : policyLane === "coding"
      ? `single_fixed_deep_code_${Math.round(firstTurnBudgetMs / 1000)}s`
      : policyLane === "desktop"
        ? `single_fixed_desktop_${Math.round(firstTurnBudgetMs / 1000)}s`
        : policyLane === "browser"
        ? `single_fixed_browser_${Math.round(firstTurnBudgetMs / 1000)}s`
        : `single_fixed_interactive_${Math.round(firstTurnBudgetMs / 1000)}s`;
  const terminalStrictMode =
    policy.terminalBackendMode === "strict_openhands_native" &&
    policy.requireNativeTerminalTool === true &&
    (policyLane === "coding" || taskLikelyNeedsTerminalRuntime(input.run.request.task));
  return {
    adapterMode,
    latencyPolicy: detachedForced ? "detached_15s_cap" : "default",
    timeoutPolicy: detachedForced
      ? "detached_no_timeout_retry_single_non_timeout_fallback"
      : "default_retry",
    modelRoutingMode,
    ...(fixedModelAlias ? { fixedModelAlias } : {}),
    fallbackEnabled: policy.fallbackEnabled === true,
    budgetProfile,
    ...(input.initialTurn
      ? {
          firstTurnBudgetMs,
        }
      : {}),
    smallModelForced,
    policyLane,
    terminalBackendMode: policy.terminalBackendMode,
    requireNativeTerminalTool: terminalStrictMode,
    terminalStrictMode,
  };
}

function withEnvelopeLatency(
  envelope: AssistRunEnvelope,
  latencyMs: number,
  providerOnly = false
): AssistRunEnvelope {
  const rounded = Math.max(0, Math.round(latencyMs));
  return {
    ...envelope,
    ...(providerOnly ? {} : { plannerLatencyMs: envelope.plannerLatencyMs ?? rounded }),
    providerLatencyMs: envelope.providerLatencyMs ?? rounded,
  };
}

function resolveTerminalRuntimeMetadata(input: {
  runtimeStatus: OpenHandsRuntimeStatus | null | undefined;
  terminalStrictMode: boolean;
}): {
  terminalBackend: "openhands_native" | "blocked";
  nativeTerminalAvailable: boolean;
  terminalHealthReason?: string;
} {
  const runtimeStatus = input.runtimeStatus;
  const terminalHealth = resolveNativeTerminalAvailability({
    supportedTools: Array.isArray(runtimeStatus?.supportedTools) ? runtimeStatus.supportedTools : [],
    degradedReasons: Array.isArray(runtimeStatus?.degradedReasons) ? runtimeStatus.degradedReasons : [],
  });
  const terminalBackend: "openhands_native" | "blocked" =
    input.terminalStrictMode && !terminalHealth.nativeTerminalAvailable ? "blocked" : "openhands_native";
  return {
    terminalBackend,
    nativeTerminalAvailable: terminalHealth.nativeTerminalAvailable,
    ...(terminalHealth.terminalHealthReason ? { terminalHealthReason: terminalHealth.terminalHealthReason } : {}),
  };
}

function isInfrastructureStatusMessage(message: string): boolean {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return [
    "binary host accepted the request.",
    "binary host is contacting the hosted assist transport.",
    "binary host retrying a transient hosted transport failure.",
    "binary host is falling back to the local openhands gateway because the hosted assist transport is temporarily unavailable.",
    "binary host received the initial assist response.",
    "binary host completed the run.",
  ].includes(normalized);
}

function setTimingOnce(
  run: StoredHostRun,
  key: "firstVisibleTextAt" | "firstToolRequestAt" | "firstToolResultAt" | "finalAt",
  at: string
): void {
  if (!run.timingState) return;
  if (!run.timingState[key]) {
    run.timingState[key] = at;
  }
}

function buildResumeToken(): string {
  return randomUUID().replace(/-/g, "");
}

function buildHostSupportedTools(workspaceRoot?: string): string[] {
  return [
    ...HOST_BINARY_TOOLS,
    ...(workspaceRoot ? [...HOST_WORKSPACE_TOOLS, ...HOST_REPO_TOOLS] : []),
    ...HOST_BROWSER_TOOLS,
    ...HOST_DESKTOP_TOOLS,
    ...HOST_WORLD_TOOLS,
  ];
}

function normalizeWorkspacePath(input: string): string {
  return path.resolve(input);
}

function debugHostProgress(runId: string, message: string): void {
  if (String(process.env.BINARY_HOST_DEBUG_PROGRESS || "").trim() !== "1") return;
  console.log(`[host-debug:${runId}] ${message}`);
}

function normalizeOptionalPath(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? normalizeWorkspacePath(input) : undefined;
}

function defaultMachineRootPath(): string {
  return normalizeWorkspacePath(os.homedir());
}

function resolveMachineRootPath(preferences: BinaryHostPreferences, requestedPath?: string): string {
  return normalizeOptionalPath(requestedPath) || normalizeOptionalPath(preferences.machineRootPath) || defaultMachineRootPath();
}

function isSubpathOf(parentPath: string, candidatePath: string): boolean {
  const resolvedParent = normalizeWorkspacePath(parentPath);
  const resolvedCandidate = normalizeWorkspacePath(candidatePath);
  if (resolvedParent === resolvedCandidate) return true;
  const relative = path.relative(resolvedParent, resolvedCandidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function inferFocusedRoots(input: {
  preferences: BinaryHostPreferences;
  machineRootPath?: string;
  workspaceRoot?: string;
  focusWorkspaceRoot?: string;
  focusRepoRoot?: string;
}): {
  machineRootPath: string;
  focusedWorkspaceRoot?: string;
  focusedRepoRoot?: string;
  rootResolutionReason: string;
} {
  const machineRootPath = resolveMachineRootPath(input.preferences, input.machineRootPath);
  const explicitFocusWorkspace = normalizeOptionalPath(input.focusWorkspaceRoot);
  const explicitWorkspace = normalizeOptionalPath(input.workspaceRoot);
  const preferredFocusWorkspace = normalizeOptionalPath(input.preferences.focusWorkspaceRoot);
  const focusedWorkspaceRoot = explicitFocusWorkspace || explicitWorkspace || preferredFocusWorkspace;
  const explicitFocusRepo = normalizeOptionalPath(input.focusRepoRoot);
  const preferredFocusRepo = normalizeOptionalPath(input.preferences.focusRepoRoot);
  const focusedRepoRoot = explicitFocusRepo || preferredFocusRepo || focusedWorkspaceRoot;
  const reasonParts = [`machine_home=${machineRootPath}`];
  if (explicitFocusWorkspace) reasonParts.push("focus_workspace=request.focusWorkspaceRoot");
  else if (explicitWorkspace) reasonParts.push("focus_workspace=request.workspaceRoot");
  else if (preferredFocusWorkspace) reasonParts.push("focus_workspace=preferences.focusWorkspaceRoot");
  else reasonParts.push("focus_workspace=none");
  if (explicitFocusRepo) reasonParts.push("focus_repo=request.focusRepoRoot");
  else if (preferredFocusRepo) reasonParts.push("focus_repo=preferences.focusRepoRoot");
  else if (focusedWorkspaceRoot) reasonParts.push("focus_repo=fallback_workspace_root");
  else reasonParts.push("focus_repo=none");
  if (focusedWorkspaceRoot && !isSubpathOf(machineRootPath, focusedWorkspaceRoot)) {
    reasonParts.push("focus_workspace=outside_machine_home");
  }
  return {
    machineRootPath,
    focusedWorkspaceRoot,
    focusedRepoRoot,
    rootResolutionReason: reasonParts.join(" | "),
  };
}

function normalizeRelativeTaskPath(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/[),.;:]+$/g, "");
}

function isBinaryTool(name: string): boolean {
  return (HOST_BINARY_TOOLS as readonly string[]).includes(name);
}

function isBinaryMutationTool(name: string): boolean {
  return name === "patch_binary" || name === "write_binary_file";
}

function isBinaryInspectTool(name: string): boolean {
  return isBinaryTool(name) && !isBinaryMutationTool(name);
}

function getBinaryTargetPath(argumentsValue: Record<string, unknown>): string {
  return typeof argumentsValue.path === "string" ? argumentsValue.path.trim() : "";
}

function isBinaryRawDevicePath(targetPath: string): boolean {
  const normalized = String(targetPath || "").trim();
  return /^\\\\\.\\/.test(normalized) || /^\\\\\?\\GLOBALROOT\\/i.test(normalized) || /^\/dev\//.test(normalized);
}

function isBinaryProtectedPath(targetPath: string): boolean {
  const normalized = path.resolve(String(targetPath || "").trim());
  if (process.platform === "win32") {
    const roots = [
      process.env.SystemRoot || "C:\\Windows",
      process.env.ProgramFiles || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      process.env.ProgramData || "C:\\ProgramData",
    ].map((item) => path.resolve(item));
    return roots.some((rootPath) => {
      const relative = path.relative(rootPath, normalized);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
  }
  return ["/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/etc", "/private/etc"]
    .map((item) => path.resolve(item))
    .some((rootPath) => {
      const relative = path.relative(rootPath, normalized);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
}

function classifyBinaryTargetRisk(targetPath: string): "low" | "high" | "critical" {
  const normalized = String(targetPath || "").trim();
  const extension = path.extname(normalized).toLowerCase();
  if (
    isBinaryRawDevicePath(normalized) ||
    isBinaryProtectedPath(normalized) ||
    [".iso", ".img", ".dmg", ".vhd", ".vhdx", ".qcow", ".qcow2", ".uf2", ".rom", ".fw", ".firmware", ".hex"].includes(extension)
  ) {
    return "critical";
  }
  if (
    [
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".msi",
      ".app",
      ".bat",
      ".cmd",
      ".ps1",
      ".sh",
      ".py",
      ".jar",
    ].includes(extension)
  ) {
    return "high";
  }
  return "low";
}

function taskRequestsValidation(task: string): boolean {
  return /\b(run(?:\s+the)?\s+tests?|tests?\s+(?:until\s+they\s+pass|suite|pass)|test suite|validate|validation|lint|verify|proof)\b/i.test(
    task
  );
}

function extractRequestedProjectRoot(task: string): string | null {
  const patterns = [
    /\b(?:project|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
    /\bnamed\s+([A-Za-z0-9._-]+)\s+in\s+the\s+current\s+workspace\b/i,
    /\bcreate\s+(?:a\s+new\s+)?(?:plain\s+\w+\s+)?(?:project\s+folder|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match?.[1]) return normalizeRelativeTaskPath(match[1]);
  }
  return null;
}

function extractRequiredArtifacts(task: string): string[] {
  const projectRoot = extractRequestedProjectRoot(task);
  const seen = new Set<string>();
  const out: string[] = [];

  if (projectRoot) {
    seen.add(projectRoot);
    out.push(projectRoot);
  }

  const tokenPattern = /\b([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)\b/g;
  for (const match of task.matchAll(tokenPattern)) {
    const raw = normalizeRelativeTaskPath(match[1] || "");
    if (!raw) continue;
    const normalized =
      projectRoot && raw !== projectRoot && !raw.startsWith(`${projectRoot}/`) ? `${projectRoot}/${raw}` : raw;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

function normalizeMachineSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOpenTargetQuery(query: string): string {
  return String(query || "")
    .replace(/\b(?:please|my|the|a|an)\b/gi, " ")
    .replace(/\b(?:folder|directory|app|application)\b/gi, " ")
    .replace(/<3/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFolderAlias(value: string): string {
  return normalizeMachineSearchText(value);
}

const KNOWN_FOLDER_TARGETS: Array<{ aliases: string[]; resolve: () => string }> = [
  {
    aliases: ["home", "machine home", "profile", "user profile"],
    resolve: () => os.homedir(),
  },
  {
    aliases: ["desktop", "desktop folder"],
    resolve: () => path.join(os.homedir(), "Desktop"),
  },
  {
    aliases: ["documents", "document", "docs"],
    resolve: () => path.join(os.homedir(), "Documents"),
  },
  {
    aliases: ["downloads", "download", "downloads folder"],
    resolve: () => path.join(os.homedir(), "Downloads"),
  },
  {
    aliases: ["pictures", "picture", "photos", "photo", "images"],
    resolve: () => path.join(os.homedir(), "Pictures"),
  },
  {
    aliases: ["music", "songs", "audio"],
    resolve: () => path.join(os.homedir(), "Music"),
  },
  {
    aliases: ["videos", "video", "movies"],
    resolve: () => path.join(os.homedir(), "Videos"),
  },
];

const KNOWN_FOLDER_ALIAS_RESOLVERS = new Map<string, () => string>();
for (const target of KNOWN_FOLDER_TARGETS) {
  for (const alias of target.aliases) {
    KNOWN_FOLDER_ALIAS_RESOLVERS.set(normalizeFolderAlias(alias), target.resolve);
  }
}

const DIRECT_FOLDER_RESOLUTION_CACHE_MAX = 128;
const directFolderResolutionCache = new Map<string, string>();

function readCachedFolderResolution(query: string): string | null {
  const key = normalizeFolderAlias(query);
  if (!key) return null;
  return directFolderResolutionCache.get(key) ?? null;
}

function writeCachedFolderResolution(query: string, resolvedPath: string): void {
  const key = normalizeFolderAlias(query);
  const normalizedPath = normalizeWorkspacePath(resolvedPath);
  if (!key || !normalizedPath) return;
  if (directFolderResolutionCache.has(key)) {
    directFolderResolutionCache.delete(key);
  }
  directFolderResolutionCache.set(key, normalizedPath);
  while (directFolderResolutionCache.size > DIRECT_FOLDER_RESOLUTION_CACHE_MAX) {
    const oldestKey = directFolderResolutionCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    directFolderResolutionCache.delete(oldestKey);
  }
}

function resolveKnownFolderAliasTarget(query: string): string | null {
  const resolver = KNOWN_FOLDER_ALIAS_RESOLVERS.get(normalizeFolderAlias(query));
  if (!resolver) return null;
  return normalizeWorkspacePath(resolver());
}

function looksLikeFolderIntent(query: string): boolean {
  const cleaned = cleanOpenTargetQuery(query);
  if (!cleaned) return false;
  const normalized = normalizeFolderAlias(cleaned);
  if (!normalized) return false;
  if (/^[a-z]:\\?$/i.test(cleaned) || /^[a-z]:[\\/]/i.test(cleaned) || /[\\/]/.test(cleaned)) return true;
  if (/\b[a-z]\s+drive\b/i.test(cleaned)) return true;
  if (KNOWN_FOLDER_ALIAS_RESOLVERS.has(normalized)) return true;
  const tokens = normalized.split(" ").filter(Boolean);
  const folderSignals = new Set([
    "folder",
    "directory",
    "drive",
    "desktop",
    "downloads",
    "download",
    "documents",
    "document",
    "docs",
    "pictures",
    "picture",
    "photos",
    "videos",
    "video",
    "music",
    "home",
    "workspace",
    "repo",
    "project",
    "path",
  ]);
  return tokens.some((token) => folderSignals.has(token));
}

function extractOpenFolderQuery(task: string): string | null {
  const normalized = String(task || "").trim();
  if (!normalized) return null;
  const folderFirst = normalized.match(
    /^(?:please\s+)?(?:open|show|focus|launch)\s+(.+?)\s+(?:folder|directory)(?:\s+please)?(?:\s*<3)?$/i
  );
  if (folderFirst?.[1]) return cleanOpenTargetQuery(folderFirst[1]);
  const folderLast = normalized.match(
    /^(?:please\s+)?(?:open|show|focus|launch)\s+(?:the\s+)?(?:folder|directory)\s+(.+?)(?:\s+please)?(?:\s*<3)?$/i
  );
  if (folderLast?.[1]) return cleanOpenTargetQuery(folderLast[1]);
  return null;
}

function extractDirectOpenTarget(task: string): string | null {
  const normalized = String(task || "").trim();
  if (!normalized) return null;
  const direct = normalized.match(/^(?:please\s+)?(?:open|show|focus|launch)\s+(.+?)(?:\s+please)?(?:\s*<3)?$/i);
  if (!direct?.[1]) return null;
  return cleanOpenTargetQuery(direct[1]);
}

async function openPathInShell(targetPath: string): Promise<string> {
  const resolved = normalizeWorkspacePath(targetPath);
  if (process.platform === "win32") {
    const child = spawn("explorer.exe", [resolved], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return `explorer.exe "${resolved}"`;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", [resolved], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return `open "${resolved}"`;
  }
  const child = spawn("xdg-open", [resolved], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return `xdg-open "${resolved}"`;
}

type FolderSearchMatch = {
  path: string;
  score: number;
};

async function listExistingDriveRoots(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const letters = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const roots: string[] = [];
  for (const letter of letters) {
    const candidate = `${letter}:\\`;
    if (await pathExists(candidate)) roots.push(candidate);
  }
  return roots;
}

function buildFolderNameVariants(query: string): string[] {
  const base = cleanOpenTargetQuery(query).trim();
  if (!base) return [];
  const compact = base.replace(/\s+/g, "");
  return Array.from(new Set([base, compact].filter(Boolean)));
}

async function resolveDirectFolderTarget(query: string): Promise<string | null> {
  const cleaned = cleanOpenTargetQuery(query).trim();
  if (!cleaned) return null;

  const cached = readCachedFolderResolution(cleaned);
  if (cached && (await pathExists(cached))) {
    return cached;
  }

  const normalized = normalizeWorkspacePath(cleaned);

  if (/^[a-zA-Z]:[\\/].*/.test(normalized) && (await pathExists(normalized))) {
    writeCachedFolderResolution(cleaned, normalized);
    return normalized;
  }

  if (/^[a-zA-Z]:\\?$/.test(normalized) && (await pathExists(normalized.endsWith("\\") ? normalized : `${normalized}\\`))) {
    const resolved = normalized.endsWith("\\") ? normalized : `${normalized}\\`;
    writeCachedFolderResolution(cleaned, resolved);
    return resolved;
  }

  const driveMatch = cleaned.match(/\b([a-z])(?:\s*:?|\s+drive)\b/i);
  if (driveMatch?.[1]) {
    const driveRoot = `${driveMatch[1].toUpperCase()}:\\`;
    if (await pathExists(driveRoot)) {
      writeCachedFolderResolution(cleaned, driveRoot);
      return driveRoot;
    }
  }

  const aliasPath = resolveKnownFolderAliasTarget(cleaned);
  if (aliasPath && (await pathExists(aliasPath))) {
    writeCachedFolderResolution(cleaned, aliasPath);
    return aliasPath;
  }

  return null;
}

async function findExactFolderMatch(query: string, roots: string[]): Promise<string | null> {
  const variants = buildFolderNameVariants(query);
  for (const root of roots) {
    for (const variant of variants) {
      const candidate = path.join(root, variant);
      if (await pathExists(candidate)) {
        return normalizeWorkspacePath(candidate);
      }
    }
  }
  return null;
}

async function searchFolderMatch(rootPath: string, query: string, maxDepth = 6, maxDirs = 3000): Promise<string | null> {
  if (!(await pathExists(rootPath))) return null;
  const normalizedQuery = normalizeMachineSearchText(query);
  if (!normalizedQuery) return null;
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const queue: Array<{ dir: string; depth: number }> = [{ dir: normalizeWorkspacePath(rootPath), depth: 0 }];
  const seen = new Set<string>();
  let scanned = 0;
  let best: FolderSearchMatch | null = null;

  while (queue.length && scanned < maxDirs) {
    const next = queue.shift()!;
    if (seen.has(next.dir)) continue;
    seen.add(next.dir);
    scanned += 1;
    const entries = await fs.readdir(next.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(next.dir, entry.name);
      const normalizedName = normalizeMachineSearchText(entry.name);
      let score = 0;
      if (normalizedName === normalizedQuery) score += 120;
      if (normalizedName.startsWith(normalizedQuery)) score += 85;
      if (normalizedName.includes(normalizedQuery)) score += 65;
      for (const token of queryTokens) {
        if (normalizedName.includes(token)) score += 8;
      }
      score -= next.depth * 6;
      if (/\\appdata\\/i.test(fullPath)) score -= 40;
      if (/\\programdata\\/i.test(fullPath)) score -= 25;
      if (/\\renpy\\/i.test(fullPath)) score -= 20;
      if (!best || score > best.score) {
        if (score > 0) best = { path: fullPath, score };
      }
      if (next.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: next.depth + 1 });
      }
    }
  }

  return best?.path || null;
}

async function searchExactFolderNameMatch(rootPath: string, query: string, maxDepth = 5, maxDirs = 2500): Promise<string | null> {
  if (!(await pathExists(rootPath))) return null;
  const normalizedVariants = new Set(
    buildFolderNameVariants(query)
      .map((value) => normalizeMachineSearchText(value))
      .filter(Boolean)
  );
  if (!normalizedVariants.size) return null;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: normalizeWorkspacePath(rootPath), depth: 0 }];
  const seen = new Set<string>();
  let scanned = 0;
  let best: FolderSearchMatch | null = null;

  while (queue.length && scanned < maxDirs) {
    const next = queue.shift()!;
    if (seen.has(next.dir)) continue;
    seen.add(next.dir);
    scanned += 1;
    const entries = await fs.readdir(next.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(next.dir, entry.name);
      const normalizedName = normalizeMachineSearchText(entry.name);
      if (normalizedVariants.has(normalizedName)) {
        let score = 220 - next.depth * 14;
        if (/\\appdata\\/i.test(fullPath)) score -= 90;
        if (/\\programdata\\/i.test(fullPath)) score -= 45;
        if (/\\renpy\\/i.test(fullPath)) score -= 40;
        if (!best || score > best.score) {
          best = { path: fullPath, score };
        }
      }
      if (next.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: next.depth + 1 });
      }
    }
  }

  return best?.path || null;
}

async function resolveLikelyFolderPath(
  query: string,
  run: StoredHostRun
): Promise<string | null> {
  const cleanedQuery = cleanOpenTargetQuery(query);
  if (!cleanedQuery) return null;

  const cached = readCachedFolderResolution(cleanedQuery);
  if (cached && (await pathExists(cached))) return cached;

  const directMatch = await resolveDirectFolderTarget(cleanedQuery);
  if (directMatch) {
    writeCachedFolderResolution(cleanedQuery, directMatch);
    return directMatch;
  }

  const driveRoots = await listExistingDriveRoots();
  const exactRoots = [
    ...driveRoots,
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam", "steamapps", "common"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam", "steamapps", "common"),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  const exactMatch = await findExactFolderMatch(cleanedQuery, exactRoots);
  if (exactMatch) {
    writeCachedFolderResolution(cleanedQuery, exactMatch);
    return exactMatch;
  }

  const exactSearchRoots = [
    run.focusedRepoRoot,
    run.focusedWorkspaceRoot,
    run.workspaceRoot,
    run.machineRootPath,
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads"),
    ...driveRoots,
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  for (const root of exactSearchRoots) {
    const exactNameMatch = await searchExactFolderNameMatch(root, cleanedQuery);
    if (exactNameMatch) {
      const normalizedPath = normalizeWorkspacePath(exactNameMatch);
      writeCachedFolderResolution(cleanedQuery, normalizedPath);
      return normalizedPath;
    }
  }

  const roots = [
    run.focusedRepoRoot,
    run.focusedWorkspaceRoot,
    run.workspaceRoot,
    run.machineRootPath,
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads"),
    ...driveRoots,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam", "steamapps", "common"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam", "steamapps", "common"),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  for (const root of roots) {
    const match = await searchFolderMatch(root, cleanedQuery);
    if (match) {
      const normalizedPath = normalizeWorkspacePath(match);
      writeCachedFolderResolution(cleanedQuery, normalizedPath);
      return normalizedPath;
    }
  }
  return null;
}

async function tryDirectMachineShortcut(input: {
  run: StoredHostRun;
  preferences: BinaryHostPreferences;
  taskSpeedClass: BinaryTaskSpeedClass;
  speedProfile: BinaryAssistSpeedProfile;
  machineAutonomyController: MachineAutonomyController;
  attachedRes?: ServerResponse | null;
}): Promise<boolean> {
  const { run, preferences, taskSpeedClass, speedProfile, machineAutonomyController, attachedRes } = input;
  if (taskSpeedClass !== "simple_action") return false;

  const task = String(run.request.task || "").trim();
  if (looksLikeWebAutomationIntent(task)) return false;
  const parsedAction = parseMachineAutonomyTask(task);
  const folderQuery = extractOpenFolderQuery(task);
  const directTargetQuery = extractDirectOpenTarget(task);
  const interactiveTerminalPlan = extractInteractiveTerminalShortcutPlan(task);
  const orchestrationPolicy = normalizeOrchestrationPolicy(
    preferences.orchestrationPolicy,
    defaultOrchestrationPolicy()
  );
  const strictTerminalShortcutBlocked =
    orchestrationPolicy.terminalBackendMode === "strict_openhands_native" &&
    orchestrationPolicy.requireNativeTerminalTool === true;
  const canOpenApps =
    preferences.machineAutonomy.allowAppLaunch &&
    (preferences.machineAutonomy.enabled || preferences.machineTrustMode === "full_machine_mutate");
  const canOpenFiles =
    preferences.machineAutonomy.allowFileOpen &&
    (preferences.machineAutonomy.enabled || preferences.machineTrustMode === "full_machine_mutate");
  const canUseInteractiveTerminal =
    Boolean(run.workspaceRoot || run.focusedWorkspaceRoot) ||
    preferences.machineAutonomy.enabled ||
    preferences.machineTrustMode === "full_machine_mutate";
  const tryVerifiedFolderOpenShortcut = async (targetPath: string): Promise<boolean> => {
    const executionController = new AutonomyExecutionController(preferences.machineAutonomy);
    const focusLease = sanitizeFocusLease(activeFocusLease);
    if (focusLease) {
      const remainingMs = Math.max(500, new Date(focusLease.expiresAt).getTime() - Date.now());
      executionController.updateFocusLease({
        surface: focusLease.surface,
        source: focusLease.source,
        leaseMs: remainingMs,
        active: true,
      });
    }
    const desktopExecutor = new DesktopToolExecutor(
      machineAutonomyController,
      preferences.machineAutonomy,
      executionController,
      nativeAppRuntime,
      run.request.task,
      {
        autoCloseLaunchedApps: run.request.detach === true,
      }
    );
    const pendingToolCall: PendingToolCall = {
      step: run.toolResults.length + 1,
      adapter: "host_machine_shortcut",
      requiresClientExecution: false,
      createdAt: nowIso(),
      toolCall: {
        id: `desktop_shortcut_open_${Date.now().toString(36)}`,
        name: "desktop_open_app",
        kind: "mutate",
        summary: `Open ${targetPath} in File Explorer.`,
        arguments: {
          app: "File Explorer",
          path: targetPath,
          targetAppIntent: "File Explorer",
          verificationRequired: true,
        },
      },
      availableTools: [...HOST_DESKTOP_TOOLS],
    };
    await appendRunEvent(
      run,
      {
        event: "tool_request",
        data: enrichPendingToolCallForUi(run, preferences, pendingToolCall),
      },
      attachedRes
    );
    const toolResult = await desktopExecutor.execute(pendingToolCall);
    await appendSyntheticToolResult(run, toolResult, attachedRes);
    if (!toolResult.ok) {
      await emitHostStatus(
        run,
        `Binary couldn't verify opening ${path.basename(targetPath) || targetPath} directly, so it's continuing with the full flow.`,
        attachedRes,
        {
          shortcutKind: "open_folder",
          targetPath,
          verificationPassed: false,
        }
      );
      return false;
    }
    const completed = await tryCompleteDesktopRunFromProof(
      run,
      attachHostMetadata(
        {
          adapter: "host_machine_shortcut",
          final: `Opened ${targetPath}.`,
          completionStatus: "complete",
          pendingToolCall: null,
          missingRequirements: [],
          closureSummary: "Binary completed the folder-open request directly in the local machine lane.",
          lastMeaningfulProof: toolResult.summary,
          loopState: {
            stepCount: run.toolResults.length,
            mutationCount: 1,
            repairCount: 0,
            status: "completed",
            closurePhase: "complete",
          },
          progressState: {
            status: "completed",
            startupPhase: "fast_start",
            selectedSpeedProfile: speedProfile,
            selectedLatencyTier: "fast",
            taskSpeedClass,
          },
          receipt: {
            engine: "binary_host_shortcut",
            shortcutKind: "open_folder",
            targetPath,
          },
        },
        run
      ),
      "machine_shortcut_folder_open",
      attachedRes
    );
    if (!completed) {
      await emitHostStatus(
        run,
        `Binary couldn't confirm that ${path.basename(targetPath) || targetPath} actually opened, so it's falling back to the standard flow.`,
        attachedRes,
        {
          shortcutKind: "open_folder",
          targetPath,
          verificationPassed: false,
        }
      );
    }
    return completed;
  };

    try {
      if (interactiveTerminalPlan && canUseInteractiveTerminal) {
        if (strictTerminalShortcutBlocked) {
          await emitHostStatus(
            run,
            "Binary skipped the local terminal shortcut because strict OpenHands native terminal mode is enabled.",
            attachedRes,
            {
              shortcutKind: "interactive_terminal",
              blockedReason: "terminal_backend_unavailable_strict",
            }
          );
          return false;
        }
        await emitHostStatus(run, "Binary detected an explicit interactive terminal request and is starting it locally.", attachedRes, {
          shortcutKind: "interactive_terminal",
          shell: interactiveTerminalPlan.shell || "default",
          inputCount: interactiveTerminalPlan.inputs.length,
        });
        const cwd = run.workspaceRoot || run.focusedWorkspaceRoot || run.machineRootPath || process.cwd();
        const startCall: PendingToolCall = {
          step: run.toolResults.length + 1,
          adapter: "host_machine_shortcut",
          requiresClientExecution: false,
          toolCall: {
            id: `term_start_${Date.now().toString(36)}`,
            name: "terminal_start_session",
            arguments: {
              cwd,
              ...(interactiveTerminalPlan.shell ? { shell: interactiveTerminalPlan.shell } : {}),
              name: "Binary interactive terminal",
            },
            kind: "observe",
            summary: interactiveTerminalPlan.objective,
          },
          availableTools: [...HOST_WORKSPACE_TOOLS],
          createdAt: nowIso(),
        };
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: enrichPendingToolCallForUi(run, preferences, startCall),
          },
          attachedRes
        );
        const started = await interactiveTerminalRuntime.startSession({
          cwd,
          shell: interactiveTerminalPlan.shell,
          name: "Binary interactive terminal",
        });
        const startResult: ToolResult = {
          toolCallId: startCall.toolCall.id,
          name: "terminal_start_session",
          ok: true,
          summary: `Started interactive terminal session ${started.session.sessionId} in ${started.session.cwd}.`,
          data: {
            session: started.session,
            output: started.output,
            truncated: started.truncated,
            proof: {
              sessionId: started.session.sessionId,
              cwd: started.session.cwd,
              shell: started.session.shell,
            },
          },
          createdAt: nowIso(),
        };
        await appendSyntheticToolResult(run, startResult, attachedRes);

        let latestSession = started.session;
        let latestOutput = started.output;
        let latestInput = "";
        for (const terminalInput of interactiveTerminalPlan.inputs) {
          latestInput = terminalInput;
          const inputCall: PendingToolCall = {
            step: run.toolResults.length + 1,
            adapter: "host_machine_shortcut",
            requiresClientExecution: false,
            toolCall: {
              id: `term_send_${Date.now().toString(36)}_${run.toolResults.length + 1}`,
              name: "terminal_send_input",
              arguments: {
                sessionId: latestSession.sessionId,
                input: terminalInput,
              },
              kind: "mutate",
              summary: `Send input to interactive terminal session ${latestSession.sessionId}.`,
            },
            availableTools: [...HOST_WORKSPACE_TOOLS],
            createdAt: nowIso(),
          };
          await appendRunEvent(
            run,
            {
              event: "tool_request",
              data: enrichPendingToolCallForUi(run, preferences, inputCall),
            },
            attachedRes
          );
          const sent = await interactiveTerminalRuntime.sendInput({
            sessionId: latestSession.sessionId,
            input: terminalInput,
          });
          latestSession = sent.session;
          latestOutput = sent.output;
          const inputResult: ToolResult = {
            toolCallId: inputCall.toolCall.id,
            name: "terminal_send_input",
            ok: true,
            summary: sent.output.trim()
              ? `Interactive terminal produced output after input: ${truncateText(sent.output.trim(), 160) || ""}`
              : "Interactive terminal accepted the input and is idle.",
            data: {
              session: sent.session,
              output: sent.output,
              truncated: sent.truncated,
              proof: {
                sessionId: sent.session.sessionId,
                cwd: sent.session.cwd,
                shell: sent.session.shell,
              },
            },
            createdAt: nowIso(),
          };
          await appendSyntheticToolResult(run, inputResult, attachedRes);
        }

        const visibleOutput =
          normalizeInteractiveTerminalShortcutOutput(latestOutput, latestInput) ||
          normalizeInteractiveTerminalShortcutOutput(started.output);
        await emitHostStatus(
          run,
          `Binary started interactive terminal session ${latestSession.sessionId} directly from the local machine lane.`,
          attachedRes,
          {
            shortcutKind: "interactive_terminal",
            sessionId: latestSession.sessionId,
            shell: latestSession.shell,
            cwd: latestSession.cwd,
          }
        );
        run.finalEnvelope = attachHostMetadata(
          {
            adapter: "host_machine_shortcut",
            final: visibleOutput
              ? `Started an interactive terminal session and it printed:\n\n${visibleOutput}`
              : `Started interactive terminal session ${latestSession.sessionId} in ${latestSession.cwd}.`,
            completionStatus: "complete",
            pendingToolCall: null,
            missingRequirements: [],
            closureSummary: "Binary completed the interactive terminal request directly in the local machine lane.",
            lastMeaningfulProof: visibleOutput
              ? `Interactive terminal ${latestSession.sessionId} output:\n${visibleOutput}`
              : `Started interactive terminal session ${latestSession.sessionId} in ${latestSession.cwd}.`,
            loopState: {
              stepCount: run.toolResults.length,
              mutationCount: interactiveTerminalPlan.inputs.length,
              repairCount: 0,
              status: "completed",
              closurePhase: "complete",
            },
            progressState: {
              status: "completed",
              startupPhase: "fast_start",
              selectedSpeedProfile: speedProfile,
              selectedLatencyTier: "fast",
              taskSpeedClass,
            },
            receipt: {
              engine: "binary_host_shortcut",
              shortcutKind: "interactive_terminal",
              sessionId: latestSession.sessionId,
              cwd: latestSession.cwd,
              shell: latestSession.shell,
              inputs: interactiveTerminalPlan.inputs,
              outputPreview: visibleOutput || latestOutput || started.output,
            },
          },
          run
        );
        await finalizeRun(run, "completed", attachedRes);
        return true;
      }

      if (folderQuery && canOpenFiles) {
        const folderPath = await resolveLikelyFolderPath(folderQuery, run);
        if (folderPath) {
          return await tryVerifiedFolderOpenShortcut(folderPath);
        }
      }

      if (directTargetQuery && canOpenFiles) {
        const directFolderPath = await resolveDirectFolderTarget(directTargetQuery);
        if (directFolderPath) {
          return await tryVerifiedFolderOpenShortcut(directFolderPath);
        }
      }

      if (parsedAction?.kind === "launch_app" && canOpenApps) {
        const query = cleanOpenTargetQuery(parsedAction.query);
        if (query) {
        const folderIntent = looksLikeFolderIntent(query);
        if (folderIntent && canOpenFiles) {
          const folderPath = await resolveLikelyFolderPath(query, run);
          if (folderPath) {
            return await tryVerifiedFolderOpenShortcut(folderPath);
          }
          return false;
        }
        const launched = await machineAutonomyController.launchApp(query);
        await emitHostStatus(run, `Binary opened ${launched.app.name} directly from the local machine lane.`, attachedRes, {
          shortcutKind: "open_app",
          appName: launched.app.name,
        });
        run.finalEnvelope = attachHostMetadata(
          {
            adapter: "host_machine_shortcut",
            final: `Opened ${launched.app.name}.`,
            completionStatus: "complete",
            pendingToolCall: null,
            missingRequirements: [],
            closureSummary: "Binary completed the app-open request directly in the local machine lane.",
            lastMeaningfulProof: launched.summary,
            loopState: {
              stepCount: 1,
              mutationCount: 0,
              repairCount: 0,
              status: "completed",
              closurePhase: "complete",
            },
            progressState: {
              status: "completed",
              startupPhase: "fast_start",
              selectedSpeedProfile: speedProfile,
              selectedLatencyTier: "fast",
              taskSpeedClass,
            },
            receipt: {
              engine: "binary_host_shortcut",
              shortcutKind: "open_app",
              appName: launched.app.name,
              command: launched.command,
              appSource: launched.app.source,
            },
          },
          run
        );
        await finalizeRun(run, "completed", attachedRes);
        return true;
      }
    }
  } catch (error) {
    if (interactiveTerminalPlan) {
      await emitHostStatus(
        run,
        `Binary could not start the direct interactive terminal shortcut. Cause: ${error instanceof Error ? error.message : String(error)}`,
        attachedRes,
        {
          shortcutKind: "interactive_terminal",
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
    debugHostProgress(run.id, `machine shortcut skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  return false;
}

async function hasGitWorkspace(workspaceRoot: string): Promise<boolean> {
  return pathExists(path.join(workspaceRoot, ".git"));
}

function isOptionalGitValidationCommand(command: string): boolean {
  return /^git\s+diff\s+--check\s+--\s+/i.test(command.trim());
}

function hasSuccessfulCommandProof(run: StoredHostRun): boolean {
  return run.toolResults.some((toolResult) => toolResult.name === "run_command" && toolResult.ok);
}

function isWorkspaceMutationToolName(name: string): boolean {
  return (
    name === "edit" ||
    name === "write_file" ||
    name === "mkdir" ||
    name === "patch_binary" ||
    name === "write_binary_file"
  );
}

function hasSuccessfulWorkspaceMutationProof(run: StoredHostRun): boolean {
  return run.toolResults.some((toolResult) => toolResult.ok && isWorkspaceMutationToolName(toolResult.name));
}

function hasFailedValidationCommandProof(run: StoredHostRun): boolean {
  return run.toolResults.some((toolResult) => toolResult.name === "run_command" && !toolResult.ok);
}

function taskLikelyRequiresBrowserVerification(task: string): boolean {
  return /\b(verify|verification|confirm|proof|result|title|url|extract|login|form|submit|complete)\b/i.test(
    String(task || "")
  );
}

function runLikelyBrowserTask(run: StoredHostRun): boolean {
  const policyLane = String(run.lastExecutionState?.policyLane || "").toLowerCase();
  if (policyLane === "browser") return true;
  if (policyLane === "coding" || policyLane === "desktop" || policyLane === "chat") return false;
  if (taskLikelyTargetsBrowser(run.request.task)) return true;
  if (run.toolResults.some((toolResult) => String(toolResult.name || "").startsWith("browser_"))) return true;
  return false;
}

function getLatestBrowserMetadataValue(run: StoredHostRun, key: string): string | undefined {
  for (let index = run.toolResults.length - 1; index >= 0; index -= 1) {
    const toolResult = run.toolResults[index];
    if (!toolResult || !String(toolResult.name || "").startsWith("browser_")) continue;
    const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
    if (!data) continue;
    if (typeof data[key] === "string" && String(data[key]).trim()) {
      return String(data[key]).trim();
    }
  }
  return undefined;
}

function evaluateBrowserProofState(run: StoredHostRun): {
  required: boolean;
  requiresVerification: boolean;
  hasActionProof: boolean;
  hasVerificationProof: boolean;
  targetOrigin?: string;
  pageLeaseId?: string;
} {
  const browserToolResults = run.toolResults.filter((toolResult) => String(toolResult.name || "").startsWith("browser_"));
  const required =
    browserToolResults.length > 0 &&
    (taskLikelyTargetsBrowser(run.request.task) ||
      browserToolResults.some((toolResult) => {
        const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
        return Boolean(data && data.verificationRequired === true);
      }));
  const requiresVerification =
    taskLikelyRequiresBrowserVerification(run.request.task) ||
    browserToolResults.some((toolResult) => {
      const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
      return Boolean(data && data.verificationRequired === true);
    });
  const hasActionProof = browserToolResults.some((toolResult) => toolResult.ok && !isObserveTool(toolResult.name));
  const hasVerificationProof = browserToolResults.some((toolResult) => {
    if (!toolResult.ok) return false;
    const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
    if (data && data.verificationRequired === true && data.verificationPassed === true) return true;
    if (data && Array.isArray(data.domProofArtifacts) && data.domProofArtifacts.length > 0) return true;
    return (
      toolResult.name === "browser_snapshot_dom" ||
      toolResult.name === "browser_read_text" ||
      toolResult.name === "browser_read_form_state" ||
      toolResult.name === "browser_get_network_activity" ||
      toolResult.name === "browser_get_console_messages"
    );
  });
  return {
    required,
    requiresVerification,
    hasActionProof,
    hasVerificationProof,
    targetOrigin:
      getLatestBrowserMetadataValue(run, "targetOrigin") ||
      (typeof run.lastExecutionState?.targetOrigin === "string" ? run.lastExecutionState.targetOrigin : undefined),
    pageLeaseId:
      getLatestBrowserMetadataValue(run, "pageLeaseId") ||
      (typeof run.lastExecutionState?.pageLeaseId === "string" ? run.lastExecutionState.pageLeaseId : undefined),
  };
}

function buildQualityProofArtifacts(run: StoredHostRun): BinaryProofArtifact[] {
  const artifacts: BinaryProofArtifact[] = [];
  for (const toolResult of run.toolResults.slice(-64)) {
    const capturedAt = typeof toolResult.createdAt === "string" && toolResult.createdAt ? toolResult.createdAt : undefined;
    if (toolResult.name === "run_command") {
      artifacts.push({
        id: `cmd:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
        kind: "validation_proof",
        source: "tool_result",
        summary: String(toolResult.summary || "Validation command result."),
        toolName: toolResult.name,
        status: toolResult.ok ? "passed" : "failed",
        capturedAt,
      });
      continue;
    }
    if (toolResult.ok && isWorkspaceMutationToolName(toolResult.name)) {
      artifacts.push({
        id: `workspace:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
        kind: "artifact_proof",
        source: "tool_result",
        summary: String(toolResult.summary || "Workspace mutation proof."),
        toolName: toolResult.name,
        status: "passed",
        capturedAt,
      });
      continue;
    }
    if (String(toolResult.name || "").startsWith("desktop_")) {
      const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
      if (toolResult.ok && !isObserveTool(toolResult.name)) {
        artifacts.push({
          id: `desktop:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
          kind: "desktop_action_proof",
          source: "tool_result",
          summary: String(toolResult.summary || "Desktop action proof."),
          toolName: toolResult.name,
          status: "passed",
          capturedAt,
        });
      }
      if (toolResult.ok && data && (data.verificationPassed === true || data.verificationRequired === true)) {
        artifacts.push({
          id: `desktop_verify:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
          kind: "desktop_verification_proof",
          source: "tool_result",
          summary: String(toolResult.summary || "Desktop verification proof."),
          toolName: toolResult.name,
          status: data.verificationPassed === true ? "passed" : "unknown",
          capturedAt,
        });
      }
      continue;
    }
    if (String(toolResult.name || "").startsWith("browser_")) {
      const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
      if (toolResult.ok && !isObserveTool(toolResult.name)) {
        artifacts.push({
          id: `browser:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
          kind: "browser_action_proof",
          source: "tool_result",
          summary: String(toolResult.summary || "Browser action proof."),
          toolName: toolResult.name,
          status: "passed",
          capturedAt,
        });
      }
      if (
        toolResult.ok &&
        (toolResult.name === "browser_snapshot_dom" ||
          toolResult.name === "browser_read_text" ||
          toolResult.name === "browser_read_form_state" ||
          toolResult.name === "browser_get_network_activity" ||
          toolResult.name === "browser_get_console_messages" ||
          (data && (data.verificationPassed === true || Array.isArray(data.domProofArtifacts))))
      ) {
        artifacts.push({
          id: `browser_verify:${String(toolResult.toolCallId || `${toolResult.name}:${artifacts.length}`)}`,
          kind: "browser_verification_proof",
          source: "tool_result",
          summary: String(toolResult.summary || "Browser verification proof."),
          toolName: toolResult.name,
          status: data && data.verificationPassed === true ? "passed" : "unknown",
          capturedAt,
        });
      }
    }
  }
  return artifacts.slice(-64);
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function mapMissingProofToLegacyRequirement(missingProof: string): string {
  if (missingProof === "validation_proof" || missingProof === "verification_proof_failed") {
    return "required_validation_missing";
  }
  if (missingProof === "artifact_proof") {
    return "required_artifact_missing:quality_gate";
  }
  if (missingProof === "semantic_completion_proof") {
    return "required_summary_missing";
  }
  return `quality_gate_missing:${missingProof}`;
}

function buildQualityGateBlockedReason(missingProofs: string[]): BinaryQualityBlockedReason | undefined {
  if (missingProofs.includes("verification_proof_failed")) return "verification_failed";
  if (missingProofs.includes("validation_proof")) return "missing_validation_proof";
  if (missingProofs.includes("artifact_proof")) return "missing_artifact_proof";
  if (missingProofs.includes("semantic_completion_proof")) return "missing_semantic_completion_proof";
  return undefined;
}

function evaluateQualityGate(
  run: StoredHostRun,
  envelope: AssistRunEnvelope,
  input?: { finalizationAttempt?: boolean }
): BinaryQualityGateEvaluation {
  const requiredProofs: BinaryProofRequirement[] = [];
  const satisfiedProofs: string[] = [];
  const missingProofs: string[] = [];
  const finalizationAttempt = input?.finalizationAttempt === true;
  const hintedPolicyLane =
    envelope.policyLane ||
    (typeof run.lastExecutionState?.policyLane === "string" ? run.lastExecutionState.policyLane : undefined);
  const lane: BinaryQualityLane =
    hintedPolicyLane === "desktop"
      ? "desktop"
      : hintedPolicyLane === "browser"
        ? "browser"
        : hintedPolicyLane === "coding"
          ? "coding"
          : hintedPolicyLane === "chat"
            ? "chat_research"
            : runLikelyDesktopTask(run)
              ? "desktop"
              : runLikelyBrowserTask(run)
                ? "browser"
                : run.workspaceRoot && (taskLikelyRequiresWorkspaceAction(run.request.task) || taskRequestsValidation(run.request.task))
                  ? "coding"
                  : "chat_research";

  if (lane === "coding") {
    const requiresArtifacts = taskLikelyRequiresWorkspaceAction(run.request.task);
    const requiresValidation = taskRequestsValidation(run.request.task);
    const hasArtifactProof = hasSuccessfulWorkspaceMutationProof(run);
    const hasValidationProof = hasSuccessfulCommandProof(run);
    if (requiresArtifacts) {
      requiredProofs.push({
        id: "artifact_proof",
        lane,
        description: "Successful workspace mutation proof is required before completion.",
      });
      if (hasArtifactProof) satisfiedProofs.push("artifact_proof");
      else missingProofs.push("artifact_proof");
    }
    if (requiresValidation) {
      requiredProofs.push({
        id: "validation_proof",
        lane,
        description: "Successful validation command proof is required before completion.",
      });
      if (hasValidationProof) satisfiedProofs.push("validation_proof");
      else if (hasFailedValidationCommandProof(run)) missingProofs.push("verification_proof_failed");
      else missingProofs.push("validation_proof");
    }
  } else if (lane === "desktop") {
    const desktopProof = evaluateDesktopProofState(run);
    if (desktopProof.required) {
      requiredProofs.push({
        id: "artifact_proof",
        lane,
        description: "Desktop mutation proof is required before completion.",
      });
      if (desktopProof.hasActionProof) satisfiedProofs.push("artifact_proof");
      else missingProofs.push("artifact_proof");
    }
    if (desktopProof.requiresVerification) {
      requiredProofs.push({
        id: "validation_proof",
        lane,
        description: "Desktop verification proof is required before completion.",
      });
      if (desktopProof.hasVerificationProof) satisfiedProofs.push("validation_proof");
      else missingProofs.push("validation_proof");
    }
  } else if (lane === "browser") {
    const browserProof = evaluateBrowserProofState(run);
    if (browserProof.required) {
      requiredProofs.push({
        id: "artifact_proof",
        lane,
        description: "Browser mutation proof is required before completion.",
      });
      if (browserProof.hasActionProof) satisfiedProofs.push("artifact_proof");
      else missingProofs.push("artifact_proof");
    }
    if (browserProof.requiresVerification) {
      requiredProofs.push({
        id: "validation_proof",
        lane,
        description: "Browser verification proof is required before completion.",
      });
      if (browserProof.hasVerificationProof) satisfiedProofs.push("validation_proof");
      else missingProofs.push("validation_proof");
    }
  } else {
    requiredProofs.push({
      id: "semantic_completion_proof",
      lane,
      description: "A minimal semantic completion summary is required before completion.",
    });
    if (typeof envelope.final === "string" && envelope.final.trim().length >= 2) {
      satisfiedProofs.push("semantic_completion_proof");
    } else {
      missingProofs.push("semantic_completion_proof");
    }
  }

  const repairAttemptCountRaw =
    typeof envelope.repairAttemptCount === "number"
      ? envelope.repairAttemptCount
      : typeof run.lastExecutionState?.repairAttemptCount === "number"
        ? run.lastExecutionState.repairAttemptCount
        : 0;
  const repairAttemptCount = Math.max(0, Math.floor(repairAttemptCountRaw));
  const maxRepairAttempts = QUALITY_GATE_MAX_REPAIR_ATTEMPTS;
  const missing = dedupeStringList(missingProofs);
  const baseBlockedReason = buildQualityGateBlockedReason(missing);
  const exhausted = missing.length > 0 && repairAttemptCount >= maxRepairAttempts;
  const qualityGateState: BinaryQualityGateState =
    missing.length === 0 ? "satisfied" : exhausted ? "blocked" : "pending";
  const finalizationBlocked = missing.length > 0 && (finalizationAttempt || exhausted);
  const qualityBlockedReason: BinaryQualityBlockedReason | undefined = exhausted
    ? "repair_exhausted"
    : baseBlockedReason;
  const legacyMissingRequirements = dedupeStringList(missing.map(mapMissingProofToLegacyRequirement));

  return {
    lane,
    qualityGateState,
    requiredProofs,
    satisfiedProofs: dedupeStringList(satisfiedProofs),
    missingProofs: missing,
    qualityBlockedReason,
    repairAttemptCount,
    maxRepairAttempts,
    finalizationBlocked,
    proofArtifactsDetailed: buildQualityProofArtifacts(run),
    legacyMissingRequirements,
  };
}

function buildQualityGateRepairToolCall(
  run: StoredHostRun,
  envelope: AssistRunEnvelope,
  evaluation: BinaryQualityGateEvaluation
): PendingToolCall | null {
  if (evaluation.qualityGateState === "blocked") return null;
  const step = Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1;
  const adapter = String(envelope.adapter || "host_quality_gate");

  if (evaluation.missingProofs.includes("validation_proof") || evaluation.missingProofs.includes("verification_proof_failed")) {
    if (evaluation.lane === "coding" && run.workspaceRoot) {
      const validationCommand = inferValidationCommand(run.request.task, run.workspaceRoot);
      if (validationCommand) {
        return {
          step,
          adapter,
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `quality_validation_${randomUUID()}`,
            name: "run_command",
            kind: "command",
            summary: "Quality gate repair: collect validation proof before completion.",
            arguments: {
              command: validationCommand,
              ...(run.workspaceRoot ? { cwd: run.workspaceRoot } : {}),
            },
          },
          availableTools: buildHostSupportedTools(run.workspaceRoot),
        };
      }
    }
    if (evaluation.lane === "browser") {
      const pageId =
        (typeof run.lastExecutionState?.pageLeaseId === "string" && run.lastExecutionState.pageLeaseId.trim()) ||
        getLatestBrowserMetadataValue(run, "pageLeaseId");
      if (pageId) {
        return {
          step,
          adapter,
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `quality_browser_verify_${randomUUID()}`,
            name: "browser_snapshot_dom",
            kind: "observe",
            summary: "Quality gate repair: capture browser DOM proof before completion.",
            arguments: {
              pageId,
              limit: 40,
            },
          },
          availableTools: [...HOST_BROWSER_TOOLS],
        };
      }
      return {
        step,
        adapter,
        requiresClientExecution: true,
        createdAt: nowIso(),
        toolCall: {
          id: `quality_browser_active_${randomUUID()}`,
          name: "browser_get_active_page",
          kind: "observe",
          summary: "Quality gate repair: resolve active browser page before verification.",
          arguments: {},
        },
        availableTools: [...HOST_BROWSER_TOOLS],
      };
    }
    if (evaluation.lane === "desktop") {
      return {
        step,
        adapter,
        requiresClientExecution: true,
        createdAt: nowIso(),
        toolCall: {
          id: `quality_desktop_verify_${randomUUID()}`,
          name: "desktop_get_active_window",
          kind: "observe",
          summary: "Quality gate repair: capture desktop verification context before completion.",
          arguments: {},
        },
        availableTools: [...HOST_DESKTOP_TOOLS],
      };
    }
  }

  if (evaluation.missingProofs.includes("artifact_proof")) {
    if (evaluation.lane === "coding" && run.workspaceRoot) {
      const bootstrapCall = buildWorkspaceBootstrapToolCall({
        task: run.request.task,
        workspaceRoot: run.workspaceRoot,
        step,
        adapter,
      });
      if (bootstrapCall) return bootstrapCall;
    }
    if (evaluation.lane === "browser") {
      const missionCall = buildBrowserMissionToolCall(run.request.task, step);
      if (missionCall) return missionCall;
    }
    if (evaluation.lane === "desktop") {
      const targetApp =
        (typeof run.lastExecutionState?.targetAppIntent === "string" && run.lastExecutionState.targetAppIntent.trim()) ||
        getLatestDesktopMetadataValue(run, "targetAppIntent");
      if (targetApp) {
        return {
          step,
          adapter,
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `quality_desktop_open_${randomUUID()}`,
            name: "desktop_open_app",
            kind: "mutate",
            summary: `Quality gate repair: reopen or focus ${targetApp} before collecting proof.`,
            arguments: {
              app: targetApp,
            },
          },
          availableTools: [...HOST_DESKTOP_TOOLS],
        };
      }
      return {
        step,
        adapter,
        requiresClientExecution: true,
        createdAt: nowIso(),
        toolCall: {
          id: `quality_desktop_list_${randomUUID()}`,
          name: "desktop_list_apps",
          kind: "observe",
          summary: "Quality gate repair: resolve desktop targets before completion.",
          arguments: {
            limit: 8,
          },
        },
        availableTools: [...HOST_DESKTOP_TOOLS],
      };
    }
  }

  return null;
}

function withQualityGateMetadata(
  envelope: AssistRunEnvelope,
  evaluation: BinaryQualityGateEvaluation,
  override?: { repairAttemptCount?: number; qualityGateState?: BinaryQualityGateState; finalizationBlocked?: boolean }
): AssistRunEnvelope {
  const repairAttemptCount =
    typeof override?.repairAttemptCount === "number"
      ? Math.max(0, Math.floor(override.repairAttemptCount))
      : evaluation.repairAttemptCount;
  const qualityGateState = override?.qualityGateState || evaluation.qualityGateState;
  const finalizationBlocked =
    typeof override?.finalizationBlocked === "boolean"
      ? override.finalizationBlocked
      : evaluation.finalizationBlocked;
  return {
    ...envelope,
    qualityGateState,
    requiredProofs: evaluation.requiredProofs,
    satisfiedProofs: evaluation.satisfiedProofs,
    missingProofs: evaluation.missingProofs,
    qualityBlockedReason: qualityGateState === "blocked" ? evaluation.qualityBlockedReason || "repair_exhausted" : evaluation.qualityBlockedReason,
    repairAttemptCount,
    maxRepairAttempts: evaluation.maxRepairAttempts,
    finalizationBlocked,
    proofArtifactsDetailed: evaluation.proofArtifactsDetailed,
    missingRequirements: dedupeStringList([
      ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements.map((item) => String(item)) : []),
      ...evaluation.legacyMissingRequirements,
    ]),
  };
}

function enforceQualityGateForTurn(run: StoredHostRun, envelope: AssistRunEnvelope): AssistRunEnvelope {
  const evaluation = evaluateQualityGate(run, envelope, { finalizationAttempt: false });
  let nextEnvelope = withQualityGateMetadata(envelope, evaluation);

  if (evaluation.qualityGateState === "satisfied") {
    if (nextEnvelope.completionStatus === "incomplete" && (!nextEnvelope.pendingToolCall || nextEnvelope.finalizationBlocked)) {
      nextEnvelope = {
        ...nextEnvelope,
        completionStatus: "complete",
        finalizationBlocked: false,
        missingRequirements: [],
      };
    }
    return nextEnvelope;
  }

  if (!nextEnvelope.pendingToolCall && evaluation.qualityGateState === "pending") {
    const repairCall = buildQualityGateRepairToolCall(run, nextEnvelope, evaluation);
    if (repairCall) {
      const repairAttemptCount = evaluation.repairAttemptCount + 1;
      const exhausted = repairAttemptCount >= evaluation.maxRepairAttempts;
      nextEnvelope = withQualityGateMetadata(
        {
          ...nextEnvelope,
          pendingToolCall: repairCall,
          completionStatus: "incomplete",
          finalizationBlocked: true,
        },
        evaluation,
        {
          repairAttemptCount,
          qualityGateState: exhausted ? "blocked" : "pending",
          finalizationBlocked: true,
        }
      );
      if (exhausted) {
        nextEnvelope = {
          ...nextEnvelope,
          qualityBlockedReason: "repair_exhausted",
        };
      }
      return nextEnvelope;
    }
  }

  return {
    ...nextEnvelope,
    completionStatus: "incomplete",
    finalizationBlocked: true,
  };
}


function getLatestDesktopMetadataValue(run: StoredHostRun, key: string): string | undefined {
  for (let index = run.toolResults.length - 1; index >= 0; index -= 1) {
    const toolResult = run.toolResults[index];
    if (!toolResult || !String(toolResult.name || "").startsWith("desktop_")) continue;
    const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
    if (!data) continue;
    if (typeof data[key] === "string" && String(data[key]).trim()) {
      return String(data[key]).trim();
    }
  }
  return undefined;
}

function evaluateDesktopProofState(run: StoredHostRun): {
  required: boolean;
  requiresVerification: boolean;
  hasActionProof: boolean;
  hasVerificationProof: boolean;
  targetResolvedApp?: string;
  targetAppIntent?: string;
} {
  const desktopToolResults = run.toolResults.filter((toolResult) => String(toolResult.name || "").startsWith("desktop_"));
  const required =
    desktopToolResults.length > 0 &&
    (taskLikelyTargetsDesktop(run.request.task) ||
      desktopToolResults.some((toolResult) => {
        const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
        return Boolean(data && data.verificationRequired === true);
      }));
  const requiresVerification =
    taskLikelyRequiresDesktopVerification(run.request.task) ||
    desktopToolResults.some((toolResult) => {
      const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
      return Boolean(data && data.verificationRequired === true);
    });
  const hasActionProof = desktopToolResults.some((toolResult) => toolResult.ok && !isObserveTool(toolResult.name));
  const hasVerificationProof = desktopToolResults.some((toolResult) => {
    const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
    return Boolean(toolResult.ok && data && data.verificationRequired === true && data.verificationPassed === true);
  });
  return {
    required,
    requiresVerification,
    hasActionProof,
    hasVerificationProof,
    targetResolvedApp:
      getLatestDesktopMetadataValue(run, "targetResolvedApp") ||
      (typeof run.lastExecutionState?.targetResolvedApp === "string" ? run.lastExecutionState.targetResolvedApp : undefined),
    targetAppIntent:
      getLatestDesktopMetadataValue(run, "targetAppIntent") ||
      (typeof run.lastExecutionState?.targetAppIntent === "string" ? run.lastExecutionState.targetAppIntent : undefined),
  };
}

function buildDesktopProofClosureSummary(run: StoredHostRun, proof: ReturnType<typeof evaluateDesktopProofState>): string {
  const requested = String(run.request?.task || "").trim();
  const target = String(proof.targetResolvedApp || proof.targetAppIntent || "desktop app session").trim();
  const verificationText =
    !proof.requiresVerification || proof.hasVerificationProof
      ? "verified"
      : "verification not fully confirmed";
  const cleanupCount =
    typeof run.lastExecutionState?.cleanupClosedCount === "number"
      ? Math.max(0, Math.floor(run.lastExecutionState.cleanupClosedCount))
      : null;
  const cleanupText = cleanupCount === null ? "cleanup will run at closeout" : `${cleanupCount} run-launched app(s) closed`;
  return `Desktop proof complete for ${target}: ${verificationText}. Requested: ${requested || "desktop automation task"}. ${cleanupText}.`;
}

async function tryCompleteDesktopRunFromProof(
  run: StoredHostRun,
  envelope: AssistRunEnvelope,
  reason: string,
  attachedRes?: ServerResponse | null
): Promise<boolean> {
  const desktopProof = evaluateDesktopProofState(run);
  const desktopActionObserved =
    desktopProof.hasActionProof ||
    run.toolResults.some((toolResult) => {
      if (!toolResult.ok || !String(toolResult.name || "").startsWith("desktop_")) return false;
      return !isObserveTool(String(toolResult.name || ""));
    });
  const desktopTargetKnown = Boolean(
    desktopProof.required ||
      desktopProof.targetResolvedApp ||
      desktopProof.targetAppIntent ||
      run.lastExecutionState?.targetResolvedApp ||
      run.lastExecutionState?.targetAppIntent
  );
  const verificationRequired =
    desktopProof.requiresVerification || Boolean(run.lastExecutionState?.verificationRequired === true);
  const verificationPassed =
    desktopProof.hasVerificationProof || Boolean(run.lastExecutionState?.verificationPassed === true);

  if (!desktopTargetKnown || !desktopActionObserved || (verificationRequired && !verificationPassed)) {
    return false;
  }

  const desktopClosureSummary = buildDesktopProofClosureSummary(run, desktopProof);
  run.finalEnvelope = attachHostMetadata(
    {
      ...envelope,
      completionStatus: "complete",
      missingRequirements: [],
      pendingToolCall: null,
      closureSummary: desktopClosureSummary,
      final: desktopClosureSummary,
      verificationRequired,
      verificationPassed: !verificationRequired || verificationPassed,
      ...(desktopProof.targetResolvedApp ? { targetResolvedApp: desktopProof.targetResolvedApp } : {}),
      ...(desktopProof.targetAppIntent ? { targetAppIntent: desktopProof.targetAppIntent } : {}),
      ...(typeof run.lastExecutionState?.cleanupClosedCount === "number"
        ? { cleanupClosedCount: run.lastExecutionState.cleanupClosedCount }
        : {}),
    },
    run
  );
  run.updatedAt = nowIso();
  await refreshRunPreferences(run);
  await finalizeRun(run, "completed", attachedRes, {
    message: "Binary Host completed the desktop run from verified local proof.",
  });
  await emitHostStatus(
    run,
    "Binary finished this desktop run from verified local proof.",
    attachedRes,
    {
      escalationStage: "desktop_local_proof_closeout",
      reason,
      verificationPassed: !verificationRequired || verificationPassed,
    }
  );
  return true;
}

function hasRequiredArtifactsLocally(requiredArtifacts: string[], workspaceRoot: string): Promise<boolean> {
  return Promise.all(
    requiredArtifacts.map((relativePath) => pathExists(path.join(workspaceRoot, relativePath.replace(/\//g, path.sep))))
  ).then((results) => results.every(Boolean));
}

function inferValidationCommand(task: string, workspaceRoot: string): string | null {
  const projectRoot = extractRequestedProjectRoot(task);
  const normalizedRoot =
    projectRoot && projectRoot !== "test" && projectRoot !== "tests" ? projectRoot : null;
  const projectPackageJson = normalizedRoot
    ? path.join(workspaceRoot, normalizedRoot, "package.json")
    : path.join(workspaceRoot, "package.json");
  const projectTestIndex = normalizedRoot
    ? path.join(workspaceRoot, normalizedRoot, "test", "index.test.js")
    : path.join(workspaceRoot, "test", "index.test.js");
  const projectDurationTest = normalizedRoot
    ? path.join(workspaceRoot, normalizedRoot, "test", "duration.test.js")
    : path.join(workspaceRoot, "test", "duration.test.js");

  if (normalizedRoot) {
    if (existsSync(projectPackageJson)) {
      return "npm test --silent";
    }
    if (existsSync(projectTestIndex)) {
      return `node --test ${JSON.stringify(`${normalizedRoot}/test/index.test.js`)}`;
    }
    if (existsSync(projectDurationTest)) {
      return `node --test ${JSON.stringify(`${normalizedRoot}/test/duration.test.js`)}`;
    }
  }

  if (existsSync(projectPackageJson)) {
    return "npm test --silent";
  }
  const pythonTestsDir = normalizedRoot
    ? path.join(workspaceRoot, normalizedRoot, "tests")
    : path.join(workspaceRoot, "tests");
  if (existsSync(pythonTestsDir)) {
    return "py -3.12 -m unittest discover -s tests -p \"test_*.py\"";
  }
  if (existsSync(projectTestIndex)) {
    return `node --test ${JSON.stringify("test/index.test.js")}`;
  }
  if (existsSync(projectDurationTest)) {
    return `node --test ${JSON.stringify("test/duration.test.js")}`;
  }
  const requiresCommandProof = /\b(shell|terminal|command(?:-line)?|run(?:\s+a)?\s+command|list|show|print|proof)\b/i.test(task);
  if (requiresCommandProof) {
    const requiredArtifacts = extractRequiredArtifacts(task);
    const fileArtifact = requiredArtifacts.find((artifact) => /\.[A-Za-z0-9._-]+$/.test(artifact));
    const folderArtifact = requiredArtifacts.find((artifact) => !/\.[A-Za-z0-9._-]+$/.test(artifact));
    const targetPath = fileArtifact || folderArtifact;
    if (targetPath) {
      if (process.platform === "win32") {
        const windowsPath = targetPath.replace(/\//g, "\\");
        return `cmd /c dir /b ${JSON.stringify(windowsPath)}`;
      }
      return `ls -la ${JSON.stringify(targetPath)}`;
    }
    return process.platform === "win32" ? "cmd /c dir /b" : "ls -la";
  }
  return null;
}

async function appendSyntheticToolResult(
  run: StoredHostRun,
  toolResult: ToolResult,
  attachedRes?: ServerResponse | null
): Promise<void> {
  const desktopMetadata = extractDesktopToolMetadata(toolResult);
  run.toolResults.push(toolResult);
  run.toolResults = run.toolResults.slice(-MAX_TOOL_RESULT_HISTORY);
  run.lastToolAt = toolResult.createdAt || nowIso();
  if (run.leaseState) run.leaseState.lastToolAt = run.lastToolAt;
  run.heartbeatAt = nowIso();
  if (run.leaseState) run.leaseState.heartbeatAt = run.heartbeatAt;
  await appendRunEvent(
    run,
    {
      event: "tool_result",
      data: {
        name: toolResult.name,
        ok: toolResult.ok,
        summary: toolResult.summary,
        blocked: toolResult.blocked ?? false,
        lane:
          toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.lane === "string"
            ? toolResult.data.lane
            : undefined,
        executionVisibility:
          toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.executionVisibility === "string"
            ? toolResult.data.executionVisibility
            : undefined,
        foregroundDisruptionRisk:
          toolResult.data &&
          typeof toolResult.data === "object" &&
          typeof toolResult.data.foregroundDisruptionRisk === "string"
            ? toolResult.data.foregroundDisruptionRisk
            : undefined,
        interactionMode:
          toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.interactionMode === "string"
            ? toolResult.data.interactionMode
            : undefined,
        visibleFallbackReason:
          toolResult.data &&
          typeof toolResult.data === "object" &&
          typeof toolResult.data.visibleFallbackReason === "string"
            ? toolResult.data.visibleFallbackReason
            : undefined,
        terminalState:
          toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.terminalState === "object"
            ? toolResult.data.terminalState
            : undefined,
        ...desktopMetadata,
      },
    },
    attachedRes
  );
  await emitHostHeartbeat(run, attachedRes);
}

async function shouldSkipOptionalValidation(
  run: StoredHostRun,
  envelope: AssistRunEnvelope,
  pendingToolCall: PendingToolCall
): Promise<boolean> {
  if (envelope.completionStatus !== "complete") return false;
  if (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.length > 0) return false;
  if (pendingToolCall.toolCall.name !== "run_command") return false;
  const command = String(pendingToolCall.toolCall.arguments?.command || "");
  if (!isOptionalGitValidationCommand(command)) return false;
  if (!run.workspaceRoot) return false;
  return !(await hasGitWorkspace(run.workspaceRoot));
}

async function attemptLocalCompletionProof(
  run: StoredHostRun,
  envelope: AssistRunEnvelope,
  executor: { execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult> } | null,
  attachedRes?: ServerResponse | null
): Promise<boolean> {
  if (!run.workspaceRoot || !executor) return false;
  if (runLikelyDesktopTask(run)) return false;
  const missingRequirements = Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : [];
  // Never override a model-complete envelope unless there is explicit missing-proof state to close.
  if (missingRequirements.length === 0) return false;
  const localProofEligible = missingRequirements.every((item) =>
    item === "required_validation_missing" ||
    item === "required_summary_missing" ||
    item.startsWith("required_artifact_missing:")
  );
  if (!localProofEligible) return false;
  const hasNonObservationProof = run.toolResults.some((toolResult) => toolResult.ok && !isObserveTool(toolResult.name));
  if (!hasNonObservationProof) return false;
  const requiredArtifacts = extractRequiredArtifacts(run.request.task);
  if (!requiredArtifacts.length) return false;
  if (!(await hasRequiredArtifactsLocally(requiredArtifacts, run.workspaceRoot))) return false;

  if (taskRequestsValidation(run.request.task) && !hasSuccessfulCommandProof(run)) {
    const command = inferValidationCommand(run.request.task, run.workspaceRoot);
    if (!command) return false;
    const validationResult = await executor.execute({
      step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
      adapter: String(envelope.adapter || "host_proof"),
      requiresClientExecution: true,
      createdAt: nowIso(),
      toolCall: {
        id: `host_validation_${randomUUID()}`,
        name: "run_command",
        kind: "command",
        summary: "Binary Host local completion proof",
        arguments: { command },
      },
    });
    await appendSyntheticToolResult(run, validationResult, attachedRes);
    if (!validationResult.ok) return false;
  }

  run.finalEnvelope = attachHostMetadata(
    {
      ...envelope,
      completionStatus: "complete",
      missingRequirements: [],
      pendingToolCall: null,
      closureSummary:
        typeof envelope.closureSummary === "string" && envelope.closureSummary.trim()
          ? envelope.closureSummary
          : "Binary Host verified the remaining closure proof locally.",
      final:
        typeof envelope.final === "string" && envelope.final.trim()
          ? envelope.final
          : "Binary Host verified the completed workspace locally.",
    },
    run
  );
  run.updatedAt = nowIso();
  await refreshRunPreferences(run);
  await finalizeRun(run, "completed", attachedRes, {
    message: "Binary Host completed the run after local verification.",
  });
  return true;
}

function deriveWorkspaceTrustMode(grant: BinaryHostTrustGrant | null | undefined): BinaryHostWorkspaceTrustMode {
  if (!grant) return "untrusted";
  if (!grant.mutate) return "trusted_read_only";
  if (grant.commands === "prompt") return "trusted_prompt_commands";
  return "trusted_full_access";
}

function deriveEffectiveTrustMode(
  preferences: BinaryHostPreferences,
  workspaceRoot?: string
): BinaryHostWorkspaceTrustMode {
  if (workspaceRoot) return deriveWorkspaceTrustMode(isWorkspaceTrusted(preferences, workspaceRoot));
  if (preferences.machineTrustMode === "full_machine_mutate") return "trusted_full_access";
  if (preferences.machineTrustMode === "home_mutate") return "trusted_prompt_commands";
  return "trusted_read_only";
}

function isTerminalToolName(name: string): boolean {
  return name === "run_command" || name.startsWith("terminal_");
}

function isObserveTool(name: string): boolean {
  return ![
    "edit",
    "write_file",
    "patch_binary",
    "write_binary_file",
    "mkdir",
    "run_command",
    "terminal_start_session",
    "terminal_send_input",
    "terminal_terminate_session",
      "create_checkpoint",
      "browser_open_page",
      "browser_search_and_open_best_result",
      "browser_login_and_continue",
      "browser_complete_form",
      "browser_extract_and_decide",
      "browser_recover_workflow",
      "browser_focus_page",
    "browser_navigate",
    "browser_click",
    "browser_type",
    "browser_press_keys",
    "browser_scroll",
    "desktop_open_app",
    "desktop_open_url",
    "desktop_focus_window",
    "desktop_click",
    "desktop_type",
    "desktop_keypress",
    "desktop_scroll",
    "desktop_wait",
  ].includes(name);
}

function buildPendingSignature(pendingToolCall: PendingToolCall | null | undefined): string {
  if (!pendingToolCall) return "";
  return JSON.stringify({
    name: pendingToolCall.toolCall.name,
    arguments: pendingToolCall.toolCall.arguments,
  });
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 15))}\n...[truncated]`;
}

function sanitizeToolResultForContinue(toolResult: ToolResult): ToolResult {
  const next: ToolResult = {
    ...toolResult,
    summary: truncateText(toolResult.summary, 20_000) || toolResult.summary,
    ...(typeof toolResult.error === "string" ? { error: truncateText(toolResult.error, 4_000) } : {}),
  };
  if (toolResult.data && typeof toolResult.data === "object") {
    const data = { ...toolResult.data };
    if (typeof data.stdout === "string") data.stdout = truncateText(data.stdout, 8_000) || "";
    if (typeof data.stderr === "string") data.stderr = truncateText(data.stderr, 8_000) || "";
    if (typeof data.output === "string") data.output = truncateText(data.output, 12_000) || "";
    if (typeof data.content === "string") data.content = truncateText(data.content, 16_000) || "";
    if (typeof data.bytesBase64 === "string") data.bytesBase64 = truncateText(data.bytesBase64, 8_000) || "";
    if (typeof data.hexPreview === "string") data.hexPreview = truncateText(data.hexPreview, 2_000) || "";
    if (typeof data.asciiPreview === "string") data.asciiPreview = truncateText(data.asciiPreview, 2_000) || "";
    next.data = data;
  }
  return next;
}

function getLocalGatewayUrl(): string {
  return String(process.env.OPENHANDS_GATEWAY_URL || "http://127.0.0.1:8010").trim().replace(/\/+$/, "");
}

function resolveGatewayBaseUrl(input: {
  executionLane?: BinaryExecutionLane | null;
  remoteGatewayUrl?: string | null;
  localGatewayUrl?: string | null;
}): string {
  const remoteGatewayUrl = String(input.remoteGatewayUrl || "").trim();
  const localGatewayUrl = String(input.localGatewayUrl || "").trim();
  if (input.executionLane === "openhands_remote" && remoteGatewayUrl) {
    return remoteGatewayUrl.replace(/\/+$/, "");
  }
  if (localGatewayUrl) {
    return localGatewayUrl.replace(/\/+$/, "");
  }
  return getLocalGatewayUrl();
}

const HOSTED_TRANSPORT_PROBE_TIMEOUT_MS = 1_500;
const HOSTED_TRANSPORT_SUCCESS_TTL_MS = 15_000;
const HOSTED_TRANSPORT_FAILURE_TTL_MS = 60_000;
const FAST_SURFACE_CONTEXT_TIMEOUT_MS = 1_500;
const FULL_SURFACE_CONTEXT_TIMEOUT_MS = 5_000;
const hostedTransportAvailabilityCache = new Map<
  string,
  {
    available: boolean;
    checkedAt: number;
    reason?: string;
  }
>();

function rememberHostedTransportAvailability(baseUrl: string, available: boolean, reason?: string): void {
  hostedTransportAvailabilityCache.set(baseUrl, {
    available,
    checkedAt: Date.now(),
    ...(reason ? { reason } : {}),
  });
}

async function probeHostedTransportAvailability(baseUrl: string): Promise<{
  available: boolean;
  reason?: string;
}> {
  const cached = hostedTransportAvailabilityCache.get(baseUrl);
  if (cached) {
    const ttl = cached.available ? HOSTED_TRANSPORT_SUCCESS_TTL_MS : HOSTED_TRANSPORT_FAILURE_TTL_MS;
    if (Date.now() - cached.checkedAt < ttl) {
      return {
        available: cached.available,
        ...(cached.reason ? { reason: cached.reason } : {}),
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Hosted transport probe timed out.")), HOSTED_TRANSPORT_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const available = response.ok || response.status < 500;
    const reason = available ? undefined : `Health endpoint returned ${response.status}.`;
    rememberHostedTransportAvailability(baseUrl, available, reason);
    return {
      available,
      ...(reason ? { reason } : {}),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || "Hosted transport probe failed.");
    rememberHostedTransportAvailability(baseUrl, false, reason);
    return { available: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function withSurfaceContextTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function shouldPreferLocalGatewayAssist(
  baseUrl: string,
  modelCandidate: BinaryUserConnectedModelCandidate | null,
  runtime: OpenHandsRuntimeStatus
): Promise<{
  preferLocalGateway: boolean;
  reason?: string;
}> {
  if (!modelCandidate || runtime.readiness === "repair_needed") {
    return { preferLocalGateway: false };
  }
  const hostedTransport = await probeHostedTransportAvailability(baseUrl);
  if (hostedTransport.available) {
    return { preferLocalGateway: false };
  }
  return {
    preferLocalGateway: true,
    ...(hostedTransport.reason ? { reason: hostedTransport.reason } : {}),
  };
}

function shouldUseLocalGatewayAssistFallback(
  error: unknown,
  modelCandidate: BinaryUserConnectedModelCandidate | null,
  runtime: OpenHandsRuntimeStatus
): boolean {
  if (!modelCandidate || runtime.readiness === "repair_needed") return false;
  const message = error instanceof Error ? error.message : String(error || "");
  return /fetch failed|timed out|timeout|econn|enotfound|socket|network/i.test(message);
}

function resolveRemoteGatewayBaseUrl(): string | null {
  const raw = String(process.env.OPENHANDS_REMOTE_GATEWAY_URL || process.env.OPENHANDS_AGENT_SERVER_URL || "").trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function normalizePluginPackIds(value: unknown): Array<BinaryPluginPack["id"]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => String(item || "").trim())
    .filter(
      (item): item is BinaryPluginPack["id"] =>
        item === "web-debug" ||
        item === "qa-repair" ||
        item === "dependency-maintenance" ||
        item === "productivity-backoffice"
      );
  return normalized.length ? normalized : undefined;
}

const OPENHANDS_PLUGIN_PACK_IDS: Array<BinaryPluginPack["id"]> = [
  "web-debug",
  "qa-repair",
  "dependency-maintenance",
  "productivity-backoffice",
];

function getOpenHandsPluginCatalog(): BinaryPluginPack[] {
  return resolveOpenHandsPluginPacks({
    task: "",
    requestedPacks: OPENHANDS_PLUGIN_PACK_IDS,
  });
}

function mergePluginPackIds(
  ...values: Array<Array<BinaryPluginPack["id"]> | undefined>
): Array<BinaryPluginPack["id"]> | undefined {
  const merged = new Set<BinaryPluginPack["id"]>();
  for (const items of values) {
    for (const item of items || []) {
      merged.add(item);
    }
  }
  return merged.size ? [...merged] : undefined;
}

function buildOpenHandsOfferings(input: {
  openhandsRuntime?: OpenHandsRuntimeStatus | null;
}): BinaryOpenHandsOffering[] {
  const supported = new Set(
    Array.isArray(input.openhandsRuntime?.supportedTools)
      ? input.openhandsRuntime!.supportedTools.map((tool) => String(tool || "").trim()).filter(Boolean)
      : []
  );
  const runtimeMessage = typeof input.openhandsRuntime?.message === "string" ? input.openhandsRuntime.message : "";
  const fileEditorAvailable =
    supported.has("FileEditorTool") || supported.has("apply_patch") || supported.has("PatchTool");
  const browserUseAvailable = supported.has("BrowserToolSet");
  const terminalAvailable = supported.has("TerminalTool") && input.openhandsRuntime?.readiness !== "repair_needed";

  return [
    {
      id: "conversation_orchestrator",
      title: "OpenHands conversation orchestration",
      description: "Binary routes normal coding and tool-using work through OpenHands as the main planner.",
      status: "available",
      detail: "Conversation-backed runs stay unified across desktop, CLI, and detached jobs.",
    },
    {
      id: "terminal_tool",
      title: "Native terminal tool",
      description: "OpenHands can execute terminal-backed coding steps directly when the runtime is healthy.",
      status: terminalAvailable ? "available" : "limited",
      detail: terminalAvailable ? runtimeMessage : "Terminal-backed work needs runtime repair before strict native terminal flows can run.",
    },
    {
      id: "file_editor",
      title: "Native file editing",
      description: "OpenHands can read and edit workspace files without Binary emulating the edit loop.",
      status: fileEditorAvailable ? "available" : "limited",
      detail: fileEditorAvailable ? "File editing support is available in the current OpenHands runtime." : "The current runtime is missing native file editing support.",
    },
    {
      id: "browser_use",
      title: "Browser Use",
      description: "Structured browser automation is available when the OpenHands browser toolset is healthy.",
      status: browserUseAvailable ? "available" : "limited",
      detail: browserUseAvailable ? "DOM-first browser automation is available in the current runtime." : "Browser Use is not currently exposed by the active runtime.",
    },
    {
      id: "headless_jobs",
      title: "Headless JSONL jobs",
      description: "Detached runs, automations, and long jobs can stream through the headless OpenHands lane.",
      status: "available",
      detail: "Binary keeps JSONL-backed artifacts and live SSE timelines for long work.",
    },
    {
      id: "probe_sessions",
      title: "Agent probe sessions",
      description: "Long-form debug sessions keep a real OpenHands conversation alive across multiple turns.",
      status: "available",
      detail: "Probe sessions expose fallback, trace, and conversation diagnostics without changing the main run path.",
    },
  ];
}

function resolveEffectivePluginPacks(input: {
  task: string;
  requestedPacks?: Array<BinaryPluginPack["id"]>;
  defaultPacks?: Array<BinaryPluginPack["id"]>;
}): BinaryPluginPack[] {
  return resolveOpenHandsPluginPacks({
    task: input.task,
    requestedPacks: mergePluginPackIds(input.defaultPacks, input.requestedPacks),
  });
}

function normalizeImageInputs(value: unknown): BinaryImageInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: BinaryImageInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const mimeType = typeof entry.mimeType === "string" ? entry.mimeType.trim().toLowerCase() : "";
    let dataUrl = typeof entry.dataUrl === "string" ? entry.dataUrl.trim() : "";
    const base64 = typeof entry.base64 === "string" ? entry.base64.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!dataUrl && base64 && mimeType.startsWith("image/")) {
      dataUrl = `data:${mimeType};base64,${base64}`;
    }
    if (!dataUrl && url.startsWith("data:image/")) {
      dataUrl = url;
    }
    if (!dataUrl && !url) continue;
    const next: BinaryImageInput = {
      ...(mimeType.startsWith("image/") ? { mimeType } : {}),
      ...(dataUrl ? { dataUrl } : {}),
      ...(base64 && !dataUrl ? { base64 } : {}),
      ...(url ? { url } : {}),
      ...(typeof entry.caption === "string" && entry.caption.trim() ? { caption: entry.caption.trim() } : {}),
      ...(typeof entry.name === "string" && entry.name.trim() ? { name: entry.name.trim() } : {}),
      ...(typeof entry.source === "string" && entry.source.trim() ? { source: entry.source.trim() } : {}),
    };
    normalized.push(next);
    if (normalized.length >= 6) break;
  }
  return normalized.length ? normalized : undefined;
}

function resolveRunExecutionConfig(input: {
  run: StoredHostRun;
  taskSpeedClass: BinaryTaskSpeedClass;
  remoteConfigured: boolean;
  defaultPluginPacks?: Array<BinaryPluginPack["id"]>;
}): {
  executionLane: BinaryExecutionLane;
  pluginPacks: BinaryPluginPack[];
  skillSources: BinarySkillSource[];
  traceSampled: boolean;
  reason: string;
} {
  const pluginPacks = resolveEffectivePluginPacks({
    task: input.run.request.task,
    requestedPacks: input.run.request.pluginPacks,
    defaultPacks: input.defaultPluginPacks,
  });
  const skillSources = resolveOpenHandsSkillSources(input.run.workspaceRoot);
  const explicitLane = input.run.request.executionLane;
  const shouldUseAdaptiveLaneSelection =
    Boolean(explicitLane) ||
    input.run.request.detach === true ||
    Boolean(input.run.automationId) ||
    Boolean(input.run.automationTriggerKind) ||
    input.run.request.requireIsolation === true;
  if (!shouldUseAdaptiveLaneSelection) {
    return {
      executionLane: "local_interactive",
      pluginPacks,
      skillSources,
      traceSampled: shouldEnableSampledTracing({
        lane: "local_interactive",
        debugMode: input.run.request.debugTracing,
      }),
      reason: "OpenHands-first default: normal trusted runs stay on the local interactive OpenHands path.",
    };
  }
  const laneDecision = resolveExecutionLane({
    task: input.run.request.task,
    workspaceTrustMode: input.run.workspaceTrustMode,
    taskSpeedClass: input.taskSpeedClass,
    detach: input.run.request.detach,
    automationId: input.run.automationId,
    automationTriggerKind: input.run.automationTriggerKind,
    probeSession: false,
    expectedLongRun: input.run.request.expectedLongRun,
    requireIsolation: input.run.request.requireIsolation,
    explicitLane,
    remoteConfigured: input.remoteConfigured,
  });
  return {
    executionLane: laneDecision.lane,
    pluginPacks,
    skillSources,
    traceSampled: shouldEnableSampledTracing({
      lane: laneDecision.lane,
      debugMode: input.run.request.debugTracing,
    }),
    reason: laneDecision.reason,
  };
}

function buildLocalGatewayToolTrace(run: StoredHostRun): Array<Record<string, unknown>> {
  return run.toolResults.slice(-8).map((toolResult) => ({
    status: toolResult.ok ? "ok" : toolResult.blocked ? "blocked" : "failed",
    summary: truncateText(toolResult.summary, 2_000) || toolResult.summary,
    toolResult: sanitizeToolResultForContinue(toolResult),
  }));
}

function mapLocalGatewayTurnToEnvelope(
  turn: Record<string, unknown>,
  availableTools: readonly string[],
  step: number
): AssistRunEnvelope {
  const toolCall =
    turn.toolCall && typeof turn.toolCall === "object" ? (turn.toolCall as Record<string, unknown>) : null;
  const adapter = typeof turn.adapter === "string" ? turn.adapter : "text_actions";
  const pendingToolCall =
    toolCall && typeof toolCall.name === "string"
      ? {
          step,
          adapter,
          requiresClientExecution: true,
          toolCall: {
            id: String(toolCall.id || `gateway_${Date.now().toString(36)}`),
            name: String(toolCall.name),
            arguments:
              toolCall.arguments && typeof toolCall.arguments === "object"
                ? ({ ...(toolCall.arguments as Record<string, unknown>) } as Record<string, unknown>)
                : {},
            ...(toolCall.kind === "observe" || toolCall.kind === "mutate" || toolCall.kind === "command"
              ? { kind: toolCall.kind as "observe" | "mutate" | "command" }
              : {}),
            ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
          },
          availableTools: [...availableTools],
          createdAt: nowIso(),
        }
      : null;
  const progressState =
    turn.progressState && typeof turn.progressState === "object"
      ? (turn.progressState as AssistRunEnvelope["progressState"])
      : null;
  const escalationStage = typeof turn.escalationStage === "string" ? turn.escalationStage : undefined;
  const escalationReason = typeof turn.escalationReason === "string" ? turn.escalationReason : undefined;
  const plannerLatencyMs = typeof turn.plannerLatencyMs === "number" ? turn.plannerLatencyMs : undefined;
  const providerLatencyMs = typeof turn.providerLatencyMs === "number" ? turn.providerLatencyMs : undefined;
  const actionLatencyMs = typeof turn.actionLatencyMs === "number" ? turn.actionLatencyMs : undefined;
  const fallbackCount =
    typeof turn.fallbackCount === "number"
      ? Math.max(0, Math.round(turn.fallbackCount))
      : typeof turn.fallbackAttempt === "number"
        ? Math.max(0, Math.round(turn.fallbackAttempt))
        : Array.isArray(turn.fallbackTrail)
          ? Math.max(0, turn.fallbackTrail.length - 1)
          : undefined;
  const adapterMode =
    turn.adapterMode === "force_binary_tool_adapter" || turn.adapterMode === "auto"
      ? (turn.adapterMode as BinaryAdapterMode)
      : undefined;
  const latencyPolicy =
    turn.latencyPolicy === "detached_15s_cap" || turn.latencyPolicy === "default"
      ? (turn.latencyPolicy as BinaryLatencyPolicy)
      : undefined;
  const smallModelForced = Object.prototype.hasOwnProperty.call(turn, "smallModelForced")
    ? turn.smallModelForced === true
    : undefined;
  const modelRoutingMode = turn.modelRoutingMode === "single_fixed_free" ? ("single_fixed_free" as const) : undefined;
  const fixedModelAlias = typeof turn.fixedModelAlias === "string" ? turn.fixedModelAlias : undefined;
  const fallbackEnabled = Object.prototype.hasOwnProperty.call(turn, "fallbackEnabled")
    ? turn.fallbackEnabled === true
    : undefined;
  const budgetProfile = typeof turn.budgetProfile === "string" ? turn.budgetProfile : undefined;
  const firstTurnBudgetMs = typeof turn.firstTurnBudgetMs === "number" ? turn.firstTurnBudgetMs : undefined;
  const timeoutPolicy = typeof turn.timeoutPolicy === "string" ? turn.timeoutPolicy : undefined;
  const terminalBackend =
    turn.terminalBackend === "openhands_native" || turn.terminalBackend === "blocked"
      ? (turn.terminalBackend as "openhands_native" | "blocked")
      : undefined;
  const terminalStrictMode = Object.prototype.hasOwnProperty.call(turn, "terminalStrictMode")
    ? turn.terminalStrictMode === true
    : undefined;
  const terminalHealthReason = typeof turn.terminalHealthReason === "string" ? turn.terminalHealthReason : undefined;
  const nativeTerminalAvailable = Object.prototype.hasOwnProperty.call(turn, "nativeTerminalAvailable")
    ? turn.nativeTerminalAvailable === true
    : undefined;
  const turnReceipt = turn.receipt && typeof turn.receipt === "object" ? (turn.receipt as Record<string, unknown>) : null;
  const rawTerminalBackendMode =
    typeof turn.terminalBackendMode === "string"
      ? turn.terminalBackendMode
      : typeof turnReceipt?.terminalBackendMode === "string"
        ? (turnReceipt.terminalBackendMode as string)
        : "";
  const terminalBackendMode =
    rawTerminalBackendMode === "strict_openhands_native" || rawTerminalBackendMode === "allow_host_fallback"
      ? (rawTerminalBackendMode as BinaryTerminalBackendMode)
      : undefined;
  const requireNativeTerminalTool = Object.prototype.hasOwnProperty.call(turn, "requireNativeTerminalTool")
    ? turn.requireNativeTerminalTool === true
    : typeof turnReceipt?.requireNativeTerminalTool === "boolean"
      ? turnReceipt.requireNativeTerminalTool === true
      : undefined;
  const rawPolicyLane =
    typeof turn.policyLane === "string"
      ? turn.policyLane
      : typeof turnReceipt?.policyLane === "string"
        ? (turnReceipt.policyLane as string)
        : "";
  const policyLane =
    rawPolicyLane === "chat" || rawPolicyLane === "coding" || rawPolicyLane === "desktop" || rawPolicyLane === "browser"
      ? (rawPolicyLane as BinaryPromptLane)
      : undefined;
  const coercionApplied = Object.prototype.hasOwnProperty.call(turn, "coercionApplied")
    ? turn.coercionApplied === true
    : undefined;
  const seedToolInjected = Object.prototype.hasOwnProperty.call(turn, "seedToolInjected")
    ? turn.seedToolInjected === true
    : undefined;
  const invalidToolNameRecovered = Object.prototype.hasOwnProperty.call(turn, "invalidToolNameRecovered")
    ? turn.invalidToolNameRecovered === true
    : undefined;
  const qualityGateState =
    turn.qualityGateState === "pending" || turn.qualityGateState === "satisfied" || turn.qualityGateState === "blocked"
      ? (turn.qualityGateState as BinaryQualityGateState)
      : undefined;
  const requiredProofs = Array.isArray(turn.requiredProofs)
    ? (turn.requiredProofs as BinaryProofRequirement[])
    : undefined;
  const satisfiedProofs = Array.isArray(turn.satisfiedProofs) ? (turn.satisfiedProofs as string[]) : undefined;
  const missingProofs = Array.isArray(turn.missingProofs) ? (turn.missingProofs as string[]) : undefined;
  const qualityBlockedReason =
    turn.qualityBlockedReason === "missing_validation_proof" ||
    turn.qualityBlockedReason === "missing_artifact_proof" ||
    turn.qualityBlockedReason === "verification_failed" ||
    turn.qualityBlockedReason === "repair_exhausted" ||
    turn.qualityBlockedReason === "missing_semantic_completion_proof"
      ? (turn.qualityBlockedReason as BinaryQualityBlockedReason)
      : undefined;
  const repairAttemptCount = typeof turn.repairAttemptCount === "number" ? turn.repairAttemptCount : undefined;
  const maxRepairAttempts = typeof turn.maxRepairAttempts === "number" ? turn.maxRepairAttempts : undefined;
  const finalizationBlocked =
    Object.prototype.hasOwnProperty.call(turn, "finalizationBlocked") && typeof turn.finalizationBlocked === "boolean"
      ? turn.finalizationBlocked
      : undefined;
  const proofArtifactsDetailed = Array.isArray(turn.proofArtifactsDetailed)
    ? (turn.proofArtifactsDetailed as BinaryProofArtifact[])
    : undefined;
  return {
    runId: typeof turn.runId === "string" ? turn.runId : undefined,
    adapter,
    ...(policyLane ? { policyLane } : {}),
    ...(adapterMode ? { adapterMode } : {}),
    ...(latencyPolicy ? { latencyPolicy } : {}),
    ...(typeof smallModelForced === "boolean" ? { smallModelForced } : {}),
    ...(modelRoutingMode ? { modelRoutingMode } : {}),
    ...(typeof fixedModelAlias === "string" ? { fixedModelAlias } : {}),
    ...(typeof fallbackEnabled === "boolean" ? { fallbackEnabled } : {}),
    ...(budgetProfile ? { budgetProfile } : {}),
    ...(typeof firstTurnBudgetMs === "number" ? { firstTurnBudgetMs } : {}),
    ...(timeoutPolicy ? { timeoutPolicy } : {}),
    ...(terminalBackend ? { terminalBackend } : {}),
    ...(typeof terminalStrictMode === "boolean" ? { terminalStrictMode } : {}),
    ...(typeof terminalHealthReason === "string" ? { terminalHealthReason } : {}),
    ...(typeof nativeTerminalAvailable === "boolean" ? { nativeTerminalAvailable } : {}),
    ...(terminalBackendMode ? { terminalBackendMode } : {}),
    ...(typeof requireNativeTerminalTool === "boolean" ? { requireNativeTerminalTool } : {}),
    ...(typeof coercionApplied === "boolean" ? { coercionApplied } : {}),
    ...(typeof seedToolInjected === "boolean" ? { seedToolInjected } : {}),
    ...(typeof invalidToolNameRecovered === "boolean" ? { invalidToolNameRecovered } : {}),
    orchestrator: turn.orchestrator === "openhands" ? "openhands" : "openhands",
    orchestratorVersion: typeof turn.orchestratorVersion === "string" || turn.orchestratorVersion === null
      ? (turn.orchestratorVersion as string | null)
      : undefined,
    executionLane:
      turn.executionLane === "local_interactive" ||
      turn.executionLane === "openhands_headless" ||
      turn.executionLane === "openhands_remote"
        ? (turn.executionLane as BinaryExecutionLane)
        : undefined,
    runtimeTarget:
      turn.runtimeTarget === "local_native" || turn.runtimeTarget === "sandbox" || turn.runtimeTarget === "remote"
        ? (turn.runtimeTarget as "local_native" | "sandbox" | "remote")
        : undefined,
    toolBackend:
      turn.toolBackend === "openhands_native" || turn.toolBackend === "binary_host"
        ? (turn.toolBackend as "openhands_native" | "binary_host")
        : undefined,
    pluginPacks: Array.isArray(turn.pluginPacks) ? (turn.pluginPacks as BinaryPluginPack[]) : undefined,
    skillSources: Array.isArray(turn.skillSources) ? (turn.skillSources as BinarySkillSource[]) : undefined,
    conversationId: typeof turn.conversationId === "string" ? turn.conversationId : null,
    persistenceDir: typeof turn.persistenceDir === "string" ? turn.persistenceDir : null,
    jsonlPath: typeof turn.jsonlPath === "string" ? turn.jsonlPath : null,
    traceId: typeof turn.traceId === "string" ? turn.traceId : undefined,
    approvalState:
      turn.approvalState === "autonomous" ||
      turn.approvalState === "required" ||
      turn.approvalState === "granted" ||
      turn.approvalState === "denied" ||
      turn.approvalState === "not_required"
        ? (turn.approvalState as "autonomous" | "required" | "granted" | "denied" | "not_required")
        : undefined,
    worldContextUsed:
      turn.worldContextUsed && typeof turn.worldContextUsed === "object"
        ? (turn.worldContextUsed as { provided: boolean; tier?: string | null })
        : undefined,
    final: typeof turn.final === "string" ? turn.final : "",
    pendingToolCall,
    completionStatus: pendingToolCall ? "incomplete" : "complete",
    ...(qualityGateState ? { qualityGateState } : {}),
    ...(requiredProofs ? { requiredProofs } : {}),
    ...(satisfiedProofs ? { satisfiedProofs } : {}),
    ...(missingProofs ? { missingProofs } : {}),
    ...(qualityBlockedReason ? { qualityBlockedReason } : {}),
    ...(typeof repairAttemptCount === "number" ? { repairAttemptCount } : {}),
    ...(typeof maxRepairAttempts === "number" ? { maxRepairAttempts } : {}),
    ...(typeof finalizationBlocked === "boolean" ? { finalizationBlocked } : {}),
    ...(proofArtifactsDetailed ? { proofArtifactsDetailed } : {}),
    ...(progressState ? { progressState } : {}),
    ...(escalationStage ? { escalationStage } : {}),
    ...(escalationReason ? { escalationReason } : {}),
    ...(plannerLatencyMs !== undefined ? { plannerLatencyMs } : {}),
    ...(providerLatencyMs !== undefined ? { providerLatencyMs } : {}),
    ...(actionLatencyMs !== undefined ? { actionLatencyMs } : {}),
    ...(fallbackCount !== undefined ? { fallbackCount } : {}),
    receipt:
      turn.modelCandidate && typeof turn.modelCandidate === "object"
        ? {
            engine: "local_openhands_gateway",
            modelCandidate: turn.modelCandidate,
            persistenceDir: turn.persistenceDir,
            fallbackTrail: turn.fallbackTrail,
            ...(fallbackCount !== undefined ? { fallbackCount } : {}),
            ...(adapterMode ? { adapterMode } : {}),
            ...(latencyPolicy ? { latencyPolicy } : {}),
            ...(typeof smallModelForced === "boolean" ? { smallModelForced } : {}),
            ...(modelRoutingMode ? { modelRoutingMode } : {}),
            ...(typeof fixedModelAlias === "string" ? { fixedModelAlias } : {}),
            ...(typeof fallbackEnabled === "boolean" ? { fallbackEnabled } : {}),
            ...(budgetProfile ? { budgetProfile } : {}),
            ...(typeof firstTurnBudgetMs === "number" ? { firstTurnBudgetMs } : {}),
            ...(timeoutPolicy ? { timeoutPolicy } : {}),
            ...(terminalBackend ? { terminalBackend } : {}),
            ...(typeof terminalStrictMode === "boolean" ? { terminalStrictMode } : {}),
            ...(typeof terminalHealthReason === "string" ? { terminalHealthReason } : {}),
            ...(typeof nativeTerminalAvailable === "boolean" ? { nativeTerminalAvailable } : {}),
            ...(terminalBackendMode ? { terminalBackendMode } : {}),
            ...(typeof requireNativeTerminalTool === "boolean" ? { requireNativeTerminalTool } : {}),
            ...(typeof coercionApplied === "boolean" ? { coercionApplied } : {}),
            ...(typeof seedToolInjected === "boolean" ? { seedToolInjected } : {}),
            ...(typeof invalidToolNameRecovered === "boolean" ? { invalidToolNameRecovered } : {}),
            ...(policyLane ? { policyLane } : {}),
          }
        : {
            engine: "local_openhands_gateway",
            persistenceDir: turn.persistenceDir,
            fallbackTrail: turn.fallbackTrail,
            ...(fallbackCount !== undefined ? { fallbackCount } : {}),
            ...(adapterMode ? { adapterMode } : {}),
            ...(latencyPolicy ? { latencyPolicy } : {}),
            ...(typeof smallModelForced === "boolean" ? { smallModelForced } : {}),
            ...(modelRoutingMode ? { modelRoutingMode } : {}),
            ...(typeof fixedModelAlias === "string" ? { fixedModelAlias } : {}),
            ...(typeof fallbackEnabled === "boolean" ? { fallbackEnabled } : {}),
            ...(budgetProfile ? { budgetProfile } : {}),
            ...(typeof firstTurnBudgetMs === "number" ? { firstTurnBudgetMs } : {}),
            ...(timeoutPolicy ? { timeoutPolicy } : {}),
            ...(terminalBackend ? { terminalBackend } : {}),
            ...(typeof terminalStrictMode === "boolean" ? { terminalStrictMode } : {}),
            ...(typeof terminalHealthReason === "string" ? { terminalHealthReason } : {}),
            ...(typeof nativeTerminalAvailable === "boolean" ? { nativeTerminalAvailable } : {}),
            ...(terminalBackendMode ? { terminalBackendMode } : {}),
            ...(typeof requireNativeTerminalTool === "boolean" ? { requireNativeTerminalTool } : {}),
            ...(typeof coercionApplied === "boolean" ? { coercionApplied } : {}),
            ...(typeof seedToolInjected === "boolean" ? { seedToolInjected } : {}),
            ...(typeof invalidToolNameRecovered === "boolean" ? { invalidToolNameRecovered } : {}),
            ...(policyLane ? { policyLane } : {}),
          },
  };
}

function isSseContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("text/event-stream");
}

async function consumeLocalGatewaySseTurn(
  response: Response,
  onEvent?: (event: Record<string, unknown>) => Promise<void> | void,
  allowPartialTerminalFallback = false
): Promise<Record<string, unknown>> {
  if (!response.body) {
    throw new Error("Local OpenHands gateway stream ended before a body was returned.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let pendingDelta = "";
  let lastFlushAt = 0;
  let terminalFailureHint: string | null = null;

  const flushPartial = async (force = false): Promise<void> => {
    if (!pendingDelta) return;
    if (!force) {
      const now = Date.now();
      const shouldFlush =
        pendingDelta.length >= 24 || /[\n.!?]$/.test(pendingDelta) || now - lastFlushAt >= 55;
      if (!shouldFlush) return;
      lastFlushAt = now;
    }
    streamedText += pendingDelta;
    pendingDelta = "";
    if (onEvent) {
      await onEvent({
        event: "partial",
        data: streamedText,
        source: "gateway",
      });
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary < 0) break;
        const raw = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (!raw) continue;
        const lines = raw.split(/\r?\n/);
        let payload = "";
        for (const line of lines) {
          if (line.startsWith("data:")) payload += line.slice(5).trimStart();
        }
        if (!payload) continue;
        if (payload === "[DONE]") {
          await flushPartial(true);
          break;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        const eventName = typeof parsed.event === "string" ? parsed.event : "";
        const payloadData = Object.prototype.hasOwnProperty.call(parsed, "data") ? parsed.data : undefined;
        if (eventName === "token" && typeof payloadData === "string") {
          pendingDelta += payloadData;
          await flushPartial(false);
          continue;
        }
        if (eventName === "gateway.result" && payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)) {
          await flushPartial(true);
          return payloadData as Record<string, unknown>;
        }
        if (eventName === "gateway.error" && payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)) {
          await flushPartial(true);
          const typed = payloadData as Record<string, unknown>;
          const detail =
            (typeof typed.details === "string" && typed.details.trim()) ||
            (typeof typed.error === "string" && typed.error.trim()) ||
            "Local OpenHands gateway streamed a failure response.";
          throw new Error(detail);
        }
        if (eventName === "gateway.turn_failed" && payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)) {
          await flushPartial(true);
          const typed = payloadData as Record<string, unknown>;
          const detail =
            (typeof typed.details === "string" && typed.details.trim()) ||
            (typeof typed.error === "string" && typed.error.trim()) ||
            "Local OpenHands gateway streamed a terminal failure event.";
          throw new Error(detail);
        }
        if (eventName === "run.execution_status" && payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)) {
          const status = String((payloadData as { status?: unknown }).status || "")
            .trim()
            .toLowerCase();
          if (status.includes("error") || status.includes("stuck")) {
            terminalFailureHint = status;
          }
        }
      }
    }
  } catch (error) {
    await flushPartial(true);
    if (allowPartialTerminalFallback && error instanceof Error && error.name === "AbortError" && streamedText.trim()) {
      return {
        final: streamedText,
        toolCall: null,
        logs: ["gateway_stream_aborted_after_partial_text"],
      };
    }
    throw error;
  }

  await flushPartial(true);
  if (allowPartialTerminalFallback && streamedText.trim()) {
    return {
      final: streamedText,
      toolCall: null,
      logs: ["gateway_terminal_payload_missing_used_stream_text"],
    };
  }
  if (terminalFailureHint) {
    throw new Error(`Local OpenHands gateway ended before a terminal result (status=${terminalFailureHint}).`);
  }
  throw new Error("Local OpenHands gateway stream ended without a terminal result.");
}

async function runLocalGatewayAssist(input: LocalGatewayAssistInput): Promise<AssistRunEnvelope> {
  const baseUrl = input.gatewayBaseUrl || getLocalGatewayUrl();
  const availableTools = buildHostSupportedTools(input.run.workspaceRoot);
  const speedProfile = normalizeSpeedProfile(input.run.request.speedProfile);
  const initialTurn = !input.latestToolResult && !input.gatewayRunId;
  const firstTurnImageInputs = initialTurn ? normalizeImageInputs(input.run.request.imageInputs) : undefined;
  const routePolicy = buildTurnRoutePolicy({
    speedProfile,
    taskSpeedClass: input.taskSpeedClass,
    request: input.run.request,
    override: input.routePolicy,
  });
  const forcedSmallDetachedBudgetMs = Math.max(
    5_000,
    Math.round(
      toFinitePositiveNumber(input.firstTurnBudgetMs) ||
        FORCED_SMALL_MODEL_FIRST_TURN_BUDGET_MS
    )
  );
  const forcedSmallContinueBudgetMs = Math.max(
    10_000,
    Math.round(
      input.taskSpeedClass === "deep_code"
        ? Math.max(
            FORCED_SMALL_MODEL_DEEP_CODE_CONTINUE_TURN_BUDGET_MS,
            Math.min(routePolicy.turnBudgetMs, THOROUGH_TURN_BUDGET_MS)
          )
        : Math.min(routePolicy.turnBudgetMs, FORCED_SMALL_MODEL_CONTINUE_TURN_BUDGET_MS)
    )
  );
  const detachedTurnBudgetMs =
    input.latencyPolicy === "detached_15s_cap"
      ? initialTurn
        ? forcedSmallDetachedBudgetMs
        : forcedSmallContinueBudgetMs
      : input.latestToolResult
        ? 90_000
        : 45_000;
  const fastFailPolicy =
    initialTurn &&
    input.adapterMode === "force_binary_tool_adapter" &&
    input.latencyPolicy === "detached_15s_cap";
  const effectiveRoutePolicy =
    input.run.request.detach === true ||
    input.executionLane === "openhands_headless" ||
    input.executionLane === "openhands_remote"
      ? {
          ...routePolicy,
          turnBudgetMs: Math.min(routePolicy.turnBudgetMs, detachedTurnBudgetMs),
          ...(fastFailPolicy ? { maxIterations: Math.min(routePolicy.maxIterations, 4) } : {}),
          ...(fastFailPolicy ? { stallTimeoutMs: Math.min(routePolicy.stallTimeoutMs, 6_000) } : {}),
        }
      : routePolicy;
  const primaryReasoningEffort = inferReasoningEffort(
    speedProfile,
    input.taskSpeedClass,
    input.modelCandidate,
    initialTurn
  );
  const interactionKind =
    input.policyLane === "desktop"
      ? "machine_desktop"
      : input.policyLane === "browser"
        ? "browser_task"
        : input.policyLane === "chat"
          ? "chat"
          : "repo_code";
  const body = {
    protocol: "xpersona_openhands_gateway_v1",
    request: {
      mode: input.run.request.mode,
      task: input.run.request.task,
      interactionKind,
      conversationHistory: [],
      speedProfile,
      startupPhase: input.startupPhase,
      routePolicy: effectiveRoutePolicy,
      ...(firstTurnImageInputs ? { imageInputs: firstTurnImageInputs } : {}),
    },
    speedProfile,
    startupPhase: input.startupPhase,
    taskSpeedClass: input.taskSpeedClass,
    routePolicy: effectiveRoutePolicy,
    execution: {
      lane: input.executionLane,
      pluginPacks: input.pluginPacks,
      skillSources: input.skillSources,
      traceId: input.traceId,
      traceSampled: input.traceSampled,
    },
    executionHints: {
      adapterMode: input.adapterMode || "auto",
      latencyPolicy: input.latencyPolicy || "default",
      timeoutPolicy: input.timeoutPolicy || "default_retry",
      modelRoutingMode: input.modelRoutingMode || "single_fixed_free",
      ...(typeof input.fixedModelAlias === "string" && input.fixedModelAlias.trim()
        ? { fixedModelAlias: input.fixedModelAlias.trim() }
        : {}),
      fallbackEnabled: input.fallbackEnabled === true,
      budgetProfile: input.budgetProfile || "default",
      smallModelForced: input.smallModelForced === true,
      terminalBackendMode: input.terminalBackendMode || defaultTerminalBackendMode(),
      requireNativeTerminalTool: input.requireNativeTerminalTool === true,
      ...(input.policyLane ? { policyLane: input.policyLane } : {}),
      ...(typeof input.firstTurnBudgetMs === "number" ? { firstTurnBudgetMs: input.firstTurnBudgetMs } : {}),
    },
    targetInference: {
      kind: interactionKind,
      confidence: 0.9,
    },
    contextSelection: {
      workspaceRoot: input.run.workspaceRoot || process.cwd(),
      summary: "",
      fileContext: [],
      diagnostics: [],
      git: {},
      relevantFiles: [],
    },
    fallbackPlan: {
      objective: input.run.request.task,
      checkpoints: [],
      risks: [],
      nextActions: [],
    },
    toolTrace: buildLocalGatewayToolTrace(input.run),
    loopSummary: {
      stepCount: input.run.budgetState?.usedSteps || input.run.toolResults.length,
      mutationCount: input.run.budgetState?.usedMutations || 0,
      repairCount: 0,
    },
    availableTools,
    latestToolResult: input.latestToolResult ? sanitizeToolResultForContinue(input.latestToolResult) : null,
    repairDirective: input.repairDirective || null,
    model: {
      alias: input.modelCandidate.alias,
      requested: input.modelCandidate.alias,
      model: input.modelCandidate.model,
      openhandsModel: input.modelCandidate.model,
      openhandsCompatible: true,
      openhandsFallbackAliases: [],
      provider: input.modelCandidate.provider,
      baseUrl: input.modelCandidate.baseUrl,
      authSource: "user_connected",
      apiKey: input.modelCandidate.apiKey,
      latencyTier: input.modelCandidate.latencyTier || "balanced",
      reasoningDefault: input.modelCandidate.reasoningDefault || primaryReasoningEffort,
      intendedUse: input.modelCandidate.intendedUse || "chat",
      smallModelForced: input.smallModelForced === true,
      modelRoutingMode: input.modelRoutingMode || "single_fixed_free",
      ...(typeof input.fixedModelAlias === "string" && input.fixedModelAlias.trim()
        ? { fixedModelAlias: input.fixedModelAlias.trim() }
        : {}),
      fallbackEnabled: input.fallbackEnabled === true,
      reasoningEffort: primaryReasoningEffort,
      ...(input.modelCandidate.routeKind ? { routeKind: input.modelCandidate.routeKind } : {}),
      ...(input.modelCandidate.routeLabel ? { routeLabel: input.modelCandidate.routeLabel } : {}),
      ...(input.modelCandidate.routeReason ? { routeReason: input.modelCandidate.routeReason } : {}),
      ...(Array.isArray(input.modelCandidate.modelFamilies) ? { modelFamilies: input.modelCandidate.modelFamilies } : {}),
      ...(input.modelCandidate.extraHeaders ? { extraHeaders: input.modelCandidate.extraHeaders } : {}),
      capabilities: {
        supportsTextActions: true,
        supportsNativeToolCalls: false,
        preferredAdapter: "text_actions",
      },
      candidates: input.modelCandidates.map((candidate) => ({
        alias: candidate.alias,
        requested: candidate.alias,
        model: candidate.model,
        openhandsModel: candidate.model,
        provider: candidate.provider,
        baseUrl: candidate.baseUrl,
        authSource: "user_connected",
        apiKey: candidate.apiKey,
        latencyTier: candidate.latencyTier || "balanced",
        reasoningDefault: candidate.reasoningDefault || "medium",
        intendedUse: candidate.intendedUse || "chat",
        smallModelForced: Array.isArray(input.forcedSmallModelAliases)
          ? input.forcedSmallModelAliases.includes(candidate.alias)
          : undefined,
        reasoningEffort: inferReasoningEffort(speedProfile, input.taskSpeedClass, candidate, initialTurn),
        ...(candidate.routeKind ? { routeKind: candidate.routeKind } : {}),
        ...(candidate.routeLabel ? { routeLabel: candidate.routeLabel } : {}),
        ...(candidate.routeReason ? { routeReason: candidate.routeReason } : {}),
        ...(Array.isArray(candidate.modelFamilies) ? { modelFamilies: candidate.modelFamilies } : {}),
        ...(candidate.extraHeaders ? { extraHeaders: candidate.extraHeaders } : {}),
      })),
    },
    context: {
      desktop: input.desktopContext,
      browser: input.browserContext,
      ...(input.worldContext ? { worldModel: input.worldContext } : {}),
      ...(input.repoContext ? { repoModel: input.repoContext } : {}),
      ...(input.verificationPlan ? { verificationPlan: input.verificationPlan } : {}),
    },
    ...(input.mcp ? { mcp: input.mcp } : {}),
  };
  const pathSuffix = input.gatewayRunId
    ? `/v1/runs/${encodeURIComponent(input.gatewayRunId)}/continue`
    : "/v1/runs/start";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveRoutePolicy.turnBudgetMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${pathSuffix}?stream=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Turn budget exceeded after ${effectiveRoutePolicy.turnBudgetMs}ms while waiting for local gateway.`);
    }
    throw error;
  }
  let parsed: Record<string, unknown> = {};
  try {
    if (isSseContentType(response)) {
      parsed = await consumeLocalGatewaySseTurn(
        response,
        input.onEvent,
        input.taskSpeedClass === "chat_only"
      );
    } else {
      const raw = await response.text().catch(() => "");
      try {
        parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      if (!response.ok) {
        const detail =
          (typeof parsed.details === "string" && parsed.details.trim()) ||
          (typeof parsed.error === "string" && parsed.error.trim()) ||
          raw ||
          `Local OpenHands gateway failed with status ${response.status}.`;
        throw new Error(detail);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Turn budget exceeded after ${effectiveRoutePolicy.turnBudgetMs}ms while waiting for local gateway.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const envelope = mapLocalGatewayTurnToEnvelope(parsed, availableTools, input.run.toolResults.length + 1);
  return {
    ...envelope,
    ...(envelope.progressState ? { progressState: { ...envelope.progressState } } : {}),
    ...(typeof envelope.policyLane === "string"
      ? {}
      : input.policyLane
        ? { policyLane: input.policyLane }
        : {}),
    receipt: {
      ...(envelope.receipt && typeof envelope.receipt === "object" ? envelope.receipt : {}),
      routePolicy: effectiveRoutePolicy,
      adapterMode: input.adapterMode || "auto",
      latencyPolicy: input.latencyPolicy || "default",
      timeoutPolicy: input.timeoutPolicy || "default_retry",
      budgetProfile: input.budgetProfile || "default",
      smallModelForced: input.smallModelForced === true,
      terminalBackendMode: input.terminalBackendMode || defaultTerminalBackendMode(),
      requireNativeTerminalTool: input.requireNativeTerminalTool === true,
      ...(input.policyLane ? { policyLane: input.policyLane } : {}),
      ...(typeof input.firstTurnBudgetMs === "number" ? { firstTurnBudgetMs: input.firstTurnBudgetMs } : {}),
    },
  };
}

function isTerminalStatus(status: BinaryHostRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function extractDirectChatText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") return "";
  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const typedPart = part as { type?: unknown; text?: unknown };
      return typedPart.type === "text" && typeof typedPart.text === "string" ? typedPart.text : "";
    })
    .join("\n")
    .trim();
}

function supportsDirectFastChat(candidate: BinaryUserConnectedModelCandidate | null): boolean {
  if (!candidate?.baseUrl || !candidate.apiKey) return false;
  const provider = getProviderCatalogEntry(candidate.provider as BinaryProviderId);
  if (!provider) return false;
  return provider.runtimeKind === "openai_compatible" || provider.runtimeKind === "browser_session";
}

async function runDirectChatAssist(input: {
  run: StoredHostRun;
  modelCandidate: BinaryUserConnectedModelCandidate;
  modelCandidates: BinaryUserConnectedModelCandidate[];
  speedProfile: BinaryAssistSpeedProfile;
  taskSpeedClass: BinaryTaskSpeedClass;
}): Promise<AssistRunEnvelope> {
  const timeoutMs = input.speedProfile === "fast" ? 8_000 : input.speedProfile === "balanced" ? 15_000 : 25_000;
  const orderedCandidates = [
    input.modelCandidate,
    ...input.modelCandidates.filter((candidate) => candidate.alias !== input.modelCandidate.alias),
  ].filter((candidate, index, array) => {
    const firstIndex = array.findIndex((other) => other.alias === candidate.alias);
    return firstIndex === index && supportsDirectFastChat(candidate);
  });
  let final = "";
  let selectedCandidate = input.modelCandidate;
  let selectedReasoningEffort = inferReasoningEffort(input.speedProfile, input.taskSpeedClass, input.modelCandidate, true);
  let fallbackCount = 0;
  let lastError: string | null = null;
  for (const [index, candidate] of orderedCandidates.entries()) {
    const reasoningEffort = inferReasoningEffort(input.speedProfile, input.taskSpeedClass, candidate, true);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${candidate.apiKey}`,
      ...(candidate.extraHeaders || {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${candidate.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: candidate.model,
          messages: [{ role: "user", content: input.run.request.task }],
          temperature: 0.2,
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        }),
      });
      const raw = await response.text().catch(() => "");
      let parsed: Record<string, unknown> = {};
      try {
        parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      if (!response.ok) {
        lastError =
          (typeof parsed.error === "object" &&
            parsed.error &&
            typeof (parsed.error as { message?: unknown }).message === "string" &&
            (parsed.error as { message: string }).message.trim()) ||
          (typeof parsed.message === "string" && parsed.message.trim()) ||
          raw ||
          `Direct chat route failed with status ${response.status}.`;
        continue;
      }
      final = extractDirectChatText(parsed).trim();
      if (!final) {
        lastError = "The model returned an empty response.";
        continue;
      }
      selectedCandidate = candidate;
      selectedReasoningEffort = reasoningEffort;
      fallbackCount = index;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!final) {
    throw new Error(lastError || "All direct chat candidates failed.");
  }
  return {
    adapter: "direct_chat",
    final,
    completionStatus: "complete",
    pendingToolCall: null,
    missingRequirements: [],
    closureSummary: "Binary answered directly on the fast chat route.",
    lastMeaningfulProof: final,
    loopState: {
      stepCount: 1,
      mutationCount: 0,
      repairCount: 0,
      status: "completed",
      closurePhase: "complete",
    },
    progressState: {
      status: "completed",
      startupPhase: "fast_start",
      selectedSpeedProfile: input.speedProfile,
      selectedLatencyTier: input.modelCandidate.latencyTier || "fast",
      taskSpeedClass: input.taskSpeedClass,
    },
    fallbackCount,
    receipt: {
      provider: selectedCandidate.provider,
      model: selectedCandidate.model,
      routeKind: selectedCandidate.routeKind || null,
      routeLabel: selectedCandidate.routeLabel || null,
      routeReason: selectedCandidate.routeReason || null,
      transport: "direct_chat",
      reasoningEffort: selectedReasoningEffort,
      fallbackCount,
    },
  };
}

function maskApiKey(value: string | null): string | null {
  if (!value || value.length < 10) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function headerValue(header: string | string[] | undefined): string {
  if (Array.isArray(header)) return String(header[0] || "").trim();
  return String(header || "").trim();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function resolveTrustedCorsOrigin(req: IncomingMessage): string | null {
  const origin = headerValue(req.headers.origin);
  if (!origin) return null;
  if (origin === "null") return "null";
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHostname(parsed.hostname)) {
      return parsed.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function setResponseCorsOrigin(res: ServerResponse, origin: string | null): void {
  (res as ServerResponse & { [RESPONSE_CORS_ORIGIN]?: string | null })[RESPONSE_CORS_ORIGIN] = origin;
}

function withCors(res: ServerResponse): void {
  const allowedOrigin = (res as ServerResponse & { [RESPONSE_CORS_ORIGIN]?: string | null })[RESPONSE_CORS_ORIGIN];
  if (typeof allowedOrigin === "string" && allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  withCors(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(payload.byteLength),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function writeSseHeaders(res: ServerResponse): void {
  withCors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
}

function sendSseEvent(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

let hostBootstrapPromise: Promise<void> | null = null;
let openHandsWarmupScheduled = false;

async function ensureHostDirs(): Promise<void> {
  if (!hostBootstrapPromise) {
    hostBootstrapPromise = (async () => {
      await fs.mkdir(HOST_DIR, { recursive: true });
      await fs.mkdir(RUNS_DIR, { recursive: true });
      await worldModelService.initialize();
      await repoModelService.initialize();
      await automationRuntime.initialize();
      await automationRuntime.start();
      await agentProbeManager.initialize();
      await agentJobManager.initialize();
      await openHandsRuntimeSupervisor.initialize();
    })();
  }
  try {
    await hostBootstrapPromise;
  } catch (error) {
    hostBootstrapPromise = null;
    throw error;
  }
}

async function scheduleOpenHandsWarmup(): Promise<void> {
  if (openHandsWarmupScheduled) return;
  openHandsWarmupScheduled = true;
  try {
    await ensureHostDirs();
    await openHandsRuntimeSupervisor.warmup("chat-only");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Binary Host startup warmup skipped (${reason}).\n`);
  }
}

async function getOpenHandsRuntimeHealth(
  task?: string,
  options?: { strictNativeTerminal?: boolean }
): Promise<OpenHandsRuntimeStatus> {
  const desiredProfile = task ? inferOpenHandsRuntimeProfile(task) : "chat-only";
  return await openHandsRuntimeSupervisor.getStatus(desiredProfile, {
    strictNativeTerminal: options?.strictNativeTerminal === true,
  });
}

async function executeHostedAgentProbeTurn(input: {
  message: string;
  model?: string;
  gatewayRunId?: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  workspaceRoot?: string;
}): Promise<{
  runId: string;
  final: string;
  logs: string[];
  modelCandidate?: Record<string, unknown> | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
}> {
  let preferences = await loadPreferences();
  const remoteHealth = await getRemoteRuntimeHealth().catch(() => null);
  const executionDecision = resolveExecutionLane({
    task: input.message,
    workspaceTrustMode: input.workspaceRoot ? "trusted_full_access" : "trusted_read_only",
    taskSpeedClass: classifyTaskSpeed(input.message, input.workspaceRoot),
    probeSession: true,
    expectedLongRun: true,
    explicitLane: undefined,
    remoteConfigured: Boolean(remoteHealth?.available && remoteHealth.compatibility === "gateway_compatible"),
  });
  const pluginPacks = resolveEffectivePluginPacks({
    task: input.message,
    defaultPacks: preferences.defaultPluginPacks,
  });
  const skillSources = resolveOpenHandsSkillSources(input.workspaceRoot);
  const traceId = randomUUID();
  const auth = await getApiKeyRecord();
  if (!auth.apiKey) {
    throw new Error("No Binary IDE API key is configured in the local host.");
  }
  const worldContext = await buildWorldContextSlice().catch(() => undefined);
  const repoContext = await buildRepoContextSlice(input.workspaceRoot, input.message).catch(() => undefined);
  const verificationPlan = await buildVerificationPlanSlice(input.workspaceRoot).catch(() => undefined);
  preferences = await ensureOAuthProviderConnectionFresh(preferences);
  const providerSecrets = await getConnectionSecrets(preferences.connections);
  const userConnectedModels = buildUserConnectedModelCandidates({
    records: preferences.connections,
    secrets: providerSecrets,
    defaultProviderId: preferences.defaultProviderId,
  });
  const taskSpeedClass = classifyTaskSpeed(input.message, input.workspaceRoot);
  const orderedUserConnectedModels = orderUserConnectedModelsForRun({
    requestedModel: input.model || "Binary IDE",
    candidates: userConnectedModels,
    speedProfile: "balanced",
    taskSpeedClass,
    initialTurn: !input.gatewayRunId,
  });
  const resolvedProbeModel = resolveRequestedProviderModelAlias(input.model || "Binary IDE", orderedUserConnectedModels);
  const localGatewayModelCandidate =
    resolvedProbeModel.source === "user_connected"
      ? orderedUserConnectedModels.find((candidate) => candidate.alias === resolvedProbeModel.model) || null
      : null;
  if (localGatewayModelCandidate) {
    const gatewayBaseUrl = resolveGatewayBaseUrl({
      executionLane: executionDecision.lane,
      remoteGatewayUrl: remoteHealth?.available ? remoteHealth.gatewayUrl : null,
      localGatewayUrl: getLocalGatewayUrl(),
    });
    const initialTurn = !input.gatewayRunId;
    const body = {
      protocol: "xpersona_openhands_gateway_v1",
      request: {
        mode: "debug",
        task: input.message,
        interactionKind: "agent_probe",
        conversationHistory: input.conversationHistory,
      },
      speedProfile: "balanced",
      startupPhase: initialTurn ? "fast_start" : "full_run",
      taskSpeedClass,
      execution: {
        lane: executionDecision.lane,
        pluginPacks,
        skillSources,
        traceId,
        traceSampled: true,
      },
      probe: {
        enabled: true,
        workspaceRoot: input.workspaceRoot,
      },
      model: {
        alias: localGatewayModelCandidate.alias,
        requested: localGatewayModelCandidate.alias,
        model: localGatewayModelCandidate.model,
        openhandsModel: localGatewayModelCandidate.model,
        provider: localGatewayModelCandidate.provider,
        baseUrl: localGatewayModelCandidate.baseUrl,
        authSource: "user_connected",
        apiKey: localGatewayModelCandidate.apiKey,
        latencyTier: localGatewayModelCandidate.latencyTier || "balanced",
        reasoningDefault: localGatewayModelCandidate.reasoningDefault || "medium",
        intendedUse: localGatewayModelCandidate.intendedUse || "chat",
        reasoningEffort: inferReasoningEffort("balanced", taskSpeedClass, localGatewayModelCandidate, initialTurn),
        ...(localGatewayModelCandidate.routeKind ? { routeKind: localGatewayModelCandidate.routeKind } : {}),
        ...(localGatewayModelCandidate.routeLabel ? { routeLabel: localGatewayModelCandidate.routeLabel } : {}),
        ...(localGatewayModelCandidate.routeReason ? { routeReason: localGatewayModelCandidate.routeReason } : {}),
        ...(Array.isArray(localGatewayModelCandidate.modelFamilies)
          ? { modelFamilies: localGatewayModelCandidate.modelFamilies }
          : {}),
        ...(localGatewayModelCandidate.extraHeaders ? { extraHeaders: localGatewayModelCandidate.extraHeaders } : {}),
        capabilities: {
          supportsTextActions: true,
          supportsNativeToolCalls: false,
          preferredAdapter: "text_actions",
        },
        candidates: orderedUserConnectedModels.map((candidate) => ({
          alias: candidate.alias,
          requested: candidate.alias,
          model: candidate.model,
          openhandsModel: candidate.model,
          provider: candidate.provider,
          baseUrl: candidate.baseUrl,
          authSource: "user_connected",
          apiKey: candidate.apiKey,
          latencyTier: candidate.latencyTier || "balanced",
          reasoningDefault: candidate.reasoningDefault || "medium",
          intendedUse: candidate.intendedUse || "chat",
          reasoningEffort: inferReasoningEffort("balanced", taskSpeedClass, candidate, initialTurn),
          ...(candidate.routeKind ? { routeKind: candidate.routeKind } : {}),
          ...(candidate.routeLabel ? { routeLabel: candidate.routeLabel } : {}),
          ...(candidate.routeReason ? { routeReason: candidate.routeReason } : {}),
          ...(Array.isArray(candidate.modelFamilies) ? { modelFamilies: candidate.modelFamilies } : {}),
          ...(candidate.extraHeaders ? { extraHeaders: candidate.extraHeaders } : {}),
        })),
      },
      tom: {
        enabled: true,
        traceId,
      },
      context:
        worldContext || repoContext || verificationPlan
          ? {
              ...(worldContext ? { worldModel: worldContext } : {}),
              ...(repoContext ? { repoModel: repoContext } : {}),
              ...(verificationPlan ? { verificationPlan } : {}),
            }
          : {},
    };
    const pathSuffix = input.gatewayRunId
      ? `/v1/runs/${encodeURIComponent(input.gatewayRunId)}/continue`
      : "/v1/runs/start";
    const response = await fetch(`${gatewayBaseUrl}${pathSuffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        (typeof parsed.details === "string" && parsed.details.trim()) ||
          (typeof parsed.error === "string" && parsed.error.trim()) ||
          "Local OpenHands gateway probe failed."
      );
    }
    return {
      runId: typeof parsed.runId === "string" ? parsed.runId : input.gatewayRunId || randomUUID(),
      final: typeof parsed.final === "string" ? parsed.final : "",
      logs: Array.isArray(parsed.logs) ? parsed.logs.map((entry) => String(entry)) : [],
      modelCandidate:
        parsed.modelCandidate && typeof parsed.modelCandidate === "object"
          ? (parsed.modelCandidate as Record<string, unknown>)
          : null,
      fallbackAttempt: typeof parsed.fallbackAttempt === "number" ? parsed.fallbackAttempt : 0,
      failureReason: typeof parsed.failureReason === "string" ? parsed.failureReason : null,
      persistenceDir: typeof parsed.persistenceDir === "string" ? parsed.persistenceDir : null,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      fallbackTrail: Array.isArray(parsed.fallbackTrail) ? (parsed.fallbackTrail as Array<Record<string, unknown>>) : [],
    };
  }
  return await runHostedAgentProbe({
    baseUrl: preferences.baseUrl,
    apiKey: auth.apiKey,
    request: {
      message: input.message,
      model: input.model,
      gatewayRunId: input.gatewayRunId,
      workspaceRoot: input.workspaceRoot,
      conversationHistory: input.conversationHistory,
      context:
        worldContext || repoContext || verificationPlan
          ? {
              ...(worldContext ? { worldModel: worldContext } : {}),
              ...(repoContext ? { repoModel: repoContext } : {}),
              ...(verificationPlan ? { verificationPlan } : {}),
            }
          : undefined,
      tom: {
        enabled: true,
      },
    },
  });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function defaultPreferences(): BinaryHostPreferences {
  return {
    baseUrl: process.env.BINARY_IDE_BASE_URL || "http://localhost:3000",
    trustedWorkspaces: [],
    recentSessions: [],
    artifactHistory: [],
    preferredTransport: "host",
    orchestrationPolicy: defaultOrchestrationPolicy(),
    defaultPluginPacks: [],
    defaultProviderId: undefined,
    machineAutonomy: defaultMachineAutonomyPolicy(),
    backgroundAgents: [],
    automations: [],
    webhookSubscriptions: [],
    connections: [],
    machineRootPath: normalizeWorkspacePath(os.homedir()),
    machineRootMode: "hybrid_root",
    machineTrustMode: "full_machine_mutate",
    systemPathScope: "included",
    focusWorkspaceRoot: undefined,
    focusRepoRoot: undefined,
  };
}

async function loadPreferences(): Promise<BinaryHostPreferences> {
  const existing = await readJsonFile<Partial<BinaryHostPreferences>>(STATE_PATH);
  const defaultValue = defaultPreferences();
  const automations = Array.isArray(existing?.automations)
    ? (existing!.automations as BinaryAutomationDefinition[])
    : Array.isArray(existing?.backgroundAgents)
      ? (existing!.backgroundAgents as BinaryHostBackgroundAgent[]).map((agent) => legacyAgentToAutomation(agent))
      : [];
  const backgroundAgents = automations.map((automation) => automationToLegacyAgent(automation));
  return {
    ...defaultValue,
    ...(existing || {}),
    baseUrl: String(process.env.BINARY_IDE_BASE_URL || existing?.baseUrl || defaultValue.baseUrl).replace(/\/+$/, ""),
    trustedWorkspaces: Array.isArray(existing?.trustedWorkspaces) ? existing!.trustedWorkspaces : [],
    recentSessions: Array.isArray(existing?.recentSessions) ? existing!.recentSessions : [],
    artifactHistory: Array.isArray(existing?.artifactHistory) ? existing!.artifactHistory : [],
    orchestrationPolicy: normalizeOrchestrationPolicy(
      existing?.orchestrationPolicy && typeof existing.orchestrationPolicy === "object"
        ? (existing.orchestrationPolicy as Partial<BinaryOrchestrationPolicy>)
        : undefined,
      defaultValue.orchestrationPolicy
    ),
    defaultPluginPacks: normalizePluginPackIds(existing?.defaultPluginPacks) || defaultValue.defaultPluginPacks,
    backgroundAgents,
    automations,
    defaultProviderId:
      typeof existing?.defaultProviderId === "string" && getProviderCatalogEntry(existing.defaultProviderId)
        ? (existing.defaultProviderId as BinaryProviderId)
        : undefined,
    webhookSubscriptions: Array.isArray(existing?.webhookSubscriptions)
      ? (existing!.webhookSubscriptions as BinaryWebhookSubscription[])
      : [],
    connections: Array.isArray(existing?.connections) ? (existing!.connections as BinaryConnectionRecord[]) : [],
    machineRootPath:
      typeof existing?.machineRootPath === "string" && existing.machineRootPath.trim()
        ? normalizeWorkspacePath(existing.machineRootPath)
        : defaultValue.machineRootPath,
    machineRootMode:
      existing?.machineRootMode === "home_root" || existing?.machineRootMode === "hybrid_root"
        ? existing.machineRootMode
        : defaultValue.machineRootMode,
    machineTrustMode:
      existing?.machineTrustMode === "observe_first" ||
      existing?.machineTrustMode === "home_mutate" ||
      existing?.machineTrustMode === "full_machine_mutate"
        ? existing.machineTrustMode
        : defaultValue.machineTrustMode,
    systemPathScope:
      existing?.systemPathScope === "excluded" ||
      existing?.systemPathScope === "included" ||
      existing?.systemPathScope === "prompt"
        ? existing.systemPathScope
        : defaultValue.systemPathScope,
    focusWorkspaceRoot:
      typeof existing?.focusWorkspaceRoot === "string" && existing.focusWorkspaceRoot.trim()
        ? normalizeWorkspacePath(existing.focusWorkspaceRoot)
        : undefined,
    focusRepoRoot:
      typeof existing?.focusRepoRoot === "string" && existing.focusRepoRoot.trim()
        ? normalizeWorkspacePath(existing.focusRepoRoot)
        : undefined,
    machineAutonomy:
      existing?.machineAutonomy && typeof existing.machineAutonomy === "object"
        ? {
          ...defaultValue.machineAutonomy,
            ...existing.machineAutonomy,
          }
        : defaultValue.machineAutonomy,
  };
}

async function savePreferences(value: BinaryHostPreferences): Promise<void> {
  const normalized: BinaryHostPreferences = {
    ...value,
    orchestrationPolicy: normalizeOrchestrationPolicy(value.orchestrationPolicy, defaultOrchestrationPolicy()),
    backgroundAgents: value.automations.map((automation) => automationToLegacyAgent(automation)),
    connections: Array.isArray(value.connections) ? value.connections : [],
    ...(value.defaultProviderId ? { defaultProviderId: value.defaultProviderId } : {}),
  };
  await writeJsonFile(STATE_PATH, normalized);
}

async function readLegacyConfig(): Promise<Record<string, unknown>> {
  return (await readJsonFile<Record<string, unknown>>(LEGACY_CONFIG_PATH)) || {};
}

async function writeLegacyApiKey(apiKey?: string): Promise<void> {
  const current = await readLegacyConfig();
  const next = { ...current };
  if (apiKey) next.apiKey = apiKey;
  else delete next.apiKey;
  await writeJsonFile(LEGACY_CONFIG_PATH, next);
}

async function loadOptionalKeytar(): Promise<{
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
} | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier);") as (
      specifier: string
    ) => Promise<unknown>;
    const imported = (await dynamicImport("keytar")) as {
      default?: {
        getPassword: (service: string, account: string) => Promise<string | null>;
        setPassword: (service: string, account: string, password: string) => Promise<void>;
        deletePassword: (service: string, account: string) => Promise<boolean>;
      };
      getPassword: (service: string, account: string) => Promise<string | null>;
      setPassword: (service: string, account: string, password: string) => Promise<void>;
      deletePassword: (service: string, account: string) => Promise<boolean>;
    };
    return imported.default || imported;
  } catch {
    return null;
  }
}

async function getStoredSecretFile(): Promise<BinaryHostSecretStore & Record<string, unknown>> {
  return (await readJsonFile<BinaryHostSecretStore & Record<string, unknown>>(SECRET_FALLBACK_PATH)) || {};
}

async function setStoredSecretFileValue(key: string, value?: unknown): Promise<void> {
  const current = await getStoredSecretFile();
  if (typeof value === "undefined") delete current[key];
  else current[key] = value;
  await writeJsonFile(SECRET_FALLBACK_PATH, current);
}

async function getConnectionSecretMapFromFile(): Promise<Record<string, BinaryConnectionSecretRecord>> {
  const current = await getStoredSecretFile();
  const value = current.connections;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, BinaryConnectionSecretRecord>)
    : {};
}

async function setConnectionSecretMapFromFile(map: Record<string, BinaryConnectionSecretRecord>): Promise<void> {
  await setStoredSecretFileValue("connections", map);
}

async function getApiKeyRecord(): Promise<{ apiKey: string | null; storageMode: "secure" | "file" | "none"; secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    const apiKey = await keytar.getPassword("Binary IDE", "apiKey");
    if (apiKey) {
      return { apiKey, storageMode: "secure", secureStorageAvailable: true };
    }
  }
  const fallbackSecrets = await getStoredSecretFile();
  if (typeof fallbackSecrets.apiKey === "string" && fallbackSecrets.apiKey.trim()) {
    return { apiKey: fallbackSecrets.apiKey.trim(), storageMode: "file", secureStorageAvailable: Boolean(keytar) };
  }
  const legacyConfig = await readLegacyConfig();
  const legacyKey = typeof legacyConfig.apiKey === "string" ? legacyConfig.apiKey.trim() : "";
  if (legacyKey) {
    return { apiKey: legacyKey, storageMode: "file", secureStorageAvailable: Boolean(keytar) };
  }
  return { apiKey: null, storageMode: "none", secureStorageAvailable: Boolean(keytar) };
}

async function setApiKey(apiKey: string): Promise<{ storageMode: "secure" | "file"; secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.setPassword("Binary IDE", "apiKey", apiKey);
    await setStoredSecretFileValue("apiKey", apiKey);
    await writeLegacyApiKey(apiKey);
    return { storageMode: "secure", secureStorageAvailable: true };
  }
  await setStoredSecretFileValue("apiKey", apiKey);
  await writeLegacyApiKey(apiKey);
  return { storageMode: "file", secureStorageAvailable: false };
}

async function clearApiKey(): Promise<{ secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.deletePassword("Binary IDE", "apiKey");
  }
  await setStoredSecretFileValue("apiKey", undefined);
  await writeLegacyApiKey(undefined);
  return { secureStorageAvailable: Boolean(keytar) };
}

async function getConnectionSecretRecord(connectionId: string): Promise<BinaryConnectionSecretRecord | null> {
  const id = String(connectionId || "").trim();
  if (!id) return null;
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    const raw = await keytar.getPassword("Binary IDE", `connection:${id}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as BinaryConnectionSecretRecord;
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // Fall back to file storage below.
      }
    }
  }
  const fileMap = await getConnectionSecretMapFromFile();
  const value = fileMap[id];
  return value && typeof value === "object" ? value : null;
}

async function setConnectionSecretRecord(connectionId: string, secret: BinaryConnectionSecretRecord): Promise<{
  storageMode: "secure" | "file";
  secureStorageAvailable: boolean;
}> {
  const id = String(connectionId || "").trim();
  const normalized: BinaryConnectionSecretRecord = {
    ...(secret.bearerToken ? { bearerToken: secret.bearerToken } : {}),
    ...(secret.apiKey ? { apiKey: secret.apiKey } : {}),
    ...(secret.accessToken ? { accessToken: secret.accessToken } : {}),
    ...(secret.refreshToken ? { refreshToken: secret.refreshToken } : {}),
    ...(secret.expiresAt ? { expiresAt: secret.expiresAt } : {}),
    ...(Array.isArray(secret.scopes) && secret.scopes.length ? { scopes: secret.scopes } : {}),
    ...(secret.idToken ? { idToken: secret.idToken } : {}),
    ...(secret.accountHint ? { accountHint: secret.accountHint } : {}),
    ...(secret.tenantHint ? { tenantHint: secret.tenantHint } : {}),
    ...(secret.tokenType ? { tokenType: secret.tokenType } : {}),
    ...(secret.secretHeaders && Object.keys(secret.secretHeaders).length ? { secretHeaders: secret.secretHeaders } : {}),
  };
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.setPassword("Binary IDE", `connection:${id}`, JSON.stringify(normalized));
    const fileMap = await getConnectionSecretMapFromFile();
    fileMap[id] = normalized;
    await setConnectionSecretMapFromFile(fileMap);
    return { storageMode: "secure", secureStorageAvailable: true };
  }
  const fileMap = await getConnectionSecretMapFromFile();
  fileMap[id] = normalized;
  await setConnectionSecretMapFromFile(fileMap);
  return { storageMode: "file", secureStorageAvailable: false };
}

async function clearConnectionSecretRecord(connectionId: string): Promise<{ secureStorageAvailable: boolean }> {
  const id = String(connectionId || "").trim();
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.deletePassword("Binary IDE", `connection:${id}`);
  }
  const fileMap = await getConnectionSecretMapFromFile();
  delete fileMap[id];
  await setConnectionSecretMapFromFile(fileMap);
  return { secureStorageAvailable: Boolean(keytar) };
}

async function getConnectionSecrets(records: BinaryConnectionRecord[]): Promise<Record<string, BinaryConnectionSecretRecord | null>> {
  const entries = await Promise.all(
    records.map(async (record) => [record.id, await getConnectionSecretRecord(record.id)] as const)
  );
  return Object.fromEntries(entries);
}

async function getFallbackProviderApiKey(
  providerId: string | undefined,
  records: BinaryConnectionRecord[]
): Promise<string | null> {
  const normalizedProviderId = String(providerId || "").trim() as BinaryProviderId;
  if (!normalizedProviderId) return null;
  const catalog = getProviderCatalogEntry(normalizedProviderId);
  if (!catalog || catalog.authStrategy !== "api_key") return null;
  if (records.some((record) => record.providerId === normalizedProviderId)) return null;
  const fileMap = await getConnectionSecretMapFromFile();
  const apiKeys = Object.values(fileMap)
    .map((secret) => String(secret?.apiKey || "").trim())
    .filter(Boolean);
  if (apiKeys.length !== 1) return null;
  return apiKeys[0] || null;
}

function getConnectionStatusLabel(status: BinaryConnectionView["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "disabled") return "Disabled";
  if (status === "needs_auth") return "Needs auth";
  return "Failed test";
}

async function testRemoteConnection(
  record: BinaryConnectionRecord,
  secret: BinaryConnectionSecretRecord | null | undefined
): Promise<{ ok: boolean; status: number | null; message?: string }> {
  const materialized = buildOpenHandsMcpConfig([record], { [record.id]: secret });
  const server = materialized?.mcpServers?.[record.name];
  if (!server) {
    return { ok: false, status: null, message: "Connection is missing required credentials." };
  }
  const headers = {
    Accept: record.transport === "sse" ? "text/event-stream, application/json" : "application/json, text/event-stream",
    ...((server.headers && typeof server.headers === "object" ? server.headers : {}) as Record<string, string>),
  };

  try {
    const headResponse = await fetch(record.url, {
      method: "HEAD",
      headers,
    });
    if (headResponse.ok || [400, 401, 403, 405, 406].includes(headResponse.status)) {
      return { ok: true, status: headResponse.status };
    }
    if (headResponse.status === 404) {
      return { ok: false, status: 404, message: "The connection URL responded with 404 Not Found." };
    }
    const getResponse = await fetch(record.url, {
      method: "GET",
      headers,
    });
    if (getResponse.ok || [400, 401, 403, 405, 406].includes(getResponse.status)) {
      return { ok: true, status: getResponse.status };
    }
    return {
      ok: false,
      status: getResponse.status,
      message: `The connection URL responded with HTTP ${getResponse.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "Connection reachability test failed.",
    };
  }
}

async function validateAndTestConnection(input: {
  draft: ConnectionDraftInput;
  secret: BinaryConnectionSecretRecord;
}): Promise<
  | {
      ok: true;
      record: BinaryConnectionRecord;
      secret: BinaryConnectionSecretRecord;
      view: BinaryConnectionView;
      storageMode?: "secure" | "file";
      secureStorageAvailable?: boolean;
    }
  | { ok: false; message: string }
> {
  const validated = validateConnectionDraft(input.draft);
  if (!validated.ok) return validated;
  const now = nowIso();
  const record: BinaryConnectionRecord = {
    id: validated.draft.id || randomUUID(),
    name: validated.draft.name,
    transport: validated.draft.transport,
    url: validated.draft.url,
    authMode: validated.draft.authMode,
    enabled: validated.draft.enabled,
    source: validated.draft.source,
    createdAt: now,
    updatedAt: now,
    ...(validated.draft.headerName ? { headerName: validated.draft.headerName } : {}),
    ...(validated.draft.publicHeaders ? { publicHeaders: validated.draft.publicHeaders } : {}),
    ...(validated.draft.oauthSupported ? { oauthSupported: true } : {}),
    ...(validated.draft.importedFrom ? { importedFrom: validated.draft.importedFrom } : {}),
  };

  const hasSecret = connectionHasRequiredSecret(record, input.secret);
  if (!hasSecret) {
    record.lastValidationOk = false;
    record.lastValidationError = "This connection needs credentials before it can be tested.";
    record.lastValidatedAt = now;
    return {
      ok: true,
      record,
      secret: input.secret,
      view: buildConnectionView(record, input.secret),
    };
  }

  const testResult = await testRemoteConnection(record, input.secret);
  record.lastValidatedAt = now;
  record.lastValidationOk = testResult.ok;
  record.lastValidationError = testResult.ok ? undefined : testResult.message || "Connection test failed.";
  return {
    ok: true,
    record,
    secret: input.secret,
    view: buildConnectionView(record, input.secret),
  };
}

async function listConnectionViews(preferences?: BinaryHostPreferences): Promise<BinaryConnectionView[]> {
  const current = preferences || (await loadPreferences());
  const secrets = await getConnectionSecrets(current.connections);
  return current.connections
    .filter((record) => !isProviderConnection(record))
    .map((record) => buildConnectionView(record, secrets[record.id]))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeProviderBaseUrl(value: string | null | undefined, fallback: string): string {
  return String(value || "").trim().replace(/\/+$/, "") || fallback;
}

function sanitizeProviderValidationMessage(
  providerId: BinaryProviderId,
  status: number | null,
  raw?: string | null
): string {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return status ? `${providerId} validation failed with HTTP ${status}.` : `${providerId} validation failed.`;
  }
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function buildProviderValidationHeaders(
  providerId: BinaryProviderId,
  apiKey: string
): Record<string, string> {
  if (providerId === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function validateProviderApiKey(input: {
  providerId: BinaryProviderId;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}): Promise<{
  ok: boolean;
  status: number | null;
  message?: string;
  availableModels?: string[];
}> {
  const catalog = getProviderCatalogEntry(input.providerId);
  if (!catalog) {
    return { ok: false, status: null, message: "Unknown provider." };
  }
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) {
    return { ok: false, status: null, message: "API key is required." };
  }
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl, catalog.defaultBaseUrl);
  const model = String(input.defaultModel || "").trim() || catalog.defaultModel;
  const headers = buildProviderValidationHeaders(catalog.id, apiKey);

  const tryOpenAiModels = async () => {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        message: sanitizeProviderValidationMessage(catalog.id, response.status, raw),
      };
    }
    let payload: { data?: Array<{ id?: string }> } = {};
    try {
      payload = raw ? (JSON.parse(raw) as { data?: Array<{ id?: string }> }) : {};
    } catch {
      payload = {};
    }
    const availableModels = Array.isArray(payload.data)
      ? payload.data.map((item) => String(item?.id || "").trim()).filter(Boolean).slice(0, 120)
      : [];
    return {
      ok: true as const,
      status: response.status,
      availableModels,
    };
  };

  const tryOpenAiChatProbe = async () => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
        temperature: 0,
      }),
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        message: sanitizeProviderValidationMessage(catalog.id, response.status, raw),
      };
    }
    return {
      ok: true as const,
      status: response.status,
      availableModels: [model],
    };
  };

  const tryAnthropicModels = async () => {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        message: sanitizeProviderValidationMessage(catalog.id, response.status, raw),
      };
    }
    let payload: { data?: Array<{ id?: string }> } = {};
    try {
      payload = raw ? (JSON.parse(raw) as { data?: Array<{ id?: string }> }) : {};
    } catch {
      payload = {};
    }
    const availableModels = Array.isArray(payload.data)
      ? payload.data.map((item) => String(item?.id || "").trim()).filter(Boolean).slice(0, 120)
      : [model];
    return {
      ok: true as const,
      status: response.status,
      availableModels,
    };
  };

  try {
    if (catalog.validationKind === "anthropic_models") {
      return await tryAnthropicModels();
    }
    if (catalog.validationKind === "openai_chat_probe") {
      return await tryOpenAiChatProbe();
    }
    const modelsResult = await tryOpenAiModels();
    if (modelsResult.ok) return modelsResult;
    if ([400, 404, 405, 406].includes(modelsResult.status || 0)) {
      return await tryOpenAiChatProbe();
    }
    return modelsResult;
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "Provider validation failed.",
    };
  }
}

async function listProviderViews(input?: {
  preferences?: BinaryHostPreferences;
  includeBeta?: boolean;
}) {
  const basePreferences = input?.preferences || (await loadPreferences());
  const preferences = await ensureOAuthProviderConnectionFresh(basePreferences);
  const secrets = await getConnectionSecrets(preferences.connections);
  return listProviderProfiles({
    records: preferences.connections,
    secrets,
    defaultProviderId: preferences.defaultProviderId,
    includeBeta: input?.includeBeta ?? true,
  });
}

function findProviderRecord(
  preferences: BinaryHostPreferences,
  providerId: BinaryProviderId
): BinaryConnectionRecord | null {
  return preferences.connections.find((record) => record.providerId === providerId) || null;
}

async function upsertProviderConnection(input: {
  providerId: BinaryProviderId;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  setDefault?: boolean;
}): Promise<
  | {
      ok: true;
      provider: Awaited<ReturnType<typeof listProviderViews>>[number];
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
      availableModels: string[];
    }
  | { ok: false; statusCode: number; message: string }
> {
  const catalog = getProviderCatalogEntry(input.providerId);
  if (!catalog) return { ok: false, statusCode: 404, message: "Unknown provider." };
  if (catalog.authStrategy !== "api_key") {
    return { ok: false, statusCode: 501, message: "This provider is scaffolded for OAuth, but OAuth is not enabled yet." };
  }
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) return { ok: false, statusCode: 400, message: `${catalog.apiKeyLabel} is required.` };
  let preferences = await loadPreferences();
  const existing = findProviderRecord(preferences, catalog.id);
  const normalizedBaseUrl = normalizeProviderBaseUrl(input.baseUrl, catalog.defaultBaseUrl);
  const normalizedModel = String(input.defaultModel || "").trim() || catalog.defaultModel;
  const validation = await validateProviderApiKey({
    providerId: catalog.id,
    apiKey,
    baseUrl: normalizedBaseUrl,
    defaultModel: normalizedModel,
  });
  if (!validation.ok) {
    return {
      ok: false,
      statusCode: 400,
      message: validation.message || `${catalog.displayName} validation failed.`,
    };
  }

  const now = nowIso();
  const record: BinaryConnectionRecord = {
    id: existing?.id || randomUUID(),
    name: getProviderConnectionName(catalog),
    transport: "http",
    url: normalizedBaseUrl,
    authMode: "api-key",
    enabled: true,
    source: existing?.source || "guided",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    headerName: catalog.id === "anthropic" ? "x-api-key" : "Authorization",
    providerId: catalog.id,
    providerAuthStrategy: catalog.authStrategy,
    defaultBaseUrl: normalizedBaseUrl,
    defaultModel: normalizedModel,
    preferredForModels: input.setDefault === true || (!preferences.defaultProviderId && !existing),
    lastValidatedAt: now,
    lastValidationOk: true,
  };
  const storage = await setConnectionSecretRecord(record.id, { apiKey });
  preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
  if (input.setDefault === true || (!preferences.defaultProviderId && !existing)) {
    preferences.defaultProviderId = catalog.id;
  }
  await savePreferences(preferences);
  const profiles = await listProviderViews({ preferences });
  const provider = profiles.find((item) => item.id === catalog.id);
  if (!provider) {
    return { ok: false, statusCode: 500, message: "Provider was saved but could not be loaded." };
  }
  return {
    ok: true,
    provider,
    storageMode: storage.storageMode,
    secureStorageAvailable: storage.secureStorageAvailable,
    availableModels: validation.availableModels || [],
  };
}

async function persistOAuthProviderConnection(input: {
  preferences: BinaryHostPreferences;
  catalog: BinaryProviderCatalogEntry;
  secret: BinaryConnectionSecretRecord;
  baseUrl: string;
  defaultModel: string;
  setDefault?: boolean;
}): Promise<{
  ok: true;
  provider: Awaited<ReturnType<typeof listProviderViews>>[number];
  storageMode: "secure" | "file";
  secureStorageAvailable: boolean;
  availableModels: string[];
}> {
  const existing = findProviderRecord(input.preferences, input.catalog.id);
  const runtimeBaseUrl = resolveOAuthRuntimeBaseUrl(input.catalog, input.baseUrl);
  const route = buildProviderRouteMetadata(input.catalog, runtimeBaseUrl);
  const linkedAt = nowIso();
  const linkedAccountLabel = buildLinkedAccountLabel(input.secret);
  const validation = await validateProviderOAuthAccess({
    provider: input.catalog,
    secret: input.secret,
    baseUrl: runtimeBaseUrl,
    defaultModel: input.defaultModel,
  });
  const allowLinkedButLimited = isProviderQuotaOrRateLimitFailure(validation);
  if (!validation.ok && !allowLinkedButLimited) {
    throw new Error(validation.message || `${input.catalog.displayName} validation failed.`);
  }
  const runtimeReady = validation.ok;
  const runtimeReadinessReason =
    !validation.ok && allowLinkedButLimited
      ? `${input.catalog.displayName} linked successfully, but the provider is currently rate-limited or out of quota. Retry validation later.`
      : undefined;
  const record: BinaryConnectionRecord = {
    id: existing?.id || randomUUID(),
    name: getProviderConnectionName(input.catalog),
    transport: "http",
    url: runtimeBaseUrl,
    authMode: "oauth",
    enabled: true,
    source: existing?.source || "guided",
    createdAt: existing?.createdAt || linkedAt,
    updatedAt: linkedAt,
    oauthSupported: true,
    providerId: input.catalog.id,
    providerAuthStrategy: input.catalog.authStrategy,
    defaultBaseUrl: runtimeBaseUrl,
    defaultModel: input.defaultModel,
    preferredForModels: input.setDefault === true || (!input.preferences.defaultProviderId && !existing),
    linkedAt: existing?.linkedAt || linkedAt,
    ...(linkedAccountLabel ? { linkedAccountLabel } : existing?.linkedAccountLabel ? { linkedAccountLabel: existing.linkedAccountLabel } : {}),
    lastValidatedAt: linkedAt,
    lastValidationOk: validation.ok,
    lastValidationError: validation.ok ? undefined : validation.message || `${input.catalog.displayName} validation failed.`,
    lastRefreshedAt: linkedAt,
    authHealth: validation.ok ? "ready" : "blocked",
    refreshFailureCount: 0,
    lastAuthError: validation.ok ? undefined : validation.message || `${input.catalog.displayName} validation failed.`,
    runtimeReady,
    ...(runtimeReadinessReason ? { runtimeReadinessReason } : {}),
    routeKind: route.routeKind,
    routeLabel: route.routeLabel,
    routeReason: route.routeReason,
    modelFamilies: route.modelFamilies,
    availableModels: validation.availableModels || [input.defaultModel],
  };
  const storage = await setConnectionSecretRecord(record.id, input.secret);
  input.preferences.connections = [record, ...input.preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
  if (input.setDefault === true || (!input.preferences.defaultProviderId && !existing)) {
    input.preferences.defaultProviderId = input.catalog.id;
  }
  await savePreferences(input.preferences);
  const provider = (await listProviderViews({ preferences: input.preferences })).find((item) => item.id === input.catalog.id);
  if (!provider) throw new Error("Provider was linked but could not be loaded.");
  return {
    ok: true,
    provider,
    storageMode: storage.storageMode,
    secureStorageAvailable: storage.secureStorageAvailable,
    availableModels: validation.availableModels || [input.defaultModel],
  };
}

function isProviderQuotaOrRateLimitFailure(validation: {
  ok: boolean;
  status: number | null;
  message?: string;
}): boolean {
  if (validation.ok) return false;
  if (validation.status === 429) return true;
  const message = String(validation.message || "").toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("billing details") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests")
  );
}

async function persistBrowserSessionProviderConnection(input: {
  preferences: BinaryHostPreferences;
  catalog: BinaryProviderCatalogEntry;
  imported: ImportedBrowserProviderAuth;
  baseUrl?: string;
  defaultModel?: string;
  setDefault?: boolean;
}): Promise<{
  ok: true;
  provider: Awaited<ReturnType<typeof listProviderViews>>[number];
  storageMode: "secure" | "file";
  secureStorageAvailable: boolean;
}> {
  const existing = findProviderRecord(input.preferences, input.catalog.id);
  const linkedAt = nowIso();
  const importedBaseUrl = normalizeProviderBaseUrl(input.baseUrl, input.catalog.defaultBaseUrl);
  const requestedModel = String(input.defaultModel || "").trim() || input.catalog.defaultModel;
  const runtime = await resolveBrowserSessionRuntimeResolution({
    catalog: input.catalog,
    secret: input.imported.secret,
    baseUrl: importedBaseUrl,
    defaultModel: requestedModel,
  });
  const defaultModel =
    runtime.runtimeReady &&
    Array.isArray(runtime.availableModels) &&
    runtime.availableModels.length > 0 &&
    !runtime.availableModels.includes(requestedModel)
      ? runtime.availableModels[0]
      : requestedModel;
  const record: BinaryConnectionRecord = {
    id: existing?.id || randomUUID(),
    name: getProviderConnectionName(input.catalog),
    transport: "http",
    url: runtime.baseUrl,
    authMode: "oauth",
    enabled: true,
    source: existing?.source || "imported",
    createdAt: existing?.createdAt || linkedAt,
    updatedAt: linkedAt,
    oauthSupported: true,
    providerId: input.catalog.id,
    providerAuthStrategy: input.catalog.authStrategy,
    defaultBaseUrl: runtime.baseUrl,
    defaultModel,
    preferredForModels: input.setDefault === true || (!input.preferences.defaultProviderId && !existing),
    linkedAt: existing?.linkedAt || linkedAt,
    ...(input.imported.linkedAccountLabel
      ? { linkedAccountLabel: input.imported.linkedAccountLabel }
      : existing?.linkedAccountLabel
        ? { linkedAccountLabel: existing.linkedAccountLabel }
        : {}),
    lastValidatedAt: linkedAt,
    lastValidationOk: true,
    lastValidationError: undefined,
    lastRefreshedAt: linkedAt,
    authHealth: "ready",
    refreshFailureCount: 0,
    lastAuthError: undefined,
    runtimeReady: runtime.runtimeReady,
    ...(runtime.runtimeReadinessReason ? { runtimeReadinessReason: runtime.runtimeReadinessReason } : {}),
    routeKind: runtime.routeKind,
    routeLabel: runtime.routeLabel,
    routeReason: runtime.routeReason,
    modelFamilies: runtime.modelFamilies,
    availableModels: runtime.availableModels?.length ? runtime.availableModels : [defaultModel],
  };
  const storage = await setConnectionSecretRecord(record.id, input.imported.secret);
  input.preferences.connections = [record, ...input.preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
  if (input.setDefault === true || (!input.preferences.defaultProviderId && !existing)) {
    input.preferences.defaultProviderId = input.catalog.id;
  }
  await savePreferences(input.preferences);
  const provider = (await listProviderViews({ preferences: input.preferences })).find((item) => item.id === input.catalog.id);
  if (!provider) {
    throw new Error("Provider was linked but could not be loaded.");
  }
  return {
    ok: true,
    provider,
    storageMode: storage.storageMode,
    secureStorageAvailable: storage.secureStorageAvailable,
  };
}

async function startProviderOAuthSession(input: {
  req?: IncomingMessage;
  providerId: BinaryProviderId;
  baseUrl?: string;
  defaultModel?: string;
  setDefault?: boolean;
}): Promise<
  | {
      ok: true;
      session: ReturnType<OAuthSessionManager["startPkceSession"]>;
      provider: BinaryProviderCatalogEntry;
      launchUrl: string;
    }
  | { ok: false; statusCode: number; message: string }
> {
  const catalog = getProviderCatalogEntry(input.providerId);
  if (!catalog) return { ok: false, statusCode: 404, message: "Unknown provider." };
  if (!isOAuthProviderCatalog(catalog)) {
    return { ok: false, statusCode: 400, message: catalog.availabilityReason || "This provider does not support browser OAuth." };
  }
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl, catalog.defaultBaseUrl);
  const oauthConfig = resolveProviderOAuthConfig({ catalog, req: input.req, baseUrl });
  if (!oauthConfig) {
    return { ok: false, statusCode: 501, message: buildOauthAvailabilityMessage(catalog) };
  }
  const defaultModel = String(input.defaultModel || "").trim() || catalog.defaultModel;
  const metadata = {
    baseUrl,
    defaultModel,
    setDefault: input.setDefault === true,
    projectHint:
      parseProviderProjectHint({
        providerId: catalog.id,
        baseUrl,
        fallbackProjectId:
          catalog.id === "gemini"
            ? String(process.env.BINARY_GEMINI_GOOGLE_CLOUD_PROJECT || "").trim()
            : catalog.id === "vertex_ai"
              ? String(process.env.BINARY_VERTEX_GOOGLE_CLOUD_PROJECT || "").trim()
              : undefined,
      }) || "",
  };
  const session =
    catalog.authStrategy === "oauth_device"
      ? await oauthSessionManager.startDeviceSession({ providerId: catalog.id, config: oauthConfig, metadata })
      : oauthSessionManager.startPkceSession({ providerId: catalog.id, config: oauthConfig, metadata });
  return {
    ok: true,
    session,
    provider: catalog,
    launchUrl: session.authorizeUrl || session.verificationUri || catalog.browserConnectUrl,
  };
}

async function startProviderBrowserSession(input: {
  providerId: BinaryProviderId;
  baseUrl?: string;
  defaultModel?: string;
  setDefault?: boolean;
}): Promise<
  | {
      ok: true;
      session: BrowserProviderSessionView;
      provider: BinaryProviderCatalogEntry;
      launchUrl: string;
    }
  | { ok: false; statusCode: number; message: string }
> {
  const catalog = getProviderCatalogEntry(input.providerId);
  if (!catalog) return { ok: false, statusCode: 404, message: "Unknown provider." };
  if (!isBrowserSessionProviderCatalog(catalog)) {
    return {
      ok: false,
      statusCode: 400,
      message: catalog.availabilityReason || "This provider does not support Binary browser-session linking.",
    };
  }
  const session = browserSessionManager.start(catalog.id, {
    ...(typeof input.baseUrl === "string" && input.baseUrl.trim() ? { baseUrl: input.baseUrl.trim() } : {}),
    ...(typeof input.defaultModel === "string" && input.defaultModel.trim() ? { defaultModel: input.defaultModel.trim() } : {}),
    ...(input.setDefault === true ? { setDefault: true } : {}),
  });
  return {
    ok: true,
    session,
    provider: catalog,
    launchUrl: session.launchUrl,
  };
}

async function importLocalProviderConnection(input: {
  providerId: BinaryProviderId;
  baseUrl?: string;
  defaultModel?: string;
  setDefault?: boolean;
}): Promise<
  | {
      ok: true;
      provider: Awaited<ReturnType<typeof listProviderViews>>[number];
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
    }
  | { ok: false; statusCode: number; message: string }
> {
  const catalog = getProviderCatalogEntry(input.providerId);
  if (!catalog) return { ok: false, statusCode: 404, message: "Unknown provider." };
  const imported = await browserSessionManager.tryImport(catalog.id);
  if (!imported) {
    return {
      ok: false,
      statusCode: 404,
      message: `Binary could not find local credentials to import for ${catalog.displayName}.`,
    };
  }
  const preferences = await loadPreferences();
  const result = await persistBrowserSessionProviderConnection({
    preferences,
    catalog,
    imported,
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    setDefault: input.setDefault,
  });
  return result;
}

async function pollProviderBrowserSession(input: {
  sessionId: string;
}): Promise<
  | {
      ok: true;
      session: BrowserProviderSessionView;
      provider?: Awaited<ReturnType<typeof listProviderViews>>[number] | null;
    }
  | { ok: false; statusCode: number; message: string }
> {
  const session = await browserSessionManager.poll(input.sessionId);
  if (!session) {
    return { ok: false, statusCode: 404, message: "Binary could not find that browser linking session." };
  }
  if (session.status !== "connected") {
    return { ok: true, session };
  }
  const imported = browserSessionManager.getImportedAuth(input.sessionId);
  const metadata = browserSessionManager.getMetadata(input.sessionId) || {};
  const catalog = getProviderCatalogEntry(session.providerId);
  if (!catalog || !imported) {
    return { ok: false, statusCode: 500, message: "Binary linked the browser session but lost the imported credentials." };
  }
  const preferences = await loadPreferences();
  const result = await persistBrowserSessionProviderConnection({
    preferences,
    catalog,
    imported,
    baseUrl: typeof metadata.baseUrl === "string" ? metadata.baseUrl : undefined,
    defaultModel: typeof metadata.defaultModel === "string" ? metadata.defaultModel : undefined,
    setDefault: metadata.setDefault === true || !preferences.defaultProviderId,
  });
  return {
    ok: true,
    session,
    provider: result.provider,
  };
}

async function finalizeCompletedOAuthSession(session: StoredOAuthSession): Promise<{
  ok: true;
  provider: Awaited<ReturnType<typeof listProviderViews>>[number];
  storageMode: "secure" | "file";
  secureStorageAvailable: boolean;
  availableModels: string[];
}> {
  if (!session.tokenSet) {
    throw new Error("OAuth session completed without token data.");
  }
  const catalog = getProviderCatalogEntry(session.providerId);
  if (!catalog) {
    throw new Error("OAuth session completed for an unknown provider.");
  }
  let preferences = await loadPreferences();
  const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const projectHint = String(metadata.projectHint || "").trim();
  const tenantHint = String(session.tokenSet.tenantHint || projectHint || "").trim();
  const secret: BinaryConnectionSecretRecord = {
    accessToken: session.tokenSet.accessToken,
    ...(session.tokenSet.refreshToken ? { refreshToken: session.tokenSet.refreshToken } : {}),
    ...(session.tokenSet.expiresAt ? { expiresAt: session.tokenSet.expiresAt } : {}),
    ...(session.tokenSet.scopes?.length ? { scopes: session.tokenSet.scopes } : {}),
    ...(session.tokenSet.idToken ? { idToken: session.tokenSet.idToken } : {}),
    ...(session.tokenSet.accountHint ? { accountHint: session.tokenSet.accountHint } : {}),
    ...(tenantHint ? { tenantHint } : {}),
    ...(session.tokenSet.tokenType ? { tokenType: session.tokenSet.tokenType } : {}),
  };
  return persistOAuthProviderConnection({
    preferences,
    catalog,
    secret,
    baseUrl: String(metadata.baseUrl || "").trim() || catalog.defaultBaseUrl,
    defaultModel: String(metadata.defaultModel || "").trim() || catalog.defaultModel,
    setDefault: metadata.setDefault === true,
  });
}

async function refreshProviderConnection(providerId: BinaryProviderId): Promise<{
  ok: true;
  provider: Awaited<ReturnType<typeof listProviderViews>>[number];
} | {
  ok: false;
  statusCode: number;
  message: string;
}> {
  let preferences = await loadPreferences();
  const record = findProviderRecord(preferences, providerId);
  const catalog = getProviderCatalogEntry(providerId);
  if (!catalog || !record) {
    return { ok: false, statusCode: 404, message: "Provider is not connected." };
  }
  if (isBrowserSessionProviderCatalog(catalog)) {
    const imported = await browserSessionManager.tryImport(providerId);
    if (!imported) {
      return {
        ok: false,
        statusCode: 404,
        message: `Binary could not find refreshed local credentials for ${catalog.displayName}.`,
      };
    }
    const result = await persistBrowserSessionProviderConnection({
      preferences,
      catalog,
      imported,
      baseUrl: record.defaultBaseUrl || catalog.defaultBaseUrl,
      defaultModel: record.defaultModel || catalog.defaultModel,
      setDefault: preferences.defaultProviderId === providerId,
    });
    return {
      ok: true,
      provider: result.provider,
    };
  }
  if (record.authMode !== "oauth") {
    return { ok: false, statusCode: 400, message: "This provider does not use OAuth in Binary." };
  }
  const secret = await getConnectionSecretRecord(record.id);
  const refreshToken = String(secret?.refreshToken || "").trim();
  if (!refreshToken) {
    return { ok: false, statusCode: 400, message: "This provider needs to be linked again because it has no refresh token." };
  }
  const oauthConfig = resolveProviderOAuthConfig({
    catalog,
    baseUrl: record.defaultBaseUrl || catalog.defaultBaseUrl,
  });
  if (!oauthConfig) {
    return { ok: false, statusCode: 501, message: buildOauthAvailabilityMessage(catalog) };
  }
  try {
    const refreshed = await oauthSessionManager.refreshSessionToken({
      sessionOrConfig: oauthConfig,
      refreshToken,
    });
    const nextSecret: BinaryConnectionSecretRecord = {
      ...(secret || {}),
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      expiresAt: refreshed.expiresAt || secret?.expiresAt,
      scopes: refreshed.scopes || secret?.scopes,
      idToken: refreshed.idToken || secret?.idToken,
      tokenType: refreshed.tokenType || secret?.tokenType,
    };
    await setConnectionSecretRecord(record.id, nextSecret);
    record.updatedAt = nowIso();
    record.lastRefreshedAt = nowIso();
    record.authHealth = "ready";
    record.refreshFailureCount = 0;
    record.lastAuthError = undefined;
    preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
    await savePreferences(preferences);
    const provider = (await listProviderViews({ preferences })).find((item) => item.id === providerId);
    if (!provider) {
      return { ok: false, statusCode: 500, message: "Provider was refreshed but could not be loaded." };
    }
    return { ok: true, provider };
  } catch (error) {
    record.updatedAt = nowIso();
    record.authHealth = "refresh_failed";
    record.refreshFailureCount = Number(record.refreshFailureCount || 0) + 1;
    record.lastAuthError = error instanceof Error ? error.message : "OAuth token refresh failed.";
    preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
    await savePreferences(preferences);
    return {
      ok: false,
      statusCode: 400,
      message: record.lastAuthError,
    };
  }
}

async function ensureOAuthProviderConnectionFresh(preferences: BinaryHostPreferences): Promise<BinaryHostPreferences> {
  let mutated = false;
  for (const record of preferences.connections) {
    if (record.authMode !== "oauth" || !record.providerId) continue;
    const catalog = getProviderCatalogEntry(record.providerId);
    if (!catalog || !isOAuthProviderCatalog(catalog)) continue;
    const secret = await getConnectionSecretRecord(record.id);
    const expiresAt = Date.parse(String(secret?.expiresAt || ""));
    const refreshToken = String(secret?.refreshToken || "").trim();
    if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > OAUTH_REFRESH_SKEW_MS || !refreshToken) {
      continue;
    }
    const refreshed = await refreshProviderConnection(record.providerId);
    if (refreshed.ok) {
      mutated = true;
    }
  }
  return mutated ? await loadPreferences() : preferences;
}

async function testProviderConnection(providerId: BinaryProviderId): Promise<
  | {
      ok: true;
      provider: Awaited<ReturnType<typeof listProviderViews>>[number];
      test: { ok: boolean; status: number | null; message: string; availableModels?: string[] };
    }
  | { ok: false; statusCode: number; message: string }
> {
  const preferences = await loadPreferences();
  const record = findProviderRecord(preferences, providerId);
  const catalog = getProviderCatalogEntry(providerId);
  if (!catalog || !record) return { ok: false, statusCode: 404, message: "Provider is not connected." };
  if (isBrowserSessionProviderCatalog(catalog)) {
    const secret = await getConnectionSecretRecord(record.id);
    const importedFrom = String(secret?.importedFrom || "").trim();
    const linked = Boolean(secret?.accessToken?.trim() || secret?.refreshToken?.trim() || secret?.idToken?.trim());
    const runtime = linked
      ? await resolveBrowserSessionRuntimeResolution({
          catalog,
          secret: secret || {},
          baseUrl: record.defaultBaseUrl || catalog.defaultBaseUrl,
          defaultModel: record.defaultModel || catalog.defaultModel,
        })
      : null;
    record.lastValidatedAt = nowIso();
    record.lastValidationOk = linked;
    record.lastValidationError = linked ? undefined : "The linked browser account no longer has importable local credentials.";
    if (runtime) {
      record.runtimeReady = runtime.runtimeReady;
      record.runtimeReadinessReason = runtime.runtimeReadinessReason;
      record.routeKind = runtime.routeKind;
      record.routeLabel = runtime.routeLabel;
      record.routeReason = runtime.routeReason;
      record.modelFamilies = runtime.modelFamilies;
      record.availableModels = runtime.availableModels?.length ? runtime.availableModels : record.availableModels;
      if (runtime.runtimeReady) {
        record.defaultBaseUrl = runtime.baseUrl;
        record.url = runtime.baseUrl;
      }
    }
    record.updatedAt = nowIso();
    preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
    await savePreferences(preferences);
    const provider = (await listProviderViews({ preferences })).find((item) => item.id === providerId);
    if (!provider) return { ok: false, statusCode: 500, message: "Provider was tested but could not be loaded." };
    return {
      ok: true,
      provider,
      test: {
        ok: linked,
        status: null,
        ...(runtime?.availableModels?.length ? { availableModels: runtime.availableModels } : {}),
        message: !linked
          ? `Binary could not confirm a local linked session for ${catalog.displayName}.`
          : runtime?.runtimeReady
            ? `${catalog.displayName} browser session is linked locally and validated through ${runtime.routeLabel}.`
            : runtime?.runtimeReadinessReason ||
              (importedFrom
                ? `${catalog.displayName} browser session is linked locally from ${importedFrom}.`
                : `${catalog.displayName} browser session is linked locally.`),
      },
    };
  }
  const secret = await getConnectionSecretRecord(record.id);
  const validation =
    record.authMode === "oauth"
      ? await validateProviderOAuthAccess({
          provider: catalog,
          secret: secret || {},
          baseUrl: record.defaultBaseUrl || catalog.defaultBaseUrl,
          defaultModel: record.defaultModel || catalog.defaultModel,
        })
      : await validateProviderApiKey({
          providerId,
          apiKey: String(secret?.apiKey || "").trim(),
          baseUrl: record.defaultBaseUrl || catalog.defaultBaseUrl,
          defaultModel: record.defaultModel || catalog.defaultModel,
        });
  record.lastValidatedAt = nowIso();
  record.lastValidationOk = validation.ok;
  record.lastValidationError = validation.ok ? undefined : validation.message || "Provider validation failed.";
  record.lastAuthError = validation.ok ? undefined : record.lastAuthError;
  if (validation.ok && Array.isArray(validation.availableModels) && validation.availableModels.length) {
    record.availableModels = validation.availableModels;
  }
  record.updatedAt = nowIso();
  preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
  await savePreferences(preferences);
  const provider = (await listProviderViews({ preferences })).find((item) => item.id === providerId);
  if (!provider) return { ok: false, statusCode: 500, message: "Provider was tested but could not be loaded." };
  return {
    ok: true,
    provider,
    test: {
      ok: validation.ok,
      status: validation.status,
      ...(Array.isArray(validation.availableModels) ? { availableModels: validation.availableModels } : {}),
      message: validation.ok
        ? `${catalog.displayName} credentials are valid.`
        : validation.message || `${catalog.displayName} validation failed.`,
    },
  };
}

async function disconnectProvider(providerId: BinaryProviderId): Promise<{ ok: true } | { ok: false; statusCode: number; message: string }> {
  const preferences = await loadPreferences();
  const existing = findProviderRecord(preferences, providerId);
  if (!existing) return { ok: false, statusCode: 404, message: "Provider is not connected." };
  const catalog = getProviderCatalogEntry(providerId);
  const secret = await getConnectionSecretRecord(existing.id);
  if (catalog && existing.authMode === "oauth" && secret?.accessToken?.trim() && isOAuthProviderCatalog(catalog)) {
    const oauthConfig = resolveProviderOAuthConfig({
      catalog,
      baseUrl: existing.defaultBaseUrl || catalog.defaultBaseUrl,
    });
    if (oauthConfig) {
      await oauthSessionManager.revokeSessionToken({
        sessionOrConfig: oauthConfig,
        token: secret.accessToken.trim(),
      });
    }
  }
  preferences.connections = preferences.connections.filter((item) => item.id !== existing.id);
  if (preferences.defaultProviderId === providerId) {
    preferences.defaultProviderId = undefined;
  }
  await savePreferences(preferences);
  await clearConnectionSecretRecord(existing.id);
  return { ok: true };
}

async function setDefaultProvider(providerId: BinaryProviderId): Promise<
  | { ok: true; providers: Awaited<ReturnType<typeof listProviderViews>> }
  | { ok: false; statusCode: number; message: string }
> {
  const preferences = await loadPreferences();
  const existing = findProviderRecord(preferences, providerId);
  if (!existing) return { ok: false, statusCode: 404, message: "Connect the provider before making it default." };
  preferences.defaultProviderId = providerId;
  preferences.connections = preferences.connections.map((record) =>
    record.providerId ? { ...record, preferredForModels: record.providerId === providerId } : record
  );
  await savePreferences(preferences);
  return {
    ok: true,
    providers: await listProviderViews({ preferences }),
  };
}

function openExternalUrl(targetUrl: string): void {
  const url = String(targetUrl || "").trim();
  if (!url) throw new Error("A browser URL is required.");
  if (process.platform === "win32") {
    const child = spawn("explorer.exe", [url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function getPublicHostBaseUrl(req?: IncomingMessage): string {
  const hostHeader = String(req?.headers.host || "").trim();
  if (hostHeader) {
    return `http://${hostHeader.replace(/\/+$/, "")}`;
  }
  return `http://${HOST}:${PORT}`;
}

function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  const normalized = String(token || "").trim();
  const segments = normalized.split(".");
  if (segments.length < 2) return null;
  try {
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isOAuthProviderCatalog(catalog: BinaryProviderCatalogEntry | null | undefined): boolean {
  return Boolean(
    catalog &&
      (catalog.connectionMode === "direct_oauth_pkce" ||
        catalog.connectionMode === "direct_oauth_device" ||
        catalog.connectionMode === "hub_oauth")
  );
}

function isBrowserSessionProviderCatalog(catalog: BinaryProviderCatalogEntry | null | undefined): boolean {
  return Boolean(
    catalog &&
      (catalog.connectionMode === "portal_session" || catalog.connectionMode === "local_credential_adapter")
  );
}

function normalizeScopes(value: string | string[] | undefined, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return [...fallback];
  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseProviderProjectHint(input: {
  providerId: BinaryProviderId;
  baseUrl: string;
  fallbackProjectId?: string;
}): string | undefined {
  const fallback = String(input.fallbackProjectId || "").trim();
  if (fallback) return fallback;
  if (input.providerId === "vertex_ai") {
    const match = input.baseUrl.match(/\/projects\/([^/]+)\//i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function resolveProviderOAuthConfig(input: {
  catalog: BinaryProviderCatalogEntry;
  req?: IncomingMessage;
  baseUrl: string;
}): OAuthProviderRuntimeConfig | null {
  const redirectUri = `${getPublicHostBaseUrl(input.req)}/v1/providers/connect/oauth/callback`;
  if (input.catalog.id === "gemini") {
    const clientId = String(process.env.BINARY_GOOGLE_OAUTH_CLIENT_ID || "").trim();
    if (!clientId) return null;
    return {
      providerId: input.catalog.id,
      clientId,
      clientSecret: String(process.env.BINARY_GOOGLE_OAUTH_CLIENT_SECRET || "").trim() || undefined,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      revocationEndpoint: "https://oauth2.googleapis.com/revoke",
      redirectUri,
      scopes: normalizeScopes(process.env.BINARY_GEMINI_OAUTH_SCOPES, [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/generative-language.retriever",
      ]),
      extraAuthorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    };
  }
  if (input.catalog.id === "vertex_ai") {
    const clientId = String(process.env.BINARY_GOOGLE_OAUTH_CLIENT_ID || "").trim();
    if (!clientId) return null;
    return {
      providerId: input.catalog.id,
      clientId,
      clientSecret: String(process.env.BINARY_GOOGLE_OAUTH_CLIENT_SECRET || "").trim() || undefined,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      revocationEndpoint: "https://oauth2.googleapis.com/revoke",
      redirectUri,
      scopes: normalizeScopes(process.env.BINARY_VERTEX_OAUTH_SCOPES, [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/cloud-platform",
      ]),
      extraAuthorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    };
  }
  if (input.catalog.id === "azure_openai") {
    const clientId = String(process.env.BINARY_AZURE_OAUTH_CLIENT_ID || "").trim();
    if (!clientId) return null;
    const tenant = String(process.env.BINARY_AZURE_OAUTH_TENANT_ID || "organizations").trim() || "organizations";
    return {
      providerId: input.catalog.id,
      clientId,
      authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      revocationEndpoint: undefined,
      redirectUri,
      scopes: normalizeScopes(process.env.BINARY_AZURE_OAUTH_SCOPES, [
        "openid",
        "profile",
        "offline_access",
        "https://cognitiveservices.azure.com/.default",
      ]),
    };
  }
  return null;
}

function buildOauthAvailabilityMessage(catalog: BinaryProviderCatalogEntry): string {
  if (!isOAuthProviderCatalog(catalog)) {
    return catalog.availabilityReason || `${catalog.displayName} does not support true browser OAuth in Binary today.`;
  }
  if (catalog.id === "gemini" || catalog.id === "vertex_ai") {
    return "OAuth is supported here, but this Binary Host build needs a Google desktop OAuth client ID configured before browser linking can start.";
  }
  if (catalog.id === "azure_openai") {
    return "OAuth is supported here, but this Binary Host build needs an Azure public client app ID configured before browser linking can start.";
  }
  return `${catalog.displayName} browser auth is not configured on this Binary Host build.`;
}

function buildLinkedAccountLabel(secret: BinaryConnectionSecretRecord): string | undefined {
  const idTokenClaims = decodeJwtPayload(secret.idToken);
  const account =
    String(
      secret.accountHint ||
        idTokenClaims?.email ||
        idTokenClaims?.preferred_username ||
        idTokenClaims?.upn ||
        ""
    ).trim();
  if (!account) return undefined;
  const tenant = String(secret.tenantHint || idTokenClaims?.tid || "").trim();
  return tenant ? `${account} (${tenant})` : account;
}

function buildProviderRouteMetadata(catalog: BinaryProviderCatalogEntry, baseUrl?: string): {
  routeKind: string;
  routeLabel: string;
  routeReason: string;
  modelFamilies: string[];
} {
  if (catalog.id === "gemini" && String(baseUrl || "").includes("127.0.0.1:8004")) {
    return {
      routeKind: "gemini_oauth_bridge",
      routeLabel: "Gemini via local OAuth bridge",
      routeReason: "Using a verified local bridge for the Gemini OAuth route.",
      modelFamilies: ["gemini", "google"],
    };
  }
  if (catalog.id === "gemini") {
    return {
      routeKind: "gemini_direct_oauth",
      routeLabel: "Gemini via Google OAuth",
      routeReason: "Using the direct Gemini OAuth route.",
      modelFamilies: ["gemini", "google"],
    };
  }
  if (catalog.id === "azure_openai") {
    return {
      routeKind: "azure_openai_entra",
      routeLabel: "OpenAI-family via Azure OpenAI (Entra)",
      routeReason: "Using the Azure OpenAI OAuth route for OpenAI-family models.",
      modelFamilies: ["openai", "gpt", "azure_openai"],
    };
  }
  if (catalog.id === "vertex_ai") {
    return {
      routeKind: "vertex_ai_oauth",
      routeLabel: "Gemini via Vertex AI OAuth",
      routeReason: "Using the Vertex AI OAuth route for Gemini-family models.",
      modelFamilies: ["gemini", "google", "vertex_ai"],
    };
  }
  if (catalog.id === "chatgpt_portal") {
    return {
      routeKind: "chatgpt_portal",
      routeLabel: "ChatGPT / Codex browser account",
      routeReason: "Using a locally linked ChatGPT or Codex browser-account route.",
      modelFamilies: ["openai", "gpt", "chatgpt"],
    };
  }
  if (catalog.id === "qwen_portal") {
    return {
      routeKind: "qwen_portal",
      routeLabel: "Qwen browser account",
      routeReason: "Using a locally linked Qwen browser-account route.",
      modelFamilies: ["qwen", "qwen_portal"],
    };
  }
  return {
    routeKind: `${catalog.id}_oauth`,
    routeLabel: `${catalog.displayName} via browser auth`,
    routeReason: `Using the ${catalog.displayName} browser-auth route.`,
    modelFamilies: [...(catalog.modelFamilies || [catalog.id])],
  };
}

function resolveOAuthRuntimeBaseUrl(catalog: BinaryProviderCatalogEntry, baseUrl: string): string {
  const normalizedBaseUrl = String(baseUrl || "").trim() || catalog.defaultBaseUrl;
  if (catalog.id === "gemini") {
    const override = String(process.env.BINARY_GEMINI_OAUTH_RUNTIME_URL || "").trim();
    if (override) return override.replace(/\/+$/, "");
  }
  return normalizedBaseUrl.replace(/\/+$/, "");
}

type BrowserSessionRuntimeResolution = {
  runtimeReady: boolean;
  baseUrl: string;
  routeKind: string;
  routeLabel: string;
  routeReason: string;
  modelFamilies: string[];
  runtimeReadinessReason?: string;
  availableModels?: string[];
};

function buildBrowserSessionRuntimeFallbackReason(catalog: BinaryProviderCatalogEntry): string {
  if (catalog.id === "chatgpt_portal") {
    return "Binary linked the browser account locally. Configure BINARY_CHATGPT_PORTAL_RUNTIME_URL to a compatible local bridge, such as a Codex or ChatGPT proxy, before OpenHands can use this route.";
  }
  if (catalog.id === "qwen_portal") {
    return "Binary linked the browser account locally. Configure BINARY_QWEN_PORTAL_RUNTIME_URL to a compatible local bridge before OpenHands can use this route.";
  }
  return "Binary linked the browser account locally, but a dedicated runtime bridge is still required before this route can replace direct API inference.";
}

function collectBrowserSessionRuntimeBridgeCandidates(
  catalog: BinaryProviderCatalogEntry,
  baseUrl: string
): string[] {
  const values = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (normalized) values.add(normalized);
  };
  if (catalog.id === "chatgpt_portal") {
    add(process.env.BINARY_CHATGPT_PORTAL_RUNTIME_URL);
    add(process.env.BINARY_CHATGPT_PORTAL_BRIDGE_URL);
    add("http://host.docker.internal:8000/codex/v1");
    add("http://127.0.0.1:8000/codex/v1");
    add("http://127.0.0.1:8000/v1");
  }
  if (catalog.id === "qwen_portal") {
    add(process.env.BINARY_QWEN_PORTAL_RUNTIME_URL);
    add(process.env.BINARY_QWEN_PORTAL_BRIDGE_URL);
    add("http://127.0.0.1:8000/v1");
  }
  if (baseUrl && baseUrl !== catalog.defaultBaseUrl) {
    add(baseUrl);
  }
  return [...values];
}

async function resolveBrowserSessionRuntimeResolution(input: {
  catalog: BinaryProviderCatalogEntry;
  secret: BinaryConnectionSecretRecord;
  baseUrl: string;
  defaultModel: string;
}): Promise<BrowserSessionRuntimeResolution> {
  const baseRoute = buildProviderRouteMetadata(input.catalog);
  const validationProvider: BinaryProviderCatalogEntry = {
    ...input.catalog,
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
  };
  for (const bridgeBaseUrl of collectBrowserSessionRuntimeBridgeCandidates(input.catalog, input.baseUrl)) {
    const validation = await validateProviderOAuthAccess({
      provider: validationProvider,
      secret: input.secret,
      baseUrl: bridgeBaseUrl,
      defaultModel: input.defaultModel,
    });
    if (!validation.ok) continue;
    return {
      runtimeReady: true,
      baseUrl: bridgeBaseUrl,
      routeKind: `${input.catalog.id}_bridge`,
      routeLabel:
        input.catalog.id === "chatgpt_portal"
          ? "ChatGPT / Codex via local bridge"
          : input.catalog.id === "qwen_portal"
            ? "Qwen via local bridge"
            : `${input.catalog.displayName} via local bridge`,
      routeReason: `Using a verified local OpenAI-compatible bridge for the linked ${input.catalog.displayName} account.`,
      modelFamilies: [...baseRoute.modelFamilies],
      availableModels: validation.availableModels?.length ? validation.availableModels : [input.defaultModel],
    };
  }
  return {
    runtimeReady: false,
    baseUrl: input.baseUrl,
    routeKind: baseRoute.routeKind,
    routeLabel: baseRoute.routeLabel,
    routeReason: baseRoute.routeReason,
    modelFamilies: [...baseRoute.modelFamilies],
    runtimeReadinessReason: buildBrowserSessionRuntimeFallbackReason(input.catalog),
    availableModels: [input.defaultModel],
  };
}

async function fetchProviderOauthModels(input: {
  provider: BinaryProviderCatalogEntry;
  baseUrl: string;
  secret: BinaryConnectionSecretRecord;
}): Promise<string[]> {
  const accessToken = String(input.secret.accessToken || "").trim();
  if (!accessToken) return [];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if ((input.provider.id === "gemini" || input.provider.id === "vertex_ai") && input.secret.tenantHint?.trim()) {
    headers["x-goog-user-project"] = input.secret.tenantHint.trim();
  }
  const tryUrls =
    input.provider.id === "gemini"
      ? [
          "https://generativelanguage.googleapis.com/v1/models",
          `${input.baseUrl.replace(/\/+$/, "")}/models`,
        ]
      : [`${input.baseUrl.replace(/\/+$/, "")}/models`];
  for (const target of tryUrls) {
    try {
      const response = await fetch(target, { method: "GET", headers });
      const raw = await response.text().catch(() => "");
      if (!response.ok) continue;
      const parsed = raw ? (JSON.parse(raw) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> }) : {};
      const modelIds = [
        ...(Array.isArray(parsed.data) ? parsed.data.map((item) => String(item?.id || "").trim()) : []),
        ...(Array.isArray(parsed.models)
          ? parsed.models.map((item) => String(item?.name || "").trim().replace(/^models\//, ""))
          : []),
      ].filter(Boolean);
      if (modelIds.length) return Array.from(new Set(modelIds)).slice(0, 120);
    } catch {
      // Try the next endpoint.
    }
  }
  return [];
}

async function validateProviderOAuthAccess(input: {
  provider: BinaryProviderCatalogEntry;
  secret: BinaryConnectionSecretRecord;
  baseUrl: string;
  defaultModel: string;
}): Promise<{ ok: boolean; status: number | null; message?: string; availableModels?: string[] }> {
  const accessToken = String(input.secret.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: null, message: "OAuth access token is missing." };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if ((input.provider.id === "gemini" || input.provider.id === "vertex_ai") && input.secret.tenantHint?.trim()) {
    headers["x-goog-user-project"] = input.secret.tenantHint.trim();
  }
  try {
    if (input.provider.validationKind === "openai_models") {
      const response = await fetch(`${input.baseUrl.replace(/\/+$/, "")}/models`, { method: "GET", headers });
      const raw = await response.text().catch(() => "");
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          message: sanitizeProviderValidationMessage(input.provider.id, response.status, raw),
        };
      }
      const availableModels = await fetchProviderOauthModels(input);
      return {
        ok: true,
        status: response.status,
        availableModels: availableModels.length ? availableModels : [input.defaultModel],
      };
    }
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.defaultModel,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
        temperature: 0,
      }),
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: sanitizeProviderValidationMessage(input.provider.id, response.status, raw),
      };
    }
    const availableModels = await fetchProviderOauthModels(input);
    return {
      ok: true,
      status: response.status,
      availableModels: availableModels.length ? availableModels : [input.defaultModel],
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "OAuth validation failed.",
    };
  }
}

function resolveRequestedProviderModelAlias(
  requestedModel: string,
  candidates: BinaryUserConnectedModelCandidate[]
): { model: string; source: "platform" | "user_connected" } {
  const normalized = String(requestedModel || "").trim();
  if (!candidates.length) {
    return {
      model: normalized || "Binary IDE",
      source: "platform",
    };
  }
  const defaultCandidate = candidates.find((candidate) => candidate.preferred) || candidates[0];
  if (!normalized || normalized.toLowerCase() === "binary ide") {
    return {
      model: defaultCandidate.alias,
      source: "user_connected",
    };
  }
  const lowered = normalized.toLowerCase();
  const matched = candidates.find(
    (candidate) =>
      candidate.alias.toLowerCase() === lowered ||
      candidate.model.toLowerCase() === lowered ||
      candidate.provider.toLowerCase() === lowered ||
      candidate.displayName.toLowerCase() === lowered ||
      (Array.isArray(candidate.modelFamilies) && candidate.modelFamilies.some((family) => family.toLowerCase() === lowered))
  );
  return matched
    ? { model: matched.alias, source: "user_connected" }
    : { model: normalized, source: "platform" };
}

async function materializeEnabledConnections(
  preferences: BinaryHostPreferences,
  mode: AssistMode
): Promise<MaterializedMcpConfig | undefined> {
  if (mode === "debug") return undefined;
  const secrets = await getConnectionSecrets(preferences.connections);
  const eligible = preferences.connections.filter((record) => {
    if (isProviderConnection(record)) return false;
    if (!record.enabled) return false;
    if (getConnectionStatus(record, secrets[record.id]) !== "connected") return false;
    return record.lastValidationOk !== false;
  });
  return buildOpenHandsMcpConfig(eligible, secrets);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > JSON_LIMIT_BYTES) {
        reject(new Error("Request body exceeded the 1.5MB limit."));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function createHostToolExecutor(input: {
  run: StoredHostRun;
  workspaceRoot?: string;
  task: string;
  preferences: BinaryHostPreferences;
}): Promise<LocalToolExecutor> {
  const executionController = new AutonomyExecutionController(input.preferences.machineAutonomy);
  const focusLease = sanitizeFocusLease(activeFocusLease);
  if (focusLease) {
    const remainingMs = Math.max(500, new Date(focusLease.expiresAt).getTime() - Date.now());
    executionController.updateFocusLease({
      surface: focusLease.surface,
      source: focusLease.source,
      leaseMs: remainingMs,
      active: true,
    });
  }
  const desktopExecutor = new DesktopToolExecutor(
    machineAutonomyController,
    input.preferences.machineAutonomy,
    executionController,
    nativeAppRuntime,
    input.task,
    {
      autoCloseLaunchedApps: input.run.request.detach === true,
    }
  );
  const browserExecutor = new BrowserToolExecutor(
    browserRuntimeController,
    input.preferences.machineAutonomy,
    executionController
  );
  const worldExecutor = new WorldToolExecutor(worldModelService);
  const repoExecutor = input.workspaceRoot ? new RepoToolExecutor(repoModelService, input.workspaceRoot) : null;
  const moduleRef = (await import("../../../sdk/playground-ai-cli/dist/tool-executor.js")) as {
    CliToolExecutor: new (
      workspaceRoot: string,
      preferredProjectRoot?: string | null
    ) => { execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult> };
  };
  const workspaceExecutor = new moduleRef.CliToolExecutor(
    input.workspaceRoot || input.run.machineRootPath || process.cwd(),
    input.workspaceRoot ? extractRequestedProjectRoot(input.task) : null
  );
  const terminalExecutor = {
    execute: async (pendingToolCall: PendingToolCall): Promise<ToolResult> => {
      const toolName = String(pendingToolCall.toolCall.name || "");
      const args = pendingToolCall.toolCall.arguments || {};
      if (toolName === "run_command") {
        return workspaceExecutor.execute(pendingToolCall);
      }
      if (toolName === "terminal_start_session") {
        const started = await interactiveTerminalRuntime.startSession({
          cwd: typeof args.cwd === "string" ? args.cwd : input.workspaceRoot || input.run.machineRootPath,
          shell: typeof args.shell === "string" ? args.shell : undefined,
          name: typeof args.name === "string" ? args.name : undefined,
          waitForMs: typeof args.waitForMs === "number" ? args.waitForMs : undefined,
          timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
        });
        return {
          toolCallId: pendingToolCall.toolCall.id,
          name: toolName,
          ok: true,
          summary: `Started interactive terminal session ${started.session.sessionId} in ${started.session.cwd}.`,
          data: {
            session: started.session,
            output: started.output,
            truncated: started.truncated,
            proof: {
              sessionId: started.session.sessionId,
              cwd: started.session.cwd,
              shell: started.session.shell,
            },
          },
          createdAt: nowIso(),
        };
      }
      if (toolName === "terminal_send_input") {
        const commandInput = String(args.input || "");
        if (!commandInput.trim()) {
          return {
            toolCallId: pendingToolCall.toolCall.id,
            name: toolName,
            ok: false,
            summary: "terminal_send_input requires non-empty input.",
            error: "terminal_send_input requires non-empty input.",
            createdAt: nowIso(),
          };
        }
        const sent = await interactiveTerminalRuntime.sendInput({
          sessionId: String(args.sessionId || ""),
          input: commandInput,
          appendNewline: args.appendNewline !== false,
          waitForMs: typeof args.waitForMs === "number" ? args.waitForMs : undefined,
          timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
          maxChars: typeof args.maxChars === "number" ? args.maxChars : undefined,
        });
        return {
          toolCallId: pendingToolCall.toolCall.id,
          name: toolName,
          ok: true,
          summary: sent.output.trim()
            ? `Interactive terminal produced output after input: ${truncateText(sent.output.trim(), 160) || ""}`
            : "Interactive terminal accepted the input and is idle.",
          data: {
            session: sent.session,
            output: sent.output,
            truncated: sent.truncated,
            proof: {
              sessionId: sent.session.sessionId,
              cwd: sent.session.cwd,
              shell: sent.session.shell,
            },
          },
          createdAt: nowIso(),
        };
      }
      if (toolName === "terminal_read_output") {
        const read = await interactiveTerminalRuntime.readOutput({
          sessionId: String(args.sessionId || ""),
          afterCursor: typeof args.afterCursor === "number" ? args.afterCursor : undefined,
          waitForMs: typeof args.waitForMs === "number" ? args.waitForMs : undefined,
          timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
          maxChars: typeof args.maxChars === "number" ? args.maxChars : undefined,
          markRead: args.markRead !== false,
        });
        return {
          toolCallId: pendingToolCall.toolCall.id,
          name: toolName,
          ok: true,
          summary: read.output.trim()
            ? `Read interactive terminal output from ${read.session.sessionId}.`
            : `No new interactive terminal output from ${read.session.sessionId}.`,
          data: {
            session: read.session,
            output: read.output,
            truncated: read.truncated,
            proof: {
              sessionId: read.session.sessionId,
              cwd: read.session.cwd,
              shell: read.session.shell,
            },
          },
          createdAt: nowIso(),
        };
      }
      if (toolName === "terminal_list_sessions") {
        const sessions = interactiveTerminalRuntime.listSessions();
        return {
          toolCallId: pendingToolCall.toolCall.id,
          name: toolName,
          ok: true,
          summary: sessions.length
            ? `Found ${sessions.length} interactive terminal session(s).`
            : "No interactive terminal sessions are currently active.",
          data: {
            sessions,
          },
          createdAt: nowIso(),
        };
      }
      if (toolName === "terminal_terminate_session") {
        const session = await interactiveTerminalRuntime.terminateSession(String(args.sessionId || ""));
        return {
          toolCallId: pendingToolCall.toolCall.id,
          name: toolName,
          ok: true,
          summary: `Closed interactive terminal session ${session.sessionId}.`,
          data: {
            session,
            proof: {
              sessionId: session.sessionId,
              cwd: session.cwd,
              shell: session.shell,
            },
          },
          createdAt: nowIso(),
        };
      }
      return {
        toolCallId: pendingToolCall.toolCall.id,
        name: toolName,
        ok: false,
        summary: `Unknown interactive terminal tool: ${toolName}.`,
        error: `Unknown interactive terminal tool: ${toolName}.`,
        createdAt: nowIso(),
      };
    },
  };
  const decorateResult = (
    pendingToolCall: PendingToolCall,
    toolResult: ToolResult,
    decision?: ExecutionPolicyDecision | null
  ): ToolResult => {
    const executionState = buildExecutionState(decision, input.run, pendingToolCall, toolResult);
    if (!executionState) return toolResult;
    input.run.lastExecutionState = executionState;
    return {
      ...toolResult,
      data: {
        ...(toolResult.data && typeof toolResult.data === "object" ? toolResult.data : {}),
        executionVisibility: executionState.executionVisibility,
        foregroundDisruptionRisk: executionState.foregroundDisruptionRisk,
        interactionMode: executionState.interactionMode,
        focusPolicy: executionState.focusPolicy,
        sessionPolicy: executionState.sessionPolicy,
        backgroundSafe: executionState.backgroundSafe,
        requiresVisibleInteraction: executionState.requiresVisibleInteraction,
        focusLeaseActive: executionState.focusLeaseActive,
        focusSuppressed: executionState.focusSuppressed,
        ...(executionState.visibleFallbackReason
          ? { visibleFallbackReason: executionState.visibleFallbackReason }
          : {}),
        ...(executionState.terminalState ? { terminalState: executionState.terminalState } : {}),
      },
    };
  };
  if (!input.workspaceRoot) {
    return {
      async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
        const decision = executionController.decide(pendingToolCall);
        if (isBinaryTool(String(pendingToolCall.toolCall.name || ""))) {
          return decorateResult(pendingToolCall, await workspaceExecutor.execute(pendingToolCall), decision);
        }
      if (String(pendingToolCall.toolCall.name || "").startsWith("world_")) {
        return decorateResult(pendingToolCall, await worldExecutor.execute(pendingToolCall), decision);
      }
      if (isTerminalToolName(String(pendingToolCall.toolCall.name || ""))) {
        return decorateResult(pendingToolCall, await terminalExecutor.execute(pendingToolCall), decision);
      }
      if (String(pendingToolCall.toolCall.name || "").startsWith("repo_")) {
        return decorateResult(
            pendingToolCall,
            {
              toolCallId: pendingToolCall.toolCall.id,
              name: pendingToolCall.toolCall.name,
              ok: false,
              blocked: true,
              summary: "Repo cognition tools require a trusted workspace root.",
              error: "Repo cognition tools require a trusted workspace root.",
              createdAt: nowIso(),
            },
            decision
          );
        }
        if (String(pendingToolCall.toolCall.name || "").startsWith("browser_")) {
          return decorateResult(pendingToolCall, await browserExecutor.execute(pendingToolCall), decision);
        }
        return decorateResult(pendingToolCall, await desktopExecutor.execute(pendingToolCall), decision);
      },
      cleanup: async () => await desktopExecutor.cleanupLaunchedApps(),
    };
  }

  return {
    async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
      const decision = executionController.decide(pendingToolCall);
      if (String(pendingToolCall.toolCall.name || "").startsWith("world_")) {
        return decorateResult(pendingToolCall, await worldExecutor.execute(pendingToolCall), decision);
      }
      if (isTerminalToolName(String(pendingToolCall.toolCall.name || ""))) {
        return decorateResult(pendingToolCall, await terminalExecutor.execute(pendingToolCall), decision);
      }
      if (String(pendingToolCall.toolCall.name || "").startsWith("repo_") && repoExecutor) {
        return decorateResult(pendingToolCall, await repoExecutor.execute(pendingToolCall), decision);
      }
      if (String(pendingToolCall.toolCall.name || "").startsWith("browser_")) {
        return decorateResult(pendingToolCall, await browserExecutor.execute(pendingToolCall), decision);
      }
      if (String(pendingToolCall.toolCall.name || "").startsWith("desktop_")) {
        return decorateResult(pendingToolCall, await desktopExecutor.execute(pendingToolCall), decision);
      }
      return decorateResult(pendingToolCall, await workspaceExecutor.execute(pendingToolCall), decision);
    },
    cleanup: async () => await desktopExecutor.cleanupLaunchedApps(),
  };
}

function hashWorkspaceRoot(input: string | undefined): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

async function persistHostRun(run: StoredHostRun): Promise<void> {
  await writeJsonFile(path.join(RUNS_DIR, `${run.id}.json`), run);
}

function isWorkspaceTrusted(preferences: BinaryHostPreferences, workspaceRoot: string): BinaryHostTrustGrant | null {
  const resolved = normalizeWorkspacePath(workspaceRoot);
  return preferences.trustedWorkspaces.find((grant) => normalizeWorkspacePath(grant.path) === resolved) || null;
}

async function readAllRuns(): Promise<StoredHostRun[]> {
  const files = await fs.readdir(RUNS_DIR).catch(() => []);
  const runs: StoredHostRun[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const run = await readJsonFile<StoredHostRun>(path.join(RUNS_DIR, file));
    if (run) runs.push(run);
  }
  return runs;
}

async function loadRunRecord(id: string): Promise<StoredHostRun | null> {
  const direct = await readJsonFile<StoredHostRun>(path.join(RUNS_DIR, `${id}.json`));
  const run =
    direct ||
    (await readAllRuns()).find(
      (item) => item.id === id || item.runId === id || item.traceId === id || item.sessionId === id
    ) ||
    null;
  if (!run) return null;

  if (
    run.status === "running" &&
    !activeExecutions.has(run.id) &&
    run.heartbeatAt &&
    Date.now() - new Date(run.heartbeatAt).getTime() > STALE_LEASE_MS
  ) {
    run.status = "paused";
    run.takeoverReason = "Recovered a stale unattended run after a host restart or expired worker lease.";
    run.resumeToken = buildResumeToken();
    run.updatedAt = nowIso();
    await persistHostRun(run);
  }

  return run;
}

function buildBudgetState(envelope: AssistRunEnvelope | undefined): BinaryHostBudgetState | null {
  const loopState = envelope?.loopState;
  if (!loopState) return null;
  const maxSteps = typeof loopState.maxSteps === "number" ? loopState.maxSteps : undefined;
  const usedSteps = typeof loopState.stepCount === "number" ? loopState.stepCount : 0;
  const maxMutations = typeof loopState.maxMutations === "number" ? loopState.maxMutations : undefined;
  const usedMutations = typeof loopState.mutationCount === "number" ? loopState.mutationCount : 0;
  const missingRequirements = Array.isArray(envelope?.missingRequirements) ? envelope!.missingRequirements! : [];
  const exhaustedReason =
    missingRequirements.find((item) => /budget_exceeded/i.test(item)) ||
    (typeof envelope?.progressState?.stallReason === "string" ? envelope.progressState.stallReason : undefined);
  return {
    maxSteps,
    usedSteps,
    remainingSteps: typeof maxSteps === "number" ? Math.max(0, maxSteps - usedSteps) : undefined,
    maxMutations,
    usedMutations,
    remainingMutations:
      typeof maxMutations === "number" ? Math.max(0, maxMutations - usedMutations) : undefined,
    exhausted: Boolean(exhaustedReason),
    ...(exhaustedReason ? { reason: exhaustedReason } : {}),
  };
}

function buildCheckpointState(run: StoredHostRun): BinaryHostCheckpointState {
  const last = run.checkpoints[run.checkpoints.length - 1];
  return {
    count: run.checkpoints.length,
    ...(last?.capturedAt ? { lastCheckpointAt: last.capturedAt } : {}),
    ...(last?.summary ? { lastCheckpointSummary: last.summary } : {}),
  };
}

function buildRunSummary(run: StoredHostRun): HostRunSummary {
  return {
    ...run,
    lastExecutionState: run.lastExecutionState ?? null,
    pluginPacks: run.pluginPacks || [],
    skillSources: run.skillSources || [],
    eventCount: run.events.length,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function diffMs(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round(endMs - startMs);
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function extractFallbackCount(envelope: AssistRunEnvelope | undefined): number | null {
  if (!envelope || typeof envelope !== "object") return null;
  const direct = asNonNegativeInteger(envelope.fallbackCount);
  if (direct !== null) return direct;
  const receipt =
    envelope.receipt && typeof envelope.receipt === "object"
      ? (envelope.receipt as Record<string, unknown>)
      : null;
  const receiptCount = asNonNegativeInteger(receipt?.fallbackCount);
  if (receiptCount !== null) return receiptCount;
  const trail = Array.isArray(receipt?.fallbackTrail) ? receipt?.fallbackTrail : [];
  if (trail.length > 0) return Math.max(0, trail.length - 1);
  const fallbackAttempt = asNonNegativeInteger(receipt?.fallbackAttempt);
  if (fallbackAttempt !== null) return fallbackAttempt;
  return null;
}

function computeLatencyMetrics(
  run: StoredHostRun,
  envelope?: AssistRunEnvelope | null
): {
  queueDelayMs?: number;
  ttfrMs?: number;
  firstToolMs?: number;
  totalRunMs?: number;
  fallbackCount?: number;
} {
  const queueDelayMs = diffMs(run.createdAt, run.leaseState?.startedAt || run.heartbeatAt);
  const ttfrMs = diffMs(run.timingState?.startedAt, run.timingState?.firstVisibleTextAt);
  const firstToolMs = diffMs(run.timingState?.startedAt, run.timingState?.firstToolRequestAt);
  const totalRunMs = diffMs(run.timingState?.startedAt, run.timingState?.finalAt);
  const fallbackCount = extractFallbackCount(envelope || run.finalEnvelope);
  return {
    ...(typeof queueDelayMs === "number" ? { queueDelayMs } : {}),
    ...(typeof ttfrMs === "number" ? { ttfrMs } : {}),
    ...(typeof firstToolMs === "number" ? { firstToolMs } : {}),
    ...(typeof totalRunMs === "number" ? { totalRunMs } : {}),
    ...(typeof fallbackCount === "number" ? { fallbackCount } : {}),
  };
}

function refreshRunLatencyMetrics(run: StoredHostRun, envelope?: AssistRunEnvelope | null): void {
  if (!run.timingState) return;
  const metrics = computeLatencyMetrics(run, envelope);
  if (typeof metrics.queueDelayMs === "number") run.timingState.queueDelayMs = metrics.queueDelayMs;
  if (typeof metrics.ttfrMs === "number") run.timingState.ttfrMs = metrics.ttfrMs;
  if (typeof metrics.firstToolMs === "number") run.timingState.firstToolMs = metrics.firstToolMs;
  if (typeof metrics.totalRunMs === "number") run.timingState.totalRunMs = metrics.totalRunMs;
  if (typeof metrics.fallbackCount === "number") run.timingState.fallbackCount = metrics.fallbackCount;
}

function classifyLatencyLane(run: StoredHostRun): "chat" | "desktop" | "coding" {
  const task = String(run.request?.task || "");
  const hasDesktopToolTrace = run.toolResults.some((toolResult) => String(toolResult.name || "").startsWith("desktop_"));
  if (hasDesktopToolTrace || taskLikelyTargetsDesktop(task)) return "desktop";
  const speedClass = run.timingState?.taskSpeedClass;
  if (speedClass === "chat_only" || speedClass === "simple_action") return "chat";
  return "coding";
}

function hasBudgetTimeoutSignal(run: StoredHostRun): boolean {
  const candidates = [
    run.takeoverReason,
    run.finalEnvelope?.escalationReason,
    run.finalEnvelope?.progressState?.stallReason,
    ...(Array.isArray(run.finalEnvelope?.missingRequirements) ? run.finalEnvelope.missingRequirements : []),
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
  return candidates.some((value) => /turn budget|budget timeout|budget_exceeded|timed out|timeout/.test(value));
}

function buildLatencyScorecard(runs: StoredHostRun[]): Record<string, unknown> {
  const withTiming = runs.filter((run) => run.timingState);
  const firstVisible = withTiming
    .map(
      (run) =>
        asNonNegativeInteger(run.timingState?.ttfrMs) ??
        diffMs(run.timingState?.startedAt, run.timingState?.firstVisibleTextAt)
    )
    .filter((value): value is number => typeof value === "number");
  const firstToolRequest = withTiming
    .map(
      (run) =>
        asNonNegativeInteger(run.timingState?.firstToolMs) ??
        diffMs(run.timingState?.startedAt, run.timingState?.firstToolRequestAt)
    )
    .filter((value): value is number => typeof value === "number");
  const firstToolResult = withTiming
    .map((run) => diffMs(run.timingState?.startedAt, run.timingState?.firstToolResultAt))
    .filter((value): value is number => typeof value === "number");
  const queueDelay = withTiming
    .map((run) => asNonNegativeInteger(run.timingState?.queueDelayMs))
    .filter((value): value is number => typeof value === "number");
  const totalRun = withTiming
    .map(
      (run) =>
        asNonNegativeInteger(run.timingState?.totalRunMs) ??
        diffMs(run.timingState?.startedAt, run.timingState?.finalAt)
    )
    .filter((value): value is number => typeof value === "number");
  const fallbackCount = withTiming
    .map((run) => asNonNegativeInteger(run.timingState?.fallbackCount))
    .filter((value): value is number => typeof value === "number");
  const escalatedCount = withTiming.filter((run) => run.timingState?.escalatedRoute).length;
  const laneBuckets: Record<"chat" | "desktop" | "coding", { ttfr: number[]; firstTool: number[]; totalRun: number[] }> = {
    chat: { ttfr: [], firstTool: [], totalRun: [] },
    desktop: { ttfr: [], firstTool: [], totalRun: [] },
    coding: { ttfr: [], firstTool: [], totalRun: [] },
  };
  let budgetTimeoutCount = 0;
  let firstTurnFastFailCount = 0;
  for (const run of withTiming) {
    const lane = classifyLatencyLane(run);
    const laneTtfr = asNonNegativeInteger(run.timingState?.ttfrMs);
    const laneFirstTool = asNonNegativeInteger(run.timingState?.firstToolMs);
    const laneTotalRun =
      asNonNegativeInteger(run.timingState?.totalRunMs) ??
      diffMs(run.timingState?.startedAt, run.timingState?.finalAt);
    if (typeof laneTtfr === "number") laneBuckets[lane].ttfr.push(laneTtfr);
    if (typeof laneFirstTool === "number") laneBuckets[lane].firstTool.push(laneFirstTool);
    if (typeof laneTotalRun === "number") laneBuckets[lane].totalRun.push(laneTotalRun);
    if (hasBudgetTimeoutSignal(run)) {
      budgetTimeoutCount += 1;
      const firstTurnBudget = asNonNegativeInteger(run.lastExecutionState?.firstTurnBudgetMs);
      const noToolStarted = asNonNegativeInteger(run.timingState?.firstToolMs) === null;
      if (
        typeof firstTurnBudget === "number" &&
        typeof laneTotalRun === "number" &&
        noToolStarted &&
        laneTotalRun <= firstTurnBudget + 2_000
      ) {
        firstTurnFastFailCount += 1;
      }
    }
  }
  return {
    runCount: runs.length,
    timedRunCount: withTiming.length,
    medianFirstVisibleResponseMs: median(firstVisible),
    medianTtfrMs: median(firstVisible),
    medianFirstToolRequestMs: median(firstToolRequest),
    medianFirstToolMs: median(firstToolRequest),
    medianFirstToolResultMs: median(firstToolResult),
    medianQueueDelayMs: median(queueDelay),
    medianTotalRunMs: median(totalRun),
    medianFallbackCount: median(fallbackCount),
    laneMedians: {
      chat: {
        ttfrMs: median(laneBuckets.chat.ttfr),
        firstToolMs: median(laneBuckets.chat.firstTool),
        totalRunMs: median(laneBuckets.chat.totalRun),
      },
      desktop: {
        ttfrMs: median(laneBuckets.desktop.ttfr),
        firstToolMs: median(laneBuckets.desktop.firstTool),
        totalRunMs: median(laneBuckets.desktop.totalRun),
      },
      coding: {
        ttfrMs: median(laneBuckets.coding.ttfr),
        firstToolMs: median(laneBuckets.coding.firstTool),
        totalRunMs: median(laneBuckets.coding.totalRun),
      },
    },
    budgetTimeoutRate: withTiming.length ? Number((budgetTimeoutCount / withTiming.length).toFixed(4)) : 0,
    firstTurnFastFailRate: withTiming.length ? Number((firstTurnFastFailCount / withTiming.length).toFixed(4)) : 0,
    escalatedRoutePercent: withTiming.length ? Number(((escalatedCount / withTiming.length) * 100).toFixed(1)) : 0,
  };
}

function attachHostMetadata(envelope: AssistRunEnvelope, run: StoredHostRun): AssistRunEnvelope {
  const receipt = envelope.receipt && typeof envelope.receipt === "object" ? (envelope.receipt as Record<string, unknown>) : null;
  const receiptEngine = typeof receipt?.engine === "string" ? receipt.engine : "";
  const inferredShortcutEnvelope = receiptEngine === "binary_host_shortcut" || envelope.adapter === "host_machine_shortcut";
  const defaultOrchestrator = inferredShortcutEnvelope ? "in_house" : "openhands";
  const defaultToolBackend =
    inferredShortcutEnvelope || envelope.adapter === "desktop_native" ? "binary_host" : "openhands_native";
  const mergedLoopState =
    envelope.loopState || run.lastExecutionState
      ? {
          ...(envelope.loopState || {}),
          ...(run.lastExecutionState?.executionVisibility
            ? { executionVisibility: run.lastExecutionState.executionVisibility }
            : {}),
          ...(run.lastExecutionState?.foregroundDisruptionRisk
            ? { foregroundDisruptionRisk: run.lastExecutionState.foregroundDisruptionRisk }
            : {}),
          ...(run.lastExecutionState?.interactionMode
            ? { interactionMode: run.lastExecutionState.interactionMode }
            : {}),
          ...(run.lastExecutionState?.focusPolicy ? { focusPolicy: run.lastExecutionState.focusPolicy } : {}),
          ...(run.lastExecutionState?.sessionPolicy
            ? { sessionPolicy: run.lastExecutionState.sessionPolicy }
            : {}),
          ...(run.lastExecutionState?.visibleFallbackReason
            ? { visibleFallbackReason: run.lastExecutionState.visibleFallbackReason }
            : {}),
          ...(run.lastExecutionState?.terminalState ? { terminalState: run.lastExecutionState.terminalState } : {}),
        }
      : envelope.loopState;
  const mergedProgressState =
    envelope.progressState || run.lastExecutionState
      ? {
          ...(envelope.progressState || {}),
          ...(run.lastExecutionState?.executionVisibility
            ? { executionVisibility: run.lastExecutionState.executionVisibility }
            : {}),
          ...(run.lastExecutionState?.interactionMode
            ? { interactionMode: run.lastExecutionState.interactionMode }
            : {}),
          ...(run.lastExecutionState?.visibleFallbackReason
            ? { visibleFallbackReason: run.lastExecutionState.visibleFallbackReason }
            : {}),
          ...(run.lastExecutionState?.startupPhase ? { startupPhase: run.lastExecutionState.startupPhase } : {}),
          ...(run.lastExecutionState?.speedProfile
            ? { selectedSpeedProfile: run.lastExecutionState.speedProfile }
            : {}),
          ...(run.lastExecutionState?.latencyTier
            ? { selectedLatencyTier: run.lastExecutionState.latencyTier }
            : {}),
          ...(run.lastExecutionState?.taskSpeedClass
            ? { taskSpeedClass: run.lastExecutionState.taskSpeedClass }
            : {}),
          ...(run.lastExecutionState?.terminalState ? { terminalState: run.lastExecutionState.terminalState } : {}),
        }
      : envelope.progressState;
  const latencyMetrics = computeLatencyMetrics(run, envelope);
  return {
    ...envelope,
    orchestrator: envelope.orchestrator || defaultOrchestrator,
    ...(Object.prototype.hasOwnProperty.call(envelope, "orchestratorVersion")
      ? { orchestratorVersion: envelope.orchestratorVersion ?? null }
      : {}),
    executionLane: envelope.executionLane || run.executionLane || run.lastExecutionState?.executionLane,
    runtimeTarget:
      envelope.runtimeTarget ||
      (run.executionLane === "openhands_remote"
        ? "remote"
        : run.executionLane || inferredShortcutEnvelope
        ? "local_native"
        : undefined),
    toolBackend: envelope.toolBackend || defaultToolBackend,
    pluginPacks: envelope.pluginPacks || run.pluginPacks || run.lastExecutionState?.pluginPacks || [],
    skillSources: envelope.skillSources || run.skillSources || run.lastExecutionState?.skillSources || [],
    conversationId: envelope.conversationId || run.conversationId || null,
    persistenceDir: envelope.persistenceDir || run.persistenceDir || null,
    jsonlPath:
      (typeof envelope.jsonlPath === "string" ? envelope.jsonlPath : undefined) ||
      (typeof run.lastExecutionState?.jsonlPath === "string" ? run.lastExecutionState.jsonlPath : undefined) ||
      null,
    ...(envelope.policyLane || run.lastExecutionState?.policyLane
      ? { policyLane: envelope.policyLane || run.lastExecutionState?.policyLane }
      : {}),
    ...(envelope.adapterMode || run.lastExecutionState?.adapterMode
      ? { adapterMode: envelope.adapterMode || run.lastExecutionState?.adapterMode }
      : {}),
    ...(envelope.latencyPolicy || run.lastExecutionState?.latencyPolicy
      ? { latencyPolicy: envelope.latencyPolicy || run.lastExecutionState?.latencyPolicy }
      : {}),
    ...(envelope.timeoutPolicy || run.lastExecutionState?.timeoutPolicy
      ? { timeoutPolicy: envelope.timeoutPolicy || run.lastExecutionState?.timeoutPolicy }
      : {}),
    ...(envelope.terminalBackend || run.lastExecutionState?.terminalBackend
      ? { terminalBackend: envelope.terminalBackend || run.lastExecutionState?.terminalBackend }
      : {}),
    ...(typeof envelope.terminalStrictMode === "boolean" || typeof run.lastExecutionState?.terminalStrictMode === "boolean"
      ? { terminalStrictMode: envelope.terminalStrictMode ?? run.lastExecutionState?.terminalStrictMode }
      : {}),
    ...(typeof envelope.nativeTerminalAvailable === "boolean" ||
      typeof run.lastExecutionState?.nativeTerminalAvailable === "boolean"
      ? { nativeTerminalAvailable: envelope.nativeTerminalAvailable ?? run.lastExecutionState?.nativeTerminalAvailable }
      : {}),
    ...(typeof envelope.terminalHealthReason === "string" || typeof run.lastExecutionState?.terminalHealthReason === "string"
      ? { terminalHealthReason: envelope.terminalHealthReason || run.lastExecutionState?.terminalHealthReason }
      : {}),
    ...(envelope.terminalBackendMode || run.lastExecutionState?.terminalBackendMode
      ? { terminalBackendMode: envelope.terminalBackendMode || run.lastExecutionState?.terminalBackendMode }
      : {}),
    ...(typeof envelope.requireNativeTerminalTool === "boolean" ||
      typeof run.lastExecutionState?.requireNativeTerminalTool === "boolean"
      ? {
          requireNativeTerminalTool:
            envelope.requireNativeTerminalTool ?? run.lastExecutionState?.requireNativeTerminalTool,
        }
      : {}),
    ...(typeof envelope.budgetProfile === "string" || typeof run.lastExecutionState?.budgetProfile === "string"
      ? { budgetProfile: envelope.budgetProfile || run.lastExecutionState?.budgetProfile }
      : {}),
    ...(typeof envelope.firstTurnBudgetMs === "number" || typeof run.lastExecutionState?.firstTurnBudgetMs === "number"
      ? { firstTurnBudgetMs: envelope.firstTurnBudgetMs ?? run.lastExecutionState?.firstTurnBudgetMs }
      : {}),
    ...(typeof envelope.smallModelForced === "boolean" || typeof run.lastExecutionState?.smallModelForced === "boolean"
      ? { smallModelForced: envelope.smallModelForced ?? run.lastExecutionState?.smallModelForced }
      : {}),
    ...(envelope.modelRoutingMode || run.lastExecutionState?.modelRoutingMode
      ? { modelRoutingMode: envelope.modelRoutingMode || run.lastExecutionState?.modelRoutingMode }
      : {}),
    ...(typeof envelope.fixedModelAlias === "string" || typeof run.lastExecutionState?.fixedModelAlias === "string"
      ? { fixedModelAlias: envelope.fixedModelAlias || run.lastExecutionState?.fixedModelAlias }
      : {}),
    ...(typeof envelope.fallbackEnabled === "boolean" || typeof run.lastExecutionState?.fallbackEnabled === "boolean"
      ? { fallbackEnabled: envelope.fallbackEnabled ?? run.lastExecutionState?.fallbackEnabled }
      : {}),
    ...(typeof envelope.coercionApplied === "boolean" || typeof run.lastExecutionState?.coercionApplied === "boolean"
      ? { coercionApplied: envelope.coercionApplied ?? run.lastExecutionState?.coercionApplied }
      : {}),
    ...(typeof envelope.seedToolInjected === "boolean" || typeof run.lastExecutionState?.seedToolInjected === "boolean"
      ? { seedToolInjected: envelope.seedToolInjected ?? run.lastExecutionState?.seedToolInjected }
      : {}),
    ...(typeof envelope.invalidToolNameRecovered === "boolean" ||
      typeof run.lastExecutionState?.invalidToolNameRecovered === "boolean"
      ? {
          invalidToolNameRecovered:
            envelope.invalidToolNameRecovered ?? run.lastExecutionState?.invalidToolNameRecovered,
        }
      : {}),
    ...(typeof envelope.intentStepId === "string" || typeof run.lastExecutionState?.intentStepId === "string"
      ? { intentStepId: envelope.intentStepId || run.lastExecutionState?.intentStepId }
      : {}),
    ...(envelope.intentKind || run.lastExecutionState?.intentKind
      ? { intentKind: envelope.intentKind || run.lastExecutionState?.intentKind }
      : {}),
    ...(envelope.executionMode || run.lastExecutionState?.executionMode
      ? { executionMode: envelope.executionMode || run.lastExecutionState?.executionMode }
      : {}),
    ...(typeof envelope.windowAffinityToken === "string" || typeof run.lastExecutionState?.windowAffinityToken === "string"
      ? { windowAffinityToken: envelope.windowAffinityToken || run.lastExecutionState?.windowAffinityToken }
      : {}),
    ...(typeof envelope.targetAppIntent === "string" || typeof run.lastExecutionState?.targetAppIntent === "string"
      ? { targetAppIntent: envelope.targetAppIntent || run.lastExecutionState?.targetAppIntent }
      : {}),
    ...(typeof envelope.targetResolvedApp === "string" || typeof run.lastExecutionState?.targetResolvedApp === "string"
      ? { targetResolvedApp: envelope.targetResolvedApp || run.lastExecutionState?.targetResolvedApp }
      : {}),
    ...(typeof envelope.targetConfidence === "number" || typeof run.lastExecutionState?.targetConfidence === "number"
      ? { targetConfidence: envelope.targetConfidence ?? run.lastExecutionState?.targetConfidence }
      : {}),
    ...(typeof envelope.pageLeaseId === "string" || typeof run.lastExecutionState?.pageLeaseId === "string"
      ? { pageLeaseId: envelope.pageLeaseId || run.lastExecutionState?.pageLeaseId }
      : {}),
    ...(typeof envelope.targetOrigin === "string" || typeof run.lastExecutionState?.targetOrigin === "string"
      ? { targetOrigin: envelope.targetOrigin || run.lastExecutionState?.targetOrigin }
      : {}),
    ...(typeof envelope.focusRecoveryAttempted === "boolean" ||
    typeof run.lastExecutionState?.focusRecoveryAttempted === "boolean"
      ? { focusRecoveryAttempted: envelope.focusRecoveryAttempted ?? run.lastExecutionState?.focusRecoveryAttempted }
      : {}),
    ...(envelope.focusModeApplied || run.lastExecutionState?.focusModeApplied
      ? { focusModeApplied: envelope.focusModeApplied || run.lastExecutionState?.focusModeApplied }
      : {}),
    ...(typeof envelope.foregroundLeaseMs === "number" || typeof run.lastExecutionState?.foregroundLeaseMs === "number"
      ? { foregroundLeaseMs: envelope.foregroundLeaseMs ?? run.lastExecutionState?.foregroundLeaseMs }
      : {}),
    ...(typeof envelope.focusLeaseRestored === "boolean" ||
    typeof run.lastExecutionState?.focusLeaseRestored === "boolean"
      ? { focusLeaseRestored: envelope.focusLeaseRestored ?? run.lastExecutionState?.focusLeaseRestored }
      : {}),
    ...(typeof envelope.recoverySuppressedReason === "string" ||
    typeof run.lastExecutionState?.recoverySuppressedReason === "string"
      ? { recoverySuppressedReason: envelope.recoverySuppressedReason || run.lastExecutionState?.recoverySuppressedReason }
      : {}),
    ...(typeof envelope.relaunchAttempt === "number" || typeof run.lastExecutionState?.relaunchAttempt === "number"
      ? { relaunchAttempt: envelope.relaunchAttempt ?? run.lastExecutionState?.relaunchAttempt }
      : {}),
    ...(typeof envelope.relaunchSuppressed === "boolean" ||
    typeof run.lastExecutionState?.relaunchSuppressed === "boolean"
      ? { relaunchSuppressed: envelope.relaunchSuppressed ?? run.lastExecutionState?.relaunchSuppressed }
      : {}),
    ...(typeof envelope.relaunchSuppressionReason === "string" ||
    typeof run.lastExecutionState?.relaunchSuppressionReason === "string"
      ? {
          relaunchSuppressionReason:
            envelope.relaunchSuppressionReason || run.lastExecutionState?.relaunchSuppressionReason,
        }
      : {}),
    ...(typeof envelope.verificationRequired === "boolean" ||
    typeof run.lastExecutionState?.verificationRequired === "boolean"
      ? { verificationRequired: envelope.verificationRequired ?? run.lastExecutionState?.verificationRequired }
      : {}),
    ...(typeof envelope.verificationPassed === "boolean" ||
    typeof run.lastExecutionState?.verificationPassed === "boolean"
      ? { verificationPassed: envelope.verificationPassed ?? run.lastExecutionState?.verificationPassed }
      : {}),
    ...(Array.isArray(envelope.domProofArtifacts) || Array.isArray(run.lastExecutionState?.domProofArtifacts)
      ? { domProofArtifacts: envelope.domProofArtifacts || run.lastExecutionState?.domProofArtifacts || [] }
      : {}),
    ...(typeof envelope.screenshotCaptured === "boolean" ||
    typeof run.lastExecutionState?.screenshotCaptured === "boolean"
      ? { screenshotCaptured: envelope.screenshotCaptured ?? run.lastExecutionState?.screenshotCaptured }
      : {}),
    ...(typeof envelope.screenshotReason === "string" || typeof run.lastExecutionState?.screenshotReason === "string"
      ? { screenshotReason: envelope.screenshotReason || run.lastExecutionState?.screenshotReason }
      : {}),
    ...(typeof envelope.proofProgress === "number" || typeof run.lastExecutionState?.proofProgress === "number"
      ? { proofProgress: envelope.proofProgress ?? run.lastExecutionState?.proofProgress }
      : {}),
    ...(Array.isArray(envelope.proofArtifacts) || Array.isArray(run.lastExecutionState?.proofArtifacts)
      ? { proofArtifacts: envelope.proofArtifacts || run.lastExecutionState?.proofArtifacts || [] }
      : {}),
    ...(Array.isArray(envelope.proofArtifactsDetailed) || Array.isArray(run.lastExecutionState?.proofArtifactsDetailed)
      ? { proofArtifactsDetailed: envelope.proofArtifactsDetailed || run.lastExecutionState?.proofArtifactsDetailed || [] }
      : {}),
    ...(envelope.qualityGateState || run.lastExecutionState?.qualityGateState
      ? { qualityGateState: envelope.qualityGateState || run.lastExecutionState?.qualityGateState }
      : {}),
    ...(Array.isArray(envelope.requiredProofs) || Array.isArray(run.lastExecutionState?.requiredProofs)
      ? { requiredProofs: envelope.requiredProofs || run.lastExecutionState?.requiredProofs || [] }
      : {}),
    ...(Array.isArray(envelope.satisfiedProofs) || Array.isArray(run.lastExecutionState?.satisfiedProofs)
      ? { satisfiedProofs: envelope.satisfiedProofs || run.lastExecutionState?.satisfiedProofs || [] }
      : {}),
    ...(Array.isArray(envelope.missingProofs) || Array.isArray(run.lastExecutionState?.missingProofs)
      ? { missingProofs: envelope.missingProofs || run.lastExecutionState?.missingProofs || [] }
      : {}),
    ...(envelope.qualityBlockedReason || run.lastExecutionState?.qualityBlockedReason
      ? { qualityBlockedReason: envelope.qualityBlockedReason || run.lastExecutionState?.qualityBlockedReason }
      : {}),
    ...(typeof envelope.repairAttemptCount === "number" || typeof run.lastExecutionState?.repairAttemptCount === "number"
      ? { repairAttemptCount: envelope.repairAttemptCount ?? run.lastExecutionState?.repairAttemptCount }
      : {}),
    ...(typeof envelope.maxRepairAttempts === "number" || typeof run.lastExecutionState?.maxRepairAttempts === "number"
      ? { maxRepairAttempts: envelope.maxRepairAttempts ?? run.lastExecutionState?.maxRepairAttempts }
      : {}),
    ...(typeof envelope.finalizationBlocked === "boolean" || typeof run.lastExecutionState?.finalizationBlocked === "boolean"
      ? { finalizationBlocked: envelope.finalizationBlocked ?? run.lastExecutionState?.finalizationBlocked }
      : {}),
    ...(typeof envelope.cleanupClosedCount === "number" || typeof run.lastExecutionState?.cleanupClosedCount === "number"
      ? { cleanupClosedCount: envelope.cleanupClosedCount ?? run.lastExecutionState?.cleanupClosedCount }
      : {}),
    ...(typeof envelope.cleanupSkippedPreExistingCount === "number" ||
    typeof run.lastExecutionState?.cleanupSkippedPreExistingCount === "number"
      ? {
          cleanupSkippedPreExistingCount:
            envelope.cleanupSkippedPreExistingCount ?? run.lastExecutionState?.cleanupSkippedPreExistingCount,
        }
      : {}),
    ...(typeof envelope.cleanupErrors === "number" || typeof run.lastExecutionState?.cleanupErrors === "number"
      ? { cleanupErrors: envelope.cleanupErrors ?? run.lastExecutionState?.cleanupErrors }
      : {}),
    ...(mergedLoopState ? { loopState: mergedLoopState } : {}),
    ...(mergedProgressState ? { progressState: mergedProgressState } : {}),
    leaseId: run.leaseId,
    heartbeatAt: run.heartbeatAt,
    lastToolAt: run.lastToolAt,
    approvalState: envelope.approvalState || "not_required",
    worldContextUsed:
      envelope.worldContextUsed ||
      (!inferredShortcutEnvelope && run.worldContextTier
        ? {
            provided: true,
            tier: run.worldContextTier,
          }
        : {
            provided: false,
            tier: null,
          }),
    budgetState: run.budgetState ?? null,
    checkpointState: run.checkpointState ?? null,
    ...(typeof latencyMetrics.queueDelayMs === "number" ? { queueDelayMs: latencyMetrics.queueDelayMs } : {}),
    ...(typeof latencyMetrics.ttfrMs === "number" ? { ttfrMs: latencyMetrics.ttfrMs } : {}),
    ...(typeof latencyMetrics.firstToolMs === "number" ? { firstToolMs: latencyMetrics.firstToolMs } : {}),
    ...(typeof latencyMetrics.totalRunMs === "number" ? { totalRunMs: latencyMetrics.totalRunMs } : {}),
    ...(typeof latencyMetrics.fallbackCount === "number" ? { fallbackCount: latencyMetrics.fallbackCount } : {}),
    resumeToken: run.resumeToken,
    workspaceTrustMode: run.workspaceTrustMode,
    lastExecutionState: run.lastExecutionState ?? null,
    timingState: run.timingState ?? null,
    focusLease: sanitizeFocusLease(activeFocusLease),
  };
}

function applyEnvelopeToRun(run: StoredHostRun, envelope: AssistRunEnvelope): void {
  if (typeof envelope.traceId === "string") run.traceId = envelope.traceId;
  if (typeof envelope.sessionId === "string") run.sessionId = envelope.sessionId;
  if (typeof envelope.runId === "string") run.runId = envelope.runId;
  const lockLongLane =
    run.request.detach === true || Boolean(run.automationId) || Boolean(run.automationTriggerKind);
  const acceptedExecutionLane =
    envelope.executionLane &&
    (!lockLongLane || !run.executionLane || envelope.executionLane === run.executionLane)
      ? envelope.executionLane
      : undefined;
  if (acceptedExecutionLane) run.executionLane = acceptedExecutionLane;
  if (Array.isArray(envelope.pluginPacks)) run.pluginPacks = envelope.pluginPacks;
  if (Array.isArray(envelope.skillSources)) run.skillSources = envelope.skillSources;
  if (typeof envelope.conversationId === "string") run.conversationId = envelope.conversationId;
  if (typeof envelope.persistenceDir === "string") run.persistenceDir = envelope.persistenceDir;
  run.lastExecutionState = {
    ...(run.lastExecutionState || {}),
    ...(envelope.orchestrator ? { orchestrator: envelope.orchestrator } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, "orchestratorVersion")
      ? { orchestratorVersion: envelope.orchestratorVersion ?? null }
      : {}),
    ...(acceptedExecutionLane ? { executionLane: acceptedExecutionLane } : {}),
    ...(envelope.runtimeTarget ? { runtimeTarget: envelope.runtimeTarget } : {}),
    ...(envelope.toolBackend ? { toolBackend: envelope.toolBackend } : {}),
    ...(envelope.approvalState ? { approvalState: envelope.approvalState } : {}),
    ...(envelope.worldContextUsed ? { worldContextUsed: envelope.worldContextUsed } : {}),
    ...(Array.isArray(envelope.pluginPacks) ? { pluginPacks: envelope.pluginPacks } : {}),
    ...(Array.isArray(envelope.skillSources) ? { skillSources: envelope.skillSources } : {}),
    ...(envelope.policyLane ? { policyLane: envelope.policyLane } : {}),
    ...(envelope.adapterMode ? { adapterMode: envelope.adapterMode } : {}),
    ...(envelope.latencyPolicy ? { latencyPolicy: envelope.latencyPolicy } : {}),
    ...(envelope.timeoutPolicy ? { timeoutPolicy: envelope.timeoutPolicy } : {}),
    ...(envelope.terminalBackend ? { terminalBackend: envelope.terminalBackend } : {}),
    ...(typeof envelope.terminalStrictMode === "boolean" ? { terminalStrictMode: envelope.terminalStrictMode } : {}),
    ...(typeof envelope.nativeTerminalAvailable === "boolean"
      ? { nativeTerminalAvailable: envelope.nativeTerminalAvailable }
      : {}),
    ...(typeof envelope.terminalHealthReason === "string" ? { terminalHealthReason: envelope.terminalHealthReason } : {}),
    ...(envelope.terminalBackendMode ? { terminalBackendMode: envelope.terminalBackendMode } : {}),
    ...(typeof envelope.requireNativeTerminalTool === "boolean"
      ? { requireNativeTerminalTool: envelope.requireNativeTerminalTool }
      : {}),
    ...(typeof envelope.budgetProfile === "string" ? { budgetProfile: envelope.budgetProfile } : {}),
    ...(typeof envelope.firstTurnBudgetMs === "number" ? { firstTurnBudgetMs: envelope.firstTurnBudgetMs } : {}),
    ...(typeof envelope.smallModelForced === "boolean" ? { smallModelForced: envelope.smallModelForced } : {}),
    ...(envelope.modelRoutingMode ? { modelRoutingMode: envelope.modelRoutingMode } : {}),
    ...(typeof envelope.fixedModelAlias === "string" ? { fixedModelAlias: envelope.fixedModelAlias } : {}),
    ...(typeof envelope.fallbackEnabled === "boolean" ? { fallbackEnabled: envelope.fallbackEnabled } : {}),
    ...(typeof envelope.coercionApplied === "boolean" ? { coercionApplied: envelope.coercionApplied } : {}),
    ...(typeof envelope.seedToolInjected === "boolean" ? { seedToolInjected: envelope.seedToolInjected } : {}),
    ...(typeof envelope.invalidToolNameRecovered === "boolean"
      ? { invalidToolNameRecovered: envelope.invalidToolNameRecovered }
      : {}),
    ...(typeof envelope.intentStepId === "string" ? { intentStepId: envelope.intentStepId } : {}),
    ...(envelope.intentKind ? { intentKind: envelope.intentKind } : {}),
    ...(envelope.executionMode ? { executionMode: envelope.executionMode } : {}),
    ...(typeof envelope.windowAffinityToken === "string" ? { windowAffinityToken: envelope.windowAffinityToken } : {}),
    ...(typeof envelope.targetAppIntent === "string" ? { targetAppIntent: envelope.targetAppIntent } : {}),
    ...(typeof envelope.targetResolvedApp === "string" ? { targetResolvedApp: envelope.targetResolvedApp } : {}),
    ...(typeof envelope.targetConfidence === "number" ? { targetConfidence: envelope.targetConfidence } : {}),
    ...(typeof envelope.pageLeaseId === "string" ? { pageLeaseId: envelope.pageLeaseId } : {}),
    ...(typeof envelope.targetOrigin === "string" ? { targetOrigin: envelope.targetOrigin } : {}),
    ...(typeof envelope.focusRecoveryAttempted === "boolean"
      ? { focusRecoveryAttempted: envelope.focusRecoveryAttempted }
      : {}),
    ...(envelope.focusModeApplied ? { focusModeApplied: envelope.focusModeApplied } : {}),
    ...(typeof envelope.foregroundLeaseMs === "number" ? { foregroundLeaseMs: envelope.foregroundLeaseMs } : {}),
    ...(typeof envelope.focusLeaseRestored === "boolean"
      ? { focusLeaseRestored: envelope.focusLeaseRestored }
      : {}),
    ...(typeof envelope.recoverySuppressedReason === "string"
      ? { recoverySuppressedReason: envelope.recoverySuppressedReason }
      : {}),
    ...(typeof envelope.relaunchAttempt === "number" ? { relaunchAttempt: envelope.relaunchAttempt } : {}),
    ...(typeof envelope.relaunchSuppressed === "boolean"
      ? { relaunchSuppressed: envelope.relaunchSuppressed }
      : {}),
    ...(typeof envelope.relaunchSuppressionReason === "string"
      ? { relaunchSuppressionReason: envelope.relaunchSuppressionReason }
      : {}),
    ...(typeof envelope.verificationRequired === "boolean"
      ? { verificationRequired: envelope.verificationRequired }
      : {}),
    ...(typeof envelope.verificationPassed === "boolean"
      ? { verificationPassed: envelope.verificationPassed }
      : {}),
    ...(Array.isArray(envelope.domProofArtifacts) ? { domProofArtifacts: envelope.domProofArtifacts } : {}),
    ...(typeof envelope.screenshotCaptured === "boolean"
      ? { screenshotCaptured: envelope.screenshotCaptured }
      : {}),
    ...(typeof envelope.screenshotReason === "string" ? { screenshotReason: envelope.screenshotReason } : {}),
    ...(typeof envelope.proofProgress === "number" ? { proofProgress: envelope.proofProgress } : {}),
    ...(Array.isArray(envelope.proofArtifacts) ? { proofArtifacts: envelope.proofArtifacts } : {}),
    ...(Array.isArray(envelope.proofArtifactsDetailed) ? { proofArtifactsDetailed: envelope.proofArtifactsDetailed } : {}),
    ...(envelope.qualityGateState ? { qualityGateState: envelope.qualityGateState } : {}),
    ...(Array.isArray(envelope.requiredProofs) ? { requiredProofs: envelope.requiredProofs } : {}),
    ...(Array.isArray(envelope.satisfiedProofs) ? { satisfiedProofs: envelope.satisfiedProofs } : {}),
    ...(Array.isArray(envelope.missingProofs) ? { missingProofs: envelope.missingProofs } : {}),
    ...(typeof envelope.qualityBlockedReason === "string" ? { qualityBlockedReason: envelope.qualityBlockedReason } : {}),
    ...(typeof envelope.repairAttemptCount === "number" ? { repairAttemptCount: envelope.repairAttemptCount } : {}),
    ...(typeof envelope.maxRepairAttempts === "number" ? { maxRepairAttempts: envelope.maxRepairAttempts } : {}),
    ...(typeof envelope.finalizationBlocked === "boolean" ? { finalizationBlocked: envelope.finalizationBlocked } : {}),
    ...(typeof envelope.cleanupClosedCount === "number"
      ? { cleanupClosedCount: envelope.cleanupClosedCount }
      : {}),
    ...(typeof envelope.cleanupSkippedPreExistingCount === "number"
      ? { cleanupSkippedPreExistingCount: envelope.cleanupSkippedPreExistingCount }
      : {}),
    ...(typeof envelope.cleanupErrors === "number" ? { cleanupErrors: envelope.cleanupErrors } : {}),
    ...(typeof envelope.jsonlPath === "string" ? { jsonlPath: envelope.jsonlPath } : {}),
    ...(typeof envelope.escalationStage === "string" ? { escalationStage: envelope.escalationStage } : {}),
    ...(typeof envelope.escalationReason === "string" ? { escalationReason: envelope.escalationReason } : {}),
    ...(typeof envelope.plannerLatencyMs === "number" ? { plannerLatencyMs: envelope.plannerLatencyMs } : {}),
    ...(typeof envelope.providerLatencyMs === "number" ? { providerLatencyMs: envelope.providerLatencyMs } : {}),
    ...(typeof envelope.actionLatencyMs === "number" ? { actionLatencyMs: envelope.actionLatencyMs } : {}),
    ...(typeof envelope.queueDelayMs === "number" ? { queueDelayMs: envelope.queueDelayMs } : {}),
    ...(typeof envelope.ttfrMs === "number" ? { ttfrMs: envelope.ttfrMs } : {}),
    ...(typeof envelope.firstToolMs === "number" ? { firstToolMs: envelope.firstToolMs } : {}),
    ...(typeof envelope.totalRunMs === "number" ? { totalRunMs: envelope.totalRunMs } : {}),
    ...(typeof envelope.fallbackCount === "number" ? { fallbackCount: envelope.fallbackCount } : {}),
  };
  const receipt = envelope.receipt && typeof envelope.receipt === "object" ? envelope.receipt : null;
  const fallbackTrail =
    receipt && Array.isArray((receipt as Record<string, unknown>).fallbackTrail)
      ? ((receipt as Record<string, unknown>).fallbackTrail as unknown[])
      : [];
  if (run.timingState && fallbackTrail.length > 1) {
    run.timingState.escalatedRoute = true;
  }
  if (run.timingState) {
    if (typeof envelope.plannerLatencyMs === "number") run.timingState.plannerLatencyMs = Math.round(envelope.plannerLatencyMs);
    if (typeof envelope.providerLatencyMs === "number") run.timingState.providerLatencyMs = Math.round(envelope.providerLatencyMs);
    if (typeof envelope.actionLatencyMs === "number") run.timingState.actionLatencyMs = Math.round(envelope.actionLatencyMs);
  }
  refreshRunLatencyMetrics(run, envelope);
  const latencyMetrics = computeLatencyMetrics(run, envelope);
  run.lastExecutionState = {
    ...(run.lastExecutionState || {}),
    ...latencyMetrics,
  };
  run.budgetState = buildBudgetState(envelope);
  run.checkpointState = buildCheckpointState(run);
  run.finalEnvelope = attachHostMetadata(envelope, run);
  if (typeof envelope.whyBinaryIsBlocked === "string" && envelope.whyBinaryIsBlocked.trim()) {
    run.takeoverReason = envelope.whyBinaryIsBlocked;
  } else if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
    run.takeoverReason = envelope.progressState.stallReason;
  }
}

function enrichPendingToolCallForUi(
  run: StoredHostRun,
  preferences: BinaryHostPreferences,
  pendingToolCall: PendingToolCall
): PendingToolCall & Record<string, unknown> {
  const controller = new AutonomyExecutionController(preferences.machineAutonomy);
  const focusLease = sanitizeFocusLease(activeFocusLease);
  if (focusLease) {
    const remainingMs = Math.max(500, new Date(focusLease.expiresAt).getTime() - Date.now());
    controller.updateFocusLease({
      surface: focusLease.surface,
      source: focusLease.source,
      leaseMs: remainingMs,
      active: true,
    });
  }
  const decision = controller.decide(pendingToolCall);
  const executionState = buildExecutionState(decision, run, pendingToolCall, null);
  run.lastExecutionState = executionState;
  const binaryTargetPath = isBinaryTool(pendingToolCall.toolCall.name)
    ? getBinaryTargetPath(pendingToolCall.toolCall.arguments)
    : "";
  const binaryRiskClass = binaryTargetPath ? classifyBinaryTargetRisk(binaryTargetPath) : undefined;
  const binaryApprovalRequired =
    pendingToolCall.toolCall.name === "patch_binary" || pendingToolCall.toolCall.name === "write_binary_file"
      ? binaryRiskClass === "high" || binaryRiskClass === "critical"
      : false;
  return {
    ...pendingToolCall,
    ...(binaryRiskClass ? { riskClass: binaryRiskClass } : {}),
    ...(binaryTargetPath ? { targetPath: binaryTargetPath } : {}),
    ...(binaryApprovalRequired ? { approvalRequired: true } : {}),
    ...(executionState?.executionVisibility ? { executionVisibility: executionState.executionVisibility } : {}),
    ...(executionState?.foregroundDisruptionRisk
      ? { foregroundDisruptionRisk: executionState.foregroundDisruptionRisk }
      : {}),
    ...(executionState?.interactionMode ? { interactionMode: executionState.interactionMode } : {}),
    ...(executionState?.focusPolicy ? { focusPolicy: executionState.focusPolicy } : {}),
    ...(executionState?.sessionPolicy ? { sessionPolicy: executionState.sessionPolicy } : {}),
    ...(executionState?.visibleFallbackReason
      ? { visibleFallbackReason: executionState.visibleFallbackReason }
      : {}),
  };
}

function nextEventSeq(run: StoredHostRun): number {
  return (run.events[run.events.length - 1]?.seq || 0) + 1;
}

async function appendRunEvent(
  run: StoredHostRun,
  event: Record<string, unknown>,
  attachedRes?: ServerResponse | null
): Promise<void> {
  const seq = nextEventSeq(run);
  const capturedAt = nowIso();
  const envelope = {
    ...event,
    id: typeof event.id === "string" ? event.id : `run_event_${run.id}_${seq}`,
    seq,
    capturedAt,
    scope: typeof event.scope === "string" ? event.scope : "run",
    runId: typeof event.runId === "string" ? event.runId : run.id,
    ...(run.automationId ? { automationId: run.automationId } : {}),
    ...(run.automationTriggerKind ? { triggerKind: run.automationTriggerKind } : {}),
    source:
      typeof event.source === "string"
        ? event.source
        : typeof event.event === "string" && event.event.startsWith("host.")
          ? "host"
          : "host",
    severity:
      typeof event.severity === "string"
        ? event.severity
        : typeof event.event === "string" && (event.event.includes("failed") || event.event.includes("stall"))
          ? "error"
          : "info",
  };
  const decoratedEvent = decorateUiEvent(envelope);
  const stored: StoredEvent = {
    seq,
    capturedAt,
    event: decoratedEvent,
  };
  run.events.push(stored);
  run.events = run.events.slice(-MAX_EVENT_HISTORY);
  run.updatedAt = stored.capturedAt;
  const eventName = typeof event.event === "string" ? event.event : "";
  if (eventName === "tool_request") {
    setTimingOnce(run, "firstToolRequestAt", capturedAt);
    setTimingOnce(run, "firstVisibleTextAt", capturedAt);
  } else if (eventName === "tool_result") {
    setTimingOnce(run, "firstToolResultAt", capturedAt);
    setTimingOnce(run, "firstVisibleTextAt", capturedAt);
  } else if (eventName === "final" || eventName === "partial" || eventName === "token") {
    setTimingOnce(run, "firstVisibleTextAt", capturedAt);
    if (eventName === "final") setTimingOnce(run, "finalAt", capturedAt);
  } else if (eventName === "host.status") {
    const message =
      event.data && typeof event.data === "object" && typeof (event.data as Record<string, unknown>).message === "string"
        ? String((event.data as Record<string, unknown>).message)
        : "";
    if (message && !isInfrastructureStatusMessage(message)) {
      setTimingOnce(run, "firstVisibleTextAt", capturedAt);
    }
  }
  refreshRunLatencyMetrics(run);
  if (attachedRes && !attachedRes.destroyed) {
    sendSseEvent(attachedRes, decoratedEvent);
  }
  await persistHostRun(run);
}

function blockedToolResult(pendingToolCall: PendingToolCall, message: string): ToolResult {
  return {
    toolCallId: pendingToolCall.toolCall.id,
    name: pendingToolCall.toolCall.name,
    ok: false,
    blocked: true,
    summary: message,
    error: message,
    createdAt: nowIso(),
  };
}

function sanitizeToolResultForUi(toolResult: ToolResult): Record<string, unknown> {
  const data = toolResult.data && typeof toolResult.data === "object" ? { ...toolResult.data } : undefined;
  if (data && "dataBase64" in data) delete data.dataBase64;
  if (data && "bytesBase64" in data) delete data.bytesBase64;
  return {
    toolCallId: toolResult.toolCallId,
    name: toolResult.name,
    ok: toolResult.ok,
    blocked: toolResult.blocked ?? false,
    summary: toolResult.summary,
    ...(toolResult.error ? { error: toolResult.error } : {}),
    ...(data ? { data } : {}),
    ...(toolResult.createdAt ? { createdAt: toolResult.createdAt } : {}),
  };
}

function extractDesktopToolMetadata(toolResult: ToolResult): {
  intentStepId?: string;
  intentKind?: BinaryIntentKind;
  executionMode?: "background_safe" | "foreground_lease" | "takeover";
  windowAffinityToken?: string;
  targetAppIntent?: string;
  targetResolvedApp?: string;
  targetConfidence?: number;
  pageLeaseId?: string;
  targetOrigin?: string;
  focusRecoveryAttempted?: boolean;
  focusModeApplied?: "background_safe" | "foreground_lease";
  foregroundLeaseMs?: number;
  focusLeaseRestored?: boolean;
  recoverySuppressedReason?: string;
  relaunchAttempt?: number;
  relaunchSuppressed?: boolean;
  relaunchSuppressionReason?: string;
  verificationRequired?: boolean;
  verificationPassed?: boolean;
  domProofArtifacts?: string[];
  screenshotCaptured?: boolean;
  screenshotReason?: BinaryScreenshotReason;
  proofProgress?: number;
  proofArtifacts?: string[];
} {
  const data = toolResult.data && typeof toolResult.data === "object" ? (toolResult.data as Record<string, unknown>) : null;
  const intentKind = data && typeof data.intentKind === "string" ? String(data.intentKind) : "";
  const normalizedScreenshotReason = data && typeof data.screenshotReason === "string" ? String(data.screenshotReason) : "";
  return {
    ...(data && typeof data.intentStepId === "string" ? { intentStepId: data.intentStepId } : {}),
    ...(intentKind &&
    (intentKind === "open" ||
      intentKind === "draft_text" ||
      intentKind === "compute" ||
      intentKind === "navigate_path" ||
      intentKind === "verify" ||
      intentKind === "cleanup" ||
      intentKind === "open_site" ||
      intentKind === "search" ||
      intentKind === "login" ||
      intentKind === "fill_form" ||
      intentKind === "extract" ||
      intentKind === "recover")
      ? { intentKind: intentKind as BinaryIntentKind }
      : {}),
    ...(data &&
    (data.executionMode === "background_safe" ||
      data.executionMode === "foreground_lease" ||
      data.executionMode === "takeover")
      ? { executionMode: data.executionMode }
      : {}),
    ...(data && typeof data.windowAffinityToken === "string" ? { windowAffinityToken: data.windowAffinityToken } : {}),
    ...(data && typeof data.targetAppIntent === "string" ? { targetAppIntent: data.targetAppIntent } : {}),
    ...(data && typeof data.targetResolvedApp === "string" ? { targetResolvedApp: data.targetResolvedApp } : {}),
    ...(data && typeof data.targetConfidence === "number"
      ? { targetConfidence: data.targetConfidence }
      : data && typeof data.confidence === "number"
        ? { targetConfidence: data.confidence }
        : {}),
    ...(data && typeof data.pageLeaseId === "string" ? { pageLeaseId: data.pageLeaseId } : {}),
    ...(data && typeof data.targetOrigin === "string" ? { targetOrigin: data.targetOrigin } : {}),
    ...(data && typeof data.focusRecoveryAttempted === "boolean"
      ? { focusRecoveryAttempted: data.focusRecoveryAttempted }
      : {}),
    ...(data && (data.focusModeApplied === "background_safe" || data.focusModeApplied === "foreground_lease")
      ? { focusModeApplied: data.focusModeApplied }
      : {}),
    ...(data && typeof data.foregroundLeaseMs === "number" ? { foregroundLeaseMs: data.foregroundLeaseMs } : {}),
    ...(data && typeof data.focusLeaseRestored === "boolean" ? { focusLeaseRestored: data.focusLeaseRestored } : {}),
    ...(data && typeof data.recoverySuppressedReason === "string"
      ? { recoverySuppressedReason: data.recoverySuppressedReason }
      : {}),
    ...(data && typeof data.relaunchAttempt === "number" ? { relaunchAttempt: data.relaunchAttempt } : {}),
    ...(data && typeof data.relaunchSuppressed === "boolean" ? { relaunchSuppressed: data.relaunchSuppressed } : {}),
    ...(data && typeof data.relaunchSuppressionReason === "string"
      ? { relaunchSuppressionReason: data.relaunchSuppressionReason }
      : {}),
    ...(data && typeof data.verificationRequired === "boolean"
      ? { verificationRequired: data.verificationRequired }
      : {}),
    ...(data && typeof data.verificationPassed === "boolean"
      ? { verificationPassed: data.verificationPassed }
      : {}),
    ...(data && Array.isArray(data.domProofArtifacts)
      ? { domProofArtifacts: data.domProofArtifacts.filter((item) => typeof item === "string") as string[] }
      : {}),
    ...(data && typeof data.screenshotCaptured === "boolean" ? { screenshotCaptured: data.screenshotCaptured } : {}),
    ...(normalizedScreenshotReason === "explicit_user_request" ||
    normalizedScreenshotReason === "debug_mode" ||
    normalizedScreenshotReason === "proof_fallback"
      ? { screenshotReason: normalizedScreenshotReason as BinaryScreenshotReason }
      : {}),
    ...(data && typeof data.proofProgress === "number" ? { proofProgress: data.proofProgress } : {}),
    ...(data && Array.isArray(data.proofArtifacts)
      ? { proofArtifacts: data.proofArtifacts.filter((item) => typeof item === "string") as string[] }
      : {}),
  };
}

function looksLikeDangerousGlobalCommand(command: string): boolean {
  const normalized = String(command || "").toLowerCase();
  return [
    /\brm\s+-rf\s+\/(?!\w)/,
    /\brmdir\s+\/s\s+\/q\s+[a-z]:\\?$/i,
    /\bdel\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
    /\bformat\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bmkfs\b/i,
    /\bdiskpart\b/i,
    /\bsc\s+delete\b/i,
    /\bnet\s+user\b/i,
  ].some((pattern) => pattern.test(normalized));
}

async function enforceToolPolicy(
  run: StoredHostRun,
  preferences: BinaryHostPreferences,
  pendingToolCall: PendingToolCall
): Promise<ToolResult | null> {
  if (isBinaryMutationTool(pendingToolCall.toolCall.name)) {
    const targetPath = getBinaryTargetPath(pendingToolCall.toolCall.arguments);
    const riskClass = classifyBinaryTargetRisk(targetPath);
    if (isBinaryRawDevicePath(targetPath)) {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked a raw device mutation. Whole-machine binary writes are limited to regular files in v1."
      );
    }
    if (riskClass === "critical") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked a critical binary mutation in a protected or boot-like location."
      );
    }
    if (riskClass === "high") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host requires explicit approval and dry-run proof before mutating executable or signed-style binary targets."
      );
    }
  }
  const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
  if (isTerminalToolName(String(pendingToolCall.toolCall.name || ""))) {
    if (!grant) {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host refused to run a command because the workspace is not trusted."
      );
    }
    if (grant.commands === "prompt") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked the command because this workspace requires command confirmation."
      );
    }
    const command = String(pendingToolCall.toolCall.arguments.command || "").trim();
    if (looksLikeDangerousGlobalCommand(command) && grant.elevated !== "allow") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked a dangerous machine-level command outside the trusted workspace policy."
      );
    }
  }
  return null;
}

async function emitHostStatus(
  run: StoredHostRun,
  message: string,
  attachedRes?: ServerResponse | null,
  extra?: Record<string, unknown>
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.status",
      data: {
        message,
        runId: run.id,
        workspaceRoot: run.workspaceRoot || null,
        workspaceHash: hashWorkspaceRoot(run.workspaceRoot),
        client: run.client,
        ...extra,
      },
    },
    attachedRes
  );
}

function buildFirstResponseProgressMessage(tick: number): string {
  if (tick <= 0) return "Working on it.";
  if (tick === 1) return "Starting now.";
  if (tick % 2 === 0) return "Still working...";
  return "Making progress...";
}

function buildExecutionLaneStatusMessage(lane: BinaryExecutionLane): string {
  if (lane === "local_interactive") return "Using the local runtime for this request.";
  if (lane === "openhands_headless") return "Running this in the background runtime.";
  return "Using an isolated runtime for this request.";
}

function startFirstResponseProgressTicker(
  run: StoredHostRun,
  attachedRes?: ServerResponse | null
): () => void {
  let stopped = false;
  let tick = 1;
  const timer = setInterval(() => {
    if (stopped) return;
    if (run.status !== "running" || run.timingState?.firstToolResultAt || run.timingState?.finalAt) {
      stopped = true;
      clearInterval(timer);
      return;
    }
    tick += 1;
    void emitHostStatus(run, buildFirstResponseProgressMessage(tick), attachedRes, {
      startupPhase: "fast_start",
      progressTick: tick,
    }).catch(() => undefined);
  }, FIRST_RESPONSE_PROGRESS_INTERVAL_MS);
  timer.unref?.();
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}

async function syncWorldRouteDecision(
  run: StoredHostRun,
  worldContext: Record<string, unknown> | undefined,
  taskSpeedClass: BinaryTaskSpeedClass,
  contextTier: "minimal" | "standard" | "full",
  attachedRes?: ServerResponse | null
): Promise<void> {
  const topRoute =
    worldContext && Array.isArray(worldContext.routeRecommendations) && worldContext.routeRecommendations[0] && typeof worldContext.routeRecommendations[0] === "object"
      ? (worldContext.routeRecommendations[0] as Record<string, unknown>)
      : null;
  const kind = topRoute && typeof topRoute.kind === "string" ? topRoute.kind : null;
  if (!topRoute || !kind) return;
  const decisionFeatures =
    topRoute.decisionFeatures && typeof topRoute.decisionFeatures === "object"
      ? (topRoute.decisionFeatures as Record<string, unknown>)
      : {};
  if (run.worldRouteKind === kind && run.worldContextTier === contextTier && run.worldRouteDecisionId) {
    run.lastExecutionState = {
      ...(run.lastExecutionState || {}),
      chosenRoute: kind,
      routeReason: typeof topRoute.reason === "string" ? topRoute.reason : run.lastExecutionState?.routeReason,
      selectedContextTier: contextTier,
      decisionFeatures,
      historicalSuccessWeight:
        typeof decisionFeatures.historicalSuccessWeight === "number" ? decisionFeatures.historicalSuccessWeight : undefined,
      freshnessPenalty: typeof topRoute.freshnessPenalty === "number" ? topRoute.freshnessPenalty : undefined,
      contradictionPenalty: typeof topRoute.contradictionPenalty === "number" ? topRoute.contradictionPenalty : undefined,
      proofBoost: typeof topRoute.proofBoost === "number" ? topRoute.proofBoost : undefined,
      goalAlignmentBoost: typeof topRoute.goalAlignment === "number" ? topRoute.goalAlignment : undefined,
    };
    return;
  }
  const decision = await worldModelService.recordRouteDecision({
    runId: run.id,
    task: run.request.task,
    candidateId: typeof topRoute.candidateId === "string" ? topRoute.candidateId : kind,
    kind,
    taskSpeedClass,
    contextTier,
    heuristicScore: typeof topRoute.heuristicScore === "number" ? topRoute.heuristicScore : undefined,
    adaptiveScore: typeof topRoute.adaptiveScore === "number" ? topRoute.adaptiveScore : undefined,
    finalScore: typeof topRoute.score === "number" ? topRoute.score : undefined,
    confidence: typeof topRoute.confidence === "number" ? topRoute.confidence : undefined,
    evidenceIds: Array.isArray(topRoute.evidenceIds) ? topRoute.evidenceIds.map((item) => String(item)) : [],
    decisionFeatures,
  });
  run.worldRouteDecisionId = decision.id;
  run.worldRouteKind = decision.kind;
  run.worldContextTier = contextTier;
  run.lastExecutionState = {
    ...(run.lastExecutionState || {}),
    chosenRoute: decision.kind,
    routeReason: typeof topRoute.reason === "string" ? topRoute.reason : run.lastExecutionState?.routeReason,
    selectedContextTier: contextTier,
    decisionFeatures,
    historicalSuccessWeight:
      typeof decisionFeatures.historicalSuccessWeight === "number" ? decisionFeatures.historicalSuccessWeight : undefined,
    freshnessPenalty: typeof topRoute.freshnessPenalty === "number" ? topRoute.freshnessPenalty : undefined,
    contradictionPenalty: typeof topRoute.contradictionPenalty === "number" ? topRoute.contradictionPenalty : undefined,
    proofBoost: typeof topRoute.proofBoost === "number" ? topRoute.proofBoost : undefined,
    goalAlignmentBoost: typeof topRoute.goalAlignment === "number" ? topRoute.goalAlignment : undefined,
  };
  await appendRunEvent(
    run,
    {
      event: "host.world_route",
      data: {
        runId: run.id,
        routeKind: decision.kind,
        decisionId: decision.id,
        selectedContextTier: contextTier,
        confidence: typeof topRoute.confidence === "number" ? topRoute.confidence : null,
        heuristicScore: typeof topRoute.heuristicScore === "number" ? topRoute.heuristicScore : null,
        adaptiveScore: typeof topRoute.adaptiveScore === "number" ? topRoute.adaptiveScore : null,
        historicalSuccessWeight:
          typeof decisionFeatures.historicalSuccessWeight === "number" ? decisionFeatures.historicalSuccessWeight : null,
        freshnessPenalty: typeof topRoute.freshnessPenalty === "number" ? topRoute.freshnessPenalty : null,
        contradictionPenalty: typeof topRoute.contradictionPenalty === "number" ? topRoute.contradictionPenalty : null,
        proofBoost: typeof topRoute.proofBoost === "number" ? topRoute.proofBoost : null,
        goalAlignmentBoost: typeof topRoute.goalAlignment === "number" ? topRoute.goalAlignment : null,
        decisionFeatures,
      },
    },
    attachedRes
  );
}

function mapToolResultToRouteOutcome(
  pendingToolCall: PendingToolCall,
  toolResult: ToolResult
): {
  outcome: "success" | "blocked" | "fallback" | "verification_failure" | "focus_conflict";
  verificationStatus: "passed" | "failed" | "unknown";
  advancedGoal: boolean;
} {
  const data = toolResult.data && typeof toolResult.data === "object" ? toolResult.data : {};
  const visibleFallbackReason = typeof data.visibleFallbackReason === "string" ? data.visibleFallbackReason : "";
  const failureCategory = typeof data.failureCategory === "string" ? data.failureCategory : "";
  const verificationTool = pendingToolCall.toolCall.name === "repo_record_verification";
  if (toolResult.blocked && (visibleFallbackReason || toolResult.summary.toLowerCase().includes("focus"))) {
    return { outcome: "focus_conflict", verificationStatus: "unknown", advancedGoal: false };
  }
  if (!toolResult.ok && (verificationTool || failureCategory)) {
    return { outcome: "verification_failure", verificationStatus: "failed", advancedGoal: false };
  }
  if (!toolResult.ok) {
    return { outcome: "blocked", verificationStatus: "unknown", advancedGoal: false };
  }
  if (visibleFallbackReason) {
    return { outcome: "fallback", verificationStatus: verificationTool ? "passed" : "unknown", advancedGoal: !isObserveTool(pendingToolCall.toolCall.name) };
  }
  return {
    outcome: "success",
    verificationStatus: verificationTool ? "passed" : "unknown",
    advancedGoal: !isObserveTool(pendingToolCall.toolCall.name),
  };
}

async function emitHostHeartbeat(run: StoredHostRun, attachedRes?: ServerResponse | null): Promise<void> {
  run.heartbeatAt = nowIso();
  if (run.leaseState) run.leaseState.heartbeatAt = run.heartbeatAt;
  await appendRunEvent(
    run,
    {
      event: "host.heartbeat",
      data: {
        runId: run.id,
        status: run.status,
        heartbeatAt: run.heartbeatAt,
        lastToolAt: run.lastToolAt || null,
      },
    },
    attachedRes
  );
}

async function emitHostBudget(run: StoredHostRun, attachedRes?: ServerResponse | null): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.budget",
      data: {
        runId: run.id,
        budgetState: run.budgetState ?? null,
      },
    },
    attachedRes
  );
}

async function emitHostCheckpoint(
  run: StoredHostRun,
  checkpoint: { capturedAt: string; summary: string; step?: number },
  attachedRes?: ServerResponse | null
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.checkpoint",
      data: {
        runId: run.id,
        checkpoint,
        checkpointState: run.checkpointState,
      },
    },
    attachedRes
  );
}

async function emitHostStall(run: StoredHostRun, reason: string, attachedRes?: ServerResponse | null): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.stall",
      data: {
        runId: run.id,
        reason,
        lastPendingToolCallSignature: run.lastPendingToolCallSignature || null,
      },
    },
    attachedRes
  );
}

async function emitTakeoverRequired(
  run: StoredHostRun,
  reason: string,
  attachedRes?: ServerResponse | null
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.takeover_required",
      data: {
        runId: run.id,
        reason,
        resumeToken: run.resumeToken,
        unfinishedChecklistItems:
          Array.isArray(run.finalEnvelope?.unfinishedChecklistItems) ? run.finalEnvelope.unfinishedChecklistItems : [],
        lastMeaningfulProof:
          typeof run.finalEnvelope?.lastMeaningfulProof === "string" ? run.finalEnvelope.lastMeaningfulProof : undefined,
        nextDeterministicAction:
          typeof run.finalEnvelope?.progressState?.nextDeterministicAction === "string"
            ? run.finalEnvelope.progressState.nextDeterministicAction
            : undefined,
        closurePhase:
          typeof run.finalEnvelope?.loopState?.closurePhase === "string" ? run.finalEnvelope.loopState.closurePhase : undefined,
        closureSummary:
          typeof run.finalEnvelope?.closureSummary === "string" ? run.finalEnvelope.closureSummary : undefined,
      },
    },
    attachedRes
  );
}

function detectStall(run: StoredHostRun, envelope: AssistRunEnvelope): string | null {
  const pendingName = String(envelope.pendingToolCall?.toolCall?.name || "").trim();
  if (
    pendingName &&
    isBrowserMicroToolName(pendingName) &&
    (run.repeatedPendingSignatureCount || 0) >= BROWSER_MICRO_STALL_REPEATS
  ) {
    return "Binary detected repeated low-level browser steps without progress and is switching to a mission-style browser route.";
  }
  if ((run.repeatedPendingSignatureCount || 0) >= MAX_PENDING_SIGNATURE_REPEATS) {
    return "Binary Host detected repeated identical pending tool calls without new proof.";
  }
  if ((run.observationOnlyStreak || 0) >= MAX_OBSERVATION_ONLY_STREAK) {
    return "Binary Host detected too many observation-only turns without a mutation or terminal proof.";
  }
  if (run.budgetState?.exhausted) {
    return run.budgetState.reason || "The hosted run exhausted its budget.";
  }
  if (typeof envelope.whyBinaryIsBlocked === "string" && envelope.whyBinaryIsBlocked.trim()) {
    return envelope.whyBinaryIsBlocked;
  }
  if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
    return envelope.progressState.stallReason;
  }
  return null;
}

function summarizeReceipt(envelope: AssistRunEnvelope): { id: string; label: string; url?: string; createdAt: string } | null {
  const receipt = envelope.receipt && typeof envelope.receipt === "object" ? envelope.receipt : null;
  if (!receipt) return null;
  const id = typeof receipt.id === "string" ? receipt.id : null;
  const label = typeof receipt.title === "string" ? receipt.title : typeof receipt.status === "string" ? receipt.status : null;
  if (!id || !label) return null;
  return {
    id,
    label,
    url: typeof receipt.downloadUrl === "string" ? receipt.downloadUrl : undefined,
    createdAt: nowIso(),
  };
}

function updatePendingStats(run: StoredHostRun, envelope: AssistRunEnvelope): void {
  if (!envelope.pendingToolCall) {
    run.lastPendingToolCallSignature = undefined;
    run.repeatedPendingSignatureCount = 0;
    run.observationOnlyStreak = 0;
    return;
  }

  const signature = buildPendingSignature(envelope.pendingToolCall);
  run.repeatedPendingSignatureCount =
    signature && signature === run.lastPendingToolCallSignature
      ? (run.repeatedPendingSignatureCount || 0) + 1
      : 1;
  run.lastPendingToolCallSignature = signature || undefined;
  run.observationOnlyStreak = isObserveTool(envelope.pendingToolCall.toolCall.name)
    ? (run.observationOnlyStreak || 0) + 1
    : 0;
}

function recordToolCheckpoint(run: StoredHostRun, pendingToolCall: PendingToolCall, toolResult: ToolResult): {
  capturedAt: string;
  summary: string;
  step?: number;
} | null {
  if (!toolResult.ok) return null;
  if (pendingToolCall.toolCall.name !== "create_checkpoint" && isObserveTool(pendingToolCall.toolCall.name)) {
    return null;
  }
  return {
    capturedAt: toolResult.createdAt || nowIso(),
    summary: toolResult.summary,
    ...(typeof pendingToolCall.step === "number" ? { step: pendingToolCall.step } : {}),
  };
}

async function refreshRunPreferences(run: StoredHostRun): Promise<void> {
  const preferences = await loadPreferences();
  if (run.sessionId) {
    preferences.recentSessions = [
      {
        sessionId: run.sessionId,
        ...(run.runId ? { runId: run.runId } : {}),
        updatedAt: run.updatedAt,
        ...(run.workspaceRoot ? { workspaceRoot: run.workspaceRoot } : {}),
      },
      ...preferences.recentSessions.filter((item) => item.sessionId !== run.sessionId),
    ].slice(0, 30);
  }
  const artifact = run.finalEnvelope ? summarizeReceipt(run.finalEnvelope) : null;
  if (artifact) {
    preferences.artifactHistory = [
      artifact,
      ...preferences.artifactHistory.filter((item) => item.id !== artifact.id),
    ].slice(0, 30);
  }
  await savePreferences(preferences);
}

async function runWithTransportRetry<T>(
  run: StoredHostRun,
  attachedRes: ServerResponse | null | undefined,
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await emitHostStatus(run, "Binary Host retrying a transient hosted transport failure.", attachedRes, {
      error: error instanceof Error ? error.message : String(error),
    });
    return await work();
  }
}

async function finalizeRun(
  run: StoredHostRun,
  status: BinaryHostRunStatus,
  attachedRes?: ServerResponse | null,
  extra?: { message?: string; error?: string }
): Promise<void> {
  run.status = status;
  run.updatedAt = nowIso();
  if (extra?.error) run.error = extra.error;
  if (run.worldRouteDecisionId || run.worldRouteKind) {
    const failedVerification = run.toolResults.some((toolResult) => {
      const data = toolResult.data && typeof toolResult.data === "object" ? toolResult.data : {};
      return typeof data.failureCategory === "string" || toolResult.name === "repo_record_verification";
    });
    await worldModelService.recordRouteOutcome({
      decisionId: run.worldRouteDecisionId,
      runId: run.id,
      routeKind: run.worldRouteKind,
      outcome:
        status === "completed"
          ? failedVerification
            ? "verification_failure"
            : "success"
          : status === "takeover_required"
            ? "takeover_required"
            : status === "cancelled"
              ? "cancelled"
              : failedVerification
                ? "verification_failure"
                : "blocked",
      advancedGoal: status === "completed",
      verificationStatus: failedVerification ? "failed" : "unknown",
      summary: extra?.message || extra?.error,
    });
  }
  if (status === "completed" || status === "failed" || status === "takeover_required" || status === "cancelled") {
    setTimingOnce(run, "finalAt", run.updatedAt);
  }
  refreshRunLatencyMetrics(run, run.finalEnvelope);
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);
  await agentJobManager.syncFromRun(run);
  if (status === "completed" && run.finalEnvelope?.loopState?.closurePhase === "complete") {
    await appendRunEvent(
      run,
      {
        event: "host.closure_completed",
        data: {
          runId: run.id,
          message:
            typeof run.finalEnvelope?.closureSummary === "string" && run.finalEnvelope.closureSummary.trim()
              ? run.finalEnvelope.closureSummary
              : "Binary completed closure for the current run.",
        },
      },
      attachedRes
    );
  }
  if (
    (status === "takeover_required" || status === "failed") &&
    Array.isArray(run.finalEnvelope?.unfinishedChecklistItems) &&
    run.finalEnvelope.unfinishedChecklistItems.length > 0
  ) {
    await appendRunEvent(
      run,
      {
        event: "host.closure_blocked",
        data: {
          runId: run.id,
          reason: run.takeoverReason || extra?.error || extra?.message || "Binary could not prove full closure.",
          unfinishedChecklistItems: run.finalEnvelope.unfinishedChecklistItems,
          nextDeterministicAction: run.finalEnvelope.progressState?.nextDeterministicAction,
        },
      },
      attachedRes
    );
  }
  if (extra?.message || extra?.error) {
    const err = String(extra?.error || "").trim();
    const msg = String(extra?.message || "").trim();
    const statusMessage =
      msg && err && !msg.includes(err) ? `${msg} Cause: ${err}` : msg || err || "Binary Host ended the run.";
    await emitHostStatus(run, statusMessage, attachedRes, err ? { error: err } : undefined);
  }
  if (run.automationId && status === "completed") {
    await automationRuntime.recordRunCompleted({
      automationId: run.automationId,
      runId: run.id,
      summary: extra?.message,
    });
  } else if (run.automationId && (status === "failed" || status === "cancelled")) {
    await automationRuntime.recordRunFailed({
      automationId: run.automationId,
      runId: run.id,
      summary: extra?.error || extra?.message,
    });
  }
}

async function pauseRun(
  run: StoredHostRun,
  attachedRes?: ServerResponse | null,
  reason?: string
): Promise<void> {
  run.takeoverReason = reason || run.takeoverReason;
  await finalizeRun(run, "paused", attachedRes, {
    message: reason || "Binary Host paused the run.",
  });
}

async function cancelRun(
  run: StoredHostRun,
  attachedRes?: ServerResponse | null,
  reason?: string
): Promise<void> {
  await finalizeRun(run, "cancelled", attachedRes, {
    message: reason || "Binary Host cancelled the run.",
  });
}

async function startRunExecution(runId: string, attachedRes?: ServerResponse | null): Promise<void> {
  const existing = activeExecutions.get(runId);
  if (existing) {
    await existing;
    return;
  }

  const execution = executeHostRun(runId, attachedRes)
    .catch(async (error) => {
      const run = await loadRunRecord(runId);
      if (run) {
        run.error = error instanceof Error ? error.message : String(error);
        run.updatedAt = nowIso();
        await persistHostRun(run);
        await agentJobManager.syncFromRun(run);
      }
    })
    .finally(() => {
      activeExecutions.delete(runId);
      runControllers.delete(runId);
    });

  activeExecutions.set(runId, execution);
  await execution;
}

async function createQueuedRun(input: {
  request: AssistRequest;
  workspaceTrustMode: BinaryHostWorkspaceTrustMode;
}): Promise<StoredHostRun> {
  const createdAt = nowIso();
  const run: StoredHostRun = {
    id: randomUUID(),
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    client: input.request.client || { surface: "unknown" },
    request: input.request,
    workspaceRoot: input.request.workspaceRoot,
    machineRootPath: input.request.machineRootPath,
    focusedWorkspaceRoot: input.request.focusWorkspaceRoot || input.request.workspaceRoot,
    focusedRepoRoot: input.request.focusRepoRoot || input.request.focusWorkspaceRoot || input.request.workspaceRoot,
    rootResolutionReason: input.request.rootResolutionReason,
    workspaceTrustMode: input.workspaceTrustMode,
    traceId: randomUUID(),
    executionLane: input.request.executionLane,
    pluginPacks: [],
    skillSources: [],
    automationId: input.request.automationId,
    automationTriggerKind: input.request.automationTriggerKind,
    automationEventId: input.request.automationEventId,
    resumeToken: buildResumeToken(),
    controlHistory: [],
    toolResults: [],
    checkpoints: [],
    events: [],
    timingState: {
      startedAt: createdAt,
      selectedSpeedProfile: normalizeSpeedProfile(input.request.speedProfile),
      startupPhase: "fast_start",
      startupPhaseDurations: {},
    },
  };
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);
  return run;
}

async function executeHostRun(runId: string, attachedRes?: ServerResponse | null): Promise<void> {
  const run = await loadRunRecord(runId);
  if (!run) throw new Error(`Unknown Binary Host run ${runId}`);

  let preferences = await loadPreferences();
  if (!run.machineRootPath) {
    const resolvedRoots = inferFocusedRoots({
      preferences,
      machineRootPath: run.request.machineRootPath,
      workspaceRoot: run.workspaceRoot,
      focusWorkspaceRoot: run.focusedWorkspaceRoot || run.request.focusWorkspaceRoot,
      focusRepoRoot: run.focusedRepoRoot || run.request.focusRepoRoot,
    });
    run.machineRootPath = resolvedRoots.machineRootPath;
    run.focusedWorkspaceRoot = resolvedRoots.focusedWorkspaceRoot;
    run.focusedRepoRoot = resolvedRoots.focusedRepoRoot;
    run.rootResolutionReason = run.rootResolutionReason || resolvedRoots.rootResolutionReason;
    run.workspaceRoot = run.workspaceRoot || resolvedRoots.focusedWorkspaceRoot;
  }
  const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
  run.workspaceTrustMode = deriveEffectiveTrustMode(preferences, run.workspaceRoot);
  if (run.workspaceRoot && !grant) {
    await finalizeRun(run, "failed", attachedRes, {
      error: `Workspace ${run.workspaceRoot} is not trusted.`,
      message: "Binary Host blocked the run because the workspace is not trusted.",
    });
    return;
  }

  const controller: RunControllerState = {
    pauseRequested: false,
    cancelRequested: false,
  };
  runControllers.set(run.id, controller);

  run.status = "running";
  run.error = undefined;
  run.takeoverReason = undefined;
  run.leaseId = randomUUID();
  run.resumeToken = buildResumeToken();
  run.heartbeatAt = nowIso();
  run.leaseState = {
    leaseId: run.leaseId,
    workerId: `${os.hostname()}:${process.pid}`,
    startedAt: run.heartbeatAt,
    heartbeatAt: run.heartbeatAt,
    ...(run.lastToolAt ? { lastToolAt: run.lastToolAt } : {}),
  };
  refreshRunLatencyMetrics(run);
  run.updatedAt = nowIso();
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);
  await agentJobManager.syncFromRun(run);
  if (run.automationId) {
    await automationRuntime.recordRunStarted({
      automationId: run.automationId,
      runId: run.id,
    });
  }
  await emitHostStatus(run, "Binary Host accepted the request.", attachedRes, {
    attached: Boolean(attachedRes),
  });
  await emitHostHeartbeat(run, attachedRes);
  await emitHostStatus(run, buildFirstResponseProgressMessage(0), attachedRes, {
    startupPhase: "fast_start",
    progressTick: 0,
  });
  const stopFirstResponseProgressTicker = startFirstResponseProgressTicker(run, attachedRes);

  const executor = await createHostToolExecutor({
    run,
    workspaceRoot: run.workspaceRoot,
    task: run.request.task,
    preferences,
  });

  try {
    const speedProfile = normalizeSpeedProfile(run.request.speedProfile);
    const taskSpeedClass = classifyTaskSpeed(run.request.task, run.workspaceRoot);
    const turnRoutePolicy = buildTurnRoutePolicy({
      speedProfile,
      taskSpeedClass,
      request: run.request,
    });
    const firstTurnRoutePolicy = tightenFirstTurnRoutePolicy(turnRoutePolicy, taskSpeedClass);
    const remoteHealth = await getRemoteRuntimeHealth().catch(() => null);
    const executionConfig = resolveRunExecutionConfig({
      run,
      taskSpeedClass,
      remoteConfigured: Boolean(remoteHealth?.available && remoteHealth.compatibility === "gateway_compatible"),
      defaultPluginPacks: preferences.defaultPluginPacks,
    });
    run.executionLane = executionConfig.executionLane;
    run.pluginPacks = executionConfig.pluginPacks;
    run.skillSources = executionConfig.skillSources;
    if (!run.timingState) {
      run.timingState = {
        startedAt: run.createdAt || nowIso(),
        selectedSpeedProfile: speedProfile,
        taskSpeedClass,
        startupPhase: "fast_start",
        startupPhaseDurations: {},
      };
    } else {
      run.timingState.selectedSpeedProfile = speedProfile;
      run.timingState.taskSpeedClass = taskSpeedClass;
      run.timingState.startupPhase = "fast_start";
    }
    run.lastExecutionState = {
      ...(run.lastExecutionState || {}),
      lane:
        executionConfig.executionLane === "local_interactive"
          ? "interactive-fast"
          : executionConfig.executionLane === "openhands_headless"
            ? "background-heavy"
            : "interactive-deep",
      executionLane: executionConfig.executionLane,
      pluginPacks: executionConfig.pluginPacks,
      skillSources: executionConfig.skillSources,
      traceSampled: executionConfig.traceSampled,
    };
    await persistHostRun(run);
    await agentJobManager.syncFromRun(run);
    await emitHostStatus(run, buildExecutionLaneStatusMessage(executionConfig.executionLane), attachedRes, {
      executionLane: executionConfig.executionLane,
      routeReason: executionConfig.reason,
      pluginPackCount: executionConfig.pluginPacks.length,
      skillSourceCount: executionConfig.skillSources.length,
      traceSampled: executionConfig.traceSampled,
    });
    if (
      await tryDirectMachineShortcut({
        run,
        preferences,
        taskSpeedClass,
        speedProfile,
        machineAutonomyController,
        attachedRes,
      })
    ) {
      return;
    }
    const auth = await getApiKeyRecord();
    if (!auth.apiKey) {
      await finalizeRun(run, "failed", attachedRes, {
        error: "No Binary IDE API key is configured in the local host.",
        message: "Binary Host could not start because no API key is configured.",
      });
      return;
    }
    const machineShortcutIntent = isExplicitMachineShortcutTask(run.request.task);
    const deferInitialContextHydration =
      executionConfig.executionLane === "local_interactive" &&
      !machineShortcutIntent &&
      (taskSpeedClass === "chat_only" || taskSpeedClass === "simple_action");
    const shouldCollectMachineSurfaceContext =
      (executionConfig.executionLane !== "local_interactive" ||
        (machineShortcutIntent && taskSpeedClass === "simple_action")) &&
      taskLikelyNeedsRichSurfaceContext(run.request.task, taskSpeedClass);
    const shouldEmitWorldRouteDecision =
      !deferInitialContextHydration && shouldCollectMachineSurfaceContext && taskSpeedClass !== "chat_only";
    debugHostProgress(
      run.id,
      deferInitialContextHydration
        ? "deferring initial surface context hydration for fast first turn"
        : shouldCollectMachineSurfaceContext
          ? "starting surface context collection"
          : "skipping heavy surface context for openhands-first non-machine run"
    );
    const startupStartedAt = Date.now();
    const surfaceContextStartedAt = Date.now();
    const fastSurfaceSummary = speedProfile === "fast" && taskSpeedClass !== "deep_code";
    const skipDesktopSurfaceContext =
      deferInitialContextHydration ||
      !shouldCollectMachineSurfaceContext ||
      (speedProfile === "fast" && taskSpeedClass === "chat_only");
    const surfaceContextTimeoutMs = fastSurfaceSummary ? FAST_SURFACE_CONTEXT_TIMEOUT_MS : FULL_SURFACE_CONTEXT_TIMEOUT_MS;
    let desktopContext: Record<string, unknown>;
    let browserContext: Record<string, unknown>;
    if (deferInitialContextHydration) {
      desktopContext = {
        platform: `${process.platform}-${os.release()}`,
        deferred: true,
        reason: "fast_first_turn_deferred",
      };
      browserContext = { mode: "deferred", reason: "fast_first_turn_deferred" };
      run.timingState.startupPhaseDurations.surfaceContextMs = 0;
    } else {
      [desktopContext, browserContext] = await Promise.all([
        skipDesktopSurfaceContext
          ? Promise.resolve({
              platform: `${process.platform}-${os.release()}`,
              deferred: true,
              reason: shouldCollectMachineSurfaceContext ? "fast_chat_only" : "non_machine_task",
            })
          : withSurfaceContextTimeout(
              collectDesktopContext({
                machineAutonomyController,
                policy: preferences.machineAutonomy,
              }).catch(() => ({ platform: process.platform })),
              { platform: process.platform },
              surfaceContextTimeoutMs
            ),
        shouldCollectMachineSurfaceContext
          ? withSurfaceContextTimeout(
              collectBrowserContext({
                runtime: browserRuntimeController,
                policy: preferences.machineAutonomy,
                fast: fastSurfaceSummary,
              }).catch(() => ({ mode: "unavailable" })),
              { mode: "unavailable" },
              surfaceContextTimeoutMs
            )
          : Promise.resolve({ mode: "deferred", reason: "non_machine_task" }),
      ]);
      debugHostProgress(run.id, "surface context collected");
      run.timingState.startupPhaseDurations.surfaceContextMs = Date.now() - surfaceContextStartedAt;
      await worldModelService.ingestSnapshot({
        runId: run.id,
        task: run.request.task,
        workspaceRoot: run.workspaceRoot,
        machineRootPath: run.machineRootPath,
        focusedWorkspaceRoot: run.focusedWorkspaceRoot,
        focusedRepoRoot: run.focusedRepoRoot,
        desktopContext,
        browserContext,
        focusLease: sanitizeFocusLease(activeFocusLease),
      });
      debugHostProgress(run.id, "world snapshot ingested");
    }

    let worldContextTier = selectInitialWorldContextTier(taskSpeedClass);
    const deferRepoContext = shouldDeferRepoContext(taskSpeedClass);
    const deferVerificationPlan = shouldDeferVerificationPlan(taskSpeedClass);

    const worldContextPromise = buildWorldContextSlice({
      tier: worldContextTier,
      task: run.request.task,
      taskSpeedClass,
      toolFamily: "startup",
    }).catch(() => undefined);
    const repoContextPromise = buildRepoContextSlice(run.focusedRepoRoot || run.workspaceRoot, run.request.task).catch(() => undefined);
    const verificationPlanPromise = buildVerificationPlanSlice(run.focusedRepoRoot || run.workspaceRoot).catch(() => undefined);

    let worldContext = await worldContextPromise;
    let repoContext = deferRepoContext ? undefined : await repoContextPromise;
    let verificationPlan = deferVerificationPlan ? undefined : await verificationPlanPromise;
    run.worldContextTier = worldContextTier;
    run.timingState.startupPhaseDurations.initialContextMs = Date.now() - startupStartedAt;
    if (shouldEmitWorldRouteDecision) {
      await syncWorldRouteDecision(run, worldContext, taskSpeedClass, worldContextTier, attachedRes);
    }

    preferences = await ensureOAuthProviderConnectionFresh(preferences);
    const [mcp, providerSecrets] = await Promise.all([
      materializeEnabledConnections(preferences, run.request.mode),
      getConnectionSecrets(preferences.connections),
    ]);
    debugHostProgress(run.id, "connections materialized");
    const userConnectedModels = buildUserConnectedModelCandidates({
      records: preferences.connections,
      secrets: providerSecrets,
      defaultProviderId: preferences.defaultProviderId,
    });
    const orchestrationPolicy = normalizeOrchestrationPolicy(
      preferences.orchestrationPolicy,
      defaultOrchestrationPolicy()
    );
    const allowModelFallback = orchestrationPolicy.fallbackEnabled === true;
    const gatewayHintsForCandidate = (
      candidate: BinaryUserConnectedModelCandidate | null,
      initialTurn: boolean
    ) =>
      buildGatewayExecutionHints({
        run,
        candidate,
        orchestrationPolicy,
        taskSpeedClass,
        initialTurn,
      });
    const orderedUserConnectedModels = orderUserConnectedModelsForRun({
      requestedModel: run.request.model,
      candidates: userConnectedModels,
      speedProfile,
      taskSpeedClass,
      initialTurn: true,
    });
    const resolvedModelRequest = resolveRequestedProviderModelAlias(run.request.model, orderedUserConnectedModels);
    const fixedPolicyModelAlias =
      typeof orchestrationPolicy.fixedModelAlias === "string" && orchestrationPolicy.fixedModelAlias.trim()
        ? orchestrationPolicy.fixedModelAlias.trim()
        : undefined;
    let localGatewayModelCandidate =
      orchestrationPolicy.modelRoutingMode === "single_fixed_free"
        ? resolveFixedPolicyCandidate(orderedUserConnectedModels, fixedPolicyModelAlias)
        : resolvedModelRequest.source === "user_connected"
          ? orderedUserConnectedModels.find((candidate) => candidate.alias === resolvedModelRequest.model) || null
          : orderedUserConnectedModels[0] || null;
    let localGatewayModelCandidates = localGatewayModelCandidate
      ? (() => {
          const preferredAlias = localGatewayModelCandidate.alias;
          const prioritized = [
            localGatewayModelCandidate,
            ...orderedUserConnectedModels.filter((candidate) => candidate.alias !== preferredAlias),
          ];
          if (
            orchestrationPolicy.modelRoutingMode === "single_fixed_free" ||
            orchestrationPolicy.fallbackEnabled !== true
          ) {
            return prioritized.slice(0, 1);
          }
          return prioritized;
        })()
      : orderedUserConnectedModels;
    const forcedSmallModelAliases = new Set<string>(
      orderedUserConnectedModels
        .filter((candidate) => isSmallModelForcedCandidate(candidate, orchestrationPolicy))
        .map((candidate) => candidate.alias)
    );
    if (orchestrationPolicy.modelRoutingMode === "single_fixed_free" && localGatewayModelCandidate?.alias) {
      forcedSmallModelAliases.add(localGatewayModelCandidate.alias);
    }
    const attemptedFallbackAliases = new Set<string>(
      localGatewayModelCandidate?.alias ? [localGatewayModelCandidate.alias] : []
    );
    let initialGatewayExecutionHints = gatewayHintsForCandidate(localGatewayModelCandidate, true);
    if (run.timingState) {
      run.timingState.selectedLatencyTier = localGatewayModelCandidate?.latencyTier;
    }
    run.lastExecutionState = {
      ...(run.lastExecutionState || {}),
      executionLane: executionConfig.executionLane,
      speedProfile,
      latencyTier: localGatewayModelCandidate?.latencyTier,
      intendedUse: localGatewayModelCandidate?.intendedUse,
      startupPhase: "fast_start",
      taskSpeedClass,
      selectedContextTier: worldContextTier,
      policyLane: initialGatewayExecutionHints.policyLane,
      adapterMode: initialGatewayExecutionHints.adapterMode,
      latencyPolicy: initialGatewayExecutionHints.latencyPolicy,
      timeoutPolicy: initialGatewayExecutionHints.timeoutPolicy,
      modelRoutingMode: initialGatewayExecutionHints.modelRoutingMode,
      fixedModelAlias: initialGatewayExecutionHints.fixedModelAlias,
      fallbackEnabled: initialGatewayExecutionHints.fallbackEnabled,
      budgetProfile: initialGatewayExecutionHints.budgetProfile,
      firstTurnBudgetMs: initialGatewayExecutionHints.firstTurnBudgetMs,
      smallModelForced: initialGatewayExecutionHints.smallModelForced,
      terminalBackendMode: initialGatewayExecutionHints.terminalBackendMode,
      requireNativeTerminalTool: initialGatewayExecutionHints.requireNativeTerminalTool,
      terminalStrictMode: initialGatewayExecutionHints.terminalStrictMode,
      ...(localGatewayModelCandidate?.routeKind ? { chosenRoute: localGatewayModelCandidate.routeKind } : {}),
      ...(localGatewayModelCandidate?.routeReason ? { routeReason: localGatewayModelCandidate.routeReason } : {}),
    };
    debugHostProgress(
      run.id,
      `routing decided: source=${resolvedModelRequest.source} openhandsFirst=true candidate=${localGatewayModelCandidate?.alias || "none"}`
    );
    let assistTransport: "hosted" | "local_gateway" = "local_gateway";
    const shouldUseManagedRuntime = assistTransport === "local_gateway";
    const openhandsRuntime: OpenHandsRuntimeStatus = shouldUseManagedRuntime
      ? await (async () => {
          const runtimeStartedAt = Date.now();
          const runtimeStatus = await openHandsRuntimeSupervisor.ensureRuntime({
            desiredProfile: inferOpenHandsRuntimeProfile(run.request.task),
            strictNativeTerminal: initialGatewayExecutionHints.terminalStrictMode,
          });
          if (run.timingState) {
            run.timingState.startupPhaseDurations.runtimeReadyMs = Date.now() - runtimeStartedAt;
          }
          await emitHostStatus(run, runtimeStatus.message, attachedRes, {
            readiness: runtimeStatus.readiness,
            runtimeKind: runtimeStatus.runtimeKind,
            runtimeProfile: runtimeStatus.runtimeProfile,
            degradedReasons: runtimeStatus.degradedReasons,
            terminalStrictMode: initialGatewayExecutionHints.terminalStrictMode,
          });
          if (runtimeStatus.readiness === "repair_needed") {
            throw new Error(
              `${runtimeStatus.message} Recovery actions: ${runtimeStatus.availableActions.join(", ") || "Repair OpenHands runtime"}.`
            );
          }
          return runtimeStatus;
        })()
      : {
          readiness: "ready",
          runtimeKind: "unknown",
          runtimeProfile: "chat-only",
          gatewayUrl: getLocalGatewayUrl(),
          supportedTools: [],
          degradedReasons: [],
          availableActions: [],
          message: "Interactive hosted runs do not require a managed OpenHands runtime before the first response.",
        };
    const terminalRuntimeMetadata = resolveTerminalRuntimeMetadata({
      runtimeStatus: openhandsRuntime,
      terminalStrictMode: initialGatewayExecutionHints.terminalStrictMode,
    });
    run.lastExecutionState = {
      ...(run.lastExecutionState || {}),
      terminalBackend: terminalRuntimeMetadata.terminalBackend,
      terminalStrictMode: initialGatewayExecutionHints.terminalStrictMode,
      nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
      ...(terminalRuntimeMetadata.terminalHealthReason
        ? { terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason }
        : {}),
    };
    if (assistTransport === "local_gateway" && !localGatewayModelCandidate) {
      const runtimeFallbackApiKey = await getFallbackProviderApiKey(
        typeof openhandsRuntime.currentModelCandidate?.provider === "string"
          ? openhandsRuntime.currentModelCandidate.provider
          : undefined,
        preferences.connections
      );
      const runtimeCandidate = buildGatewayRuntimeModelCandidate(openhandsRuntime, runtimeFallbackApiKey);
      if (runtimeCandidate) {
        localGatewayModelCandidate = runtimeCandidate;
        const nextCandidates = [
          runtimeCandidate,
          ...localGatewayModelCandidates.filter((candidate) => candidate.alias !== runtimeCandidate.alias),
        ];
        localGatewayModelCandidates =
          orchestrationPolicy.modelRoutingMode === "single_fixed_free" || orchestrationPolicy.fallbackEnabled !== true
            ? nextCandidates.slice(0, 1)
            : nextCandidates;
        if (isSmallModelForcedCandidate(runtimeCandidate, orchestrationPolicy)) {
          forcedSmallModelAliases.add(runtimeCandidate.alias);
        }
        attemptedFallbackAliases.add(runtimeCandidate.alias);
        initialGatewayExecutionHints = gatewayHintsForCandidate(localGatewayModelCandidate, true);
      }
    }
    if (!localGatewayModelCandidate) {
      throw new Error(
        "Binary could not find a connected local model for the OpenHands gateway. Connect a local provider/model and try again."
      );
    }
    const runLocalGatewayAssistWithHints = async (
      args: Omit<
        LocalGatewayAssistInput,
        | "adapterMode"
        | "latencyPolicy"
        | "timeoutPolicy"
        | "modelRoutingMode"
        | "fixedModelAlias"
        | "fallbackEnabled"
        | "budgetProfile"
        | "firstTurnBudgetMs"
        | "smallModelForced"
        | "terminalBackendMode"
        | "requireNativeTerminalTool"
        | "policyLane"
        | "forcedSmallModelAliases"
      >
    ): Promise<AssistRunEnvelope> => {
      const hints = gatewayHintsForCandidate(
        args.modelCandidate,
        !args.latestToolResult && !args.gatewayRunId
      );
      return await runLocalGatewayAssist({
        ...args,
        adapterMode: hints.adapterMode,
        latencyPolicy: hints.latencyPolicy,
        timeoutPolicy: hints.timeoutPolicy,
        modelRoutingMode: hints.modelRoutingMode,
        fixedModelAlias: hints.fixedModelAlias,
        fallbackEnabled: hints.fallbackEnabled,
        budgetProfile: hints.budgetProfile,
        firstTurnBudgetMs: hints.firstTurnBudgetMs,
        smallModelForced: hints.smallModelForced,
        terminalBackendMode: hints.terminalBackendMode,
        requireNativeTerminalTool: hints.requireNativeTerminalTool,
        policyLane: hints.policyLane,
        forcedSmallModelAliases: [...forcedSmallModelAliases],
      });
    };
    let envelope: AssistRunEnvelope;
    const firstTurnPlannerStartedAt = Date.now();
    if (assistTransport === "local_gateway") {
      const gatewayBaseUrl = resolveGatewayBaseUrl({
        executionLane: executionConfig.executionLane,
        remoteGatewayUrl: remoteHealth?.available ? remoteHealth.gatewayUrl : null,
        localGatewayUrl: openhandsRuntime?.gatewayUrl || null,
      });
      await emitHostStatus(run, "Binary is routing this run through OpenHands.", attachedRes, {
        provider: localGatewayModelCandidate?.provider || null,
        model: localGatewayModelCandidate?.model || null,
        runtimeTarget: executionConfig.executionLane === "openhands_remote" ? "remote" : "local_native",
        adapterMode: initialGatewayExecutionHints.adapterMode,
        latencyPolicy: initialGatewayExecutionHints.latencyPolicy,
        timeoutPolicy: initialGatewayExecutionHints.timeoutPolicy,
        modelRoutingMode: initialGatewayExecutionHints.modelRoutingMode,
        fixedModelAlias: initialGatewayExecutionHints.fixedModelAlias,
        fallbackEnabled: initialGatewayExecutionHints.fallbackEnabled,
        budgetProfile: initialGatewayExecutionHints.budgetProfile,
        firstTurnBudgetMs: initialGatewayExecutionHints.firstTurnBudgetMs,
        smallModelForced: initialGatewayExecutionHints.smallModelForced,
        terminalBackendMode: initialGatewayExecutionHints.terminalBackendMode,
        requireNativeTerminalTool: initialGatewayExecutionHints.requireNativeTerminalTool,
        terminalStrictMode: initialGatewayExecutionHints.terminalStrictMode,
        terminalBackend: terminalRuntimeMetadata.terminalBackend,
        nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
        terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason,
        policyLane: initialGatewayExecutionHints.policyLane,
      });
      let selectedCandidate = localGatewayModelCandidate as BinaryUserConnectedModelCandidate;
      let initialEnvelope: AssistRunEnvelope | null = null;
      const forceNoTimeoutRetryChain =
        run.request.detach === true &&
        isSmallModelForcedCandidate(selectedCandidate, orchestrationPolicy);
      const allowSingleTimeoutFallbackForForced =
        allowModelFallback && forceNoTimeoutRetryChain && taskSpeedClass === "deep_code";
      let forcedTimeoutFallbackUsed = false;
      let transientNetworkRetryUsed = false;
      while (selectedCandidate) {
        try {
          initialEnvelope = await runLocalGatewayAssistWithHints({
            run,
            modelCandidate: selectedCandidate,
            modelCandidates: localGatewayModelCandidates,
            desktopContext,
            browserContext,
            worldContext,
            repoContext,
            verificationPlan,
            mcp,
            startupPhase: "fast_start",
            taskSpeedClass,
            gatewayBaseUrl,
            executionLane: executionConfig.executionLane,
            pluginPacks: executionConfig.pluginPacks,
            skillSources: executionConfig.skillSources,
            traceId: run.traceId,
            traceSampled: executionConfig.traceSampled,
            routePolicy: firstTurnRoutePolicy,
            onEvent: async (event) => {
              await appendRunEvent(run, event, attachedRes);
            },
          });
          localGatewayModelCandidate = selectedCandidate;
          break;
        } catch (error) {
          const recoverable = isRecoverableLocalGatewayTurnError(error);
          const timeoutLikeFailure = isTurnBudgetTimeoutError(error);
          const transientNetworkFailure = isTransientNetworkTurnError(error);
          if (!allowModelFallback && recoverable && transientNetworkFailure && !timeoutLikeFailure && !transientNetworkRetryUsed) {
            transientNetworkRetryUsed = true;
            await emitHostStatus(
              run,
              "Binary is retrying once after a transient gateway/network failure.",
              attachedRes,
              {
                escalationStage: "retry_transient_network",
                reason: error instanceof Error ? error.message : String(error),
              }
            );
            continue;
          }
          const canAttemptFallback = (() => {
            if (!allowModelFallback) return false;
            if (!recoverable) return false;
            if (forceNoTimeoutRetryChain) {
              if (!allowSingleTimeoutFallbackForForced) return false;
              if (!timeoutLikeFailure) return false;
              if (forcedTimeoutFallbackUsed) return false;
              forcedTimeoutFallbackUsed = true;
              return true;
            }
            if (timeoutLikeFailure) return run.request.detach !== true;
            return true;
          })();
          const nextCandidate = canAttemptFallback
            ? selectNextModelCandidate(selectedCandidate, localGatewayModelCandidates, attemptedFallbackAliases)
            : null;
          if (!nextCandidate) {
            throw error;
          }
          attemptedFallbackAliases.add(nextCandidate.alias);
          localGatewayModelCandidate = nextCandidate;
          localGatewayModelCandidates = [
            nextCandidate,
            ...localGatewayModelCandidates.filter((candidate) => candidate.alias !== nextCandidate.alias),
          ];
          selectedCandidate = nextCandidate;
          await emitHostStatus(
            run,
            `Binary is retrying the first OpenHands turn with fallback model candidate (${nextCandidate.displayName || nextCandidate.alias}).`,
            attachedRes,
            {
              escalationStage: "fallback_model_candidate",
              reason: error instanceof Error ? error.message : String(error),
              modelAlias: nextCandidate.alias,
            }
          );
        }
      }
      if (!initialEnvelope) {
        throw new Error("Local OpenHands gateway did not return an initial turn envelope.");
      }
      envelope = initialEnvelope;
    } else {
        try {
          await emitHostStatus(run, "Binary is using the hosted compatibility path because no local OpenHands candidate is configured.", attachedRes, {
            baseUrl: preferences.baseUrl,
          });
          envelope = (await runWithTransportRetry(run, attachedRes, () =>
            streamHostedAssist(
              {
                baseUrl: preferences.baseUrl,
                apiKey: auth.apiKey as string,
                request: {
                  ...run.request,
                  model: resolvedModelRequest.model,
                  chatModelSource: resolvedModelRequest.source,
                  speedProfile,
                  startupPhase: "fast_start",
                  routePolicy: firstTurnRoutePolicy,
                  fallbackToPlatformModel: run.request.fallbackToPlatformModel !== false,
                  execution: {
                    lane: executionConfig.executionLane,
                    pluginPacks: executionConfig.pluginPacks.map((pack) => ({ id: pack.id, title: pack.title })),
                    skillSources: executionConfig.skillSources.map((source) => ({
                      id: source.id,
                      kind: source.kind,
                      path: source.path,
                    })),
                    traceId: run.traceId,
                    traceSampled: executionConfig.traceSampled,
                  },
                  ...(orderedUserConnectedModels.length ? { userConnectedModels: orderedUserConnectedModels } : {}),
                  context: {
                    desktop: desktopContext,
                    browser: browserContext,
                    ...(worldContext ? { worldModel: worldContext } : {}),
                    ...(repoContext ? { repoModel: repoContext } : {}),
                    ...(verificationPlan ? { verificationPlan } : {}),
                  },
                  ...(mcp ? { mcp } : {}),
                  clientCapabilities: {
                    toolLoop: true,
                    supportedTools: buildHostSupportedTools(run.workspaceRoot),
                    supportsNativeToolResults: true,
                  },
                },
                onEvent: async (event) => {
                  await appendRunEvent(run, event, attachedRes);
                  if (typeof event.sessionId === "string") run.sessionId = event.sessionId;
                  const eventName = typeof event.event === "string" ? event.event : "";
                  if (eventName === "meta" && event.data && typeof event.data === "object") {
                    const data = event.data as Record<string, unknown>;
                    if (typeof data.traceId === "string") run.traceId = data.traceId;
                    if (typeof data.sessionId === "string") run.sessionId = data.sessionId;
                    if (typeof data.runId === "string") run.runId = data.runId;
                  }
                },
              },
              {
                fetchTimeoutMs: firstTurnRoutePolicy.turnBudgetMs,
                streamIdleTimeoutMs: firstTurnRoutePolicy.stallTimeoutMs,
              }
            )
          )) as unknown as AssistRunEnvelope;
          rememberHostedTransportAvailability(preferences.baseUrl, true);
        } catch (error) {
          if (!shouldUseLocalGatewayAssistFallback(error, localGatewayModelCandidate, openhandsRuntime)) {
            throw error;
          }
          if (!localGatewayModelCandidate) {
            throw error;
          }
          assistTransport = "local_gateway";
          await emitHostStatus(
            run,
            "Binary is falling back to the local OpenHands gateway because the hosted compatibility path is temporarily unavailable.",
            attachedRes,
            {
              reason: error instanceof Error ? error.message : String(error),
              routeKind: localGatewayModelCandidate?.routeKind || null,
            }
          );
          envelope = await runLocalGatewayAssistWithHints({
            run,
            modelCandidate: localGatewayModelCandidate,
            modelCandidates: localGatewayModelCandidates,
            desktopContext,
            browserContext,
            worldContext,
            repoContext,
            verificationPlan,
            mcp,
            startupPhase: "fast_start",
            taskSpeedClass,
            executionLane: executionConfig.executionLane,
            pluginPacks: executionConfig.pluginPacks,
            skillSources: executionConfig.skillSources,
            traceId: run.traceId,
            traceSampled: executionConfig.traceSampled,
            routePolicy: firstTurnRoutePolicy,
            onEvent: async (event) => {
              await appendRunEvent(run, event, attachedRes);
            },
          });
        }
      }
      envelope = withEnvelopeLatency(envelope, Date.now() - firstTurnPlannerStartedAt);

      if (run.timingState) {
        run.timingState.startupPhaseDurations.firstTurnReadyMs = Date.now() - startupStartedAt;
      }
      if (!worldContext || !repoContext || !verificationPlan) {
        run.timingState = {
          ...(run.timingState || {
            startedAt: run.createdAt || nowIso(),
            selectedSpeedProfile: speedProfile,
            startupPhaseDurations: {},
            startupPhase: "context_enrichment",
          }),
          startupPhase: "context_enrichment",
        };
      }

      await emitHostStatus(run, "Binary Host received the initial assist response.", attachedRes, {
        hostedRunId: envelope.runId || null,
        sessionId: envelope.sessionId || null,
        transport: assistTransport,
      });

    envelope = enforceQualityGateForTurn(run, envelope);
    applyEnvelopeToRun(run, envelope);
    updatePendingStats(run, envelope);
    await persistHostRun(run);
    await agentJobManager.syncFromRun(run);
    await emitHostBudget(run, attachedRes);
    const nextWorldContextTier = selectNextWorldContextTier({
      currentTier: worldContextTier,
      worldContext,
      taskSpeedClass,
      hasPendingToolCall: Boolean(envelope.pendingToolCall),
    });
    if (nextWorldContextTier !== worldContextTier) {
      worldContextTier = nextWorldContextTier;
      worldContext = await buildWorldContextSlice({
        tier: worldContextTier,
        task: run.request.task,
        taskSpeedClass,
        toolFamily: envelope.pendingToolCall ? "tool_request" : "startup",
      }).catch(() => worldContext);
      run.worldContextTier = worldContextTier;
      if (shouldEmitWorldRouteDecision) {
        await syncWorldRouteDecision(run, worldContext, taskSpeedClass, worldContextTier, attachedRes);
      }
    }
    if (envelope.pendingToolCall) {
      await appendRunEvent(
        run,
        {
          event: "tool_request",
          data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
        },
        attachedRes
      );
    }
    if (
      shouldForceInitialWorkspaceBootstrap({
        task: run.request.task,
        taskSpeedClass,
        workspaceRoot: run.workspaceRoot,
        completionStatus: envelope.completionStatus,
        hasPendingToolCall: Boolean(envelope.pendingToolCall),
        priorToolResultCount: run.toolResults.length,
      })
    ) {
      const workspaceRoot = run.workspaceRoot as string;
      const bootstrapCall = buildWorkspaceBootstrapToolCall({
        task: run.request.task,
        workspaceRoot,
        step: Number(envelope.loopState?.stepCount || 0) + 1,
        adapter: String(envelope.adapter || "host_bootstrap"),
      });
      if (bootstrapCall) {
        envelope = {
          ...envelope,
          pendingToolCall: bootstrapCall,
          completionStatus: "incomplete",
          missingRequirements: [
            ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
            "workspace_bootstrap_required",
          ],
        };
        await emitHostStatus(
          run,
          "Binary is adding a deterministic workspace bootstrap step because this non-chat run finished before executing any tool action.",
          attachedRes,
          {
            bootstrapTool: bootstrapCall.toolCall.name,
            bootstrapTarget:
              typeof bootstrapCall.toolCall.arguments.path === "string"
                ? bootstrapCall.toolCall.arguments.path
                : undefined,
          }
        );
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: enrichPendingToolCallForUi(run, preferences, bootstrapCall),
          },
          attachedRes
        );
      }
    }
    const strictTerminalLaneActive = run.lastExecutionState?.terminalStrictMode === true;
    if (
      !envelope.pendingToolCall &&
      run.workspaceRoot &&
      !runLikelyDesktopTask(run) &&
      taskRequestsValidation(run.request.task) &&
      !strictTerminalLaneActive &&
      !hasSuccessfulCommandProof(run)
    ) {
      const validationCommand = inferValidationCommand(run.request.task, run.workspaceRoot);
      if (validationCommand) {
        const validationBootstrapCall: PendingToolCall = {
          step: Number(envelope.loopState?.stepCount || 0) + 1,
          adapter: String(envelope.adapter || "host_bootstrap"),
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `bootstrap_validation_${randomUUID()}`,
            name: "run_command",
            kind: "command",
            summary: "Run baseline validation to gather deterministic failure proof.",
            arguments: {
              command: validationCommand,
              ...(run.workspaceRoot ? { cwd: run.workspaceRoot } : {}),
            },
          },
        };
        envelope = {
          ...envelope,
          pendingToolCall: validationBootstrapCall,
          completionStatus: "incomplete",
          missingRequirements: [
            ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
            "validation_bootstrap_required",
          ],
        };
        await emitHostStatus(
          run,
          "Binary is running baseline validation before accepting completion so the agent can repair from concrete failures.",
          attachedRes,
          {
            bootstrapTool: "run_command",
            command: validationCommand,
          }
        );
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: enrichPendingToolCallForUi(run, preferences, validationBootstrapCall),
          },
          attachedRes
        );
      } else if (taskLikelyRequiresWorkspaceAction(run.request.task)) {
        const fallbackBootstrapCall = buildWorkspaceBootstrapToolCall({
          task: run.request.task,
          workspaceRoot: run.workspaceRoot,
          step: Number(envelope.loopState?.stepCount || 0) + 1,
          adapter: String(envelope.adapter || "host_bootstrap"),
        });
        if (fallbackBootstrapCall) {
          envelope = {
            ...envelope,
            pendingToolCall: fallbackBootstrapCall,
            completionStatus: "incomplete",
            missingRequirements: [
              ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
              "workspace_bootstrap_required",
            ],
          };
          await emitHostStatus(
            run,
            "Binary could not infer a validation command, so it is forcing a deterministic workspace bootstrap step first.",
            attachedRes,
            {
              bootstrapTool: fallbackBootstrapCall.toolCall.name,
              bootstrapTarget:
                typeof fallbackBootstrapCall.toolCall.arguments.path === "string"
                  ? fallbackBootstrapCall.toolCall.arguments.path
                  : undefined,
            }
          );
          await appendRunEvent(
            run,
            {
              event: "tool_request",
              data: enrichPendingToolCallForUi(run, preferences, fallbackBootstrapCall),
            },
            attachedRes
          );
        }
      }
    }

    while (envelope.pendingToolCall && (assistTransport === "local_gateway" || envelope.runId)) {
      if (controller.cancelRequested) {
        await cancelRun(run, attachedRes, "Binary Host cancelled the run before the next tool execution.");
        return;
      }
      if (controller.pauseRequested) {
        await pauseRun(run, attachedRes, "Binary Host paused the run before the next tool execution.");
        return;
      }

      const pendingToolCall = envelope.pendingToolCall;
      if (strictTerminalLaneActive && isTerminalToolName(String(pendingToolCall.toolCall.name || ""))) {
        const strictReason = "terminal_backend_unavailable_strict";
        await emitHostStatus(
          run,
          "Terminal runtime needs repair before terminal tasks can run.",
          attachedRes,
          {
            blockedReason: strictReason,
            terminalBackend: "blocked",
            terminalStrictMode: true,
          }
        );
        run.finalEnvelope = attachHostMetadata(
          {
            ...envelope,
            pendingToolCall: null,
            final: "Terminal runtime needs repair before terminal tasks can run.",
            completionStatus: "incomplete",
            qualityGateState: "blocked",
            qualityBlockedReason: "repair_exhausted",
            finalizationBlocked: true,
            whyBinaryIsBlocked: strictReason,
            terminalBackend: "blocked",
            terminalStrictMode: true,
            terminalHealthReason:
              typeof run.lastExecutionState?.terminalHealthReason === "string"
                ? run.lastExecutionState.terminalHealthReason
                : "terminal_tool_unavailable",
            nativeTerminalAvailable: false,
            missingRequirements: [
              ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
              strictReason,
            ],
          },
          run
        );
        await finalizeRun(run, "failed", attachedRes, {
          message: "Terminal runtime needs repair before terminal tasks can run.",
        });
        return;
      }
      if (await shouldSkipOptionalValidation(run, envelope, pendingToolCall)) {
        run.finalEnvelope = attachHostMetadata(
          {
            ...envelope,
            pendingToolCall: null,
            final:
              typeof envelope.final === "string" && envelope.final.trim()
                ? envelope.final
                : "Binary Host completed the run after skipping an optional non-git validation step.",
          },
          run
        );
        run.updatedAt = nowIso();
        await refreshRunPreferences(run);
        await finalizeRun(run, "completed", attachedRes, {
          message: "Binary Host completed the run after skipping an optional non-git validation step.",
        });
        return;
      }
      const actionStartedAt = Date.now();
      const blocked = await enforceToolPolicy(run, preferences, pendingToolCall);
      const toolResult = blocked || (await executor.execute(pendingToolCall));
      const actionLatencyMs = Date.now() - actionStartedAt;
      const desktopMetadata = extractDesktopToolMetadata(toolResult);

      run.toolResults.push(toolResult);
      run.toolResults = run.toolResults.slice(-MAX_TOOL_RESULT_HISTORY);
      run.lastToolAt = toolResult.createdAt || nowIso();
      if (run.leaseState) run.leaseState.lastToolAt = run.lastToolAt;
      run.heartbeatAt = nowIso();
      if (run.leaseState) run.leaseState.heartbeatAt = run.heartbeatAt;
      run.lastExecutionState = {
        ...(run.lastExecutionState || {}),
        actionLatencyMs,
        ...desktopMetadata,
      };
      if (!isObserveTool(pendingToolCall.toolCall.name)) {
        run.observationOnlyStreak = 0;
      }
      await worldModelService.recordToolReceipt({
        runId: run.id,
        task: run.request.task,
        workspaceRoot: run.workspaceRoot,
        pendingToolCall,
        toolResult,
      });
      if (
        run.workspaceRoot &&
        (pendingToolCall.toolCall.name === "run_command" || pendingToolCall.toolCall.name === "repo_record_verification")
      ) {
        await repoModelService.recordVerification(run.workspaceRoot, {
          label:
            pendingToolCall.toolCall.name === "repo_record_verification"
              ? String(pendingToolCall.toolCall.arguments.label || toolResult.name || "Verification")
              : `Command verification: ${String(toolResult.name || "run_command")}`,
          summary: String(toolResult.summary || "").trim() || "Recorded verification result.",
          status: toolResult.ok ? "passed" : "failed",
          command:
            typeof pendingToolCall.toolCall.arguments.command === "string"
              ? pendingToolCall.toolCall.arguments.command
              : undefined,
          failureCategory:
            typeof toolResult.data?.failureCategory === "string"
              ? toolResult.data.failureCategory
              : toolResult.ok
                ? undefined
                : "validation_command_failure",
          targetHint:
            typeof pendingToolCall.toolCall.arguments.path === "string"
              ? pendingToolCall.toolCall.arguments.path
              : undefined,
        });
      }
      if (run.worldRouteDecisionId || run.worldRouteKind) {
        const routeOutcome = mapToolResultToRouteOutcome(pendingToolCall, toolResult);
        await worldModelService.recordRouteOutcome({
          decisionId: run.worldRouteDecisionId,
          runId: run.id,
          routeKind: run.worldRouteKind,
          toolFamily: isTerminalToolName(String(pendingToolCall.toolCall.name || "")) ? "terminal" : undefined,
          outcome: routeOutcome.outcome,
          advancedGoal: routeOutcome.advancedGoal,
          verificationStatus: routeOutcome.verificationStatus,
          summary: toolResult.summary,
        });
      }
      await appendRunEvent(
        run,
        {
          event: "tool_result",
          data: {
            name: toolResult.name,
            ok: toolResult.ok,
            summary: toolResult.summary,
            blocked: toolResult.blocked ?? false,
            lane:
              toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.lane === "string"
                ? toolResult.data.lane
                : undefined,
            executionVisibility:
              toolResult.data &&
              typeof toolResult.data === "object" &&
              typeof toolResult.data.executionVisibility === "string"
                ? toolResult.data.executionVisibility
                : undefined,
            foregroundDisruptionRisk:
              toolResult.data &&
              typeof toolResult.data === "object" &&
              typeof toolResult.data.foregroundDisruptionRisk === "string"
                ? toolResult.data.foregroundDisruptionRisk
                : undefined,
            interactionMode:
              toolResult.data &&
              typeof toolResult.data === "object" &&
              typeof toolResult.data.interactionMode === "string"
                ? toolResult.data.interactionMode
                : undefined,
            visibleFallbackReason:
              toolResult.data &&
              typeof toolResult.data === "object" &&
              typeof toolResult.data.visibleFallbackReason === "string"
                ? toolResult.data.visibleFallbackReason
                : undefined,
            terminalState:
              toolResult.data &&
              typeof toolResult.data === "object" &&
              typeof toolResult.data.terminalState === "object"
                ? toolResult.data.terminalState
                : undefined,
            proof:
              toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.proof === "object"
                ? toolResult.data.proof
                : undefined,
            ...desktopMetadata,
            result: sanitizeToolResultForUi(toolResult),
          },
        },
        attachedRes
      );

      const checkpoint = recordToolCheckpoint(run, pendingToolCall, toolResult);
      if (checkpoint) {
        run.checkpoints.push(checkpoint);
        run.checkpoints = run.checkpoints.slice(-MAX_CHECKPOINT_HISTORY);
        run.checkpointState = buildCheckpointState(run);
        await emitHostCheckpoint(run, checkpoint, attachedRes);
      }

      await emitHostHeartbeat(run, attachedRes);
      const enrichedWorldContextTier = selectNextWorldContextTier({
        currentTier: worldContextTier,
        worldContext,
        taskSpeedClass,
        hasPendingToolCall: true,
      });
      if (!worldContext || enrichedWorldContextTier !== worldContextTier) {
        worldContextTier = enrichedWorldContextTier;
        worldContext = await buildWorldContextSlice({
          tier: worldContextTier,
          task: run.request.task,
          taskSpeedClass,
          toolFamily: isTerminalToolName(String(pendingToolCall.toolCall.name || "")) ? "terminal" : undefined,
        }).catch(() => worldContext);
        run.worldContextTier = worldContextTier;
        if (shouldEmitWorldRouteDecision) {
          await syncWorldRouteDecision(run, worldContext, taskSpeedClass, worldContextTier, attachedRes);
        }
      }
      if (!repoContext) {
        repoContext = await repoContextPromise;
      }
      if (!verificationPlan) {
        verificationPlan = await verificationPlanPromise;
      }
      if (run.timingState) {
        run.timingState.startupPhase = "full_run";
        run.timingState.startupPhaseDurations.contextEnrichmentMs = Date.now() - startupStartedAt;
      }
      run.lastExecutionState = {
        ...(run.lastExecutionState || {}),
        startupPhase: "full_run",
        selectedContextTier: worldContextTier,
      };
      const recentToolResults = run.toolResults.slice(-2);
      const shouldForceMutationDirective =
        !runLikelyDesktopTask(run) &&
        taskLikelyRequiresWorkspaceAction(run.request.task) &&
        !hasSuccessfulCommandProof(run) &&
        run.toolResults.length > 0 &&
        (
          recentToolResults.every((result) => isObserveTool(result.name)) ||
          (taskRequestsValidation(run.request.task) &&
            !hasSuccessfulWorkspaceMutationProof(run) &&
            recentToolResults.some((result) => result.name === "run_command" && !result.ok))
        );
      const repairDirective = shouldForceMutationDirective
        ? {
            stage: "post_inspection_mutation_required" as const,
            reason:
              "Task requires concrete workspace changes or validation execution; do not end after observation-only steps.",
          }
        : null;

      const continuePlannerStartedAt = Date.now();
      try {
        envelope =
          assistTransport === "local_gateway" && localGatewayModelCandidate
            ? await runLocalGatewayAssistWithHints({
                run,
                modelCandidate: localGatewayModelCandidate,
                modelCandidates: localGatewayModelCandidates,
                desktopContext,
                browserContext,
                worldContext,
                repoContext,
                verificationPlan,
                mcp,
                latestToolResult: toolResult,
                gatewayRunId: envelope.runId as string,
                startupPhase: "full_run",
                taskSpeedClass,
                executionLane: executionConfig.executionLane,
                pluginPacks: executionConfig.pluginPacks,
                skillSources: executionConfig.skillSources,
                traceId: run.traceId,
                traceSampled: executionConfig.traceSampled,
                routePolicy: turnRoutePolicy,
                repairDirective,
                onEvent: async (event) => {
                  await appendRunEvent(run, event, attachedRes);
                },
              })
            : ((await runWithTransportRetry(run, attachedRes, () =>
                continueHostedRun(
                  {
                    baseUrl: preferences.baseUrl,
                    apiKey: auth.apiKey as string,
                    runId: envelope.runId as string,
                    toolResult: sanitizeToolResultForContinue(toolResult),
                    sessionId: envelope.sessionId,
                  },
                  {
                    fetchTimeoutMs: turnRoutePolicy.turnBudgetMs,
                  }
                )
              )) as unknown as AssistRunEnvelope);
      } catch (error) {
        if (!isTurnBudgetTimeoutError(error)) {
          throw error;
        }
        const timeoutReason =
          error instanceof Error
            ? error.message
            : `Turn budget exceeded (${turnRoutePolicy.turnBudgetMs}ms) before the planner produced the next action.`;
        if (await tryCompleteDesktopRunFromProof(run, envelope, timeoutReason, attachedRes)) {
          return;
        }
        markEscalation(run, "turn_budget_timeout", timeoutReason);
        await emitHostStatus(run, "Binary is escalating because this turn exceeded the fast budget.", attachedRes, {
          escalationStage: "turn_budget_timeout",
          reason: timeoutReason,
          turnBudgetMs: turnRoutePolicy.turnBudgetMs,
        });
        if (
          await tryDirectMachineShortcut({
            run,
            preferences,
            taskSpeedClass,
            speedProfile,
            machineAutonomyController,
            attachedRes,
          })
        ) {
          return;
        }

        const missionCandidate =
          turnRoutePolicy.missionFirstBrowser && isBrowserMicroToolName(pendingToolCall.toolCall.name)
            ? buildBrowserMissionToolCall(run.request.task, run.toolResults.length + 1)
            : null;
        if (missionCandidate) {
          markEscalation(
            run,
            "browser_mission",
            "Budget timeout triggered mission-first browser recovery."
          );
          envelope = {
            ...envelope,
            pendingToolCall: missionCandidate,
            completionStatus: "incomplete",
            escalationStage: "browser_mission",
            escalationReason: timeoutReason,
            progressState: {
              ...(envelope.progressState || {}),
              status: "in_progress",
              stallReason: timeoutReason,
              nextDeterministicAction:
                "Run browser_search_and_open_best_result to collapse open/search/click into a single mission step.",
            },
          };
          applyEnvelopeToRun(run, envelope);
          updatePendingStats(run, envelope);
          await persistHostRun(run);
          await appendRunEvent(
            run,
            {
              event: "meta",
              data: attachHostMetadata(envelope, run),
            },
            attachedRes
          );
          await appendRunEvent(
            run,
            {
              event: "tool_request",
              data: enrichPendingToolCallForUi(run, preferences, missionCandidate),
            },
            attachedRes
          );
          continue;
        }

        if (assistTransport === "local_gateway" && allowModelFallback && localGatewayModelCandidates.length > 1) {
          const nextCandidate = selectNextModelCandidate(
            localGatewayModelCandidate,
            localGatewayModelCandidates,
            attemptedFallbackAliases
          );
          if (nextCandidate) {
            attemptedFallbackAliases.add(nextCandidate.alias);
            localGatewayModelCandidate = nextCandidate;
            localGatewayModelCandidates = [
              nextCandidate,
              ...localGatewayModelCandidates.filter((candidate) => candidate.alias !== nextCandidate.alias),
            ];
            const nextCandidateHints = gatewayHintsForCandidate(nextCandidate, false);
            markEscalation(
              run,
              "fallback_model_candidate",
              `Switching to ${nextCandidate.alias} after timeout on ${pendingToolCall.toolCall.name}.`
            );
            run.lastExecutionState = {
              ...(run.lastExecutionState || {}),
              latencyTier: nextCandidate.latencyTier,
              intendedUse: nextCandidate.intendedUse,
              adapterMode: nextCandidateHints.adapterMode,
              latencyPolicy: nextCandidateHints.latencyPolicy,
              timeoutPolicy: nextCandidateHints.timeoutPolicy,
              modelRoutingMode: nextCandidateHints.modelRoutingMode,
              fixedModelAlias: nextCandidateHints.fixedModelAlias,
              fallbackEnabled: nextCandidateHints.fallbackEnabled,
              budgetProfile: nextCandidateHints.budgetProfile,
              firstTurnBudgetMs: nextCandidateHints.firstTurnBudgetMs,
              smallModelForced: nextCandidateHints.smallModelForced,
              terminalBackendMode: nextCandidateHints.terminalBackendMode,
              requireNativeTerminalTool: nextCandidateHints.requireNativeTerminalTool,
              terminalStrictMode: nextCandidateHints.terminalStrictMode,
              terminalBackend: terminalRuntimeMetadata.terminalBackend,
              nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
              ...(terminalRuntimeMetadata.terminalHealthReason
                ? { terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason }
                : {}),
              policyLane: nextCandidateHints.policyLane,
              ...(nextCandidate.routeKind ? { chosenRoute: nextCandidate.routeKind } : {}),
              ...(nextCandidate.routeReason ? { routeReason: nextCandidate.routeReason } : {}),
            };
            await emitHostStatus(
              run,
              `Binary is trying a fallback model candidate (${nextCandidate.displayName || nextCandidate.alias}) after a timeout.`,
              attachedRes,
              {
                escalationStage: "fallback_model_candidate",
                reason: timeoutReason,
                modelAlias: nextCandidate.alias,
                adapterMode: nextCandidateHints.adapterMode,
                latencyPolicy: nextCandidateHints.latencyPolicy,
                timeoutPolicy: nextCandidateHints.timeoutPolicy,
                modelRoutingMode: nextCandidateHints.modelRoutingMode,
                fixedModelAlias: nextCandidateHints.fixedModelAlias,
                fallbackEnabled: nextCandidateHints.fallbackEnabled,
                budgetProfile: nextCandidateHints.budgetProfile,
                firstTurnBudgetMs: nextCandidateHints.firstTurnBudgetMs,
                smallModelForced: nextCandidateHints.smallModelForced,
                terminalBackendMode: nextCandidateHints.terminalBackendMode,
                requireNativeTerminalTool: nextCandidateHints.requireNativeTerminalTool,
                terminalStrictMode: nextCandidateHints.terminalStrictMode,
                terminalBackend: terminalRuntimeMetadata.terminalBackend,
                nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
                terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason,
                policyLane: nextCandidateHints.policyLane,
              }
            );
            envelope = await runLocalGatewayAssistWithHints({
              run,
              modelCandidate: nextCandidate,
              modelCandidates: localGatewayModelCandidates,
              desktopContext,
              browserContext,
              worldContext,
              repoContext,
              verificationPlan,
              mcp,
              latestToolResult: toolResult,
              gatewayRunId: envelope.runId as string,
              startupPhase: "full_run",
              taskSpeedClass,
              executionLane: executionConfig.executionLane,
              pluginPacks: executionConfig.pluginPacks,
              skillSources: executionConfig.skillSources,
              traceId: run.traceId,
              traceSampled: executionConfig.traceSampled,
              routePolicy: turnRoutePolicy,
              repairDirective,
              onEvent: async (event) => {
                await appendRunEvent(run, event, attachedRes);
              },
            });
          } else {
            if (await tryCompleteDesktopRunFromProof(run, envelope, timeoutReason, attachedRes)) {
              return;
            }
            const blockedEnvelope = buildEscalationBlockedEnvelope({
              run,
              reason: timeoutReason,
              stage: "blocked_after_escalation",
              nextDeterministicAction:
                "Use Take over and run the next concrete action manually, then resume for closure.",
            });
            run.finalEnvelope = blockedEnvelope;
            run.takeoverReason = timeoutReason;
            await finalizeRun(run, "takeover_required", attachedRes, {
              message: "Binary paused after exhausting deterministic timeout recoveries.",
            });
            await emitTakeoverRequired(run, timeoutReason, attachedRes);
            return;
          }
        } else {
          if (await tryCompleteDesktopRunFromProof(run, envelope, timeoutReason, attachedRes)) {
            return;
          }
          const blockedEnvelope = buildEscalationBlockedEnvelope({
            run,
            reason: timeoutReason,
            stage: "blocked_after_escalation",
            nextDeterministicAction:
              "Use Take over and run the next concrete action manually, then resume for closure.",
          });
          run.finalEnvelope = blockedEnvelope;
          run.takeoverReason = timeoutReason;
          await finalizeRun(run, "takeover_required", attachedRes, {
            message: "Binary paused after exhausting deterministic timeout recoveries.",
          });
          await emitTakeoverRequired(run, timeoutReason, attachedRes);
          return;
        }
      }
      envelope = withEnvelopeLatency(envelope, Date.now() - continuePlannerStartedAt);
      envelope = enforceQualityGateForTurn(run, envelope);

      applyEnvelopeToRun(run, envelope);
      updatePendingStats(run, envelope);
      const postToolWorldContextTier = selectNextWorldContextTier({
        currentTier: worldContextTier,
        worldContext,
        taskSpeedClass,
        hasPendingToolCall: Boolean(envelope.pendingToolCall),
      });
      if (postToolWorldContextTier !== worldContextTier) {
        worldContextTier = postToolWorldContextTier;
        worldContext = await buildWorldContextSlice({
          tier: worldContextTier,
          task: run.request.task,
          taskSpeedClass,
          toolFamily: envelope.pendingToolCall ? "tool_request" : "generic",
        }).catch(() => worldContext);
        run.worldContextTier = worldContextTier;
      }
      if (shouldEmitWorldRouteDecision) {
        await syncWorldRouteDecision(run, worldContext, taskSpeedClass, worldContextTier, attachedRes);
      }
      await appendRunEvent(
        run,
        {
          event: "meta",
          data: attachHostMetadata(envelope, run),
        },
        attachedRes
      );
      if (envelope.pendingToolCall) {
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
          },
          attachedRes
        );
      }
      if (envelope.final) {
        await appendRunEvent(
          run,
          {
            event: "final",
            data: envelope.final,
          },
          attachedRes
        );
      }

      await emitHostBudget(run, attachedRes);
      const stallReason = detectStall(run, envelope);
      if (stallReason) {
        if (await attemptLocalCompletionProof(run, envelope, executor, attachedRes)) {
          return;
        }
        markEscalation(run, "stall_detected", stallReason);
        await emitHostStall(run, stallReason, attachedRes);
        await emitHostStatus(run, "Binary detected a stall and is escalating deterministically.", attachedRes, {
          escalationStage: "stall_detected",
          reason: stallReason,
        });
        if (
          await tryDirectMachineShortcut({
            run,
            preferences,
            taskSpeedClass,
            speedProfile,
            machineAutonomyController,
            attachedRes,
          })
        ) {
          return;
        }
        const missionEscalationCandidate =
          turnRoutePolicy.missionFirstBrowser && envelope.pendingToolCall?.toolCall?.name
            ? isBrowserMicroToolName(envelope.pendingToolCall.toolCall.name)
              ? buildBrowserMissionToolCall(run.request.task, run.toolResults.length + 1)
              : null
            : null;
        if (missionEscalationCandidate) {
          markEscalation(
            run,
            "browser_mission",
            "Stall detected in browser micro-steps; switching to mission-first browser action."
          );
          envelope = {
            ...envelope,
            pendingToolCall: missionEscalationCandidate,
            completionStatus: "incomplete",
            escalationStage: "browser_mission",
            escalationReason: stallReason,
            progressState: {
              ...(envelope.progressState || {}),
              status: "in_progress",
              stallReason,
              nextDeterministicAction:
                "Run browser_search_and_open_best_result to complete the browser intent in one action.",
            },
          };
          applyEnvelopeToRun(run, envelope);
          updatePendingStats(run, envelope);
          await persistHostRun(run);
          await appendRunEvent(
            run,
            {
              event: "meta",
              data: attachHostMetadata(envelope, run),
            },
            attachedRes
          );
          await appendRunEvent(
            run,
            {
              event: "tool_request",
              data: enrichPendingToolCallForUi(run, preferences, missionEscalationCandidate),
            },
            attachedRes
          );
          continue;
        }
        if (assistTransport === "local_gateway" && allowModelFallback && localGatewayModelCandidates.length > 1) {
          const nextCandidate = selectNextModelCandidate(
            localGatewayModelCandidate,
            localGatewayModelCandidates,
            attemptedFallbackAliases
          );
          if (nextCandidate) {
            attemptedFallbackAliases.add(nextCandidate.alias);
            localGatewayModelCandidate = nextCandidate;
            localGatewayModelCandidates = [
              nextCandidate,
              ...localGatewayModelCandidates.filter((candidate) => candidate.alias !== nextCandidate.alias),
            ];
            const nextCandidateHints = gatewayHintsForCandidate(nextCandidate, false);
            markEscalation(
              run,
              "fallback_model_candidate",
              `Stall persisted, switching to fallback model ${nextCandidate.alias}.`
            );
            run.lastExecutionState = {
              ...(run.lastExecutionState || {}),
              latencyTier: nextCandidate.latencyTier,
              intendedUse: nextCandidate.intendedUse,
              adapterMode: nextCandidateHints.adapterMode,
              latencyPolicy: nextCandidateHints.latencyPolicy,
              timeoutPolicy: nextCandidateHints.timeoutPolicy,
              modelRoutingMode: nextCandidateHints.modelRoutingMode,
              fixedModelAlias: nextCandidateHints.fixedModelAlias,
              fallbackEnabled: nextCandidateHints.fallbackEnabled,
              budgetProfile: nextCandidateHints.budgetProfile,
              firstTurnBudgetMs: nextCandidateHints.firstTurnBudgetMs,
              smallModelForced: nextCandidateHints.smallModelForced,
              terminalBackendMode: nextCandidateHints.terminalBackendMode,
              requireNativeTerminalTool: nextCandidateHints.requireNativeTerminalTool,
              terminalStrictMode: nextCandidateHints.terminalStrictMode,
              terminalBackend: terminalRuntimeMetadata.terminalBackend,
              nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
              ...(terminalRuntimeMetadata.terminalHealthReason
                ? { terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason }
                : {}),
              policyLane: nextCandidateHints.policyLane,
              ...(nextCandidate.routeKind ? { chosenRoute: nextCandidate.routeKind } : {}),
              ...(nextCandidate.routeReason ? { routeReason: nextCandidate.routeReason } : {}),
            };
            await emitHostStatus(
              run,
              `Binary is switching to fallback model ${nextCandidate.displayName || nextCandidate.alias}.`,
              attachedRes,
              {
                escalationStage: "fallback_model_candidate",
                reason: stallReason,
                modelAlias: nextCandidate.alias,
                adapterMode: nextCandidateHints.adapterMode,
                latencyPolicy: nextCandidateHints.latencyPolicy,
                timeoutPolicy: nextCandidateHints.timeoutPolicy,
                modelRoutingMode: nextCandidateHints.modelRoutingMode,
                fixedModelAlias: nextCandidateHints.fixedModelAlias,
                fallbackEnabled: nextCandidateHints.fallbackEnabled,
                budgetProfile: nextCandidateHints.budgetProfile,
                firstTurnBudgetMs: nextCandidateHints.firstTurnBudgetMs,
                smallModelForced: nextCandidateHints.smallModelForced,
                terminalBackendMode: nextCandidateHints.terminalBackendMode,
                requireNativeTerminalTool: nextCandidateHints.requireNativeTerminalTool,
                terminalStrictMode: nextCandidateHints.terminalStrictMode,
                terminalBackend: terminalRuntimeMetadata.terminalBackend,
                nativeTerminalAvailable: terminalRuntimeMetadata.nativeTerminalAvailable,
                terminalHealthReason: terminalRuntimeMetadata.terminalHealthReason,
                policyLane: nextCandidateHints.policyLane,
              }
            );
            const stallRecoveryStartedAt = Date.now();
            envelope = withEnvelopeLatency(
              await runLocalGatewayAssistWithHints({
                run,
                modelCandidate: nextCandidate,
                modelCandidates: localGatewayModelCandidates,
                desktopContext,
                browserContext,
                worldContext,
                repoContext,
                verificationPlan,
                mcp,
                latestToolResult: toolResult,
                gatewayRunId: envelope.runId as string,
                startupPhase: "full_run",
                taskSpeedClass,
                executionLane: executionConfig.executionLane,
                pluginPacks: executionConfig.pluginPacks,
                skillSources: executionConfig.skillSources,
                traceId: run.traceId,
                traceSampled: executionConfig.traceSampled,
                routePolicy: turnRoutePolicy,
                onEvent: async (event) => {
                  await appendRunEvent(run, event, attachedRes);
                },
              }),
              Date.now() - stallRecoveryStartedAt
            );
            applyEnvelopeToRun(run, envelope);
            updatePendingStats(run, envelope);
            await persistHostRun(run);
            await appendRunEvent(
              run,
              {
                event: "meta",
                data: attachHostMetadata(envelope, run),
              },
              attachedRes
            );
            if (envelope.pendingToolCall) {
              await appendRunEvent(
                run,
                {
                  event: "tool_request",
                  data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
                },
                attachedRes
              );
            }
            continue;
          }
        }

        const blockedEnvelope = buildEscalationBlockedEnvelope({
          run,
          reason: stallReason,
          stage: "blocked_after_escalation",
          nextDeterministicAction:
            "Use Take over and execute the next required step manually, then resume to let Binary close out with proof.",
        });
        if (await tryCompleteDesktopRunFromProof(run, envelope, stallReason, attachedRes)) {
          return;
        }
        run.finalEnvelope = blockedEnvelope;
        run.takeoverReason = stallReason;
        await finalizeRun(run, "takeover_required", attachedRes, {
          message: "Binary paused after exhausting deterministic stall recovery paths.",
        });
        await emitTakeoverRequired(run, stallReason, attachedRes);
        await emitHostStatus(run, "Binary Host needs operator takeover to continue safely.", attachedRes, {
          reason: stallReason,
          escalationStage: "blocked_after_escalation",
        });
        return;
      }
    }

    if (run.workspaceRoot && !runLikelyDesktopTask(run) && taskRequestsValidation(run.request.task) && !hasSuccessfulCommandProof(run)) {
      const validationCommand = inferValidationCommand(run.request.task, run.workspaceRoot);
      if (validationCommand) {
        const validationProbeCall: PendingToolCall = {
          step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
          adapter: String(envelope.adapter || "host_validation_probe"),
          requiresClientExecution: true,
          createdAt: nowIso(),
          toolCall: {
            id: `host_validation_probe_${randomUUID()}`,
            name: "run_command",
            kind: "command",
            summary: "Run baseline validation before accepting completion.",
            arguments: {
              command: validationCommand,
              ...(run.workspaceRoot ? { cwd: run.workspaceRoot } : {}),
            },
          },
        };
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: enrichPendingToolCallForUi(run, preferences, validationProbeCall),
          },
          attachedRes
        );
        const validationProbeResult = await executor.execute(validationProbeCall);
        await appendSyntheticToolResult(run, validationProbeResult, attachedRes);
        if (!validationProbeResult.ok) {
          const baselineFailureReason =
            typeof validationProbeResult.summary === "string" && validationProbeResult.summary.trim()
              ? `Binary baseline validation failed: ${validationProbeResult.summary}`
              : "Binary baseline validation failed before completion could be proven.";
          const shouldAttemptDeterministicRepair =
            assistTransport === "local_gateway" &&
            Boolean(localGatewayModelCandidate) &&
            taskLikelyRequiresWorkspaceAction(run.request.task);

          if (shouldAttemptDeterministicRepair && localGatewayModelCandidate) {
            await emitHostStatus(
              run,
              "Binary is forcing one deterministic repair turn after failed validation before requiring takeover.",
              attachedRes,
              {
                escalationStage: "validation_repair_turn",
                reason: baselineFailureReason,
              }
            );
            try {
              const forcedRepairStartedAt = Date.now();
              const forcedRepairEnvelope = withEnvelopeLatency(
                await runLocalGatewayAssistWithHints({
                  run,
                  modelCandidate: localGatewayModelCandidate,
                  modelCandidates: localGatewayModelCandidates,
                  desktopContext,
                  browserContext,
                  worldContext,
                  repoContext,
                  verificationPlan,
                  mcp,
                  latestToolResult: validationProbeResult,
                  gatewayRunId: typeof envelope.runId === "string" ? envelope.runId : undefined,
                  startupPhase: "full_run",
                  taskSpeedClass,
                  executionLane: executionConfig.executionLane,
                  pluginPacks: executionConfig.pluginPacks,
                  skillSources: executionConfig.skillSources,
                  traceId: run.traceId,
                  traceSampled: executionConfig.traceSampled,
                  routePolicy: turnRoutePolicy,
                  repairDirective: {
                    stage: "post_inspection_mutation_required",
                    reason:
                      "Validation failed. Produce one concrete workspace mutation before attempting validation again.",
                  },
                  onEvent: async (event) => {
                    await appendRunEvent(run, event, attachedRes);
                  },
                }),
                Date.now() - forcedRepairStartedAt
              );
              envelope = forcedRepairEnvelope;
              applyEnvelopeToRun(run, envelope);
              updatePendingStats(run, envelope);
              await persistHostRun(run);
              await agentJobManager.syncFromRun(run);
              await appendRunEvent(
                run,
                {
                  event: "meta",
                  data: attachHostMetadata(envelope, run),
                },
                attachedRes
              );
              if (envelope.final) {
                await appendRunEvent(
                  run,
                  {
                    event: "final",
                    data: envelope.final,
                  },
                  attachedRes
                );
              }
              if (envelope.pendingToolCall) {
                await appendRunEvent(
                  run,
                  {
                    event: "tool_request",
                    data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
                  },
                  attachedRes
                );
                const forcedRepairBlocked = await enforceToolPolicy(run, preferences, envelope.pendingToolCall);
                let forcedRepairResult = forcedRepairBlocked || (await executor.execute(envelope.pendingToolCall));
                let forcedRepairToolName = String(
                  envelope.pendingToolCall.toolCall.name || forcedRepairResult.name || ""
                );
                await appendSyntheticToolResult(run, forcedRepairResult, attachedRes);
                await worldModelService.recordToolReceipt({
                  runId: run.id,
                  task: run.request.task,
                  workspaceRoot: run.workspaceRoot,
                  pendingToolCall: envelope.pendingToolCall,
                  toolResult: forcedRepairResult,
                });
                if (!isObserveTool(envelope.pendingToolCall.toolCall.name)) {
                  run.observationOnlyStreak = 0;
                }

                if (!forcedRepairResult.ok || !isWorkspaceMutationToolName(forcedRepairToolName)) {
                  const shouldRetrySingleFileRewrite =
                    assistTransport === "local_gateway" &&
                    Boolean(localGatewayModelCandidate) &&
                    taskLikelyRequiresWorkspaceAction(run.request.task) &&
                    (forcedRepairToolName === "edit" || !isWorkspaceMutationToolName(forcedRepairToolName));
                  if (shouldRetrySingleFileRewrite && localGatewayModelCandidate) {
                    await emitHostStatus(
                      run,
                      "Binary is retrying with a deterministic single-file rewrite repair strategy.",
                      attachedRes,
                      {
                        escalationStage: "validation_repair_single_file_rewrite",
                        previousRepairTool: forcedRepairToolName || forcedRepairResult.name || null,
                        previousRepairSummary: forcedRepairResult.summary,
                      }
                    );
                    try {
                      const rewriteRepairStartedAt = Date.now();
                      const rewriteRepairEnvelope = withEnvelopeLatency(
                        await runLocalGatewayAssistWithHints({
                          run,
                          modelCandidate: localGatewayModelCandidate,
                          modelCandidates: localGatewayModelCandidates,
                          desktopContext,
                          browserContext,
                          worldContext,
                          repoContext,
                          verificationPlan,
                          mcp,
                          latestToolResult: forcedRepairResult,
                          gatewayRunId: typeof envelope.runId === "string" ? envelope.runId : undefined,
                          startupPhase: "full_run",
                          taskSpeedClass,
                          executionLane: executionConfig.executionLane,
                          pluginPacks: executionConfig.pluginPacks,
                          skillSources: executionConfig.skillSources,
                          traceId: run.traceId,
                          traceSampled: executionConfig.traceSampled,
                          routePolicy: turnRoutePolicy,
                          repairDirective: {
                            stage: "single_file_rewrite",
                            reason:
                              "Previous mutation attempt failed or was non-mutation; emit one concrete single-file rewrite/edit for the broken target.",
                          },
                          onEvent: async (event) => {
                            await appendRunEvent(run, event, attachedRes);
                          },
                        }),
                        Date.now() - rewriteRepairStartedAt
                      );
                      envelope = rewriteRepairEnvelope;
                      applyEnvelopeToRun(run, envelope);
                      updatePendingStats(run, envelope);
                      await persistHostRun(run);
                      await agentJobManager.syncFromRun(run);
                      await appendRunEvent(
                        run,
                        {
                          event: "meta",
                          data: attachHostMetadata(envelope, run),
                        },
                        attachedRes
                      );
                      if (envelope.final) {
                        await appendRunEvent(
                          run,
                          {
                            event: "final",
                            data: envelope.final,
                          },
                          attachedRes
                        );
                      }
                      if (envelope.pendingToolCall) {
                        await appendRunEvent(
                          run,
                          {
                            event: "tool_request",
                            data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
                          },
                          attachedRes
                        );
                        const rewriteRepairBlocked = await enforceToolPolicy(run, preferences, envelope.pendingToolCall);
                        const rewriteRepairResult = rewriteRepairBlocked || (await executor.execute(envelope.pendingToolCall));
                        await appendSyntheticToolResult(run, rewriteRepairResult, attachedRes);
                        await worldModelService.recordToolReceipt({
                          runId: run.id,
                          task: run.request.task,
                          workspaceRoot: run.workspaceRoot,
                          pendingToolCall: envelope.pendingToolCall,
                          toolResult: rewriteRepairResult,
                        });
                        if (!isObserveTool(envelope.pendingToolCall.toolCall.name)) {
                          run.observationOnlyStreak = 0;
                        }
                        forcedRepairResult = rewriteRepairResult;
                        forcedRepairToolName = String(
                          envelope.pendingToolCall.toolCall.name || rewriteRepairResult.name || forcedRepairToolName
                        );
                      } else {
                        await emitHostStatus(
                          run,
                          "Binary requested a single-file rewrite retry but no repair tool call was produced.",
                          attachedRes,
                          {
                            escalationStage: "validation_repair_single_file_rewrite_no_call",
                          }
                        );
                      }
                    } catch (error) {
                      await emitHostStatus(
                        run,
                        `Binary could not complete the single-file rewrite retry. Cause: ${error instanceof Error ? error.message : String(error)}`,
                        attachedRes,
                        {
                          escalationStage: "validation_repair_single_file_rewrite_failed",
                        }
                      );
                    }
                  }
                  if (!forcedRepairResult.ok || !isWorkspaceMutationToolName(forcedRepairToolName)) {
                    const reason = !forcedRepairResult.ok
                      ? `Binary forced repair turns, but mutation failed: ${forcedRepairResult.summary}`
                      : `Binary forced repair turns, but received non-mutation action ${forcedRepairToolName || forcedRepairResult.name}.`;
                    run.finalEnvelope = attachHostMetadata(
                      {
                        ...envelope,
                        completionStatus: "incomplete",
                        missingRequirements: [
                          ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
                          "required_workspace_mutation_missing",
                          "required_validation_missing",
                        ],
                        pendingToolCall: null,
                        final:
                          typeof envelope.final === "string" && envelope.final.trim()
                            ? envelope.final
                            : reason,
                      },
                      run
                    );
                    run.takeoverReason = reason;
                    await finalizeRun(run, "takeover_required", attachedRes, {
                      message:
                        "Binary Host paused because deterministic repair turns did not produce a successful workspace mutation.",
                    });
                    await emitTakeoverRequired(run, reason, attachedRes);
                    return;
                  }
                }

                const revalidationCommand = inferValidationCommand(run.request.task, run.workspaceRoot);
                if (revalidationCommand) {
                  const revalidationCall: PendingToolCall = {
                    step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
                    adapter: String(envelope.adapter || "host_validation_recheck"),
                    requiresClientExecution: true,
                    createdAt: nowIso(),
                    toolCall: {
                      id: `host_validation_recheck_${randomUUID()}`,
                      name: "run_command",
                      kind: "command",
                      summary: "Re-run baseline validation after deterministic repair turn.",
                      arguments: {
                        command: revalidationCommand,
                        ...(run.workspaceRoot ? { cwd: run.workspaceRoot } : {}),
                      },
                    },
                  };
                  await appendRunEvent(
                    run,
                    {
                      event: "tool_request",
                      data: enrichPendingToolCallForUi(run, preferences, revalidationCall),
                    },
                    attachedRes
                  );
                  const revalidationResult = await executor.execute(revalidationCall);
                  await appendSyntheticToolResult(run, revalidationResult, attachedRes);
                  if (revalidationResult.ok) {
                    run.finalEnvelope = attachHostMetadata(
                      {
                        ...envelope,
                        completionStatus: "complete",
                        missingRequirements: [],
                        pendingToolCall: null,
                        final:
                          typeof envelope.final === "string" && envelope.final.trim()
                            ? envelope.final
                            : "Binary repaired the workspace and verified the fix with a passing validation command.",
                      },
                      run
                    );
                    run.updatedAt = nowIso();
                    await refreshRunPreferences(run);
                    await finalizeRun(run, "completed", attachedRes, {
                      message: "Binary Host completed the run after deterministic repair and validation.",
                    });
                    return;
                  }
                  const reason = `Binary forced one repair turn, but validation still failed: ${revalidationResult.summary}`;
                  run.finalEnvelope = attachHostMetadata(
                    {
                      ...envelope,
                      completionStatus: "incomplete",
                      missingRequirements: [
                        ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
                        "required_validation_missing",
                      ],
                      pendingToolCall: null,
                      final:
                        typeof envelope.final === "string" && envelope.final.trim()
                          ? envelope.final
                          : reason,
                    },
                    run
                  );
                  run.takeoverReason = reason;
                  await finalizeRun(run, "takeover_required", attachedRes, {
                    message:
                      "Binary Host paused because validation still failed after the forced deterministic repair turn.",
                  });
                  await emitTakeoverRequired(run, reason, attachedRes);
                  return;
                }
              } else {
                await emitHostStatus(
                  run,
                  "Binary requested a deterministic repair turn but no mutation tool call was produced; retrying with single-file rewrite.",
                  attachedRes,
                  {
                    escalationStage: "validation_repair_missing_call",
                  }
                );
                let rewriteSeedResult: ToolResult = validationProbeResult;
                const rewriteBootstrapCall = buildWorkspaceBootstrapToolCall({
                  task: run.request.task,
                  workspaceRoot: run.workspaceRoot,
                  step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
                  adapter: String(envelope.adapter || "host_validation_repair_bootstrap"),
                });
                if (rewriteBootstrapCall) {
                  await appendRunEvent(
                    run,
                    {
                      event: "tool_request",
                      data: enrichPendingToolCallForUi(run, preferences, rewriteBootstrapCall),
                    },
                    attachedRes
                  );
                  const rewriteBootstrapBlocked = await enforceToolPolicy(run, preferences, rewriteBootstrapCall);
                  const rewriteBootstrapResult = rewriteBootstrapBlocked || (await executor.execute(rewriteBootstrapCall));
                  await appendSyntheticToolResult(run, rewriteBootstrapResult, attachedRes);
                  await worldModelService.recordToolReceipt({
                    runId: run.id,
                    task: run.request.task,
                    workspaceRoot: run.workspaceRoot,
                    pendingToolCall: rewriteBootstrapCall,
                    toolResult: rewriteBootstrapResult,
                  });
                  if (rewriteBootstrapResult.ok) {
                    rewriteSeedResult = rewriteBootstrapResult;
                  }
                }
                const rewriteRepairStartedAt = Date.now();
                const rewriteRepairEnvelope = withEnvelopeLatency(
                  await runLocalGatewayAssistWithHints({
                    run,
                    modelCandidate: localGatewayModelCandidate,
                    modelCandidates: localGatewayModelCandidates,
                    desktopContext,
                    browserContext,
                    worldContext,
                    repoContext,
                    verificationPlan,
                    mcp,
                    latestToolResult: rewriteSeedResult,
                    gatewayRunId: typeof envelope.runId === "string" ? envelope.runId : undefined,
                    startupPhase: "full_run",
                    taskSpeedClass,
                    executionLane: executionConfig.executionLane,
                    pluginPacks: executionConfig.pluginPacks,
                    skillSources: executionConfig.skillSources,
                    traceId: run.traceId,
                    traceSampled: executionConfig.traceSampled,
                    routePolicy: turnRoutePolicy,
                    repairDirective: {
                      stage: "single_file_rewrite",
                      reason:
                        "No repair tool call was emitted; produce one concrete single-file rewrite/edit against the broken target.",
                    },
                    onEvent: async (event) => {
                      await appendRunEvent(run, event, attachedRes);
                    },
                  }),
                  Date.now() - rewriteRepairStartedAt
                );
                envelope = rewriteRepairEnvelope;
                applyEnvelopeToRun(run, envelope);
                updatePendingStats(run, envelope);
                await persistHostRun(run);
                await agentJobManager.syncFromRun(run);
                await appendRunEvent(
                  run,
                  {
                    event: "meta",
                    data: attachHostMetadata(envelope, run),
                  },
                  attachedRes
                );
                if (envelope.final) {
                  await appendRunEvent(
                    run,
                    {
                      event: "final",
                      data: envelope.final,
                    },
                    attachedRes
                  );
                }
                if (envelope.pendingToolCall) {
                  await appendRunEvent(
                    run,
                    {
                      event: "tool_request",
                      data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
                    },
                    attachedRes
                  );
                  const rewriteRepairBlocked = await enforceToolPolicy(run, preferences, envelope.pendingToolCall);
                  const rewriteRepairResult = rewriteRepairBlocked || (await executor.execute(envelope.pendingToolCall));
                  await appendSyntheticToolResult(run, rewriteRepairResult, attachedRes);
                  await worldModelService.recordToolReceipt({
                    runId: run.id,
                    task: run.request.task,
                    workspaceRoot: run.workspaceRoot,
                    pendingToolCall: envelope.pendingToolCall,
                    toolResult: rewriteRepairResult,
                  });
                  if (!isObserveTool(envelope.pendingToolCall.toolCall.name)) {
                    run.observationOnlyStreak = 0;
                  }
                  if (rewriteRepairResult.ok && isWorkspaceMutationToolName(envelope.pendingToolCall.toolCall.name)) {
                    const revalidationCommand = inferValidationCommand(run.request.task, run.workspaceRoot);
                    if (revalidationCommand) {
                      const revalidationCall: PendingToolCall = {
                        step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
                        adapter: String(envelope.adapter || "host_validation_recheck"),
                        requiresClientExecution: true,
                        createdAt: nowIso(),
                        toolCall: {
                          id: `host_validation_recheck_${randomUUID()}`,
                          name: "run_command",
                          kind: "command",
                          summary: "Re-run baseline validation after deterministic repair turn.",
                          arguments: {
                            command: revalidationCommand,
                            ...(run.workspaceRoot ? { cwd: run.workspaceRoot } : {}),
                          },
                        },
                      };
                      await appendRunEvent(
                        run,
                        {
                          event: "tool_request",
                          data: enrichPendingToolCallForUi(run, preferences, revalidationCall),
                        },
                        attachedRes
                      );
                      const revalidationResult = await executor.execute(revalidationCall);
                      await appendSyntheticToolResult(run, revalidationResult, attachedRes);
                      if (revalidationResult.ok) {
                        run.finalEnvelope = attachHostMetadata(
                          {
                            ...envelope,
                            completionStatus: "complete",
                            missingRequirements: [],
                            pendingToolCall: null,
                            final:
                              typeof envelope.final === "string" && envelope.final.trim()
                                ? envelope.final
                                : "Binary repaired the workspace and verified the fix with a passing validation command.",
                          },
                          run
                        );
                        run.updatedAt = nowIso();
                        await refreshRunPreferences(run);
                        await finalizeRun(run, "completed", attachedRes, {
                          message: "Binary Host completed the run after deterministic repair and validation.",
                        });
                        return;
                      }
                    }
                  }
                } else {
                  await emitHostStatus(
                    run,
                    "Binary single-file rewrite retry still produced no tool call.",
                    attachedRes,
                    {
                      escalationStage: "validation_repair_single_file_rewrite_no_call",
                    }
                  );
                }
              }
            } catch (error) {
              await emitHostStatus(
                run,
                `Binary could not complete the forced deterministic repair turn. Cause: ${error instanceof Error ? error.message : String(error)}`,
                attachedRes,
                {
                  escalationStage: "validation_repair_turn_failed",
                  reason: baselineFailureReason,
                }
              );
            }
          }

          const reason = baselineFailureReason;
          run.finalEnvelope = attachHostMetadata(
            {
              ...envelope,
              completionStatus: "incomplete",
              missingRequirements: [
                ...(Array.isArray(envelope.missingRequirements) ? envelope.missingRequirements : []),
                "required_validation_missing",
              ],
              pendingToolCall: null,
              final:
                typeof envelope.final === "string" && envelope.final.trim()
                  ? envelope.final
                  : reason,
            },
            run
          );
          run.takeoverReason = reason;
          await finalizeRun(run, "takeover_required", attachedRes, {
            message: "Binary Host paused because baseline validation failed and no automated repair proof was produced.",
          });
          await emitTakeoverRequired(run, reason, attachedRes);
          return;
        }
      }
    }

    run.finalEnvelope = attachHostMetadata(envelope, run);
    run.updatedAt = nowIso();
    await refreshRunPreferences(run);

    if (await attemptLocalCompletionProof(run, envelope, executor, attachedRes)) {
      return;
    }

    if (
      envelope.completionStatus === "incomplete" ||
      (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.length > 0)
    ) {
      const reason =
        (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.join("; ")) ||
        "The hosted run stopped without proving completion.";
      if (await tryCompleteDesktopRunFromProof(run, envelope, reason, attachedRes)) {
        return;
      }
      run.takeoverReason = reason;
      await finalizeRun(run, "takeover_required", attachedRes, {
        message: "Binary Host paused for takeover because completion could not be proven.",
      });
      await emitTakeoverRequired(run, reason, attachedRes);
      return;
    }

    const finalQualityGate = evaluateQualityGate(run, run.finalEnvelope || envelope, {
      finalizationAttempt: true,
    });
    run.finalEnvelope = attachHostMetadata(withQualityGateMetadata(run.finalEnvelope || envelope, finalQualityGate), run);
    if (finalQualityGate.qualityGateState !== "satisfied" || finalQualityGate.finalizationBlocked) {
      const blockedReason =
        finalQualityGate.qualityBlockedReason ||
        (finalQualityGate.missingProofs.length
          ? `missing proof: ${finalQualityGate.missingProofs.join(", ")}`
          : "required proof bundle not satisfied");
      const reason = `Binary strict quality gate blocked completion (${blockedReason}).`;
      run.takeoverReason = reason;
      await finalizeRun(run, "takeover_required", attachedRes, {
        message: "Binary Host paused because strict quality-gate proof requirements were not satisfied.",
      });
      await emitTakeoverRequired(run, reason, attachedRes);
      return;
    }

    await worldModelService.commitMemory({
      label: "Successful run",
      summary:
        typeof run.finalEnvelope?.final === "string" && run.finalEnvelope.final.trim()
          ? run.finalEnvelope.final.trim().slice(0, 2000)
          : `Binary completed: ${run.request.task}`,
      scope: run.workspaceRoot ? "workspace" : "run",
      tags: Array.from(
        new Set(
          [
            "successful_run",
            run.workspaceRoot ? path.basename(run.workspaceRoot) : "",
            run.lastExecutionState?.interactionMode || "",
          ].filter(Boolean)
        )
      ),
      data: {
        runId: run.id,
        task: run.request.task,
        workspaceRoot: run.workspaceRoot || null,
      },
    });
    await finalizeRun(run, "completed", attachedRes, {
      message: "Binary Host completed the run.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.error = message;
    run.updatedAt = nowIso();
    if (run.runId || run.toolResults.length > 0) {
      run.status = "takeover_required";
      run.takeoverReason = message;
      await persistHostRun(run);
      await emitTakeoverRequired(run, message, attachedRes);
      await emitHostStatus(
        run,
        `Binary Host preserved the run for takeover after an execution failure. Cause: ${message}`,
        attachedRes,
        { error: message }
      );
      return;
    }
    await finalizeRun(run, "failed", attachedRes, {
      error: message,
      message: "Binary Host failed on the local OpenHands path.",
    });
  } finally {
    stopFirstResponseProgressTicker();
    try {
      if (executor.cleanup) {
        const cleanup = await executor.cleanup();
        run.lastExecutionState = {
          ...(run.lastExecutionState || {}),
          cleanupClosedCount: cleanup.closed,
          cleanupSkippedPreExistingCount: cleanup.skippedPreExistingCount,
          cleanupErrors: cleanup.cleanupErrors,
        };
        await appendRunEvent(
          run,
          {
            event: "host.desktop_cleanup",
            data: {
              attempted: cleanup.attempted,
              closed: cleanup.closed,
              failed: cleanup.failed,
              skipped: cleanup.skipped,
              cleanupClosedCount: cleanup.closed,
              cleanupSkippedPreExistingCount: cleanup.skippedPreExistingCount,
              cleanupErrors: cleanup.cleanupErrors,
            },
          },
          attachedRes
        );
        if (cleanup.attempted > 0) {
          await emitHostStatus(
            run,
            `Binary closed ${cleanup.closed}/${cleanup.attempted} app(s) opened during this run to reduce machine load.`,
            attachedRes,
            {
              desktopCleanup: cleanup,
              cleanupClosedCount: cleanup.closed,
              cleanupSkippedPreExistingCount: cleanup.skippedPreExistingCount,
              cleanupErrors: cleanup.cleanupErrors,
            }
          );
        }
      }
    } catch (cleanupError) {
      await emitHostStatus(
        run,
        `Binary could not finish desktop app cleanup. Cause: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        attachedRes
      );
    }
    if (attachedRes && !attachedRes.destroyed && !attachedRes.writableEnded) {
      attachedRes.write("data: [DONE]\n\n");
      attachedRes.end();
    }
  }
}

async function executeBinaryInspectorTool(
  name: string,
  argumentsValue: Record<string, unknown>
): Promise<ToolResult> {
  const moduleRef = (await import("../../../sdk/playground-ai-cli/dist/tool-executor.js")) as {
    CliToolExecutor: new (
      workspaceRoot: string,
      preferredProjectRoot?: string | null
    ) => { execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult> };
  };
  const executor = new moduleRef.CliToolExecutor(process.cwd(), null);
  return await executor.execute({
    step: 0,
    adapter: "host_http",
    requiresClientExecution: false,
    toolCall: {
      id: `${name}-${randomUUID()}`,
      name,
      arguments: argumentsValue,
    },
    createdAt: nowIso(),
  });
}

async function handleBinaryHttpTool(
  req: IncomingMessage,
  res: ServerResponse,
  toolName: string
): Promise<void> {
  const body = await readJsonBody(req);
  const result = await executeBinaryInspectorTool(toolName, body as Record<string, unknown>);
  if (!result.ok) {
    writeJson(res, result.blocked ? 403 : 400, {
      error: result.blocked ? "Blocked" : "Invalid request",
      message: result.error || result.summary,
      ...(result.data ? { data: sanitizeToolResultForUi(result) } : {}),
    });
    return;
  }
  writeJson(res, 200, sanitizeToolResultForUi(result));
}

async function handleAssist(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as Partial<AssistRequest>;
  const task = String(body.task || "").trim();
  if (!task) {
    writeJson(res, 400, { error: "Invalid request", message: "task is required" });
    return;
  }

  const preferences = await loadPreferences();
  const resolvedRoots = inferFocusedRoots({
    preferences,
    machineRootPath: normalizeOptionalPath(body.machineRootPath),
    workspaceRoot: normalizeOptionalPath(body.workspaceRoot),
    focusWorkspaceRoot: normalizeOptionalPath(body.focusWorkspaceRoot),
    focusRepoRoot: normalizeOptionalPath(body.focusRepoRoot),
  });
  const request: AssistRequest = {
    task,
    mode: (body.mode as AssistMode) || "auto",
    model: String(body.model || "Binary IDE"),
    speedProfile: normalizeSpeedProfile(body.speedProfile),
    chatModelSource: body.chatModelSource === "user_connected" ? "user_connected" : "platform",
    fallbackToPlatformModel: body.fallbackToPlatformModel !== false,
    historySessionId: typeof body.historySessionId === "string" ? body.historySessionId : undefined,
    tom:
      body.tom && typeof body.tom === "object"
        ? { enabled: (body.tom as { enabled?: unknown }).enabled === false ? false : true }
        : undefined,
    workspaceRoot: resolvedRoots.focusedWorkspaceRoot,
    machineRootPath: resolvedRoots.machineRootPath,
    focusWorkspaceRoot: resolvedRoots.focusedWorkspaceRoot,
    focusRepoRoot: resolvedRoots.focusedRepoRoot,
    rootResolutionReason: resolvedRoots.rootResolutionReason,
    detach: body.detach === true,
    executionLane:
      body.executionLane === "local_interactive" ||
      body.executionLane === "openhands_headless" ||
      body.executionLane === "openhands_remote"
        ? body.executionLane
        : undefined,
    pluginPacks: normalizePluginPackIds(body.pluginPacks),
    expectedLongRun: body.expectedLongRun === true,
    requireIsolation: body.requireIsolation === true,
    debugTracing: body.debugTracing === true,
    imageInputs: normalizeImageInputs(body.imageInputs),
    client:
      body.client && typeof body.client === "object" ? (body.client as BinaryHostClientInfo) : { surface: "unknown" },
  };
  const trustGrant = request.workspaceRoot ? isWorkspaceTrusted(preferences, request.workspaceRoot) : null;
  if (request.workspaceRoot && !trustGrant) {
    writeJson(res, 403, {
      error: "Workspace not trusted",
      message: `Trust ${request.workspaceRoot} with POST /v1/workspaces/trust before running local tool execution through Binary Host.`,
    });
    return;
  }

  const run = await createQueuedRun({
    request,
    workspaceTrustMode: deriveEffectiveTrustMode(preferences, request.workspaceRoot),
  });

  if (request.detach) {
    void startRunExecution(run.id);
    writeJson(res, 202, buildRunSummary(run));
    return;
  }

  writeSseHeaders(res);
  req.on("close", () => {
    if (!res.writableEnded) {
      res.end();
    }
  });
  await startRunExecution(run.id, res);
}

async function handleAgentJobCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as Partial<AssistRequest>;
  const task = String(body.task || "").trim();
  if (!task) {
    writeJson(res, 400, { error: "Invalid request", message: "task is required" });
    return;
  }

  const preferences = await loadPreferences();
  const resolvedRoots = inferFocusedRoots({
    preferences,
    machineRootPath: normalizeOptionalPath(body.machineRootPath),
    workspaceRoot: normalizeOptionalPath(body.workspaceRoot),
    focusWorkspaceRoot: normalizeOptionalPath(body.focusWorkspaceRoot),
    focusRepoRoot: normalizeOptionalPath(body.focusRepoRoot),
  });
  const workspaceRoot = resolvedRoots.focusedWorkspaceRoot;
  const trustGrant = workspaceRoot ? isWorkspaceTrusted(preferences, workspaceRoot) : null;
  if (workspaceRoot && !trustGrant) {
    writeJson(res, 403, {
      error: "Workspace not trusted",
      message: `Trust ${workspaceRoot} with POST /v1/workspaces/trust before starting headless jobs through Binary Host.`,
    });
    return;
  }

  const request: AssistRequest = {
    task,
    mode: (body.mode as AssistMode) || "auto",
    model: String(body.model || "Binary IDE"),
    speedProfile: normalizeSpeedProfile(body.speedProfile),
    chatModelSource: body.chatModelSource === "user_connected" ? "user_connected" : "platform",
    fallbackToPlatformModel: body.fallbackToPlatformModel !== false,
    historySessionId: typeof body.historySessionId === "string" ? body.historySessionId : undefined,
    workspaceRoot,
    machineRootPath: resolvedRoots.machineRootPath,
    focusWorkspaceRoot: resolvedRoots.focusedWorkspaceRoot,
    focusRepoRoot: resolvedRoots.focusedRepoRoot,
    rootResolutionReason: resolvedRoots.rootResolutionReason,
    detach: true,
    executionLane:
      body.executionLane === "local_interactive" ||
      body.executionLane === "openhands_headless" ||
      body.executionLane === "openhands_remote"
        ? body.executionLane
        : undefined,
    pluginPacks: normalizePluginPackIds(body.pluginPacks),
    expectedLongRun: body.expectedLongRun !== false,
    requireIsolation: body.requireIsolation === true,
    debugTracing: body.debugTracing === true,
    imageInputs: normalizeImageInputs(body.imageInputs),
    client:
      body.client && typeof body.client === "object" ? (body.client as BinaryHostClientInfo) : { surface: "unknown" },
  };
  const requestedExecutionLane = request.executionLane;

  const previewTaskSpeedClass = classifyTaskSpeed(task, workspaceRoot);
  const remoteHealth = await getRemoteRuntimeHealth().catch(() => null);
  const executionConfig = resolveRunExecutionConfig({
    run: {
      id: "preview",
      status: "queued",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      client: request.client || { surface: "unknown" },
      request,
      workspaceRoot,
      machineRootPath: request.machineRootPath,
      focusedWorkspaceRoot: request.focusWorkspaceRoot,
      focusedRepoRoot: request.focusRepoRoot,
      rootResolutionReason: request.rootResolutionReason,
      workspaceTrustMode: deriveEffectiveTrustMode(preferences, workspaceRoot),
      traceId: randomUUID(),
      resumeToken: buildResumeToken(),
      controlHistory: [],
      toolResults: [],
      checkpoints: [],
      events: [],
    } as StoredHostRun,
    taskSpeedClass: previewTaskSpeedClass,
    remoteConfigured: Boolean(remoteHealth?.available && remoteHealth.compatibility === "gateway_compatible"),
    defaultPluginPacks: preferences.defaultPluginPacks,
  });
  request.executionLane = executionConfig.executionLane;

  const run = await createQueuedRun({
    request,
    workspaceTrustMode: deriveEffectiveTrustMode(preferences, workspaceRoot),
  });
  run.executionLane = executionConfig.executionLane;
  run.pluginPacks = executionConfig.pluginPacks;
  run.skillSources = executionConfig.skillSources;
  run.lastExecutionState = {
    ...(run.lastExecutionState || {}),
    executionLane: executionConfig.executionLane,
    pluginPacks: executionConfig.pluginPacks,
    skillSources: executionConfig.skillSources,
    traceSampled: executionConfig.traceSampled,
  };
  await persistHostRun(run);

  const job = await agentJobManager.createJob({
    task,
    model: request.model,
    workspaceRoot,
    requestedExecutionLane: requestedExecutionLane || executionConfig.executionLane,
    executionLane: executionConfig.executionLane,
    pluginPacks: executionConfig.pluginPacks,
    skillSources: executionConfig.skillSources,
    runId: run.id,
    traceId: run.traceId,
  });
  await agentJobManager.syncFromRun(run);
  void startRunExecution(run.id);
  writeJson(res, 202, job);
}

async function streamExistingRun(runId: string, res: ServerResponse, after = 0): Promise<void> {
  writeSseHeaders(res);
  let lastSeq = after;

  while (!res.destroyed && !res.writableEnded) {
    const run = await loadRunRecord(runId);
    if (!run) {
      sendSseEvent(res, {
        event: "host.error",
        data: { message: `Unknown Binary Host run ${runId}` },
        id: `run_stream_error_${runId}`,
        seq: lastSeq + 1,
        capturedAt: nowIso(),
        scope: "run",
        runId,
        source: "host",
        severity: "error",
      });
      break;
    }
    const pending = run.events.filter((item) => item.seq > lastSeq);
    for (const event of pending) {
      sendSseEvent(res, event.event);
      lastSeq = Math.max(lastSeq, event.seq);
    }
    if (isTerminalStatus(run.status) || run.status === "takeover_required") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (!res.destroyed && !res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function streamAutomationEvents(automationId: string, res: ServerResponse, after = 0): Promise<void> {
  writeSseHeaders(res);
  let lastSeq = after;

  while (!res.destroyed && !res.writableEnded) {
    const response = await automationRuntime.getAutomationEvents(automationId, lastSeq);
    if (!response.automation) {
      sendSseEvent(res, {
        event: "automation.error",
        data: { message: `Unknown automation ${automationId}` },
        id: `automation_stream_error_${automationId}`,
        seq: lastSeq + 1,
        capturedAt: nowIso(),
        scope: "automation",
        automationId,
        source: "host",
        severity: "error",
      });
      break;
    }
    for (const event of response.events) {
      sendSseEvent(res, event.event);
      lastSeq = Math.max(lastSeq, event.seq);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (!res.destroyed && !res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}


type AgentJobTimelineEvent = {
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
};

async function getMergedAgentJobEvents(jobId: string, after = 0): Promise<{
  job: Awaited<ReturnType<AgentJobManager["getJob"]>>;
  events: AgentJobTimelineEvent[];
  done: boolean;
}> {
  const response = await agentJobManager.getJobEvents(jobId, 0);
  if (!response.job) {
    return { job: null, events: [], done: true };
  }
  const run = response.job.runId ? await loadRunRecord(response.job.runId) : null;
  const runEvents = run
    ? run.events.map((entry) => ({
        capturedAt: entry.capturedAt,
        event: {
          ...entry.event,
          scope: typeof entry.event.scope === "string" ? entry.event.scope : "run",
          source: typeof entry.event.source === "string" ? entry.event.source : "host",
        },
      }))
    : [];
  const combined = [...response.events, ...runEvents]
    .sort((left, right) => String(left.capturedAt).localeCompare(String(right.capturedAt)))
    .map((entry, index) => ({
      seq: index + 1,
      capturedAt: entry.capturedAt,
      event: entry.event,
    }))
    .filter((entry) => entry.seq > (Number.isFinite(after) ? after : 0));
  return {
    job: response.job,
    events: combined,
    done: response.done || Boolean(run && (isTerminalStatus(run.status) || run.status === "takeover_required")),
  };
}

async function streamAgentJobEvents(jobId: string, res: ServerResponse, after = 0): Promise<void> {
  writeSseHeaders(res);
  let lastSeq = after;

  while (!res.destroyed && !res.writableEnded) {
    const response = await getMergedAgentJobEvents(jobId, lastSeq);
    if (!response.job) {
      sendSseEvent(res, {
        event: "agent_job.error",
        data: { message: `Unknown Binary agent job ${jobId}` },
        id: `agent_job_stream_error_${jobId}`,
        seq: lastSeq + 1,
        capturedAt: nowIso(),
        scope: "job",
        source: "host",
        severity: "error",
      });
      break;
    }

    for (const entry of response.events) {
      sendSseEvent(res, entry.event);
      lastSeq = Math.max(lastSeq, entry.seq);
    }

    if (response.done) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (!res.destroyed && !res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

function extractConnectionSecretFromBody(body: Record<string, unknown>): BinaryConnectionSecretRecord {
  const secretHeaders =
    body.secretHeaders && typeof body.secretHeaders === "object" && !Array.isArray(body.secretHeaders)
      ? Object.fromEntries(
          Object.entries(body.secretHeaders as Record<string, unknown>)
            .map(([key, value]) => [String(key || "").trim(), String(value ?? "").trim()] as const)
            .filter(([key, value]) => key && value)
        )
      : undefined;
  return {
    ...(typeof body.bearerToken === "string" && body.bearerToken.trim() ? { bearerToken: body.bearerToken.trim() } : {}),
    ...(typeof body.apiKey === "string" && body.apiKey.trim() ? { apiKey: body.apiKey.trim() } : {}),
    ...(typeof body.accessToken === "string" && body.accessToken.trim() ? { accessToken: body.accessToken.trim() } : {}),
    ...(typeof body.refreshToken === "string" && body.refreshToken.trim() ? { refreshToken: body.refreshToken.trim() } : {}),
    ...(typeof body.expiresAt === "string" && body.expiresAt.trim() ? { expiresAt: body.expiresAt.trim() } : {}),
    ...(Array.isArray(body.scopes) ? { scopes: body.scopes.map((item) => String(item || "").trim()).filter(Boolean) } : {}),
    ...(secretHeaders && Object.keys(secretHeaders).length ? { secretHeaders } : {}),
  };
}

async function upsertConnectionRecord(body: Record<string, unknown>): Promise<
  | {
      ok: true;
      record: BinaryConnectionRecord;
      view: BinaryConnectionView;
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
    }
  | { ok: false; statusCode: number; message: string }
> {
  const preferences = await loadPreferences();
  const recordBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const bodyId = typeof recordBody.id === "string" ? recordBody.id.trim() : "";
  const existing =
    bodyId
      ? preferences.connections.find((item) => item.id === bodyId) || null
      : null;
  const secret = {
    ...(existing ? (await getConnectionSecretRecord(existing.id)) || {} : {}),
    ...extractConnectionSecretFromBody(body),
  };
  const validated = await validateAndTestConnection({
    draft: {
      id: existing?.id || (bodyId || undefined),
      name: typeof recordBody.name === "string" ? recordBody.name : undefined,
      transport: recordBody.transport,
      url: recordBody.url,
      authMode: recordBody.authMode,
      enabled: recordBody.enabled,
      source: recordBody.source,
      headerName: recordBody.headerName,
      publicHeaders: body.publicHeaders,
      oauthSupported: body.oauthSupported,
      importedFrom: body.importedFrom,
    },
    secret,
  });
  if (!validated.ok) {
    return { ok: false, statusCode: 400, message: validated.message };
  }

  const record: BinaryConnectionRecord = {
    ...validated.record,
    createdAt: existing?.createdAt || validated.record.createdAt,
    updatedAt: nowIso(),
  };
  const storage = await setConnectionSecretRecord(record.id, validated.secret);
  preferences.connections = [
    record,
    ...preferences.connections.filter((item) => item.id !== record.id),
  ].slice(0, 60);
  await savePreferences(preferences);

  return {
    ok: true,
    record,
    view: buildConnectionView(record, validated.secret),
    storageMode: storage.storageMode,
    secureStorageAvailable: storage.secureStorageAvailable,
  };
}

const server = createServer(async (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestOrigin = headerValue(req.headers.origin);
  const corsOrigin = resolveTrustedCorsOrigin(req);

  if (requestOrigin && !corsOrigin) {
    writeJson(res, 403, {
      error: "Forbidden",
      message: "Binary Host only accepts browser requests from local desktop origins.",
    });
    return;
  }

  setResponseCorsOrigin(res, corsOrigin);

  if (method === "OPTIONS") {
    withCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    await ensureHostDirs();

    if (method === "GET" && url.pathname === "/v1/healthz") {
      const auth = await getApiKeyRecord();
      const preferences = await loadPreferences();
      const orchestrationPolicy = normalizeOrchestrationPolicy(
        preferences.orchestrationPolicy,
        defaultOrchestrationPolicy()
      );
      const openhandsRuntime = await getOpenHandsRuntimeHealth("run the terminal command", {
        strictNativeTerminal:
          orchestrationPolicy.terminalBackendMode === "strict_openhands_native" &&
          orchestrationPolicy.requireNativeTerminalTool === true,
      }).catch(() => null);
      writeJson(res, 200, {
        ok: true,
        service: "binary-host",
        version: HOST_VERSION,
        transport: "localhost-http",
        secureStorageAvailable: auth.secureStorageAvailable,
        openhandsRuntime,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/auth/status") {
      const auth = await getApiKeyRecord();
      writeJson(res, 200, {
        hasApiKey: Boolean(auth.apiKey),
        maskedApiKey: maskApiKey(auth.apiKey),
        storageMode: auth.storageMode,
        configPath: LEGACY_CONFIG_PATH,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/auth/api-key") {
      const body = await readJsonBody(req);
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey) {
        writeJson(res, 400, { error: "Invalid request", message: "apiKey is required" });
        return;
      }
      const status = await setApiKey(apiKey);
      writeJson(res, 200, {
        hasApiKey: true,
        maskedApiKey: maskApiKey(apiKey),
        storageMode: status.storageMode,
        configPath: LEGACY_CONFIG_PATH,
      });
      return;
    }

    if (method === "DELETE" && url.pathname === "/v1/auth/api-key") {
      const status = await clearApiKey();
      writeJson(res, 200, {
        hasApiKey: false,
        maskedApiKey: null,
        storageMode: "none",
        configPath: LEGACY_CONFIG_PATH,
        secureStorageAvailable: status.secureStorageAvailable,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/preferences") {
      writeJson(res, 200, await loadPreferences());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/openhands/capabilities") {
      const preferences = await loadPreferences();
      const workspaceRoot =
        normalizeOptionalPath(url.searchParams.get("workspaceRoot")) ||
        preferences.focusWorkspaceRoot ||
        preferences.focusRepoRoot;
      const orchestrationPolicy = normalizeOrchestrationPolicy(
        preferences.orchestrationPolicy,
        defaultOrchestrationPolicy()
      );
      const openhandsRuntime = await getOpenHandsRuntimeHealth(
        "run terminal commands, edit files, and automate the browser",
        {
          strictNativeTerminal:
            orchestrationPolicy.terminalBackendMode === "strict_openhands_native" &&
            orchestrationPolicy.requireNativeTerminalTool === true,
        }
      ).catch(() => null);
      writeJson(res, 200, {
        pluginPacks: getOpenHandsPluginCatalog(),
        defaultPluginPacks: preferences.defaultPluginPacks,
        skillSources: resolveOpenHandsSkillSources(workspaceRoot),
        offerings: buildOpenHandsOfferings({
          openhandsRuntime,
        }),
        ...(workspaceRoot ? { workspaceRoot } : {}),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/orchestration/policy") {
      const current = await loadPreferences();
      writeJson(res, 200, normalizeOrchestrationPolicy(current.orchestrationPolicy, defaultOrchestrationPolicy()));
      return;
    }

    if (method === "PATCH" && url.pathname === "/v1/orchestration/policy") {
      const body = await readJsonBody(req);
      const current = await loadPreferences();
      const nextPolicy = normalizeOrchestrationPolicy(
        {
          ...current.orchestrationPolicy,
          ...(body as Partial<BinaryOrchestrationPolicy>),
        },
        defaultOrchestrationPolicy()
      );
      const next: BinaryHostPreferences = {
        ...current,
        orchestrationPolicy: nextPolicy,
      };
      await savePreferences(next);
      writeJson(res, 200, nextPolicy);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/connections") {
      writeJson(res, 200, { connections: await listConnectionViews() });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/connections") {
      const body = await readJsonBody(req);
      const result = await upsertConnectionRecord(body);
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        connection: result.view,
        storageMode: result.storageMode,
        secureStorageAvailable: result.secureStorageAvailable,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/connections/import") {
      const body = await readJsonBody(req);
      const raw = typeof body.raw === "string" ? body.raw : "";
      const importedFrom = typeof body.importedFrom === "string" ? body.importedFrom : undefined;
      const imported = importConnectionsFromMcpJson(raw, importedFrom);
      if (!imported.ok) {
        writeJson(res, 400, { error: "Invalid request", message: imported.message });
        return;
      }
      const preferences = await loadPreferences();
      const saved: BinaryConnectionView[] = [];
      for (const definition of imported.definitions) {
        const existing = preferences.connections.find((item) => item.name === definition.record.name) || null;
        const validated = await validateAndTestConnection({
          draft: {
            ...definition.record,
            id: existing?.id,
          },
          secret: definition.secret,
        });
        if (!validated.ok) {
          writeJson(res, 400, { error: "Invalid request", message: validated.message });
          return;
        }
        const record: BinaryConnectionRecord = {
          ...validated.record,
          id: existing?.id || validated.record.id,
          createdAt: existing?.createdAt || nowIso(),
          updatedAt: nowIso(),
        };
        await setConnectionSecretRecord(record.id, validated.secret);
        preferences.connections = [record, ...preferences.connections.filter((item) => item.id !== record.id)].slice(0, 60);
        saved.push(buildConnectionView(record, validated.secret));
      }
      await savePreferences(preferences);
      writeJson(res, 200, {
        connections: saved.sort((a, b) => a.name.localeCompare(b.name)),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/providers/catalog") {
      writeJson(res, 200, {
        providers: listProviderCatalog(),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/providers") {
      writeJson(res, 200, {
        providers: await listProviderViews(),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/providers/connect/oauth/callback") {
      let statusCode = 200;
      let message = "You can close this browser tab and return to Binary.";
      try {
        const session = await oauthSessionManager.completeCallback(url);
        if (session.status === "connected") {
          await finalizeCompletedOAuthSession(session);
          message = "Binary linked your account successfully. You can return to the app now.";
        } else {
          statusCode = 400;
          message = session.error || "Binary could not finish the OAuth callback.";
        }
      } catch (error) {
        statusCode = 400;
        message = error instanceof Error ? error.message : "Binary could not finish the OAuth callback.";
      }
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Binary OAuth</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f8f9ff;color:#05345c;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}main{max-width:520px;border-radius:24px;background:#fff;padding:32px;box-shadow:0 24px 80px rgba(0,83,220,.12)}h1{font-size:28px;margin:0 0 12px}p{font-size:18px;line-height:1.5;margin:0;color:#3d618c}</style></head><body><main><h1>${statusCode < 300 ? "Binary account linked" : "Binary account link failed"}</h1><p>${escapeHtml(message)}</p></main></body></html>`);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/api-key") {
      const body = await readJsonBody(req);
      const providerId = String(body.providerId || "").trim() as BinaryProviderId;
      const result = await upsertProviderConnection({
        providerId,
        apiKey: String(body.apiKey || "").trim(),
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
        setDefault: body.setDefault === true,
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        provider: result.provider,
        storageMode: result.storageMode,
        secureStorageAvailable: result.secureStorageAvailable,
        availableModels: result.availableModels,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/open-browser") {
      const body = await readJsonBody(req);
      const provider = getProviderCatalogEntry(String(body.providerId || "").trim());
      if (!provider) {
        writeJson(res, 404, { error: "Not found", message: "Unknown provider." });
        return;
      }
      openExternalUrl(provider.browserConnectUrl);
      writeJson(res, 200, {
        ok: true,
        providerId: provider.id,
        url: provider.browserConnectUrl,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/import-local") {
      const body = await readJsonBody(req);
      const providerId = String(body.providerId || "").trim() as BinaryProviderId;
      const result = await importLocalProviderConnection({
        providerId,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
        setDefault: body.setDefault === true,
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        provider: result.provider,
        storageMode: result.storageMode,
        secureStorageAvailable: result.secureStorageAvailable,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/browser/start") {
      const body = await readJsonBody(req);
      const providerId = String(body.providerId || "").trim() as BinaryProviderId;
      const result = await startProviderBrowserSession({
        providerId,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
        setDefault: body.setDefault === true,
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      openExternalUrl(result.launchUrl);
      writeJson(res, 200, {
        ok: true,
        providerId: result.provider.id,
        session: result.session,
        launchUrl: result.launchUrl,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/browser/poll") {
      const body = await readJsonBody(req);
      const result = await pollProviderBrowserSession({
        sessionId: String(body.sessionId || "").trim(),
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        session: result.session,
        ...(result.provider ? { provider: result.provider } : {}),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/oauth/start") {
      const body = await readJsonBody(req);
      const providerId = String(body.providerId || "").trim() as BinaryProviderId;
      const result = await startProviderOAuthSession({
        req,
        providerId,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
        setDefault: body.setDefault === true,
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      openExternalUrl(result.launchUrl);
      writeJson(res, 200, {
        ok: true,
        providerId: result.provider.id,
        sessionId: result.session.sessionId,
        status: result.session.status,
        launchUrl: result.launchUrl,
        ...(result.session.verificationUri ? { verificationUri: result.session.verificationUri } : {}),
        ...(result.session.userCode ? { userCode: result.session.userCode } : {}),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/oauth/poll") {
      const body = await readJsonBody(req);
      const sessionId = String(body.sessionId || "").trim();
      const session = oauthSessionManager.getSession(sessionId);
      if (!session) {
        writeJson(res, 404, { error: "Not found", message: "Binary could not find that OAuth login session." });
        return;
      }
      const poll = oauthSessionManager.getPollView(sessionId);
      let finalizeError: string | null = null;
      let provider =
        poll?.status === "connected"
          ? (await listProviderViews()).find((item) => item.id === session.providerId) || null
          : null;
      if (poll?.status === "connected" && (!provider || !provider.connected || !provider.hasSecret)) {
        try {
          const finalized = await finalizeCompletedOAuthSession(session);
          provider = finalized.provider;
        } catch (error) {
          finalizeError = error instanceof Error ? error.message : "Binary could not finish OAuth provider validation.";
          provider = (await listProviderViews()).find((item) => item.id === session.providerId) || null;
        }
      }
      writeJson(res, 200, {
        session: poll,
        ...(poll?.status === "connected" ? { provider } : {}),
        ...(finalizeError ? { finalizeError } : {}),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/providers/connect/oauth/device/start") {
      const body = await readJsonBody(req);
      const providerId = String(body.providerId || "").trim() as BinaryProviderId;
      const result = await startProviderOAuthSession({
        req,
        providerId,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
        setDefault: body.setDefault === true,
      });
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        providerId: result.provider.id,
        sessionId: result.session.sessionId,
        ...(result.session.verificationUri ? { verificationUri: result.session.verificationUri } : {}),
        ...(result.session.userCode ? { userCode: result.session.userCode } : {}),
      });
      return;
    }

    const providerActionMatch = url.pathname.match(/^\/v1\/providers\/([^/]+)\/(test|default|refresh)$/);
    if (method === "POST" && providerActionMatch) {
      const providerId = decodeURIComponent(providerActionMatch[1] || "") as BinaryProviderId;
      const action = providerActionMatch[2] || "";
      if (action === "test") {
        const result = await testProviderConnection(providerId);
        if (!result.ok) {
          writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
          return;
        }
        writeJson(res, 200, {
          provider: result.provider,
          test: result.test,
        });
        return;
      }
      if (action === "refresh") {
        const result = await refreshProviderConnection(providerId);
        if (!result.ok) {
          writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
          return;
        }
        writeJson(res, 200, {
          provider: result.provider,
        });
        return;
      }
      const result = await setDefaultProvider(providerId);
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, {
        providers: result.providers,
      });
      return;
    }

    const providerDeleteMatch = url.pathname.match(/^\/v1\/providers\/([^/]+)$/);
    if (method === "DELETE" && providerDeleteMatch) {
      const providerId = decodeURIComponent(providerDeleteMatch[1] || "") as BinaryProviderId;
      const result = await disconnectProvider(providerId);
      if (!result.ok) {
        writeJson(res, result.statusCode, { error: "Invalid request", message: result.message });
        return;
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    const connectionActionMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/(test|enable|disable)$/);
    if (method === "POST" && connectionActionMatch) {
      const connectionId = decodeURIComponent(connectionActionMatch[1] || "");
      const action = connectionActionMatch[2] || "";
      const preferences = await loadPreferences();
      const index = preferences.connections.findIndex((item) => item.id === connectionId);
      if (index < 0) {
        writeJson(res, 404, { error: "Not found", message: "Unknown connection." });
        return;
      }
      const record = preferences.connections[index];
      const secret = (await getConnectionSecretRecord(record.id)) || {};

      if (action === "test") {
        const testResult = await testRemoteConnection(record, secret);
        const next: BinaryConnectionRecord = {
          ...record,
          lastValidatedAt: nowIso(),
          lastValidationOk: testResult.ok,
          lastValidationError: testResult.ok ? undefined : testResult.message || "Connection test failed.",
          updatedAt: nowIso(),
        };
        preferences.connections[index] = next;
        await savePreferences(preferences);
        writeJson(res, 200, {
          connection: buildConnectionView(next, secret),
          test: {
            ok: testResult.ok,
            status: testResult.status,
            message:
              testResult.message ||
              `${getConnectionStatusLabel(buildConnectionView(next, secret).status)} (${next.transport.toUpperCase()})`,
          },
        });
        return;
      }

      const enabled = action === "enable";
      const next: BinaryConnectionRecord = {
        ...record,
        enabled,
        updatedAt: nowIso(),
      };
      preferences.connections[index] = next;
      await savePreferences(preferences);
      writeJson(res, 200, { connection: buildConnectionView(next, secret) });
      return;
    }

    const connectionDeleteMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)$/);
    if (method === "DELETE" && connectionDeleteMatch) {
      const connectionId = decodeURIComponent(connectionDeleteMatch[1] || "");
      const preferences = await loadPreferences();
      const existing = preferences.connections.find((item) => item.id === connectionId) || null;
      if (!existing) {
        writeJson(res, 404, { error: "Not found", message: "Unknown connection." });
        return;
      }
      preferences.connections = preferences.connections.filter((item) => item.id !== connectionId);
      await savePreferences(preferences);
      await clearConnectionSecretRecord(connectionId);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/focus-lease") {
      writeJson(res, 200, { lease: sanitizeFocusLease(activeFocusLease) });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/focus-lease") {
      const body = await readJsonBody(req);
      const controller = new AutonomyExecutionController((await loadPreferences()).machineAutonomy);
      const lease = controller.updateFocusLease({
        surface:
          body.surface === "desktop" || body.surface === "cli" || body.surface === "unknown"
            ? body.surface
            : "desktop",
        source: typeof body.source === "string" ? body.source : "typing",
        leaseMs: typeof body.leaseMs === "number" ? body.leaseMs : undefined,
        active: body.active !== false,
      });
      activeFocusLease = lease;
      writeJson(res, 200, { lease });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/status") {
      const preferences = await loadPreferences();
      const discovered = await machineAutonomyController.listApps();
      const browser = await browserRuntimeController.getStatus(preferences.machineAutonomy).catch(() => ({
        enabled: preferences.machineAutonomy.enabled,
        allowBrowserNative: preferences.machineAutonomy.allowBrowserNative,
        mode: "unavailable",
      }));
      writeJson(res, 200, {
        enabled: preferences.machineAutonomy.enabled,
        platform: process.platform,
        policy: preferences.machineAutonomy,
        appCount: discovered.apps.length,
        indexedAt: discovered.indexedAt,
        browser,
        focusLease: sanitizeFocusLease(activeFocusLease),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/autonomy/configure") {
      const body = await readJsonBody(req);
      const current = await loadPreferences();
      current.machineAutonomy = {
        ...current.machineAutonomy,
        ...(body as Partial<MachineAutonomyPolicy>),
        updatedAt: nowIso(),
      };
      await savePreferences(current);
      writeJson(res, 200, current.machineAutonomy);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/apps") {
      const forceRefresh = url.searchParams.get("refresh") === "1";
      const discovered = await machineAutonomyController.listApps({ forceRefresh });
      writeJson(res, 200, discovered);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/native-apps/status") {
      const preferences = await loadPreferences();
      writeJson(res, 200, {
        enabled:
          preferences.machineAutonomy.enabled &&
          preferences.machineAutonomy.allowWholeMachineAccess,
        policy: {
          allowWholeMachineAccess: preferences.machineAutonomy.allowWholeMachineAccess,
          allowDesktopObservation: preferences.machineAutonomy.allowDesktopObservation,
          allowAppLaunch: preferences.machineAutonomy.allowAppLaunch,
          allowVisibleFallback: preferences.machineAutonomy.allowVisibleFallback,
        },
        runtime: await nativeAppRuntime.getStatus(),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/browser/status") {
      const preferences = await loadPreferences();
      const browser = await browserRuntimeController.getStatus(preferences.machineAutonomy);
      writeJson(res, 200, browser);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/browser/pages") {
      const preferences = await loadPreferences();
      const pages = await browserRuntimeController.listPages(preferences.machineAutonomy);
      writeJson(res, 200, { pages });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/status") {
      writeJson(res, 200, await worldModelService.getStatus());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/summary") {
      writeJson(res, 200, await worldModelService.getSummary());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/active-context") {
      writeJson(res, 200, await worldModelService.getActiveContext());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/beliefs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 24;
      const statusRaw = url.searchParams.get("status");
      writeJson(res, 200, {
        beliefs: await worldModelService.getBeliefs({
          subjectId: url.searchParams.get("subjectId") || undefined,
          kind: url.searchParams.get("kind") || undefined,
          status:
            statusRaw === "active" || statusRaw === "stale" || statusRaw === "expired" || statusRaw === "contradicted"
              ? statusRaw
              : undefined,
          limit,
        }),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/goals") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 24;
      const statusRaw = url.searchParams.get("status");
      writeJson(res, 200, {
        goals: await worldModelService.getGoals({
          runId: url.searchParams.get("runId") || undefined,
          status:
            statusRaw === "open" || statusRaw === "in_progress" || statusRaw === "blocked" || statusRaw === "completed"
              ? statusRaw
              : undefined,
          limit,
        }),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/episodes") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 16;
      const statusRaw = url.searchParams.get("status");
      writeJson(res, 200, {
        episodes: await worldModelService.queryEpisodes({
          query: url.searchParams.get("query") || undefined,
          kind: url.searchParams.get("kind") || undefined,
          status: statusRaw === "open" || statusRaw === "completed" || statusRaw === "blocked" ? statusRaw : undefined,
          limit,
        }),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/recent-changes") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
      writeJson(res, 200, {
        changes: await worldModelService.getRecentChanges(limit),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/world-model/routines") {
      const query = String(url.searchParams.get("query") || "").trim();
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 8;
      writeJson(res, 200, {
        routines: await worldModelService.findRoutine(query, limit),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/query") {
      const body = await readJsonBody(req);
      writeJson(res, 200, await worldModelService.queryGraph({
        query: typeof body.query === "string" ? body.query : undefined,
        type: typeof body.type === "string" ? body.type : undefined,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/goals/register") {
      const body = await readJsonBody(req);
      const title = String(body.title || body.label || "").trim();
      if (!title) {
        writeJson(res, 400, { error: "Invalid request", message: "title is required" });
        return;
      }
      writeJson(res, 200, await worldModelService.registerGoal({
        title,
        summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : undefined,
        runId: typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : undefined,
        entityIds: Array.isArray(body.entityIds) ? body.entityIds.map((item: unknown) => String(item)) : [],
        progress: typeof body.progress === "number" ? body.progress : undefined,
        confidence: typeof body.confidence === "number" ? body.confidence : undefined,
        subgoals: Array.isArray(body.subgoals) ? body.subgoals.map((item: unknown) => String(item)) : [],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/predict") {
      const body = await readJsonBody(req);
      writeJson(res, 200, {
        predictions: await worldModelService.predictOutcomes({
          candidates: Array.isArray(body.candidates)
            ? body.candidates
                .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                .map((item) => ({
                  id: typeof item.id === "string" ? item.id : undefined,
                  candidateId: typeof item.candidateId === "string" ? item.candidateId : undefined,
                  kind: typeof item.kind === "string" ? item.kind : undefined,
                  steps: Array.isArray(item.steps) ? item.steps.map((step: unknown) => String(step)) : undefined,
                  requiresVisibleInteraction: item.requiresVisibleInteraction === true,
                  confidence: typeof item.confidence === "number" ? item.confidence : undefined,
                }))
            : undefined,
          limit: typeof body.limit === "number" ? body.limit : undefined,
        }),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/explain") {
      const body = await readJsonBody(req);
      writeJson(res, 200, await worldModelService.explainRoute({
        candidateId: typeof body.candidateId === "string" ? body.candidateId : undefined,
        claim: typeof body.claim === "string" ? body.claim : undefined,
        kind: typeof body.kind === "string" ? body.kind : undefined,
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/attention/query") {
      const body = await readJsonBody(req);
      writeJson(res, 200, {
        items: await worldModelService.getAttentionQueue({
          limit: typeof body.limit === "number" ? body.limit : undefined,
        }),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/world-model/memory/commit") {
      const body = await readJsonBody(req);
      const label = String(body.label || "").trim();
      if (!label) {
        writeJson(res, 400, { error: "Invalid request", message: "label is required" });
        return;
      }
      writeJson(res, 200, await worldModelService.commitMemory({
        label,
        summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : label,
        scope:
          body.scope === "workspace" || body.scope === "domain" || body.scope === "run" || body.scope === "machine"
            ? body.scope
            : "machine",
        tags: Array.isArray(body.tags) ? body.tags.map((item: unknown) => String(item)) : [],
        data: body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {},
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/autonomy/apps/launch") {
      const body = await readJsonBody(req);
      const query = String(body.query || "").trim();
      if (!query) {
        writeJson(res, 400, { error: "Invalid request", message: "query is required" });
        return;
      }
      const preferences = await loadPreferences();
      if (!preferences.machineAutonomy.enabled || !preferences.machineAutonomy.allowAppLaunch) {
        writeJson(res, 403, {
          error: "Autonomy disabled",
          message: "Enable machine autonomy app launching before requesting local app launches.",
        });
        return;
      }
      try {
        const launched = await machineAutonomyController.launchApp(query);
        writeJson(res, 200, launched);
      } catch (error) {
        writeJson(res, 404, {
          error: "App not found",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (method === "GET" && url.pathname === "/v1/autonomy/agents") {
      const automations = await automationRuntime.listAutomations();
      writeJson(res, 200, {
        agents: automations.map((automation) => automationToLegacyAgent(automation)),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/autonomy/agents") {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const prompt = String(body.prompt || "").trim();
      if (!name || !prompt) {
        writeJson(res, 400, { error: "Invalid request", message: "name and prompt are required" });
        return;
      }
      const trigger =
        body.trigger === "scheduled"
          ? {
              kind: "schedule_nl" as const,
              scheduleText:
                typeof body.scheduleText === "string" && body.scheduleText.trim()
                  ? body.scheduleText.trim()
                  : typeof body.scheduleMinutes === "number"
                    ? `every ${Math.max(5, Math.min(1_440, Math.floor(body.scheduleMinutes)))} minutes`
                    : "every hour",
              ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                ? { workspaceRoot: normalizeWorkspacePath(body.workspaceRoot) }
                : {}),
            }
          : body.trigger === "file_event"
            ? {
                kind: "file_event" as const,
                workspaceRoot:
                  typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                    ? normalizeWorkspacePath(body.workspaceRoot)
                    : process.cwd(),
              }
            : body.trigger === "process_event"
              ? {
                  kind: "process_event" as const,
                  query: typeof body.query === "string" && body.query.trim() ? body.query.trim() : name,
                  ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                    ? { workspaceRoot: normalizeWorkspacePath(body.workspaceRoot) }
                    : {}),
                }
              : body.trigger === "notification"
                ? {
                    kind: "notification" as const,
                    ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                      ? { workspaceRoot: normalizeWorkspacePath(body.workspaceRoot) }
                      : {}),
                    ...(typeof body.topic === "string" && body.topic.trim() ? { topic: body.topic.trim() } : {}),
                    ...(typeof body.query === "string" && body.query.trim() ? { query: body.query.trim() } : {}),
                  }
                : {
                    kind: "manual" as const,
                    ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                      ? { workspaceRoot: normalizeWorkspacePath(body.workspaceRoot) }
                      : {}),
                  };
      const automation = await automationRuntime.saveAutomation({
        id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
        name,
        prompt,
        trigger,
        status: body.status === "paused" ? "paused" : "active",
        workspaceRoot:
          typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
            ? normalizeWorkspacePath(body.workspaceRoot)
            : undefined,
        model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined,
      });
      writeJson(res, 200, automationToLegacyAgent(automation));
      return;
    }

    const agentRunMatch = url.pathname.match(/^\/v1\/autonomy\/agents\/([^/]+)\/run$/);
    if (method === "POST" && agentRunMatch) {
      const agentId = decodeURIComponent(agentRunMatch[1] || "");
      const automation = await automationRuntime.getAutomation(agentId);
      if (!automation) {
        writeJson(res, 404, { error: "Not found", message: "Unknown background agent." });
        return;
      }
      if (automation.status !== "active") {
        writeJson(res, 409, { error: "Agent paused", message: "Resume the background agent before running it." });
        return;
      }
      const queuedRun = await automationRuntime.runAutomation(agentId, "Legacy background agent run requested.");
      const run = queuedRun ? (await loadRunRecord(queuedRun.id)) || null : null;
      writeJson(res, 202, {
        agent: automationToLegacyAgent(automation),
        run: run ? buildRunSummary(run) : queuedRun,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/automations") {
      writeJson(res, 200, {
        automations: await automationRuntime.listAutomations(),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/automations") {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const prompt = String(body.prompt || "").trim();
      if (!name || !prompt || !body.trigger || typeof body.trigger !== "object") {
        writeJson(res, 400, { error: "Invalid request", message: "name, prompt, and trigger are required" });
        return;
      }
      const automation = await automationRuntime.saveAutomation({
        id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
        name,
        prompt,
        trigger: body.trigger as BinaryAutomationDefinition["trigger"],
        status: body.status === "paused" ? "paused" : "active",
        policy:
          body.policy === "observe_only" || body.policy === "approval_before_mutation"
            ? body.policy
            : "autonomous",
        workspaceRoot:
          typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
            ? normalizeWorkspacePath(body.workspaceRoot)
            : undefined,
        model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined,
      });
      writeJson(res, 200, automation);
      return;
    }

    const automationMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)$/);
    if (automationMatch && method === "GET") {
      const automation = await automationRuntime.getAutomation(decodeURIComponent(automationMatch[1] || ""));
      if (!automation) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      writeJson(res, 200, automation);
      return;
    }
    if (automationMatch && method === "PATCH") {
      const body = await readJsonBody(req);
      const existing = await automationRuntime.getAutomation(decodeURIComponent(automationMatch[1] || ""));
      if (!existing) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      const automation = await automationRuntime.saveAutomation({
        ...existing,
        ...body,
        id: existing.id,
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
        prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : existing.prompt,
        trigger:
          body.trigger && typeof body.trigger === "object"
            ? (body.trigger as BinaryAutomationDefinition["trigger"])
            : existing.trigger,
      });
      writeJson(res, 200, automation);
      return;
    }

    const automationRunMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)\/run$/);
    if (automationRunMatch && method === "POST") {
      const automationId = decodeURIComponent(automationRunMatch[1] || "");
      const queuedRun = await automationRuntime.runAutomation(automationId, "Automation run requested.");
      if (!queuedRun) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      const run = await loadRunRecord(queuedRun.id);
      writeJson(res, 202, run ? buildRunSummary(run) : queuedRun);
      return;
    }

    const automationControlMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)\/control$/);
    if (automationControlMatch && method === "POST") {
      const automationId = decodeURIComponent(automationControlMatch[1] || "");
      const body = await readJsonBody(req);
      const action = body.action === "pause" ? "pause" : body.action === "resume" ? "resume" : null;
      if (!action) {
        writeJson(res, 400, { error: "Invalid request", message: "action must be pause or resume" });
        return;
      }
      const automation = await automationRuntime.controlAutomation(automationId, action);
      if (!automation) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      writeJson(res, 200, automation);
      return;
    }

    const automationEventsMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)\/events$/);
    if (automationEventsMatch && method === "GET") {
      const automationId = decodeURIComponent(automationEventsMatch[1] || "");
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      const response = await automationRuntime.getAutomationEvents(automationId, Number.isFinite(after) ? after : 0);
      if (!response.automation) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      writeJson(res, 200, response);
      return;
    }

    const automationStreamMatch = url.pathname.match(/^\/v1\/automations\/([^/]+)\/stream$/);
    if (automationStreamMatch && method === "GET") {
      const automationId = decodeURIComponent(automationStreamMatch[1] || "");
      const automation = await automationRuntime.getAutomation(automationId);
      if (!automation) {
        writeJson(res, 404, { error: "Not found", message: "Unknown automation." });
        return;
      }
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      req.on("close", () => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      await streamAutomationEvents(automationId, res, Number.isFinite(after) ? after : 0);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/webhooks/subscriptions") {
      writeJson(res, 200, {
        subscriptions: await automationRuntime.listWebhookSubscriptions(),
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/webhooks/subscriptions") {
      const body = await readJsonBody(req);
      const urlValue = String(body.url || "").trim();
      if (!urlValue) {
        writeJson(res, 400, { error: "Invalid request", message: "url is required" });
        return;
      }
      writeJson(
        res,
        200,
        await automationRuntime.saveWebhookSubscription({
          id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
          url: urlValue,
          status: body.status === "paused" ? "paused" : "active",
          secret: typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : undefined,
          automationId: typeof body.automationId === "string" ? body.automationId : undefined,
          events: Array.isArray(body.events) ? body.events.map((item: unknown) => String(item)) : undefined,
        })
      );
      return;
    }

    if (method === "POST" && url.pathname === "/v1/notifications/intake") {
      const body = await readJsonBody(req);
      writeJson(
        res,
        202,
        await automationRuntime.ingestNotification({
          automationId: typeof body.automationId === "string" ? body.automationId : undefined,
          topic: typeof body.topic === "string" ? body.topic : undefined,
          summary: typeof body.summary === "string" ? body.summary : undefined,
          payload: body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {},
        })
      );
      return;
    }

    if (method === "POST" && url.pathname === "/v1/preferences") {
      const body = await readJsonBody(req);
      const current = await loadPreferences();
      const next: BinaryHostPreferences = {
        ...current,
        ...(body as Partial<BinaryHostPreferences>),
        baseUrl: String(body.baseUrl || current.baseUrl).replace(/\/+$/, ""),
        trustedWorkspaces: Array.isArray(body.trustedWorkspaces) ? (body.trustedWorkspaces as BinaryHostTrustGrant[]) : current.trustedWorkspaces,
        recentSessions: Array.isArray(body.recentSessions) ? (body.recentSessions as BinaryHostPreferences["recentSessions"]) : current.recentSessions,
        artifactHistory: Array.isArray(body.artifactHistory) ? (body.artifactHistory as BinaryHostPreferences["artifactHistory"]) : current.artifactHistory,
        orchestrationPolicy:
          body.orchestrationPolicy && typeof body.orchestrationPolicy === "object"
            ? normalizeOrchestrationPolicy(
                {
                  ...current.orchestrationPolicy,
                  ...(body.orchestrationPolicy as Partial<BinaryOrchestrationPolicy>),
                },
                defaultOrchestrationPolicy()
              )
            : current.orchestrationPolicy,
        defaultPluginPacks:
          body.defaultPluginPacks !== undefined
            ? normalizePluginPackIds(body.defaultPluginPacks) ?? []
            : current.defaultPluginPacks,
        backgroundAgents: Array.isArray(body.backgroundAgents) ? (body.backgroundAgents as BinaryHostBackgroundAgent[]) : current.backgroundAgents,
        automations: Array.isArray(body.automations) ? (body.automations as BinaryAutomationDefinition[]) : current.automations,
        webhookSubscriptions: Array.isArray(body.webhookSubscriptions)
          ? (body.webhookSubscriptions as BinaryWebhookSubscription[])
          : current.webhookSubscriptions,
        machineRootPath: normalizeOptionalPath(body.machineRootPath) || current.machineRootPath || defaultMachineRootPath(),
        machineRootMode:
          body.machineRootMode === "home_root" || body.machineRootMode === "hybrid_root"
            ? body.machineRootMode
            : current.machineRootMode,
        machineTrustMode:
          body.machineTrustMode === "observe_first" ||
          body.machineTrustMode === "home_mutate" ||
          body.machineTrustMode === "full_machine_mutate"
            ? body.machineTrustMode
            : current.machineTrustMode,
        systemPathScope:
          body.systemPathScope === "excluded" || body.systemPathScope === "included" || body.systemPathScope === "prompt"
            ? body.systemPathScope
            : current.systemPathScope,
        focusWorkspaceRoot:
          typeof body.focusWorkspaceRoot === "string"
            ? normalizeOptionalPath(body.focusWorkspaceRoot)
            : current.focusWorkspaceRoot,
        focusRepoRoot:
          typeof body.focusRepoRoot === "string" ? normalizeOptionalPath(body.focusRepoRoot) : current.focusRepoRoot,
        machineAutonomy:
          body.machineAutonomy && typeof body.machineAutonomy === "object"
            ? {
                ...current.machineAutonomy,
                ...(body.machineAutonomy as Partial<MachineAutonomyPolicy>),
                updatedAt: nowIso(),
              }
            : current.machineAutonomy,
      };
      await savePreferences(next);
      await automationRuntime.refreshConfig();
      writeJson(res, 200, next);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/workspaces/trust") {
      const body = await readJsonBody(req);
      const target = String(body.path || "").trim();
      if (!target) {
        writeJson(res, 400, { error: "Invalid request", message: "path is required" });
        return;
      }
      const current = await loadPreferences();
      const grant: BinaryHostTrustGrant = {
        path: normalizeWorkspacePath(target),
        mutate: typeof body.mutate === "boolean" ? body.mutate : true,
        commands: body.commands === "allow" ? "allow" : "prompt",
        network: body.network === "allow" ? "allow" : "deny",
        elevated: body.elevated === "allow" ? "allow" : "deny",
        grantedAt: nowIso(),
      };
      current.trustedWorkspaces = [grant, ...current.trustedWorkspaces.filter((item) => normalizeWorkspacePath(item.path) !== grant.path)].slice(0, 60);
      await savePreferences(current);
      await automationRuntime.refreshConfig();
      writeJson(res, 200, current.trustedWorkspaces);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/binary/stat") {
      await handleBinaryHttpTool(req, res, "stat_binary");
      return;
    }

    if (method === "POST" && url.pathname === "/v1/binary/read-chunk") {
      await handleBinaryHttpTool(req, res, "read_binary_chunk");
      return;
    }

    if (method === "POST" && url.pathname === "/v1/binary/analyze") {
      await handleBinaryHttpTool(req, res, "analyze_binary");
      return;
    }

    if (method === "POST" && url.pathname === "/v1/binary/hash") {
      await handleBinaryHttpTool(req, res, "hash_binary");
      return;
    }

    if (method === "POST" && url.pathname === "/v1/runs/assist") {
      await handleAssist(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/agents/remote/health") {
      writeJson(res, 200, await getRemoteRuntimeHealth());
      return;
    }

    if (method === "POST" && url.pathname === "/v1/agents/jobs") {
      await handleAgentJobCreate(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/agents/jobs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
      writeJson(res, 200, {
        jobs: await agentJobManager.listJobs(Number.isFinite(limit) ? Math.max(1, limit) : 20),
      });
      return;
    }

    const agentJobMatch = url.pathname.match(/^\/v1\/agents\/jobs\/([^/]+)$/);
    if (method === "GET" && agentJobMatch) {
      const job = await agentJobManager.getJob(decodeURIComponent(agentJobMatch[1] || ""));
      if (!job) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary agent job." });
        return;
      }
      writeJson(res, 200, job);
      return;
    }

    const agentJobEventsMatch = url.pathname.match(/^\/v1\/agents\/jobs\/([^/]+)\/events$/);
    if (method === "GET" && agentJobEventsMatch) {
      const jobId = decodeURIComponent(agentJobEventsMatch[1] || "");
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      const response = await getMergedAgentJobEvents(jobId, Number.isFinite(after) ? after : 0);
      if (!response.job) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary agent job." });
        return;
      }
      writeJson(res, 200, response);
      return;
    }

    const agentJobStreamMatch = url.pathname.match(/^\/v1\/agents\/jobs\/([^/]+)\/stream$/);
    if (method === "GET" && agentJobStreamMatch) {
      const jobId = decodeURIComponent(agentJobStreamMatch[1] || "");
      const job = await agentJobManager.getJob(jobId);
      if (!job) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary agent job." });
        return;
      }
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      req.on("close", () => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      await streamAgentJobEvents(jobId, res, Number.isFinite(after) ? after : 0);
      return;
    }

    const agentJobControlMatch = url.pathname.match(/^\/v1\/agents\/jobs\/([^/]+)\/control$/);
    if (method === "POST" && agentJobControlMatch) {
      const jobId = decodeURIComponent(agentJobControlMatch[1] || "");
      const body = await readJsonBody(req);
      const action = body.action === "pause" ? "pause" : body.action === "resume" ? "resume" : body.action === "cancel" ? "cancel" : null;
      if (!action) {
        writeJson(res, 400, { error: "Invalid request", message: "action must be pause, resume, or cancel" });
        return;
      }
      const job = await agentJobManager.getJob(jobId);
      if (!job) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary agent job." });
        return;
      }
      if (job.runId) {
        const run = await loadRunRecord(job.runId);
        if (run) {
          run.controlHistory.push({
            action,
            note: typeof body.note === "string" ? body.note.trim() : null,
            at: nowIso(),
          });
          const controller = runControllers.get(run.id) || {
            pauseRequested: false,
            cancelRequested: false,
          };
          runControllers.set(run.id, controller);
          if (action === "pause") {
            controller.pauseRequested = true;
          } else if (action === "cancel") {
            controller.cancelRequested = true;
          } else {
            controller.pauseRequested = false;
            controller.cancelRequested = false;
            if (!activeExecutions.has(run.id)) {
              run.status = "queued";
              run.updatedAt = nowIso();
              await persistHostRun(run);
              await agentJobManager.syncFromRun(run);
              void startRunExecution(run.id);
            }
          }
          await persistHostRun(run);
        }
      }
      const updated = await agentJobManager.recordControl(jobId, action, typeof body.note === "string" ? body.note.trim() : undefined);
      writeJson(res, 200, updated || job);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/runs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
      const runs = await readAllRuns();
      writeJson(res, 200, {
        runs: runs
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 20)
          .map((run) => buildRunSummary(run)),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/runs/scorecard") {
      const runs = await readAllRuns();
      writeJson(res, 200, {
        scorecard: buildLatencyScorecard(runs),
      });
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (method === "GET" && runMatch) {
      const run = await loadRunRecord(decodeURIComponent(runMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      writeJson(res, 200, run as unknown as Record<string, unknown>);
      return;
    }

    const eventsMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (method === "GET" && eventsMatch) {
      const run = await loadRunRecord(decodeURIComponent(eventsMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      writeJson(res, 200, {
        run: buildRunSummary(run),
        events: run.events.filter((event) => event.seq > (Number.isFinite(after) ? after : 0)),
        done: isTerminalStatus(run.status) || run.status === "takeover_required",
      });
      return;
    }

    const streamMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/stream$/);
    if (method === "GET" && streamMatch) {
      const runId = decodeURIComponent(streamMatch[1] || "");
      const run = await loadRunRecord(runId);
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      req.on("close", () => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      await streamExistingRun(runId, res, Number.isFinite(after) ? after : 0);
      return;
    }

    const controlMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/control$/);
    if (method === "POST" && controlMatch) {
      const run = await loadRunRecord(decodeURIComponent(controlMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      const body = await readJsonBody(req);
      const action = String(body.action || "").trim() as BinaryHostRunControlAction;
      if (!["pause", "resume", "cancel", "repair", "takeover", "retry_last_turn"].includes(action)) {
        writeJson(res, 400, { error: "Invalid request", message: "Unknown control action." });
        return;
      }
      const note = typeof body.note === "string" ? body.note.trim() : null;
      run.controlHistory.push({
        action,
        note,
        at: nowIso(),
      });
      const controller = runControllers.get(run.id) || {
        pauseRequested: false,
        cancelRequested: false,
      };
      runControllers.set(run.id, controller);

      if (action === "pause") {
        controller.pauseRequested = true;
        if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
          run.status = "paused";
          run.takeoverReason = note || "Paused by operator.";
          run.updatedAt = nowIso();
          await persistHostRun(run);
          await agentJobManager.syncFromRun(run);
        }
      } else if (action === "cancel") {
        controller.cancelRequested = true;
        if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
          run.status = "cancelled";
          run.updatedAt = nowIso();
          await persistHostRun(run);
          await agentJobManager.syncFromRun(run);
        }
      } else if (action === "takeover") {
        controller.pauseRequested = true;
        run.status = "takeover_required";
        run.takeoverReason = note || "Operator takeover requested.";
        run.updatedAt = nowIso();
        await persistHostRun(run);
        await agentJobManager.syncFromRun(run);
      } else {
        controller.pauseRequested = false;
        controller.cancelRequested = false;
        if (!activeExecutions.has(run.id)) {
          run.status = "queued";
          run.takeoverReason = undefined;
          run.error = undefined;
          run.updatedAt = nowIso();
          await persistHostRun(run);
          await agentJobManager.syncFromRun(run);
          void startRunExecution(run.id);
        }
      }

      writeJson(res, 200, buildRunSummary(await loadRunRecord(run.id) || run));
      return;
    }

    const exportMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/export$/);
    if (method === "GET" && exportMatch) {
      const run = await loadRunRecord(decodeURIComponent(exportMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      writeJson(res, 200, run as unknown as Record<string, unknown>);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/debug/agent-sessions") {
      const body = await readJsonBody(req);
      const session = await agentProbeManager.createSession({
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined,
        model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined,
        workspaceRoot:
          typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
            ? normalizeWorkspacePath(body.workspaceRoot)
            : undefined,
      });
      if (typeof body.message === "string" && body.message.trim()) {
        const updated = await agentProbeManager.submitMessage(
          session.id,
          { message: body.message.trim() },
          executeHostedAgentProbeTurn
        );
        writeJson(res, 200, updated || session);
        return;
      }
      writeJson(res, 200, session);
      return;
    }

    const agentProbeMatch = url.pathname.match(/^\/v1\/debug\/agent-sessions\/([^/]+)$/);
    if (method === "GET" && agentProbeMatch) {
      const session = await agentProbeManager.getSession(decodeURIComponent(agentProbeMatch[1] || ""));
      if (!session) {
        writeJson(res, 404, { error: "Not found", message: "Unknown agent probe session." });
        return;
      }
      writeJson(res, 200, session);
      return;
    }

    const agentProbeMessageMatch = url.pathname.match(/^\/v1\/debug\/agent-sessions\/([^/]+)\/messages$/);
    if (method === "POST" && agentProbeMessageMatch) {
      const sessionId = decodeURIComponent(agentProbeMessageMatch[1] || "");
      const body = await readJsonBody(req);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        writeJson(res, 400, { error: "Invalid request", message: "message is required" });
        return;
      }
      const session = await agentProbeManager.submitMessage(
        sessionId,
        { message },
        executeHostedAgentProbeTurn
      );
      if (!session) {
        writeJson(res, 404, { error: "Not found", message: "Unknown agent probe session." });
        return;
      }
      writeJson(res, 200, session);
      return;
    }

    const agentProbeEventsMatch = url.pathname.match(/^\/v1\/debug\/agent-sessions\/([^/]+)\/events$/);
    if (method === "GET" && agentProbeEventsMatch) {
      const sessionId = decodeURIComponent(agentProbeEventsMatch[1] || "");
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      const response = await agentProbeManager.getSessionEvents(sessionId, Number.isFinite(after) ? after : 0);
      if (!response.session) {
        writeJson(res, 404, { error: "Not found", message: "Unknown agent probe session." });
        return;
      }
      writeJson(res, 200, response);
      return;
    }

    const agentProbeControlMatch = url.pathname.match(/^\/v1\/debug\/agent-sessions\/([^/]+)\/control$/);
    if (method === "POST" && agentProbeControlMatch) {
      const sessionId = decodeURIComponent(agentProbeControlMatch[1] || "");
      const body = await readJsonBody(req);
      const action =
        body.action === "pause" || body.action === "resume" || body.action === "close"
          ? body.action
          : null;
      if (!action) {
        writeJson(res, 400, { error: "Invalid request", message: "action must be pause, resume, or close" });
        return;
      }
      const session = await agentProbeManager.controlSession(sessionId, action);
      if (!session) {
        writeJson(res, 404, { error: "Not found", message: "Unknown agent probe session." });
        return;
      }
      writeJson(res, 200, session);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/debug/runs") {
      const files = await fs.readdir(RUNS_DIR).catch(() => []);
      writeJson(res, 200, {
        runs: files
          .filter((name) => name.endsWith(".json"))
          .sort((a, b) => b.localeCompare(a))
          .slice(0, 50),
      });
      return;
    }

    writeJson(res, 404, {
      error: "Not found",
      message: `Unknown route ${url.pathname}`,
    });
  } catch (error) {
    writeJson(res, 500, {
      error: "Internal error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Binary Host listening on http://${HOST}:${PORT}\n`);
  void scheduleOpenHandsWarmup();
});


