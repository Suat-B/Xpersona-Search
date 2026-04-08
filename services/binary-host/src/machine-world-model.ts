import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export type WorldEntityType =
  | "device"
  | "machine_root"
  | "drive"
  | "folder"
  | "user_session"
  | "app"
  | "window"
  | "workspace"
  | "repo"
  | "terminal_session"
  | "command"
  | "browser"
  | "browser_page"
  | "web_domain"
  | "routine"
  | "artifact"
  | "memory"
  | "goal"
  | "episode"
  | "external_system";

export type WorldRelationType =
  | "launched_by"
  | "contains"
  | "belongs_to_workspace"
  | "active_in_session"
  | "depends_on"
  | "recently_used_with"
  | "verified_by"
  | "habitually_follows"
  | "tracks_goal"
  | "part_of_episode"
  | "supports_belief"
  | "supports_goal";

export type WorldEventKind =
  | "migration.bootstrap"
  | "context.snapshot"
  | "tool.executed"
  | "proof.recorded"
  | "route.decision"
  | "route.outcome"
  | "goal.opened"
  | "goal.progressed"
  | "goal.blocked"
  | "goal.completed"
  | "focus.changed"
  | "belief.expired"
  | "episode.closed"
  | "memory.committed";

export type WorldEntity = {
  id: string;
  type: WorldEntityType;
  key: string;
  label: string;
  data: Record<string, unknown>;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastObservedAt?: string;
};

export type WorldRelation = {
  id: string;
  type: WorldRelationType;
  from: string;
  to: string;
  data: Record<string, unknown>;
  weight: number;
  createdAt: string;
  updatedAt: string;
  lastObservedAt?: string;
};

export type WorldBelief = {
  id: string;
  subjectId: string;
  kind: string;
  value: unknown;
  confidence: number;
  evidenceIds: string[];
  provenance?: "snapshot" | "tool_result" | "proof" | "derived" | "manual";
  proofBacked?: boolean;
  decayHours?: number;
  status: "active" | "stale" | "expired" | "contradicted";
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorldEpisode = {
  id: string;
  kind: string;
  label: string;
  summary: string;
  status: "open" | "completed" | "blocked";
  entityIds: string[];
  goalIds: string[];
  evidenceIds: string[];
  tags: string[];
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
};

export type WorldGoal = {
  id: string;
  title: string;
  summary: string;
  status: "open" | "in_progress" | "blocked" | "completed";
  progress: number;
  confidence: number;
  runId?: string;
  entityIds: string[];
  evidenceIds: string[];
  subgoals: string[];
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
  lastProgressAt?: string;
};

export type WorldRoutine = {
  id: string;
  slug: string;
  label: string;
  description: string;
  triggers: string[];
  steps: string[];
  confidence: number;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type WorldProof = {
  id: string;
  label: string;
  summary: string;
  at: string;
  runId?: string;
  toolName?: string;
  nodeIds: string[];
  data: Record<string, unknown>;
};

export type WorldMemoryCommit = {
  id: string;
  label: string;
  summary: string;
  at: string;
  scope: "machine" | "workspace" | "domain" | "run";
  tags: string[];
  data: Record<string, unknown>;
};

export type WorldPrediction = {
  id?: string;
  candidateId: string;
  score: number;
  heuristicScore?: number;
  adaptiveScore?: number;
  expectedOutcome: string;
  riskFactors: string[];
  requiredProof: string[];
  confidence: number;
  historicalSuccessRate?: number;
  freshnessPenalty?: number;
  contradictionPenalty?: number;
  proofBoost?: number;
  goalAlignment?: number;
  kind?: string;
  reason?: string;
  informedBy?: string[];
  evidenceIds?: string[];
  decisionFeatures?: Record<string, unknown>;
  preferred?: boolean;
};

export type WorldAttentionItem = {
  id: string;
  kind: "stale_belief" | "contradiction" | "blocked_goal" | "open_goal" | "uncertain_prediction";
  priority: number;
  summary: string;
  subjectId?: string;
  beliefId?: string;
  goalId?: string;
  episodeId?: string;
  updatedAt: string;
};

export type WorldExplanation = {
  claim: string;
  confidence: number;
  supportingBeliefs: Array<Pick<WorldBelief, "id" | "subjectId" | "kind" | "value" | "confidence" | "updatedAt">>;
  supportingEvents: Array<Pick<WorldEvent, "id" | "kind" | "at" | "summary">>;
  missingEvidence: string[];
  counterfactuals: string[];
};

export type WorldEvent = {
  id: string;
  kind: WorldEventKind;
  at: string;
  summary: string;
  runId?: string;
  subjectId?: string;
  payload: Record<string, unknown>;
};

export type WorldContextTier = "minimal" | "standard" | "full";

export type WorldRouteDecision = {
  id: string;
  at: string;
  runId?: string;
  candidateId: string;
  kind: string;
  task?: string;
  taskSpeedClass: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
  contextTier: WorldContextTier;
  toolFamily: string;
  featureKey: string;
  heuristicScore: number;
  adaptiveScore: number;
  finalScore: number;
  confidence: number;
  evidenceIds: string[];
  decisionFeatures: Record<string, unknown>;
};

export type WorldRouteOutcome = {
  id: string;
  at: string;
  decisionId?: string;
  runId?: string;
  routeKind: string;
  featureKey: string;
  toolFamily: string;
  outcome:
    | "success"
    | "blocked"
    | "fallback"
    | "verification_failure"
    | "focus_conflict"
    | "takeover_required"
    | "cancelled";
  advancedGoal: boolean;
  verificationStatus: "passed" | "failed" | "unknown";
  fallbackToRouteKind?: string;
  summary?: string;
};

export type WorldRouteStats = {
  routeKind: string;
  featureKey: string;
  attempts: number;
  successes: number;
  blocked: number;
  fallbacks: number;
  verificationFailures: number;
  focusConflicts: number;
  takeovers: number;
  cancels: number;
  successRate: number;
  historicalSuccessWeight: number;
  averageGoalAdvance: number;
  lastOutcomeAt?: string;
};

type WorldChange = {
  id: string;
  at: string;
  kind:
    | "snapshot_ingested"
    | "node_observed"
    | "edge_observed"
    | "tool_recorded"
    | "proof_recorded"
    | "memory_committed"
    | "routine_distilled"
    | "goal_recorded"
    | "belief_updated"
    | "episode_recorded";
  summary: string;
  runId?: string;
  nodeIds?: string[];
  edgeIds?: string[];
  proofId?: string;
  metadata?: Record<string, unknown>;
};

type WorldLiveState = {
  activeMachineRootId?: string;
  activeHomeRootPath?: string;
  knownDriveIds?: string[];
  activeWindowId?: string;
  activePageId?: string;
  activeWorkspaceId?: string;
  activeRepoId?: string;
  focusedWorkspaceId?: string;
  focusedRepoId?: string;
  activeTerminalSessionId?: string;
  focusLeaseActive?: boolean;
  browserMode?: string;
  lastRunId?: string;
  lastTask?: string;
  activeGoalIds?: string[];
};

type WorldModelFile = {
  version: 2;
  graphVersion: number;
  lastUpdatedAt: string;
  worldEvents: WorldEvent[];
  worldEntities: WorldEntity[];
  worldRelations: WorldRelation[];
  worldBeliefs: WorldBelief[];
  worldEpisodes: WorldEpisode[];
  worldGoals: WorldGoal[];
  worldRoutines: WorldRoutine[];
  worldProofs: WorldProof[];
  worldMemories: WorldMemoryCommit[];
  worldRouteDecisions: WorldRouteDecision[];
  worldRouteOutcomes: WorldRouteOutcome[];
  recentChanges: WorldChange[];
  liveState: WorldLiveState;
};

type LegacyWorldModelFile = {
  version?: number;
  graphVersion?: number;
  lastUpdatedAt?: string;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  routines?: WorldRoutine[];
  recentChanges?: WorldChange[];
  proofs?: WorldProof[];
  memoryCommits?: WorldMemoryCommit[];
  liveState?: Record<string, unknown>;
};

export type IngestSnapshotInput = {
  runId?: string;
  task?: string;
  workspaceRoot?: string;
  machineRootPath?: string;
  focusedWorkspaceRoot?: string;
  focusedRepoRoot?: string;
  desktopContext?: Record<string, unknown> | null;
  browserContext?: Record<string, unknown> | null;
  focusLease?: { surface?: string; source?: string; expiresAt?: string } | null;
};

export type RecordToolReceiptInput = {
  runId?: string;
  task?: string;
  workspaceRoot?: string;
  pendingToolCall: {
    toolCall: {
      id: string;
      name: string;
      arguments?: Record<string, unknown>;
      summary?: string;
    };
    step?: number;
  };
  toolResult: {
    name: string;
    ok: boolean;
    summary: string;
    data?: Record<string, unknown>;
    error?: string;
    createdAt?: string;
  };
};

export type RecordRouteDecisionInput = {
  runId?: string;
  task?: string;
  candidateId?: string;
  kind: string;
  taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
  contextTier?: WorldContextTier;
  toolFamily?: string;
  heuristicScore?: number;
  adaptiveScore?: number;
  finalScore?: number;
  confidence?: number;
  evidenceIds?: string[];
  decisionFeatures?: Record<string, unknown>;
};

export type RecordRouteOutcomeInput = {
  decisionId?: string;
  runId?: string;
  routeKind?: string;
  featureKey?: string;
  toolFamily?: string;
  outcome:
    | "success"
    | "blocked"
    | "fallback"
    | "verification_failure"
    | "focus_conflict"
    | "takeover_required"
    | "cancelled";
  advancedGoal?: boolean;
  verificationStatus?: "passed" | "failed" | "unknown";
  fallbackToRouteKind?: string;
  summary?: string;
};

export type WorldModelSummary = {
  graphVersion: number;
  nodeCount: number;
  edgeCount: number;
  routineCount: number;
  proofCount: number;
  memoryCommitCount: number;
  beliefCount: number;
  goalCount: number;
  episodeCount: number;
  activeContext: {
    machineRoot?: string;
    homeRootPath?: string;
    focusedWorkspace?: string;
    focusedRepo?: string;
    activeWindow?: string;
    activePage?: string;
    activeWorkspace?: string;
    activeRepo?: string;
    browserMode?: string;
    focusLeaseActive?: boolean;
    activeGoals: string[];
  };
  knownDrives: string[];
  affordanceSummary: {
    actionsAvailable: string[];
    backgroundSafe: string[];
    visibleRequired: string[];
    blocked: string[];
    highConfidence: string[];
  };
  recentChanges: WorldChange[];
  environmentFreshness: {
    lastUpdatedAt: string;
    stale: boolean;
  };
  machineRoutineIds: string[];
  routeRecommendations: WorldPrediction[];
  distilledBeliefs: Array<Pick<WorldBelief, "id" | "subjectId" | "kind" | "value" | "confidence" | "updatedAt" | "status">>;
  activeGoals: Array<Pick<WorldGoal, "id" | "title" | "status" | "progress" | "confidence" | "blockedReason" | "updatedAt">>;
  recentEpisodes: Array<Pick<WorldEpisode, "id" | "kind" | "label" | "status" | "updatedAt" | "summary">>;
  attentionQueue: WorldAttentionItem[];
  selectedContextTier?: WorldContextTier;
  routeModelVersion: number;
  routeStatsAvailable: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Number(value)));
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeLabel(value: unknown, fallback: string): string {
  const text = compactWhitespace(value);
  return text || fallback;
}

function normalizePath(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return path.resolve(raw);
  } catch {
    return raw;
  }
}

function toPathLabel(input: string | null | undefined, fallback: string): string {
  const normalized = String(input || "").replace(/[\\/]+$/, "");
  if (!normalized) return fallback;
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized || fallback;
}

function discoverDriveRoots(machineRootPath: string | null): string[] {
  const drives: string[] = [];
  const baseRoot = machineRootPath ? path.parse(machineRootPath).root : "";
  if (baseRoot) drives.push(baseRoot);
  if (process.platform === "win32") {
    for (const code of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const candidate = `${code}:\\`;
      if (candidate === baseRoot || existsSync(candidate)) drives.push(candidate);
    }
  }
  return uniqueStrings(drives.map((item) => normalizePath(item)));
}

function discoverKnownFolders(machineRootPath: string | null): Array<{ path: string; label: string }> {
  if (!machineRootPath) return [];
  const candidates = [
    { path: machineRootPath, label: "Machine home" },
    { path: path.join(machineRootPath, "Desktop"), label: "Desktop" },
    { path: path.join(machineRootPath, "Documents"), label: "Documents" },
    { path: path.join(machineRootPath, "Downloads"), label: "Downloads" },
    { path: path.join(machineRootPath, "Pictures"), label: "Pictures" },
  ];
  return candidates
    .map((item) => ({ path: normalizePath(item.path), label: item.label }))
    .filter((item): item is { path: string; label: string } => Boolean(item.path && existsSync(item.path)));
}

function normalizeUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  return raw || null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function getOrigin(urlValue: string | null): string | null {
  if (!urlValue) return null;
  try {
    return new URL(urlValue).origin;
  } catch {
    return null;
  }
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeComparable(item));
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeComparable((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function serializeComparable(value: unknown): string {
  return JSON.stringify(normalizeComparable(value));
}

function buildRoutineSlug(parts: string[]): string {
  return parts
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .slice(0, 5)
    .join("--");
}

function eventId(kind: string, seed: string): string {
  return `${kind}_${hashKey(seed)}`;
}

function sortByUpdatedAt<T extends { updatedAt?: string; at?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftAt = String(left.updatedAt || left.at || "");
    const rightAt = String(right.updatedAt || right.at || "");
    return rightAt.localeCompare(leftAt);
  });
}

const ROUTE_MODEL_VERSION = 2;

function normalizeTaskSpeedClass(value: unknown): "chat_only" | "simple_action" | "tool_heavy" | "deep_code" {
  return value === "simple_action" || value === "tool_heavy" || value === "deep_code" ? value : "chat_only";
}

function normalizeContextTier(value: unknown): WorldContextTier {
  return value === "minimal" || value === "full" ? value : "standard";
}

function isTerminalToolName(toolName: string): boolean {
  return toolName === "run_command" || toolName.startsWith("terminal_");
}

function inferToolFamily(toolName: string): string {
  if (isTerminalToolName(toolName)) return "terminal";
  if (toolName.startsWith("browser_")) return "browser";
  if (toolName.startsWith("desktop_")) return "desktop";
  if (toolName.startsWith("repo_")) return "repo";
  if (toolName.startsWith("binary_")) return "binary";
  if (toolName.startsWith("world_")) return "world";
  return "generic";
}

function defaultBeliefDecayHours(belief: Pick<WorldBelief, "provenance" | "proofBacked" | "kind">): number {
  if (belief.proofBacked || belief.provenance === "proof") return 48;
  if (belief.provenance === "tool_result") return 12;
  if (belief.provenance === "snapshot") return 4;
  if (belief.provenance === "manual") return 24;
  if (belief.kind.startsWith("route_confidence:")) return 16;
  return 2;
}

function capLength<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit));
}

function inferEpisodeKindFromTool(toolName: string): string {
  if (isTerminalToolName(toolName)) return "repo_validation";
  if (toolName.startsWith("browser_")) return "browser_workflow";
  if (toolName.startsWith("binary_")) return "binary_inspection";
  if (toolName.startsWith("desktop_")) return "desktop_workflow";
  if (toolName.startsWith("repo_")) return "repo_analysis";
  return "tool_flow";
}

function inferProofHints(toolName: string, workspaceRoot?: string, url?: string | null): string[] {
  const hints: string[] = [];
  if (isTerminalToolName(toolName)) hints.push("terminal validation output");
  if (toolName.startsWith("browser_")) hints.push("DOM snapshot or page capture");
  if (toolName.startsWith("binary_")) hints.push("before/after hash or binary receipt");
  if (workspaceRoot) hints.push(`workspace evidence for ${path.basename(workspaceRoot) || workspaceRoot}`);
  if (url) hints.push(`proof for ${getOrigin(url) || url}`);
  return uniqueStrings(hints).slice(0, 4);
}

function legacyLiveStateBeliefs(liveState: Record<string, unknown>): WorldBelief[] {
  const now = nowIso();
  const out: WorldBelief[] = [];
  const mappings: Array<{ key: keyof WorldLiveState; kind: string }> = [
    { key: "activeWorkspaceId", kind: "active_workspace" },
    { key: "activeRepoId", kind: "active_repo" },
    { key: "activeWindowId", kind: "active_window" },
    { key: "activePageId", kind: "active_page" },
    { key: "activeTerminalSessionId", kind: "active_terminal_session" },
  ];
  for (const mapping of mappings) {
    const value = typeof liveState[mapping.key] === "string" ? liveState[mapping.key] : "";
    if (!value) continue;
    out.push({
      id: `belief_${hashKey(`migration:${mapping.kind}:${value}`)}`,
      subjectId: "local-user-session",
      kind: mapping.kind,
      value,
      confidence: 0.72,
      evidenceIds: ["migration_bootstrap"],
      provenance: "snapshot",
      proofBacked: false,
      decayHours: 6,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}

export class MachineWorldModelService {
  private file: WorldModelFile;
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly storagePath: string) {
    this.file = this.buildEmpty();
  }

  private buildEmpty(): WorldModelFile {
    return {
      version: 2,
      graphVersion: 0,
      lastUpdatedAt: nowIso(),
      worldEvents: [],
      worldEntities: [],
      worldRelations: [],
      worldBeliefs: [],
      worldEpisodes: [],
      worldGoals: [],
      worldRoutines: [],
      worldProofs: [],
      worldMemories: [],
      worldRouteDecisions: [],
      worldRouteOutcomes: [],
      recentChanges: [],
      liveState: {},
    };
  }

  private async persist(): Promise<void> {
    this.file.lastUpdatedAt = nowIso();
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(this.file, null, 2), "utf8");
    });
    await this.writeChain;
  }

  private migrateLegacy(raw: LegacyWorldModelFile): WorldModelFile {
    const migrated = this.buildEmpty();
    const legacyNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const legacyEdges = Array.isArray(raw.edges) ? raw.edges : [];
    migrated.graphVersion = Number(raw.graphVersion || 0);
    migrated.lastUpdatedAt = String(raw.lastUpdatedAt || nowIso());
    migrated.worldEntities = legacyNodes.map((node) => ({
      id: String(node.id || `entity_${hashKey(JSON.stringify(node))}`),
      type: (String(node.type || "artifact") as WorldEntityType) || "artifact",
      key: String(node.key || node.id || `legacy:${hashKey(JSON.stringify(node))}`),
      label: String(node.label || node.key || node.id || "Legacy entity"),
      data: toObject(node.data) || {},
      confidence: Number(node.confidence || 0.65),
      createdAt: String(node.createdAt || migrated.lastUpdatedAt),
      updatedAt: String(node.updatedAt || migrated.lastUpdatedAt),
      ...(typeof node.lastObservedAt === "string" ? { lastObservedAt: node.lastObservedAt } : {}),
    }));
    migrated.worldRelations = legacyEdges.map((edge) => ({
      id: String(edge.id || `relation_${hashKey(JSON.stringify(edge))}`),
      type: (String(edge.type || "depends_on") as WorldRelationType) || "depends_on",
      from: String(edge.from || ""),
      to: String(edge.to || ""),
      data: toObject(edge.data) || {},
      weight: Number(edge.weight || 1),
      createdAt: String(edge.createdAt || migrated.lastUpdatedAt),
      updatedAt: String(edge.updatedAt || migrated.lastUpdatedAt),
      ...(typeof edge.lastObservedAt === "string" ? { lastObservedAt: edge.lastObservedAt } : {}),
    }));
    migrated.worldRoutines = Array.isArray(raw.routines) ? raw.routines : [];
    migrated.worldProofs = Array.isArray(raw.proofs) ? raw.proofs : [];
    migrated.worldMemories = Array.isArray(raw.memoryCommits) ? raw.memoryCommits : [];
    migrated.worldRouteDecisions = [];
    migrated.worldRouteOutcomes = [];
    migrated.recentChanges = Array.isArray(raw.recentChanges) ? raw.recentChanges : [];
    migrated.liveState = (toObject(raw.liveState) as WorldLiveState) || {};
    migrated.worldBeliefs = legacyLiveStateBeliefs(toObject(raw.liveState) || {});
    const bootstrapEvent: WorldEvent = {
      id: "migration_bootstrap",
      kind: "migration.bootstrap",
      at: migrated.lastUpdatedAt,
      summary: "Bootstrapped the v2 world model from the legacy snapshot graph.",
      payload: {
        snapshot: {
          worldEntities: migrated.worldEntities,
          worldRelations: migrated.worldRelations,
          worldBeliefs: migrated.worldBeliefs,
          worldEpisodes: [],
          worldGoals: [],
          worldRoutines: migrated.worldRoutines,
          worldProofs: migrated.worldProofs,
          worldMemories: migrated.worldMemories,
          recentChanges: migrated.recentChanges,
          liveState: migrated.liveState,
          graphVersion: migrated.graphVersion,
          lastUpdatedAt: migrated.lastUpdatedAt,
        },
      },
    };
    migrated.worldEvents = [bootstrapEvent];
    return migrated;
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.storagePath)) {
      await this.persist();
      return;
    }
    try {
      const raw = JSON.parse(await fs.readFile(this.storagePath, "utf8")) as Partial<WorldModelFile & LegacyWorldModelFile>;
      if (raw.version === 2 && Array.isArray(raw.worldEvents)) {
        this.file = {
          ...this.buildEmpty(),
          ...raw,
          version: 2,
          graphVersion: Number(raw.graphVersion || 0),
          worldEvents: Array.isArray(raw.worldEvents) ? (raw.worldEvents.filter((item) => item && typeof item === "object") as WorldEvent[]) : [],
          worldEntities: Array.isArray(raw.worldEntities) ? raw.worldEntities : [],
          worldRelations: Array.isArray(raw.worldRelations) ? raw.worldRelations : [],
          worldBeliefs: Array.isArray(raw.worldBeliefs) ? raw.worldBeliefs : [],
          worldEpisodes: Array.isArray(raw.worldEpisodes) ? raw.worldEpisodes : [],
          worldGoals: Array.isArray(raw.worldGoals) ? raw.worldGoals : [],
          worldRoutines: Array.isArray(raw.worldRoutines) ? raw.worldRoutines : [],
          worldProofs: Array.isArray(raw.worldProofs) ? raw.worldProofs : [],
          worldMemories: Array.isArray(raw.worldMemories) ? raw.worldMemories : [],
          worldRouteDecisions: Array.isArray(raw.worldRouteDecisions) ? (raw.worldRouteDecisions as WorldRouteDecision[]) : [],
          worldRouteOutcomes: Array.isArray(raw.worldRouteOutcomes) ? (raw.worldRouteOutcomes as WorldRouteOutcome[]) : [],
          recentChanges: Array.isArray(raw.recentChanges) ? raw.recentChanges : [],
          liveState: (toObject(raw.liveState) as WorldLiveState) || {},
        };
        if (this.file.worldEvents.length > 0) {
          await this.rebuildViewsFromEvents({ persist: false });
        }
      } else {
        this.file = this.migrateLegacy(raw as LegacyWorldModelFile);
      }
    } catch {
      this.file = this.buildEmpty();
    }
    await this.persist();
  }

  private touchGraph(): void {
    this.file.graphVersion += 1;
    this.file.lastUpdatedAt = nowIso();
  }

  private pushChange(change: WorldChange): void {
    this.file.recentChanges = [change, ...this.file.recentChanges.filter((item) => item.id !== change.id)].slice(0, 300);
  }

  private setLiveState(patch: Partial<WorldLiveState>): void {
    const hasExplicitActiveGoals = Object.prototype.hasOwnProperty.call(patch, "activeGoalIds");
    const nextActiveGoalIds = hasExplicitActiveGoals
      ? uniqueStrings(((patch.activeGoalIds || []) as string[]).map((item) => String(item)))
      : uniqueStrings(this.file.liveState.activeGoalIds || []);
    this.file.liveState = {
      ...this.file.liveState,
      ...patch,
      activeGoalIds: nextActiveGoalIds,
    };
  }

  private lookupLabel(entityId?: string): string | undefined {
    if (!entityId) return undefined;
    return this.file.worldEntities.find((entity) => entity.id === entityId)?.label;
  }

  private upsertEntity(input: {
    type: WorldEntityType;
    key: string;
    label: string;
    data?: Record<string, unknown>;
    confidence?: number;
    observedAt?: string;
  }): WorldEntity {
    const now = input.observedAt || nowIso();
    const existing = this.file.worldEntities.find((entity) => entity.type === input.type && entity.key === input.key);
    if (existing) {
      existing.label = input.label || existing.label;
      existing.data = { ...existing.data, ...(input.data || {}) };
      existing.confidence = Math.max(existing.confidence, Number(input.confidence || existing.confidence));
      existing.updatedAt = now;
      existing.lastObservedAt = now;
      return existing;
    }
    const created: WorldEntity = {
      id: `${input.type}_${hashKey(`${input.type}:${input.key}`)}`,
      type: input.type,
      key: input.key,
      label: input.label,
      data: input.data || {},
      confidence: Number(input.confidence || 0.7),
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };
    this.file.worldEntities.push(created);
    this.touchGraph();
    return created;
  }

  private upsertRelation(input: {
    type: WorldRelationType;
    from: string;
    to: string;
    data?: Record<string, unknown>;
    weight?: number;
    observedAt?: string;
  }): WorldRelation {
    const now = input.observedAt || nowIso();
    const existing = this.file.worldRelations.find(
      (relation) => relation.type === input.type && relation.from === input.from && relation.to === input.to
    );
    if (existing) {
      existing.data = { ...existing.data, ...(input.data || {}) };
      existing.weight = Math.max(existing.weight, Number(input.weight || existing.weight));
      existing.updatedAt = now;
      existing.lastObservedAt = now;
      return existing;
    }
    const created: WorldRelation = {
      id: `${input.type}_${hashKey(`${input.type}:${input.from}:${input.to}`)}`,
      type: input.type,
      from: input.from,
      to: input.to,
      data: input.data || {},
      weight: Number(input.weight || 1),
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };
    this.file.worldRelations.push(created);
    this.touchGraph();
    return created;
  }

  private upsertBelief(input: {
    subjectId: string;
    kind: string;
    value: unknown;
    confidence?: number;
    evidenceIds?: string[];
    provenance?: WorldBelief["provenance"];
    proofBacked?: boolean;
    decayHours?: number;
    expiresAt?: string;
    updatedAt?: string;
  }): WorldBelief {
    const updatedAt = input.updatedAt || nowIso();
    const confidence = clamp(Number(input.confidence || 0.6), 0.05, 0.99);
    const existing = this.file.worldBeliefs.find((belief) => belief.subjectId === input.subjectId && belief.kind === input.kind);
    if (!existing) {
      const created: WorldBelief = {
        id: `belief_${hashKey(`${input.subjectId}:${input.kind}`)}`,
        subjectId: input.subjectId,
        kind: input.kind,
        value: normalizeComparable(input.value),
        confidence,
        evidenceIds: uniqueStrings(input.evidenceIds || []),
        provenance: input.provenance || "derived",
        proofBacked: input.proofBacked === true,
        decayHours: Number(input.decayHours || defaultBeliefDecayHours({ kind: input.kind, provenance: input.provenance, proofBacked: input.proofBacked })),
        status: "active",
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        createdAt: updatedAt,
        updatedAt,
      };
      this.file.worldBeliefs.push(created);
      return created;
    }

    const currentValue = serializeComparable(existing.value);
    const nextValue = serializeComparable(input.value);
    existing.evidenceIds = uniqueStrings([...existing.evidenceIds, ...(input.evidenceIds || [])]);
    existing.updatedAt = updatedAt;
    existing.provenance = input.provenance || existing.provenance || "derived";
    existing.proofBacked = existing.proofBacked === true || input.proofBacked === true;
    existing.decayHours = Number(input.decayHours || existing.decayHours || defaultBeliefDecayHours(existing));
    if (input.expiresAt) existing.expiresAt = input.expiresAt;
    if (currentValue === nextValue) {
      existing.value = normalizeComparable(input.value);
      existing.confidence = clamp(Math.max(existing.confidence, confidence) + 0.04, 0.05, 0.99);
      existing.status = "active";
      return existing;
    }

    existing.value = normalizeComparable(input.value);
    existing.confidence = clamp(Math.min(existing.confidence, confidence) - (existing.proofBacked ? 0.18 : 0.12), 0.08, 0.92);
    existing.status = "contradicted";
    return existing;
  }

  private upsertEpisode(input: {
    id: string;
    kind: string;
    label: string;
    summary: string;
    status: "open" | "completed" | "blocked";
    entityIds?: string[];
    goalIds?: string[];
    evidenceIds?: string[];
    tags?: string[];
    successDelta?: number;
    failureDelta?: number;
    updatedAt?: string;
  }): WorldEpisode {
    const updatedAt = input.updatedAt || nowIso();
    const existing = this.file.worldEpisodes.find((episode) => episode.id === input.id);
    if (!existing) {
      const created: WorldEpisode = {
        id: input.id,
        kind: input.kind,
        label: input.label,
        summary: input.summary,
        status: input.status,
        entityIds: uniqueStrings(input.entityIds || []),
        goalIds: uniqueStrings(input.goalIds || []),
        evidenceIds: uniqueStrings(input.evidenceIds || []),
        tags: uniqueStrings(input.tags || []),
        successCount: Math.max(0, Number(input.successDelta || 0)),
        failureCount: Math.max(0, Number(input.failureDelta || 0)),
        createdAt: updatedAt,
        updatedAt,
        ...(input.status !== "open" ? { endedAt: updatedAt } : {}),
      };
      this.file.worldEpisodes.push(created);
      this.touchGraph();
      return created;
    }
    existing.label = input.label || existing.label;
    existing.summary = input.summary || existing.summary;
    existing.status = input.status;
    existing.entityIds = uniqueStrings([...existing.entityIds, ...(input.entityIds || [])]);
    existing.goalIds = uniqueStrings([...existing.goalIds, ...(input.goalIds || [])]);
    existing.evidenceIds = uniqueStrings([...existing.evidenceIds, ...(input.evidenceIds || [])]);
    existing.tags = uniqueStrings([...existing.tags, ...(input.tags || [])]);
    existing.successCount += Math.max(0, Number(input.successDelta || 0));
    existing.failureCount += Math.max(0, Number(input.failureDelta || 0));
    existing.updatedAt = updatedAt;
    if (input.status !== "open") existing.endedAt = updatedAt;
    return existing;
  }

  private upsertGoal(input: {
    id: string;
    title: string;
    summary: string;
    status: "open" | "in_progress" | "blocked" | "completed";
    progress?: number;
    confidence?: number;
    runId?: string;
    entityIds?: string[];
    evidenceIds?: string[];
    subgoals?: string[];
    blockedReason?: string;
    updatedAt?: string;
  }): WorldGoal {
    const updatedAt = input.updatedAt || nowIso();
    const existing = this.file.worldGoals.find((goal) => goal.id === input.id);
    if (!existing) {
      const created: WorldGoal = {
        id: input.id,
        title: input.title,
        summary: input.summary,
        status: input.status,
        progress: clamp(Number(input.progress || 0.1), 0, 1),
        confidence: clamp(Number(input.confidence || 0.62), 0.05, 0.99),
        ...(input.runId ? { runId: input.runId } : {}),
        entityIds: uniqueStrings(input.entityIds || []),
        evidenceIds: uniqueStrings(input.evidenceIds || []),
        subgoals: uniqueStrings(input.subgoals || []),
        ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
        createdAt: updatedAt,
        updatedAt,
        ...(input.status === "in_progress" || input.status === "completed" ? { lastProgressAt: updatedAt } : {}),
      };
      this.file.worldGoals.push(created);
      this.setLiveState({ activeGoalIds: [created.id] });
      this.touchGraph();
      return created;
    }
    existing.title = input.title || existing.title;
    existing.summary = input.summary || existing.summary;
    existing.status = input.status;
    existing.progress = clamp(Math.max(existing.progress, Number(input.progress ?? existing.progress)), 0, 1);
    existing.confidence = clamp(Math.max(existing.confidence, Number(input.confidence ?? existing.confidence)), 0.05, 0.99);
    existing.entityIds = uniqueStrings([...existing.entityIds, ...(input.entityIds || [])]);
    existing.evidenceIds = uniqueStrings([...existing.evidenceIds, ...(input.evidenceIds || [])]);
    existing.subgoals = uniqueStrings([...existing.subgoals, ...(input.subgoals || [])]);
    existing.updatedAt = updatedAt;
    if (input.status === "in_progress" || input.status === "completed") existing.lastProgressAt = updatedAt;
    if (input.blockedReason) existing.blockedReason = input.blockedReason;
    this.setLiveState({ activeGoalIds: [existing.id] });
    return existing;
  }

  private upsertRoutine(input: {
    slug: string;
    label: string;
    description: string;
    triggers: string[];
    steps: string[];
    seenAt: string;
  }): WorldRoutine {
    const existing = this.file.worldRoutines.find((routine) => routine.slug === input.slug);
    if (!existing) {
      const created: WorldRoutine = {
        id: `routine_${hashKey(input.slug)}`,
        slug: input.slug,
        label: input.label,
        description: input.description,
        triggers: uniqueStrings(input.triggers),
        steps: uniqueStrings(input.steps).slice(0, 8),
        confidence: 0.55,
        evidenceCount: 1,
        createdAt: input.seenAt,
        updatedAt: input.seenAt,
        lastSeenAt: input.seenAt,
      };
      this.file.worldRoutines.push(created);
      this.touchGraph();
      return created;
    }
    existing.label = input.label;
    existing.description = input.description;
    existing.triggers = uniqueStrings([...existing.triggers, ...input.triggers]);
    existing.steps = uniqueStrings([...existing.steps, ...input.steps]).slice(0, 8);
    existing.evidenceCount += 1;
    existing.confidence = clamp(existing.confidence + 0.08, 0.05, 0.98);
    existing.updatedAt = input.seenAt;
    existing.lastSeenAt = input.seenAt;
    return existing;
  }

  private upsertProof(input: WorldProof): WorldProof {
    const existing = this.file.worldProofs.find((proof) => proof.id === input.id);
    if (existing) return existing;
    this.file.worldProofs = [input, ...this.file.worldProofs].slice(0, 400);
    return input;
  }

  private upsertMemory(input: WorldMemoryCommit): WorldMemoryCommit {
    const existing = this.file.worldMemories.find((memory) => memory.id === input.id);
    if (existing) return existing;
    this.file.worldMemories = [input, ...this.file.worldMemories].slice(0, 400);
    return input;
  }

  private projectBootstrap(event: WorldEvent): void {
    const snapshot = toObject(event.payload.snapshot);
    if (!snapshot) return;
    this.file.graphVersion = Number(snapshot.graphVersion || 0);
    this.file.lastUpdatedAt = String(snapshot.lastUpdatedAt || event.at);
    this.file.worldEntities = Array.isArray(snapshot.worldEntities) ? (snapshot.worldEntities as WorldEntity[]) : [];
    this.file.worldRelations = Array.isArray(snapshot.worldRelations) ? (snapshot.worldRelations as WorldRelation[]) : [];
    this.file.worldBeliefs = Array.isArray(snapshot.worldBeliefs) ? (snapshot.worldBeliefs as WorldBelief[]) : [];
    this.file.worldEpisodes = Array.isArray(snapshot.worldEpisodes) ? (snapshot.worldEpisodes as WorldEpisode[]) : [];
    this.file.worldGoals = Array.isArray(snapshot.worldGoals) ? (snapshot.worldGoals as WorldGoal[]) : [];
    this.file.worldRoutines = Array.isArray(snapshot.worldRoutines) ? (snapshot.worldRoutines as WorldRoutine[]) : [];
    this.file.worldProofs = Array.isArray(snapshot.worldProofs) ? (snapshot.worldProofs as WorldProof[]) : [];
    this.file.worldMemories = Array.isArray(snapshot.worldMemories) ? (snapshot.worldMemories as WorldMemoryCommit[]) : [];
    this.file.worldRouteDecisions = Array.isArray(snapshot.worldRouteDecisions) ? (snapshot.worldRouteDecisions as WorldRouteDecision[]) : [];
    this.file.worldRouteOutcomes = Array.isArray(snapshot.worldRouteOutcomes) ? (snapshot.worldRouteOutcomes as WorldRouteOutcome[]) : [];
    this.file.recentChanges = Array.isArray(snapshot.recentChanges) ? (snapshot.recentChanges as WorldChange[]) : [];
    this.file.liveState = (toObject(snapshot.liveState) as WorldLiveState) || {};
  }

  private projectContextSnapshot(event: WorldEvent): void {
    const payload = event.payload;
    const observedAt = event.at;
    const nodeIds: string[] = [];
    const task = compactWhitespace(payload.task);
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    const focusLease = toObject(payload.focusLease);
    const sessionEntity = this.upsertEntity({
      type: "user_session",
      key: "local-user-session",
      label: "Local user session",
      data: {
        task: task || null,
        focusLeaseSurface: focusLease?.surface || null,
        focusLeaseSource: focusLease?.source || null,
      },
      confidence: 0.98,
      observedAt,
    });
    nodeIds.push(sessionEntity.id);
    this.setLiveState({
      focusLeaseActive: Boolean(focusLease),
      ...(runId ? { lastRunId: runId } : {}),
      ...(task ? { lastTask: task } : {}),
    });
    this.upsertBelief({
      subjectId: sessionEntity.id,
      kind: "active_task",
      value: task || null,
      confidence: task ? 0.8 : 0.45,
      evidenceIds: [event.id],
      provenance: "snapshot",
      proofBacked: false,
      decayHours: 1,
      expiresAt: new Date(new Date(observedAt).getTime() + 30 * 60_000).toISOString(),
      updatedAt: observedAt,
    });

    const machineRootPath = normalizePath(payload.machineRootPath) || normalizePath(payload.workspaceRoot);
    const focusedWorkspaceRoot = normalizePath(payload.focusedWorkspaceRoot) || normalizePath(payload.workspaceRoot);
    const focusedRepoRoot = normalizePath(payload.focusedRepoRoot) || focusedWorkspaceRoot;
    if (machineRootPath) {
      const machineRootEntity = this.upsertEntity({
        type: "machine_root",
        key: `machine_root:${machineRootPath}`,
        label: toPathLabel(machineRootPath, "Machine home"),
        data: { path: machineRootPath, homeRoot: true },
        confidence: 0.99,
        observedAt,
      });
      nodeIds.push(machineRootEntity.id);
      this.upsertRelation({ type: "active_in_session", from: machineRootEntity.id, to: sessionEntity.id, observedAt });
      const driveIds = discoverDriveRoots(machineRootPath).map((drivePath) => {
        const driveEntity = this.upsertEntity({
          type: "drive",
          key: `drive:${drivePath.toLowerCase()}`,
          label: drivePath,
          data: { path: drivePath },
          confidence: 0.94,
          observedAt,
        });
        nodeIds.push(driveEntity.id);
        this.upsertRelation({ type: "contains", from: driveEntity.id, to: machineRootEntity.id, observedAt });
        return driveEntity.id;
      });
      for (const folder of discoverKnownFolders(machineRootPath)) {
        const folderEntity = this.upsertEntity({
          type: "folder",
          key: `folder:${folder.path}`,
          label: folder.label,
          data: { path: folder.path },
          confidence: 0.9,
          observedAt,
        });
        nodeIds.push(folderEntity.id);
        this.upsertRelation({ type: "contains", from: machineRootEntity.id, to: folderEntity.id, observedAt });
      }
      this.setLiveState({
        activeMachineRootId: machineRootEntity.id,
        activeHomeRootPath: machineRootPath,
        knownDriveIds: driveIds,
      });
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "active_machine_root",
        value: machineRootEntity.id,
        confidence: 0.96,
        evidenceIds: [event.id],
        provenance: "snapshot",
        proofBacked: false,
        decayHours: 6,
        expiresAt: new Date(new Date(observedAt).getTime() + 60 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
    }

    const desktop = toObject(payload.desktopContext);
    if (desktop) {
      const platformLabel = safeLabel(desktop.platform, "Desktop");
      const deviceEntity = this.upsertEntity({
        type: "device",
        key: `device:${platformLabel}`,
        label: platformLabel,
        data: { platform: desktop.platform || null },
        confidence: 0.96,
        observedAt,
      });
      nodeIds.push(deviceEntity.id);
      this.upsertRelation({ type: "active_in_session", from: deviceEntity.id, to: sessionEntity.id, observedAt });
      const activeWindow = toObject(desktop.activeWindow);
      if (activeWindow) {
        const appName = safeLabel(activeWindow.app, "Unknown App");
        const appEntity = this.upsertEntity({
          type: "app",
          key: `app:${appName.toLowerCase()}`,
          label: appName,
          data: { aliases: [] },
          confidence: 0.85,
          observedAt,
        });
        const windowEntity = this.upsertEntity({
          type: "window",
          key: `window:${activeWindow.id || appName}:${activeWindow.title || "untitled"}`,
          label: safeLabel(activeWindow.title, appName),
          data: {
            app: appName,
            title: activeWindow.title || null,
            windowId: activeWindow.id || null,
          },
          confidence: 0.82,
          observedAt,
        });
        nodeIds.push(appEntity.id, windowEntity.id);
        this.upsertRelation({ type: "active_in_session", from: windowEntity.id, to: sessionEntity.id, observedAt });
        this.upsertRelation({ type: "launched_by", from: windowEntity.id, to: appEntity.id, observedAt });
        this.setLiveState({ activeWindowId: windowEntity.id });
        this.upsertBelief({
          subjectId: sessionEntity.id,
          kind: "active_window",
          value: windowEntity.id,
          confidence: 0.8,
          evidenceIds: [event.id],
          provenance: "snapshot",
          proofBacked: false,
          decayHours: 2,
          expiresAt: new Date(new Date(observedAt).getTime() + 20 * 60_000).toISOString(),
          updatedAt: observedAt,
        });
      }
    }

    const workspaceRoot = normalizePath(payload.workspaceRoot);
    if (workspaceRoot) {
      const workspaceEntity = this.upsertEntity({
        type: "workspace",
        key: workspaceRoot,
        label: path.basename(workspaceRoot) || workspaceRoot,
        data: { path: workspaceRoot },
        confidence: 0.95,
        observedAt,
      });
      const repoEntity = this.upsertEntity({
        type: "repo",
        key: workspaceRoot,
        label: path.basename(workspaceRoot) || workspaceRoot,
        data: { path: workspaceRoot },
        confidence: 0.93,
        observedAt,
      });
      this.upsertRelation({ type: "belongs_to_workspace", from: repoEntity.id, to: workspaceEntity.id, observedAt });
      this.upsertRelation({ type: "active_in_session", from: workspaceEntity.id, to: sessionEntity.id, observedAt });
      this.setLiveState({ activeWorkspaceId: workspaceEntity.id, activeRepoId: repoEntity.id });
      nodeIds.push(workspaceEntity.id, repoEntity.id);
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "active_workspace",
        value: workspaceEntity.id,
        confidence: 0.88,
        evidenceIds: [event.id],
        provenance: "snapshot",
        proofBacked: false,
        decayHours: 8,
        expiresAt: new Date(new Date(observedAt).getTime() + 45 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "active_repo",
        value: repoEntity.id,
        confidence: 0.86,
        evidenceIds: [event.id],
        provenance: "snapshot",
        proofBacked: false,
        decayHours: 8,
        expiresAt: new Date(new Date(observedAt).getTime() + 45 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
    }

    if (focusedWorkspaceRoot) {
      const focusedWorkspaceEntity = this.upsertEntity({
        type: "workspace",
        key: focusedWorkspaceRoot,
        label: path.basename(focusedWorkspaceRoot) || focusedWorkspaceRoot,
        data: { path: focusedWorkspaceRoot, focus: true },
        confidence: 0.95,
        observedAt,
      });
      nodeIds.push(focusedWorkspaceEntity.id);
      this.upsertRelation({ type: "active_in_session", from: focusedWorkspaceEntity.id, to: sessionEntity.id, observedAt });
      this.setLiveState({ focusedWorkspaceId: focusedWorkspaceEntity.id, activeWorkspaceId: focusedWorkspaceEntity.id });
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "focused_workspace",
        value: focusedWorkspaceEntity.id,
        confidence: 0.9,
        evidenceIds: [event.id],
        provenance: "snapshot",
        proofBacked: false,
        decayHours: 8,
        expiresAt: new Date(new Date(observedAt).getTime() + 60 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
    }

    if (focusedRepoRoot) {
      const focusedRepoEntity = this.upsertEntity({
        type: "repo",
        key: focusedRepoRoot,
        label: path.basename(focusedRepoRoot) || focusedRepoRoot,
        data: { path: focusedRepoRoot, focus: true },
        confidence: 0.94,
        observedAt,
      });
      nodeIds.push(focusedRepoEntity.id);
      this.upsertRelation({ type: "active_in_session", from: focusedRepoEntity.id, to: sessionEntity.id, observedAt });
      this.setLiveState({ focusedRepoId: focusedRepoEntity.id, activeRepoId: focusedRepoEntity.id });
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "focused_repo",
        value: focusedRepoEntity.id,
        confidence: 0.88,
        evidenceIds: [event.id],
        provenance: "snapshot",
        proofBacked: false,
        decayHours: 8,
        expiresAt: new Date(new Date(observedAt).getTime() + 60 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
    }

    const browser = toObject(payload.browserContext);
    if (browser) {
      const browserName = safeLabel(browser.browserName, "Browser");
      const browserEntity = this.upsertEntity({
        type: "browser",
        key: `browser:${browserName.toLowerCase()}`,
        label: browserName,
        data: { mode: browser.mode || null, sessionHint: toObject(browser.sessionHint) || null },
        confidence: 0.9,
        observedAt,
      });
      nodeIds.push(browserEntity.id);
      this.upsertRelation({ type: "active_in_session", from: browserEntity.id, to: sessionEntity.id, observedAt });
      this.setLiveState({ browserMode: String(browser.mode || "") || undefined });
      const pages = [
        ...toArray<Record<string, unknown>>(browser.openPages).slice(0, 12),
        ...toArray<Record<string, unknown>>(browser.activePage ? [browser.activePage] : []),
      ];
      for (const page of pages) {
        const url = normalizeUrl(page.url);
        const title = safeLabel(page.title, url || String(page.id || "Browser page"));
        const pageEntity = this.upsertEntity({
          type: "browser_page",
          key: `page:${page.id || url || title}`,
          label: title,
          data: {
            pageId: page.id || null,
            url,
            origin: page.origin || getOrigin(url),
            title,
          },
          confidence: 0.84,
          observedAt,
        });
        nodeIds.push(pageEntity.id);
        this.upsertRelation({ type: "active_in_session", from: pageEntity.id, to: browserEntity.id, observedAt });
        const origin = getOrigin(url);
        if (origin) {
          const domainEntity = this.upsertEntity({
            type: "web_domain",
            key: origin,
            label: origin,
            data: { origin },
            confidence: 0.8,
            observedAt,
          });
          nodeIds.push(domainEntity.id);
          this.upsertRelation({ type: "depends_on", from: pageEntity.id, to: domainEntity.id, observedAt });
        }
        if (browser.activePage && page.id === toObject(browser.activePage)?.id) {
          this.setLiveState({ activePageId: pageEntity.id });
          this.upsertBelief({
            subjectId: sessionEntity.id,
            kind: "active_page",
            value: pageEntity.id,
            confidence: 0.83,
            evidenceIds: [event.id],
            provenance: "snapshot",
            proofBacked: false,
            decayHours: 2,
            expiresAt: new Date(new Date(observedAt).getTime() + 20 * 60_000).toISOString(),
            updatedAt: observedAt,
          });
        }
      }
    }

    const goalId = task ? `goal_${hashKey(`${runId || "ambient"}:${task}`)}` : null;
    if (goalId) {
      this.upsertGoal({
        id: goalId,
        title: task,
        summary: `Active goal for ${task}`,
        status: "in_progress",
        progress: 0.08,
        confidence: 0.66,
        ...(runId ? { runId } : {}),
        entityIds: uniqueStrings(nodeIds),
        evidenceIds: [event.id],
        updatedAt: observedAt,
      });
      this.upsertBelief({
        subjectId: sessionEntity.id,
        kind: "active_goal",
        value: goalId,
        confidence: 0.76,
        evidenceIds: [event.id],
        provenance: "derived",
        proofBacked: false,
        decayHours: 12,
        updatedAt: observedAt,
      });
    }

    this.upsertEpisode({
      id: `episode_${hashKey(`context:${runId || "ambient"}:${workspaceRoot || "machine"}`)}`,
      kind: "context_snapshot",
      label: task || "Ambient machine context",
      summary: task ? `Observed context for ${task}` : "Observed current machine context",
      status: "open",
      entityIds: uniqueStrings(nodeIds),
      goalIds: goalId ? [goalId] : [],
      evidenceIds: [event.id],
      tags: uniqueStrings([browser ? "browser" : null, workspaceRoot ? "workspace" : null, desktop ? "desktop" : null]),
      updatedAt: observedAt,
    });

    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "snapshot_ingested",
      summary: event.summary,
      ...(runId ? { runId } : {}),
      nodeIds: uniqueStrings(nodeIds),
      metadata: {
        workspaceRoot: workspaceRoot || null,
        browserMode: this.file.liveState.browserMode || null,
      },
    });
  }

  private projectToolExecuted(event: WorldEvent): void {
    const payload = event.payload;
    const toolName = String(payload.toolName || "tool");
    const toolResult = toObject(payload.toolResult) || {};
    const data = toObject(toolResult.data) || {};
    const proof = toObject(data.proof);
    const observedAt = event.at;
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    const ok = toolResult.ok === true;
    const nodeIds: string[] = [];

    const toolEntity = this.upsertEntity({
      type: isTerminalToolName(toolName) ? "command" : "artifact",
      key: `${toolName}:${String(payload.toolCallId || event.id)}`,
      label: toolName,
      data: {
        args: toObject(payload.arguments) || {},
        summary: toolResult.summary || event.summary,
        ok,
      },
      confidence: ok ? 0.88 : 0.4,
      observedAt,
    });
    nodeIds.push(toolEntity.id);

    const terminalState = toObject(data.terminalState);
    if (terminalState) {
      const cwd = normalizePath(terminalState.cwd) || normalizePath(terminalState.projectRoot) || "terminal";
      const terminalEntity = this.upsertEntity({
        type: "terminal_session",
        key: `terminal:${cwd}`,
        label: path.basename(cwd) || cwd,
        data: {
          cwd: terminalState.cwd || null,
          projectRoot: terminalState.projectRoot || null,
          stack: terminalState.stack || null,
          lastCommand: terminalState.lastCommand || null,
          lastCommandOutcome: terminalState.lastCommandOutcome || null,
        },
        confidence: 0.82,
        observedAt,
      });
      nodeIds.push(terminalEntity.id);
      this.upsertRelation({ type: "verified_by", from: terminalEntity.id, to: toolEntity.id, observedAt });
      this.setLiveState({ activeTerminalSessionId: terminalEntity.id });
      this.upsertBelief({
        subjectId: "local-user-session",
        kind: "active_terminal_session",
        value: terminalEntity.id,
        confidence: 0.8,
        evidenceIds: [event.id],
        expiresAt: new Date(new Date(observedAt).getTime() + 30 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
      const projectRoot = normalizePath(terminalState.projectRoot);
      if (projectRoot) {
        const repoEntity = this.upsertEntity({
          type: "repo",
          key: projectRoot,
          label: path.basename(projectRoot) || projectRoot,
          data: { path: projectRoot },
          confidence: 0.9,
          observedAt,
        });
        nodeIds.push(repoEntity.id);
        this.upsertRelation({ type: "belongs_to_workspace", from: terminalEntity.id, to: repoEntity.id, observedAt });
      }
      if (ok && typeof terminalState.lastCommand === "string" && terminalState.lastCommand.trim()) {
        const slug = buildRoutineSlug(["terminal", String(terminalState.stack || "generic"), terminalState.lastCommand]);
        this.upsertRoutine({
          slug,
          label: `Terminal flow: ${String(terminalState.lastCommand).trim().slice(0, 48)}`,
          description: `Binary successfully used the terminal for ${String(terminalState.lastCommand).trim()}.`,
          triggers: [String(terminalState.stack || "generic"), cwd],
          steps: [String(terminalState.lastCommand).trim()],
          seenAt: observedAt,
        });
      }
    }

    const url = normalizeUrl(data.url);
    if (url) {
      const title = safeLabel(data.title, url);
      const pageEntity = this.upsertEntity({
        type: "browser_page",
        key: `page:${data.pageId || url}`,
        label: title,
        data: {
          pageId: data.pageId || null,
          url,
          title,
        },
        confidence: 0.82,
        observedAt,
      });
      nodeIds.push(pageEntity.id);
      this.upsertRelation({ type: "verified_by", from: pageEntity.id, to: toolEntity.id, observedAt });
      this.setLiveState({ activePageId: pageEntity.id });
      this.upsertBelief({
        subjectId: "local-user-session",
        kind: "active_page",
        value: pageEntity.id,
        confidence: 0.8,
        evidenceIds: [event.id],
        provenance: proof ? "proof" : "tool_result",
        proofBacked: Boolean(proof),
        decayHours: proof ? 24 : 6,
        expiresAt: new Date(new Date(observedAt).getTime() + 20 * 60_000).toISOString(),
        updatedAt: observedAt,
      });
      const origin = getOrigin(url);
      if (origin) {
        const domainEntity = this.upsertEntity({
          type: "web_domain",
          key: origin,
          label: origin,
          data: { origin },
          confidence: 0.78,
          observedAt,
        });
        nodeIds.push(domainEntity.id);
        this.upsertRelation({ type: "recently_used_with", from: toolEntity.id, to: domainEntity.id, observedAt });
      }
      if (ok) {
        const slug = buildRoutineSlug(["browser", getOrigin(url) || url, toolName]);
        this.upsertRoutine({
          slug,
          label: `Browser flow: ${getOrigin(url) || url}`,
          description: `Binary successfully used ${toolName} on ${getOrigin(url) || url}.`,
          triggers: uniqueStrings([getOrigin(url), toolName]),
          steps: uniqueStrings([title, toolName]),
          seenAt: observedAt,
        });
      }
    }
    if (proof) {
      const worldProof: WorldProof = {
        id: `proof_${hashKey(event.id)}`,
        label: safeLabel(proof.title, `${toolName} proof`),
        summary: compactWhitespace(toolResult.summary || proof.title || toolName),
        at: observedAt,
        ...(runId ? { runId } : {}),
        toolName,
        nodeIds: uniqueStrings(nodeIds),
        data: {
          ...proof,
          toolName,
        },
      };
      this.upsertProof(worldProof);
    }

    const activeGoalIds = uniqueStrings(this.file.liveState.activeGoalIds || []);
    const goalIds: string[] = [];
    for (const goalId of activeGoalIds) {
      const goal = this.file.worldGoals.find((item) => item.id === goalId);
      if (!goal) continue;
      goalIds.push(goal.id);
      if (ok) {
        this.upsertGoal({
          id: goal.id,
          title: goal.title,
          summary: goal.summary,
          status: "in_progress",
          progress: clamp(goal.progress + 0.18, 0, 1),
          confidence: clamp(goal.confidence + 0.06, 0.05, 0.99),
          ...(goal.runId ? { runId: goal.runId } : {}),
          entityIds: uniqueStrings([...goal.entityIds, ...nodeIds]),
          evidenceIds: uniqueStrings([...goal.evidenceIds, event.id]),
          subgoals: goal.subgoals,
          updatedAt: observedAt,
        });
      } else {
        this.upsertGoal({
          id: goal.id,
          title: goal.title,
          summary: goal.summary,
          status: "blocked",
          progress: goal.progress,
          confidence: clamp(goal.confidence - 0.08, 0.05, 0.99),
          ...(goal.runId ? { runId: goal.runId } : {}),
          entityIds: uniqueStrings([...goal.entityIds, ...nodeIds]),
          evidenceIds: uniqueStrings([...goal.evidenceIds, event.id]),
          subgoals: goal.subgoals,
          blockedReason: compactWhitespace(toolResult.summary || toolResult.error || event.summary),
          updatedAt: observedAt,
        });
      }
    }

    const episodeKind = inferEpisodeKindFromTool(toolName);
    this.upsertEpisode({
      id: `episode_${hashKey(`${episodeKind}:${runId || "ambient"}:${toolName}`)}`,
      kind: episodeKind,
      label: `${episodeKind.replace(/_/g, " ")}: ${toolName}`,
      summary: compactWhitespace(toolResult.summary || event.summary),
      status: ok ? "completed" : "blocked",
      entityIds: uniqueStrings(nodeIds),
      goalIds,
      evidenceIds: [event.id],
      tags: uniqueStrings([toolName, ok ? "success" : "failure"]),
      successDelta: ok ? 1 : 0,
      failureDelta: ok ? 0 : 1,
      updatedAt: observedAt,
    });

    this.upsertBelief({
      subjectId: "local-user-session",
      kind: `route_confidence:${episodeKind}`,
      value: {
        lastTool: toolName,
        ok,
      },
      confidence: ok ? 0.78 : 0.42,
      evidenceIds: [event.id],
      provenance: proof ? "proof" : "tool_result",
      proofBacked: Boolean(proof),
      decayHours: proof ? 36 : 18,
      expiresAt: new Date(new Date(observedAt).getTime() + 60 * 60_000).toISOString(),
      updatedAt: observedAt,
    });

    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "tool_recorded",
      summary: event.summary,
      ...(runId ? { runId } : {}),
      nodeIds: uniqueStrings(nodeIds),
      metadata: {
        toolName,
        ok,
      },
    });
  }

  private projectProofRecorded(event: WorldEvent): void {
    const payload = event.payload;
    const proof: WorldProof = {
      id: String(payload.id || `proof_${hashKey(event.id)}`),
      label: safeLabel(payload.label, "Proof"),
      summary: safeLabel(payload.summary, "Recorded proof"),
      at: event.at,
      ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
      ...(typeof payload.toolName === "string" ? { toolName: payload.toolName } : {}),
      nodeIds: Array.isArray(payload.nodeIds) ? payload.nodeIds.map((item) => String(item)) : [],
      data: toObject(payload.data) || {},
    };
    this.upsertProof(proof);
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "proof_recorded",
      summary: proof.summary,
      ...(proof.runId ? { runId: proof.runId } : {}),
      nodeIds: proof.nodeIds,
      proofId: proof.id,
    });
  }

  private projectMemoryCommitted(event: WorldEvent): void {
    const payload = event.payload;
    const commit: WorldMemoryCommit = {
      id: String(payload.id || `memory_${hashKey(event.id)}`),
      label: safeLabel(payload.label, "Memory"),
      summary: safeLabel(payload.summary, "Committed memory"),
      at: event.at,
      scope:
        payload.scope === "workspace" || payload.scope === "domain" || payload.scope === "run" || payload.scope === "machine"
          ? payload.scope
          : "machine",
      tags: Array.isArray(payload.tags) ? payload.tags.map((item) => String(item)) : [],
      data: toObject(payload.data) || {},
    };
    this.upsertMemory(commit);
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "memory_committed",
      summary: commit.summary,
      metadata: {
        scope: commit.scope,
        tags: commit.tags,
      },
    });
  }

  private projectGoalOpened(event: WorldEvent): void {
    const payload = event.payload;
    const goal = this.upsertGoal({
      id: String(payload.id || `goal_${hashKey(`${payload.runId || "ambient"}:${payload.title || payload.label || event.summary}`)}`),
      title: safeLabel(payload.title || payload.label, "Goal"),
      summary: safeLabel(payload.summary, event.summary),
      status: "open",
      progress: Number(payload.progress || 0.05),
      confidence: Number(payload.confidence || 0.62),
      ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
      entityIds: Array.isArray(payload.entityIds) ? payload.entityIds.map((item) => String(item)) : [],
      evidenceIds: [event.id],
      subgoals: Array.isArray(payload.subgoals) ? payload.subgoals.map((item) => String(item)) : [],
      updatedAt: event.at,
    });
    this.upsertBelief({
      subjectId: "local-user-session",
      kind: "active_goal",
      value: goal.id,
      confidence: 0.78,
      evidenceIds: [event.id],
      provenance: "derived",
      proofBacked: false,
      decayHours: 12,
      updatedAt: event.at,
    });
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "goal_recorded",
      summary: event.summary,
      ...(goal.runId ? { runId: goal.runId } : {}),
      nodeIds: [goal.id],
    });
  }

  private projectGoalProgressed(event: WorldEvent): void {
    const payload = event.payload;
    const goalId = String(payload.id || "").trim();
    const goal = this.file.worldGoals.find((item) => item.id === goalId);
    if (!goal) return;
    this.upsertGoal({
      id: goal.id,
      title: goal.title,
      summary: safeLabel(payload.summary, goal.summary),
      status: payload.status === "completed" ? "completed" : "in_progress",
      progress: Number(payload.progress || goal.progress + 0.2),
      confidence: Number(payload.confidence || goal.confidence + 0.04),
      ...(goal.runId ? { runId: goal.runId } : {}),
      entityIds: Array.isArray(payload.entityIds) ? payload.entityIds.map((item) => String(item)) : goal.entityIds,
      evidenceIds: uniqueStrings([...goal.evidenceIds, event.id]),
      subgoals: goal.subgoals,
      updatedAt: event.at,
    });
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "goal_recorded",
      summary: event.summary,
      ...(goal.runId ? { runId: goal.runId } : {}),
      nodeIds: [goal.id],
    });
  }

  private projectGoalBlocked(event: WorldEvent): void {
    const payload = event.payload;
    const goalId = String(payload.id || "").trim();
    const goal = this.file.worldGoals.find((item) => item.id === goalId);
    if (!goal) return;
    this.upsertGoal({
      id: goal.id,
      title: goal.title,
      summary: goal.summary,
      status: "blocked",
      progress: goal.progress,
      confidence: clamp(goal.confidence - 0.08, 0.05, 0.99),
      ...(goal.runId ? { runId: goal.runId } : {}),
      entityIds: goal.entityIds,
      evidenceIds: uniqueStrings([...goal.evidenceIds, event.id]),
      subgoals: goal.subgoals,
      blockedReason: safeLabel(payload.blockedReason || payload.summary, "Goal is blocked"),
      updatedAt: event.at,
    });
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "goal_recorded",
      summary: event.summary,
      ...(goal.runId ? { runId: goal.runId } : {}),
      nodeIds: [goal.id],
    });
  }

  private projectGoalCompleted(event: WorldEvent): void {
    const payload = event.payload;
    const goalId = String(payload.id || "").trim();
    const goal = this.file.worldGoals.find((item) => item.id === goalId);
    if (!goal) return;
    this.upsertGoal({
      id: goal.id,
      title: goal.title,
      summary: goal.summary,
      status: "completed",
      progress: 1,
      confidence: clamp(goal.confidence + 0.1, 0.05, 0.99),
      ...(goal.runId ? { runId: goal.runId } : {}),
      entityIds: goal.entityIds,
      evidenceIds: uniqueStrings([...goal.evidenceIds, event.id]),
      subgoals: goal.subgoals,
      updatedAt: event.at,
    });
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "goal_recorded",
      summary: event.summary,
      ...(goal.runId ? { runId: goal.runId } : {}),
      nodeIds: [goal.id],
    });
  }

  private projectFocusChanged(event: WorldEvent): void {
    const payload = event.payload;
    this.setLiveState({
      focusLeaseActive: payload.focusLeaseActive === true,
    });
    this.upsertBelief({
      subjectId: "local-user-session",
      kind: "focus_state",
      value: {
        focusLeaseActive: payload.focusLeaseActive === true,
        source: payload.source || null,
      },
      confidence: 0.8,
      evidenceIds: [event.id],
      provenance: "snapshot",
      proofBacked: false,
      decayHours: 2,
      expiresAt: new Date(new Date(event.at).getTime() + 15 * 60_000).toISOString(),
      updatedAt: event.at,
    });
  }

  private projectBeliefExpired(event: WorldEvent): void {
    const beliefId = String(event.payload.beliefId || "").trim();
    const belief = this.file.worldBeliefs.find((item) => item.id === beliefId);
    if (!belief) return;
    belief.status = "expired";
    belief.updatedAt = event.at;
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "belief_updated",
      summary: event.summary,
      nodeIds: [belief.subjectId],
      metadata: {
        beliefId,
        kind: belief.kind,
      },
    });
  }

  private projectEpisodeClosed(event: WorldEvent): void {
    const episodeId = String(event.payload.episodeId || "").trim();
    const episode = this.file.worldEpisodes.find((item) => item.id === episodeId);
    if (!episode) return;
    episode.status = event.payload.status === "blocked" ? "blocked" : "completed";
    episode.endedAt = event.at;
    episode.updatedAt = event.at;
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "episode_recorded",
      summary: event.summary,
      nodeIds: [episode.id],
    });
  }

  private projectRouteDecision(event: WorldEvent): void {
    const payload = event.payload;
    const decision: WorldRouteDecision = {
      id: String(payload.id || `route_decision_${hashKey(event.id)}`),
      at: event.at,
      ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
      candidateId: safeLabel(payload.candidateId, "route"),
      kind: safeLabel(payload.kind, "route"),
      ...(typeof payload.task === "string" ? { task: payload.task } : {}),
      taskSpeedClass: normalizeTaskSpeedClass(payload.taskSpeedClass),
      contextTier: normalizeContextTier(payload.contextTier),
      toolFamily: typeof payload.toolFamily === "string" ? payload.toolFamily : "generic",
      featureKey: safeLabel(payload.featureKey, `feature:${safeLabel(payload.kind, "route")}`),
      heuristicScore: clamp(Number(payload.heuristicScore || 0.5), 0.05, 1.5),
      adaptiveScore: clamp(Number(payload.adaptiveScore || 0), -0.5, 0.5),
      finalScore: clamp(Number(payload.finalScore || payload.score || 0.5), 0.05, 1.5),
      confidence: clamp(Number(payload.confidence || 0.5), 0.05, 0.99),
      evidenceIds: Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map((item) => String(item)) : [],
      decisionFeatures: toObject(payload.decisionFeatures) || {},
    };
    this.file.worldRouteDecisions = [
      decision,
      ...this.file.worldRouteDecisions.filter((item) => item.id !== decision.id),
    ].slice(0, 500);
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "belief_updated",
      summary: `Recorded route decision for ${decision.kind}.`,
      ...(decision.runId ? { runId: decision.runId } : {}),
      metadata: {
        routeKind: decision.kind,
        featureKey: decision.featureKey,
        contextTier: decision.contextTier,
      },
    });
  }

  private projectRouteOutcome(event: WorldEvent): void {
    const payload = event.payload;
    const outcome: WorldRouteOutcome = {
      id: String(payload.id || `route_outcome_${hashKey(event.id)}`),
      at: event.at,
      ...(typeof payload.decisionId === "string" ? { decisionId: payload.decisionId } : {}),
      ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
      routeKind: safeLabel(payload.routeKind, "route"),
      featureKey: safeLabel(payload.featureKey, `feature:${safeLabel(payload.routeKind, "route")}`),
      toolFamily: typeof payload.toolFamily === "string" ? payload.toolFamily : "generic",
      outcome:
        payload.outcome === "success" ||
        payload.outcome === "blocked" ||
        payload.outcome === "fallback" ||
        payload.outcome === "verification_failure" ||
        payload.outcome === "focus_conflict" ||
        payload.outcome === "takeover_required" ||
        payload.outcome === "cancelled"
          ? payload.outcome
          : "blocked",
      advancedGoal: payload.advancedGoal === true,
      verificationStatus:
        payload.verificationStatus === "passed" || payload.verificationStatus === "failed" ? payload.verificationStatus : "unknown",
      ...(typeof payload.fallbackToRouteKind === "string" ? { fallbackToRouteKind: payload.fallbackToRouteKind } : {}),
      ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    };
    this.file.worldRouteOutcomes = [
      outcome,
      ...this.file.worldRouteOutcomes.filter((item) => item.id !== outcome.id),
    ].slice(0, 1000);
    this.pushChange({
      id: event.id,
      at: event.at,
      kind: "belief_updated",
      summary: `Recorded ${outcome.outcome} outcome for ${outcome.routeKind}.`,
      ...(outcome.runId ? { runId: outcome.runId } : {}),
      metadata: {
        routeKind: outcome.routeKind,
        featureKey: outcome.featureKey,
        outcome: outcome.outcome,
      },
    });
  }

  private applyEvent(event: WorldEvent): void {
    switch (event.kind) {
      case "migration.bootstrap":
        this.projectBootstrap(event);
        break;
      case "context.snapshot":
        this.projectContextSnapshot(event);
        break;
      case "tool.executed":
        this.projectToolExecuted(event);
        break;
      case "proof.recorded":
        this.projectProofRecorded(event);
        break;
      case "route.decision":
        this.projectRouteDecision(event);
        break;
      case "route.outcome":
        this.projectRouteOutcome(event);
        break;
      case "memory.committed":
        this.projectMemoryCommitted(event);
        break;
      case "goal.opened":
        this.projectGoalOpened(event);
        break;
      case "goal.progressed":
        this.projectGoalProgressed(event);
        break;
      case "goal.blocked":
        this.projectGoalBlocked(event);
        break;
      case "goal.completed":
        this.projectGoalCompleted(event);
        break;
      case "focus.changed":
        this.projectFocusChanged(event);
        break;
      case "belief.expired":
        this.projectBeliefExpired(event);
        break;
      case "episode.closed":
        this.projectEpisodeClosed(event);
        break;
      default:
        break;
    }
  }

  private async appendEvent(input: Omit<WorldEvent, "id" | "at"> & { id?: string; at?: string }): Promise<WorldEvent> {
    await this.initialize();
    const event: WorldEvent = {
      id: input.id || eventId(input.kind, `${input.kind}:${input.runId || "local"}:${input.subjectId || ""}:${input.summary}:${this.file.worldEvents.length}`),
      at: input.at || nowIso(),
      kind: input.kind,
      summary: input.summary,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      payload: input.payload || {},
    };
    this.file.worldEvents.push(event);
    this.applyEvent(event);
    await this.persist();
    return event;
  }

  private async expireBeliefsIfNeeded(): Promise<void> {
    await this.initialize();
    const now = Date.now();
    let changed = false;
    for (const belief of this.file.worldBeliefs) {
      if (belief.status === "expired") continue;
      const decayHours = Number(belief.decayHours || defaultBeliefDecayHours(belief));
      const ageMs = now - new Date(belief.updatedAt).getTime();
      if (!belief.expiresAt && Number.isFinite(ageMs)) {
        if (ageMs >= decayHours * 2 * 60 * 60_000) {
          belief.status = "expired";
          belief.confidence = clamp(belief.confidence - 0.22, 0.05, 0.99);
          changed = true;
          continue;
        }
        if (ageMs >= decayHours * 60 * 60_000 && belief.status === "active") {
          belief.status = "stale";
          belief.confidence = clamp(belief.confidence - (belief.proofBacked ? 0.06 : 0.12), 0.05, 0.99);
          changed = true;
        }
      }
    }
    const expiredBeliefs = this.file.worldBeliefs.filter(
      (belief) => belief.status !== "expired" && belief.expiresAt && new Date(belief.expiresAt).getTime() <= now
    );
    for (const belief of expiredBeliefs) {
      await this.appendEvent({
        id: `belief_expired_${belief.id}`,
        kind: "belief.expired",
        summary: `Belief ${belief.kind} expired.`,
        subjectId: belief.subjectId,
        payload: {
          beliefId: belief.id,
        },
      });
    }
    if (changed) {
      await this.persist();
    }
  }

  async rebuildViewsFromEvents(options?: { persist?: boolean }): Promise<void> {
    await this.initialize();
    const events = [...this.file.worldEvents];
    this.file = this.buildEmpty();
    this.file.worldEvents = events;
    for (const event of events) {
      this.applyEvent(event);
    }
    this.file.lastUpdatedAt = events[events.length - 1]?.at || nowIso();
    if (options?.persist !== false) {
      await this.persist();
    }
  }

  async ingestSnapshot(input: IngestSnapshotInput): Promise<WorldModelSummary> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    await this.appendEvent({
      kind: "context.snapshot",
      summary: safeLabel(input.task || input.workspaceRoot || "Updated machine context snapshot", "Updated machine context snapshot"),
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload: {
        runId: input.runId || null,
        task: input.task || null,
        workspaceRoot: normalizePath(input.workspaceRoot) || input.workspaceRoot || null,
        machineRootPath: normalizePath(input.machineRootPath) || input.machineRootPath || null,
        focusedWorkspaceRoot: normalizePath(input.focusedWorkspaceRoot) || input.focusedWorkspaceRoot || null,
        focusedRepoRoot: normalizePath(input.focusedRepoRoot) || input.focusedRepoRoot || null,
        desktopContext: input.desktopContext || null,
        browserContext: input.browserContext || null,
        focusLease: input.focusLease || null,
      },
    });
    if (input.focusLease) {
      await this.appendEvent({
        kind: "focus.changed",
        summary: `Focus lease is active on ${safeLabel(input.focusLease.surface, "desktop")}.`,
        ...(input.runId ? { runId: input.runId } : {}),
        subjectId: "local-user-session",
        payload: {
          focusLeaseActive: true,
          source: input.focusLease.source || null,
          surface: input.focusLease.surface || null,
          expiresAt: input.focusLease.expiresAt || null,
        },
      });
    }
    if (input.task) {
      const existingGoal = this.file.worldGoals.find(
        (goal) =>
          goal.status !== "completed" &&
          ((input.runId && goal.runId === input.runId) || normalizeComparable(goal.title) === normalizeComparable(input.task))
      );
      if (!existingGoal) {
        await this.registerGoal({
          title: input.task,
          summary: `Understand and complete: ${input.task}`,
          ...(input.runId ? { runId: input.runId } : {}),
          progress: 0.08,
        });
      }
    }
    return this.getSummary();
  }

  async recordToolReceipt(input: RecordToolReceiptInput): Promise<{ event: WorldEvent; proof?: WorldProof; goal?: WorldGoal | null }> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const payload = {
      runId: input.runId || null,
      task: input.task || null,
      workspaceRoot: normalizePath(input.workspaceRoot) || input.workspaceRoot || null,
      toolCallId: input.pendingToolCall.toolCall.id,
      toolName: input.toolResult.name || input.pendingToolCall.toolCall.name,
      arguments: input.pendingToolCall.toolCall.arguments || {},
      step: input.pendingToolCall.step || null,
      toolResult: {
        name: input.toolResult.name,
        ok: input.toolResult.ok,
        summary: input.toolResult.summary,
        data: input.toolResult.data || {},
        error: input.toolResult.error || null,
        createdAt: input.toolResult.createdAt || nowIso(),
      },
    };
    const event = await this.appendEvent({
      kind: "tool.executed",
      summary: input.toolResult.summary || `Tool ${payload.toolName} executed.`,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload,
    });

    let proof: WorldProof | undefined;
    const proofData = toObject(input.toolResult.data)?.proof;
    if (proofData && typeof proofData === "object") {
      proof = await this.recordProof({
        label: safeLabel((proofData as Record<string, unknown>).title || (proofData as Record<string, unknown>).label, input.toolResult.name),
        summary: input.toolResult.summary,
        ...(input.runId ? { runId: input.runId } : {}),
        toolName: payload.toolName,
        nodeIds: [],
        data: {
          ...(toObject(proofData) || {}),
          proofHints: inferProofHints(payload.toolName, input.workspaceRoot, normalizeUrl((input.toolResult.data || {}).url)),
        },
      });
    }

    const activeGoal =
      this.file.worldGoals.find((goal) => input.runId && goal.runId === input.runId && goal.status !== "completed") ||
      this.file.worldGoals.find((goal) => goal.status === "open" || goal.status === "in_progress") ||
      null;
    if (activeGoal) {
      if (input.toolResult.ok) {
        await this.appendEvent({
          kind: activeGoal.progress >= 0.78 ? "goal.completed" : "goal.progressed",
          summary: input.toolResult.summary || `Progressed goal ${activeGoal.title}.`,
          ...(input.runId ? { runId: input.runId } : {}),
          subjectId: activeGoal.id,
          payload: {
            id: activeGoal.id,
            summary: input.toolResult.summary,
            progress: clamp(activeGoal.progress + 0.28, 0, 1),
            confidence: clamp(activeGoal.confidence + 0.05, 0.05, 0.99),
          },
        });
      } else {
        await this.appendEvent({
          kind: "goal.blocked",
          summary: input.toolResult.summary || `Blocked goal ${activeGoal.title}.`,
          ...(input.runId ? { runId: input.runId } : {}),
          subjectId: activeGoal.id,
          payload: {
            id: activeGoal.id,
            blockedReason: input.toolResult.error || input.toolResult.summary,
            summary: input.toolResult.summary,
          },
        });
      }
    }

    return {
      event,
      ...(proof ? { proof } : {}),
      goal: activeGoal ? this.file.worldGoals.find((goal) => goal.id === activeGoal.id) || activeGoal : null,
    };
  }

  async recordObservation(input: {
    label: string;
    summary: string;
    runId?: string;
    data?: Record<string, unknown>;
  }): Promise<{ event: WorldEvent; belief: WorldBelief }> {
    await this.initialize();
    const data = input.data || {};
    const subjectId = "local-user-session";
    const event = await this.appendEvent({
      kind: "context.snapshot",
      summary: input.summary,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId,
      payload: {
        runId: input.runId || null,
        task: input.summary,
        desktopContext: null,
        browserContext: null,
        focusLease: null,
        observation: {
          label: input.label,
          data,
        },
      },
    });
    const belief = this.upsertBelief({
      subjectId,
      kind: `observation:${buildRoutineSlug([input.label]) || "generic"}`,
      value: data,
      confidence: 0.62,
      evidenceIds: [event.id],
      provenance: "manual",
      proofBacked: false,
      decayHours: 24,
      updatedAt: event.at,
    });
    await this.persist();
    return { event, belief };
  }

  async recordProof(input: {
    label: string;
    summary: string;
    runId?: string;
    toolName?: string;
    nodeIds?: string[];
    data?: Record<string, unknown>;
  }): Promise<WorldProof> {
    await this.initialize();
    const id = `proof_${hashKey(`${input.label}:${input.runId || "local"}:${serializeComparable(input.data || {})}`)}`;
    await this.appendEvent({
      id: `proof_event_${id}`,
      kind: "proof.recorded",
      summary: input.summary,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload: {
        id,
        label: input.label,
        summary: input.summary,
        runId: input.runId || null,
        toolName: input.toolName || null,
        nodeIds: Array.isArray(input.nodeIds) ? input.nodeIds.map((item) => String(item)) : [],
        data: input.data || {},
      },
    });
    return this.file.worldProofs.find((proof) => proof.id === id) || {
      id,
      label: input.label,
      summary: input.summary,
      at: nowIso(),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      nodeIds: Array.isArray(input.nodeIds) ? input.nodeIds.map((item) => String(item)) : [],
      data: input.data || {},
    };
  }

  async commitMemory(input: {
    label: string;
    summary: string;
    scope: "machine" | "workspace" | "domain" | "run";
    tags?: string[];
    data?: Record<string, unknown>;
  }): Promise<WorldMemoryCommit> {
    await this.initialize();
    const id = `memory_${hashKey(`${input.scope}:${input.label}:${serializeComparable(input.data || {})}`)}`;
    await this.appendEvent({
      id: `memory_event_${id}`,
      kind: "memory.committed",
      summary: input.summary,
      subjectId: "local-user-session",
      payload: {
        id,
        label: input.label,
        summary: input.summary,
        scope: input.scope,
        tags: input.tags || [],
        data: input.data || {},
      },
    });
    return this.file.worldMemories.find((memory) => memory.id === id) || {
      id,
      label: input.label,
      summary: input.summary,
      at: nowIso(),
      scope: input.scope,
      tags: input.tags || [],
      data: input.data || {},
    };
  }

  async registerGoal(input: {
    title: string;
    summary?: string;
    runId?: string;
    entityIds?: string[];
    progress?: number;
    confidence?: number;
    subgoals?: string[];
  }): Promise<WorldGoal> {
    await this.initialize();
    const id = `goal_${hashKey(`${input.runId || "ambient"}:${input.title}`)}`;
    await this.appendEvent({
      id: `goal_open_${id}`,
      kind: "goal.opened",
      summary: input.summary || `Registered goal: ${input.title}`,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload: {
        id,
        title: input.title,
        summary: input.summary || input.title,
        ...(input.runId ? { runId: input.runId } : {}),
        entityIds: input.entityIds || [],
        progress: input.progress ?? 0.08,
        confidence: input.confidence ?? 0.62,
        subgoals: input.subgoals || [],
      },
    });
    return this.file.worldGoals.find((goal) => goal.id === id) as WorldGoal;
  }

  async getBeliefs(options?: {
    subjectId?: string;
    kind?: string;
    status?: WorldBelief["status"];
    limit?: number;
  }): Promise<WorldBelief[]> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const limit = clamp(Number(options?.limit || 24), 1, 200);
    return sortByUpdatedAt(
      this.file.worldBeliefs.filter((belief) => {
        if (options?.subjectId && belief.subjectId !== options.subjectId) return false;
        if (options?.kind && belief.kind !== options.kind) return false;
        if (options?.status && belief.status !== options.status) return false;
        return true;
      })
    ).slice(0, limit);
  }

  async getGoals(options?: {
    status?: WorldGoal["status"];
    runId?: string;
    limit?: number;
  }): Promise<WorldGoal[]> {
    await this.initialize();
    const limit = clamp(Number(options?.limit || 24), 1, 200);
    return sortByUpdatedAt(
      this.file.worldGoals.filter((goal) => {
        if (options?.status && goal.status !== options.status) return false;
        if (options?.runId && goal.runId !== options.runId) return false;
        return true;
      })
    ).slice(0, limit);
  }

  async queryEpisodes(options?: {
    query?: string;
    kind?: string;
    status?: WorldEpisode["status"];
    limit?: number;
  }): Promise<WorldEpisode[]> {
    await this.initialize();
    const query = compactWhitespace(options?.query).toLowerCase();
    const limit = clamp(Number(options?.limit || 16), 1, 100);
    return sortByUpdatedAt(
      this.file.worldEpisodes.filter((episode) => {
        if (options?.kind && episode.kind !== options.kind) return false;
        if (options?.status && episode.status !== options.status) return false;
        if (!query) return true;
        return `${episode.label} ${episode.summary} ${episode.tags.join(" ")}`.toLowerCase().includes(query);
      })
    ).slice(0, limit);
  }

  private inferAffordances(): {
    actionsAvailable: string[];
    backgroundSafe: string[];
    visibleRequired: string[];
    blocked: string[];
    highConfidence: string[];
  } {
    const actionsAvailable: string[] = [];
    const backgroundSafe: string[] = ["world_query", "memory_commit"];
    const visibleRequired: string[] = [];
    const blocked: string[] = [];
    const highConfidence: string[] = [];

    if (this.file.liveState.activeWorkspaceId || this.file.liveState.activeRepoId) {
      actionsAvailable.push("terminal", "repo_context");
      backgroundSafe.push("terminal", "repo_context");
      highConfidence.push("terminal");
    }
    if (this.file.liveState.activePageId) {
      actionsAvailable.push("browser_native", "browser_context");
      backgroundSafe.push("browser_native");
      highConfidence.push("browser_native");
    }
    if (this.file.liveState.activeWindowId) {
      actionsAvailable.push("visible_desktop");
      visibleRequired.push("visible_desktop");
    }
    if (this.file.liveState.focusLeaseActive) {
      blocked.push("visible_foreground_activation");
    }
    const contradictedBeliefs = this.file.worldBeliefs.filter((belief) => belief.status === "contradicted");
    if (contradictedBeliefs.length > 0) {
      blocked.push("ambiguous_machine_state");
    }

    return {
      actionsAvailable: uniqueStrings(actionsAvailable),
      backgroundSafe: uniqueStrings(backgroundSafe),
      visibleRequired: uniqueStrings(visibleRequired),
      blocked: uniqueStrings(blocked),
      highConfidence: uniqueStrings(highConfidence),
    };
  }

  private getAttentionQueueInternal(limit = 12): WorldAttentionItem[] {
    const items: WorldAttentionItem[] = [];
    for (const belief of this.file.worldBeliefs) {
      if (belief.status === "contradicted") {
        items.push({
          id: `attention_${belief.id}`,
          kind: "contradiction",
          priority: 0.95,
          summary: `Belief ${belief.kind} is contradicted for ${this.lookupLabel(belief.subjectId) || belief.subjectId}.`,
          subjectId: belief.subjectId,
          beliefId: belief.id,
          updatedAt: belief.updatedAt,
        });
      } else if (belief.status === "expired" || belief.status === "stale") {
        items.push({
          id: `attention_${belief.id}`,
          kind: "stale_belief",
          priority: 0.72,
          summary: `Belief ${belief.kind} needs refresh.`,
          subjectId: belief.subjectId,
          beliefId: belief.id,
          updatedAt: belief.updatedAt,
        });
      }
    }
    for (const goal of this.file.worldGoals) {
      if (goal.status === "blocked") {
        items.push({
          id: `attention_goal_${goal.id}`,
          kind: "blocked_goal",
          priority: 0.92,
          summary: goal.blockedReason ? `${goal.title} is blocked: ${goal.blockedReason}` : `${goal.title} is blocked.`,
          goalId: goal.id,
          subjectId: goal.id,
          updatedAt: goal.updatedAt,
        });
      } else if (goal.status !== "completed") {
        items.push({
          id: `attention_goal_${goal.id}`,
          kind: "open_goal",
          priority: clamp(0.45 + (1 - goal.progress) * 0.4, 0.1, 0.9),
          summary: `${goal.title} remains active (${Math.round(goal.progress * 100)}%).`,
          goalId: goal.id,
          subjectId: goal.id,
          updatedAt: goal.updatedAt,
        });
      }
    }
    return items
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, limit);
  }

  async getAttentionQueue(options?: { limit?: number }): Promise<WorldAttentionItem[]> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    return this.getAttentionQueueInternal(clamp(Number(options?.limit || 12), 1, 100));
  }

  private getRouteRelevantBeliefs(kind: string): WorldBelief[] {
    const routeKind = safeLabel(kind, "route");
    const beliefWeight = (belief: WorldBelief): number => {
      let score = belief.proofBacked ? 4 : 0;
      score += belief.status === "contradicted" ? 3 : belief.status === "stale" ? 1 : 0;
      if (routeKind === "browser_native" && ["active_page", "focus_state"].includes(belief.kind)) score += 5;
      if (routeKind === "terminal" && ["active_workspace", "active_repo", "focused_repo"].includes(belief.kind)) score += 5;
      if (routeKind === "repo_context" && ["active_repo", "focused_repo", "focused_workspace"].includes(belief.kind)) score += 5;
      if (routeKind === "visible_desktop" && ["active_window", "focus_state"].includes(belief.kind)) score += 5;
      if (belief.kind.startsWith("route_confidence:")) {
        if (
          (routeKind === "browser_native" && belief.kind.includes("browser_workflow")) ||
          (routeKind === "terminal" && belief.kind.includes("repo_validation")) ||
          (routeKind === "visible_desktop" && belief.kind.includes("desktop_workflow")) ||
          (routeKind === "repo_context" && belief.kind.includes("repo_analysis"))
        ) {
          score += 6;
        }
      }
      return score;
    };
    return sortByUpdatedAt(this.file.worldBeliefs)
      .filter((belief) => belief.status !== "expired")
      .sort((left, right) => beliefWeight(right) - beliefWeight(left))
      .slice(0, 6);
  }

  private getRouteRelevantEvents(kind: string): WorldEvent[] {
    const routeKind = safeLabel(kind, "route");
    const scoreEvent = (event: WorldEvent): number => {
      const payload = toObject(event.payload) || {};
      const toolName = String(payload.toolName || "");
      let score = event.kind === "route.decision" || event.kind === "route.outcome" ? 4 : 0;
      if (routeKind === "browser_native" && toolName.startsWith("browser_")) score += 6;
      if (routeKind === "terminal" && isTerminalToolName(toolName)) score += 6;
      if (routeKind === "repo_context" && toolName.startsWith("repo_")) score += 6;
      if (routeKind === "visible_desktop" && toolName.startsWith("desktop_")) score += 6;
      if (event.kind === "focus.changed" && routeKind === "visible_desktop") score += 5;
      if (event.kind === "proof.recorded") score += 2;
      if (event.kind === "context.snapshot") score += 1;
      return score;
    };
    return [...this.file.worldEvents]
      .reverse()
      .sort((left, right) => scoreEvent(right) - scoreEvent(left))
      .slice(0, 8);
  }

  private buildRouteFeatureVector(input: {
    kind: string;
    task?: string;
    taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    toolFamily?: string;
    contextTier?: WorldContextTier;
  }): Record<string, unknown> {
    const kind = safeLabel(input.kind, "route");
    const contradictedBeliefs = this.file.worldBeliefs.filter((belief) => belief.status === "contradicted");
    const staleBeliefs = this.file.worldBeliefs.filter((belief) => belief.status === "stale" || belief.status === "expired");
    const blockedGoals = this.file.worldGoals.filter((goal) => goal.status === "blocked");
    const task = compactWhitespace(input.task).toLowerCase();
    const taskIntent =
      task.includes("browser") || task.includes("page") || task.includes("site")
        ? "browser"
        : task.includes("window") || task.includes("app") || task.includes("desktop")
          ? "desktop"
          : task.includes("repo") || task.includes("file") || task.includes("workspace") || task.includes("code")
            ? "repo"
            : task.includes("terminal") || task.includes("command")
              ? "terminal"
              : task.includes("verify") || task.includes("test")
                ? "verification"
                : "general";
    return {
      routeKind: kind,
      taskIntent,
      taskSpeedClass: normalizeTaskSpeedClass(input.taskSpeedClass),
      contextTier: normalizeContextTier(input.contextTier),
      toolFamily: input.toolFamily || "generic",
      hasWorkspaceContext: Boolean(this.file.liveState.activeWorkspaceId),
      hasRepoContext: Boolean(this.file.liveState.activeRepoId),
      hasBrowserContext: Boolean(this.file.liveState.activePageId),
      hasVisibleWindow: Boolean(this.file.liveState.activeWindowId),
      focusLeaseActive: Boolean(this.file.liveState.focusLeaseActive),
      contradictionCount: contradictedBeliefs.length,
      staleBeliefCount: staleBeliefs.length,
      blockedGoalCount: blockedGoals.length,
      proofCount: this.file.worldProofs.length,
      routineCount: this.file.worldRoutines.length,
      environmentStale: Date.now() - new Date(this.file.lastUpdatedAt).getTime() > 20 * 60_000,
    };
  }

  private featureKeyForRoute(features: Record<string, unknown>): string {
    return serializeComparable({
      routeKind: features.routeKind,
      taskIntent: features.taskIntent,
      taskSpeedClass: features.taskSpeedClass,
      contextTier: features.contextTier,
      toolFamily: features.toolFamily,
      hasWorkspaceContext: features.hasWorkspaceContext,
      hasRepoContext: features.hasRepoContext,
      hasBrowserContext: features.hasBrowserContext,
      hasVisibleWindow: features.hasVisibleWindow,
      focusLeaseActive: features.focusLeaseActive,
    });
  }

  private getRouteStatsInternal(input?: { kind?: string; featureKey?: string; limit?: number }): WorldRouteStats[] {
    const filtered = this.file.worldRouteOutcomes.filter((outcome) => {
      if (input?.kind && outcome.routeKind !== input.kind) return false;
      if (input?.featureKey && outcome.featureKey !== input.featureKey) return false;
      return true;
    });
    const grouped = new Map<string, WorldRouteStats>();
    for (const outcome of filtered) {
      const key = `${outcome.routeKind}::${outcome.featureKey}`;
      const existing =
        grouped.get(key) ||
        ({
          routeKind: outcome.routeKind,
          featureKey: outcome.featureKey,
          attempts: 0,
          successes: 0,
          blocked: 0,
          fallbacks: 0,
          verificationFailures: 0,
          focusConflicts: 0,
          takeovers: 0,
          cancels: 0,
          successRate: 0,
          historicalSuccessWeight: 0,
          averageGoalAdvance: 0,
        } satisfies WorldRouteStats);
      existing.attempts += 1;
      if (outcome.outcome === "success") existing.successes += 1;
      if (outcome.outcome === "blocked") existing.blocked += 1;
      if (outcome.outcome === "fallback") existing.fallbacks += 1;
      if (outcome.outcome === "verification_failure") existing.verificationFailures += 1;
      if (outcome.outcome === "focus_conflict") existing.focusConflicts += 1;
      if (outcome.outcome === "takeover_required") existing.takeovers += 1;
      if (outcome.outcome === "cancelled") existing.cancels += 1;
      existing.averageGoalAdvance += outcome.advancedGoal ? 1 : 0;
      if (!existing.lastOutcomeAt || outcome.at > existing.lastOutcomeAt) existing.lastOutcomeAt = outcome.at;
      grouped.set(key, existing);
    }
    return [...grouped.values()]
      .map((item) => ({
        ...item,
        successRate: item.attempts > 0 ? item.successes / item.attempts : 0,
        historicalSuccessWeight: item.attempts > 0 ? (item.successes - item.blocked - item.verificationFailures - item.focusConflicts) / item.attempts : 0,
        averageGoalAdvance: item.attempts > 0 ? item.averageGoalAdvance / item.attempts : 0,
      }))
      .sort((left, right) => {
        if (right.historicalSuccessWeight !== left.historicalSuccessWeight) return right.historicalSuccessWeight - left.historicalSuccessWeight;
        return (right.lastOutcomeAt || "").localeCompare(left.lastOutcomeAt || "");
      })
      .slice(0, clamp(Number(input?.limit || 12), 1, 100));
  }

  async predictOutcomes(input?: {
    candidates?: Array<{
      id?: string;
      candidateId?: string;
      kind?: string;
      steps?: string[];
      requiresVisibleInteraction?: boolean;
      confidence?: number;
    }>;
    limit?: number;
    task?: string;
    taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    contextTier?: WorldContextTier;
    toolFamily?: string;
  }): Promise<WorldPrediction[]> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const affordances = this.inferAffordances();
    const contradictedBeliefs = this.file.worldBeliefs.filter((belief) => belief.status === "contradicted");
    const staleBeliefs = this.file.worldBeliefs.filter((belief) => belief.status === "stale" || belief.status === "expired");
    const liveActiveGoalIds = uniqueStrings(this.file.liveState.activeGoalIds || []);
    const activeGoals = liveActiveGoalIds
      .map((goalId) => this.file.worldGoals.find((goal) => goal.id === goalId))
      .filter((goal): goal is WorldGoal => Boolean(goal && goal.status !== "completed"));
    const openGoals =
      activeGoals.length > 0
        ? activeGoals
        : this.file.worldGoals
            .filter((goal) => goal.status !== "completed")
            .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    const blockedGoals = openGoals.filter((goal) => goal.status === "blocked");
    const defaultCandidates: Array<{
      id?: string;
      candidateId?: string;
      kind?: string;
      steps?: string[];
      requiresVisibleInteraction?: boolean;
      confidence?: number;
    }> = uniqueStrings([
      this.file.liveState.activePageId ? "browser_native" : null,
      this.file.liveState.activeWorkspaceId || this.file.liveState.activeTerminalSessionId ? "terminal" : null,
      this.file.liveState.activeWindowId ? "visible_desktop" : null,
      this.file.liveState.activeRepoId ? "repo_context" : null,
    ]).map((kind) => ({ id: kind, kind, confidence: kind === "browser_native" ? 0.82 : 0.72 }));

    const candidates = (input?.candidates && input.candidates.length ? input.candidates : defaultCandidates).map((candidate, index) => {
      const kind = safeLabel(candidate.kind || candidate.id || candidate.candidateId, "route");
      const id = String(candidate.candidateId || candidate.id || `${kind}_${index}`);
      const features = this.buildRouteFeatureVector({
        kind,
        task: input?.task,
        taskSpeedClass: input?.taskSpeedClass,
        toolFamily: input?.toolFamily || (candidate.steps?.[0] ? inferToolFamily(candidate.steps[0]) : "generic"),
        contextTier: input?.contextTier,
      });
      const featureKey = this.featureKeyForRoute(features);
      const stats = this.getRouteStatsInternal({ kind, featureKey, limit: 1 })[0];
      const proofRelevant = this.getRouteRelevantBeliefs(kind).filter((belief) => belief.proofBacked).length;
      const proofBoost = Math.min(0.16, proofRelevant * 0.03);
      const freshnessPenalty = staleBeliefs.length > 0 ? Math.min(0.12, staleBeliefs.length * 0.03) : 0;
      const contradictionPenalty = contradictedBeliefs.length > 0 ? Math.min(0.22, contradictedBeliefs.length * 0.08) : 0;
      const goalAlignment =
        openGoals.length === 0
          ? 0.03
          : openGoals.some((goal) => {
                const goalText = `${goal.title} ${goal.summary}`.toLowerCase();
                return (
                  (kind === "browser_native" && goalText.includes("browser")) ||
                  (kind === "terminal" && (goalText.includes("terminal") || goalText.includes("command") || goalText.includes("repo"))) ||
                  (kind === "repo_context" && (goalText.includes("repo") || goalText.includes("workspace"))) ||
                  (kind === "visible_desktop" && (goalText.includes("desktop") || goalText.includes("window") || goalText.includes("app")))
                );
              })
            ? 0.12
            : 0.02;
      let heuristicScore = clamp(Number(candidate.confidence ?? 0.62), 0.05, 0.99);
      const riskFactors: string[] = [];
      const requiredProof: string[] = [];

      if (kind === "browser_native" && affordances.actionsAvailable.includes("browser_native")) heuristicScore += 0.18;
      if (kind === "terminal") heuristicScore += affordances.backgroundSafe.includes("terminal") ? 0.16 : 0.08;
      if (kind === "repo_context" && affordances.backgroundSafe.includes("repo_context")) heuristicScore += 0.12;
      if (kind === "visible_desktop" && affordances.visibleRequired.includes("visible_desktop")) heuristicScore += 0.04;
      if (kind === "visible_desktop") {
        heuristicScore -= 0.1;
        riskFactors.push("visible interaction is harder to replay and verify");
      }

      if (candidate.requiresVisibleInteraction || kind === "visible_desktop") {
        requiredProof.push("visible UI confirmation");
        if (this.file.liveState.focusLeaseActive) {
          heuristicScore -= 0.22;
          riskFactors.push("focus lease may block visible interaction");
        }
      }

      if (contradictedBeliefs.length > 0) riskFactors.push("contradicted beliefs reduce certainty");
      if (blockedGoals.length > 0) {
        heuristicScore -= 0.08;
        riskFactors.push("an active goal is blocked");
      }

      const routineBoost = Math.min(
        0.1,
        this.file.worldRoutines.filter((routine) => {
          const text = `${routine.label} ${routine.description} ${routine.triggers.join(" ")} ${routine.steps.join(" ")}`.toLowerCase();
          return (
            (kind === "browser_native" && text.includes("browser flow")) ||
            (kind === "terminal" && text.includes("terminal flow")) ||
            (kind === "visible_desktop" && text.includes("desktop")) ||
            (kind === "repo_context" && text.includes("repo"))
          );
        }).length * 0.02
      );
      const adaptiveScore = stats ? clamp(stats.historicalSuccessWeight * 0.18 + stats.averageGoalAdvance * 0.08, -0.24, 0.24) : 0;
      if ((stats?.attempts || 0) > 0 && (stats?.successRate || 0) < 0.45) {
        riskFactors.push("similar route history has recently underperformed");
      }
      const score = clamp(
        heuristicScore + adaptiveScore + proofBoost + goalAlignment + routineBoost - freshnessPenalty - contradictionPenalty,
        0.05,
        1.25
      );
      const confidence = clamp(score - riskFactors.length * 0.03, 0.05, 0.99);
      const relevantBeliefs = this.getRouteRelevantBeliefs(kind);
      const evidenceIds = uniqueStrings([
        ...relevantBeliefs.map((belief) => belief.id),
        ...this.getRouteRelevantEvents(kind)
          .filter((event) => event.kind === "proof.recorded" || event.kind === "tool.executed" || event.kind === "context.snapshot")
          .map((event) => event.id),
      ]);
      return {
        id,
        candidateId: id,
        kind,
        score,
        heuristicScore,
        adaptiveScore,
        expectedOutcome:
          kind === "browser_native"
            ? "Likely to continue the browser task with native page context."
            : kind === "terminal"
              ? "Likely to make progress through background-safe repo or terminal work."
              : kind === "visible_desktop"
                ? "May require foreground focus and explicit UI confirmation."
                : "May advance the current goal if supporting context is still valid.",
        riskFactors: uniqueStrings(riskFactors),
        requiredProof: uniqueStrings(requiredProof),
        confidence,
        historicalSuccessRate: stats?.successRate || 0,
        freshnessPenalty,
        contradictionPenalty,
        proofBoost,
        goalAlignment,
        reason: openGoals[0]?.title ? `Best aligned with active goal ${openGoals[0].title}.` : "Ranked from current machine beliefs and affordances.",
        informedBy: uniqueStrings([
          ...relevantBeliefs.slice(0, 4).map((belief) => belief.id),
          ...openGoals.slice(0, 2).map((goal) => goal.id),
        ]),
        evidenceIds,
        decisionFeatures: {
          ...features,
          featureKey,
          historicalSuccessWeight: stats?.historicalSuccessWeight || 0,
          routineBoost,
        },
      } satisfies WorldPrediction;
    });

    const sorted = [...candidates]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.confidence - left.confidence;
      })
      .slice(0, clamp(Number(input?.limit || 6), 1, 24))
      .map((prediction, index) => ({
        ...prediction,
        preferred: index === 0,
      }));
    return sorted;
  }

  async explainRoute(input: { candidateId?: string; claim?: string; kind?: string }): Promise<WorldExplanation> {
    await this.initialize();
    const predictions = await this.predictOutcomes({
      candidates: input.kind || input.candidateId ? [{ id: input.candidateId || input.kind, kind: input.kind || input.candidateId }] : undefined,
      limit: 1,
    });
    const prediction = predictions[0];
    const routeKind = prediction?.kind || input.kind || input.candidateId || "route";
    const supportingBeliefs = this.getRouteRelevantBeliefs(routeKind).map((belief) => ({
        id: belief.id,
        subjectId: belief.subjectId,
        kind: belief.kind,
        value: belief.value,
        confidence: belief.confidence,
        updatedAt: belief.updatedAt,
      }));
    const supportingEvents = this.getRouteRelevantEvents(routeKind).map((event) => ({
        id: event.id,
        kind: event.kind,
        at: event.at,
        summary: event.summary,
      }));
    return {
      claim:
        input.claim ||
        (prediction ? `Why ${prediction.kind || prediction.candidateId} is currently preferred.` : "Why the current route ranking looks the way it does."),
      confidence: prediction?.confidence || 0.54,
      supportingBeliefs,
      supportingEvents,
      missingEvidence: uniqueStrings([
        prediction?.requiredProof[0] || null,
        routeKind === "browser_native" && !this.file.liveState.activePageId ? "Refresh the active browser page before committing to browser_native." : null,
        routeKind === "visible_desktop" && !this.file.liveState.activeWindowId ? "Verify the active foreground window before choosing visible_desktop." : null,
        routeKind === "terminal" && !this.file.liveState.activeWorkspaceId ? "Refresh the workspace or terminal context before choosing terminal." : null,
        this.file.worldBeliefs.some((belief) => belief.status === "contradicted")
          ? "Resolve contradicted beliefs before committing to a high-impact route."
          : null,
      ]),
      counterfactuals: uniqueStrings([
        this.file.liveState.focusLeaseActive ? "If the focus lease cleared, visible_desktop routes would score higher." : null,
        this.file.liveState.activePageId ? "If the active browser page disappeared, browser-native routes would lose their advantage." : null,
        this.file.liveState.activeWorkspaceId ? "If the workspace context became stale, terminal and repo-context routes would lose confidence." : null,
      ]),
    };
  }

  async getSummary(): Promise<WorldModelSummary> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const activeContext = await this.getActiveContext();
    const affordanceSummary = this.inferAffordances();
    const routeRecommendations = await this.predictOutcomes({ limit: 6, contextTier: "standard" });
    const recentChanges = await this.getRecentChanges(12);
    const distilledBeliefs = (await this.getBeliefs({ limit: 8 })).map((belief) => ({
      id: belief.id,
      subjectId: belief.subjectId,
      kind: belief.kind,
      value: belief.value,
      confidence: belief.confidence,
      status: belief.status,
      updatedAt: belief.updatedAt,
    }));
    const activeGoals = (await this.getGoals({ limit: 6 })).filter((goal) => goal.status !== "completed").map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      progress: goal.progress,
      confidence: goal.confidence,
      blockedReason: goal.blockedReason,
      updatedAt: goal.updatedAt,
    }));
    const recentEpisodes = (await this.queryEpisodes({ limit: 6 })).map((episode) => ({
      id: episode.id,
      kind: episode.kind,
      label: episode.label,
      status: episode.status,
      updatedAt: episode.updatedAt,
      summary: episode.summary,
    }));
    return {
      graphVersion: this.file.graphVersion,
      nodeCount: this.file.worldEntities.length,
      edgeCount: this.file.worldRelations.length,
      routineCount: this.file.worldRoutines.length,
      proofCount: this.file.worldProofs.length,
      memoryCommitCount: this.file.worldMemories.length,
      beliefCount: this.file.worldBeliefs.length,
      goalCount: this.file.worldGoals.length,
      episodeCount: this.file.worldEpisodes.length,
      activeContext: {
        machineRoot: typeof activeContext.machineRoot === "string" ? activeContext.machineRoot : undefined,
        homeRootPath: typeof activeContext.homeRootPath === "string" ? activeContext.homeRootPath : undefined,
        focusedWorkspace: typeof activeContext.focusedWorkspace === "string" ? activeContext.focusedWorkspace : undefined,
        focusedRepo: typeof activeContext.focusedRepo === "string" ? activeContext.focusedRepo : undefined,
        activeWindow: typeof activeContext.activeWindow === "string" ? activeContext.activeWindow : undefined,
        activePage: typeof activeContext.activePage === "string" ? activeContext.activePage : undefined,
        activeWorkspace: typeof activeContext.activeWorkspace === "string" ? activeContext.activeWorkspace : undefined,
        activeRepo: typeof activeContext.activeRepo === "string" ? activeContext.activeRepo : undefined,
        browserMode: typeof activeContext.browserMode === "string" ? activeContext.browserMode : undefined,
        focusLeaseActive: Boolean(activeContext.focusLeaseActive),
        activeGoals: Array.isArray(activeContext.activeGoals) ? activeContext.activeGoals.map((item) => String(item)) : [],
      },
      knownDrives: Array.isArray(activeContext.knownDrives) ? activeContext.knownDrives.map((item) => String(item)) : [],
      affordanceSummary,
      recentChanges,
      environmentFreshness: {
        lastUpdatedAt: this.file.lastUpdatedAt,
        stale: Date.now() - new Date(this.file.lastUpdatedAt).getTime() > 20 * 60_000,
      },
      machineRoutineIds: this.file.worldRoutines.map((routine) => routine.id),
      routeRecommendations,
      distilledBeliefs,
      activeGoals,
      recentEpisodes,
      attentionQueue: this.getAttentionQueueInternal(8),
      selectedContextTier: "standard",
      routeModelVersion: ROUTE_MODEL_VERSION,
      routeStatsAvailable: this.file.worldRouteOutcomes.length > 0,
    };
  }

  async getContextSlice(input?: {
    tier?: WorldContextTier;
    task?: string;
    taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    toolFamily?: string;
  }): Promise<Record<string, unknown>> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const tier = normalizeContextTier(input?.tier);
    const activeContext = await this.getActiveContext();
    const affordanceSummary = this.inferAffordances();
    const routeRecommendations = await this.predictOutcomes({
      limit: tier === "minimal" ? 2 : tier === "full" ? 6 : 4,
      task: input?.task,
      taskSpeedClass: input?.taskSpeedClass,
      contextTier: tier,
      toolFamily: input?.toolFamily,
    });
    const summaryText = uniqueStrings([
      typeof activeContext.machineRoot === "string" ? `machine_home=${activeContext.machineRoot}` : null,
      typeof activeContext.focusedRepo === "string" ? `focus_repo=${activeContext.focusedRepo}` : null,
      typeof activeContext.activePage === "string" ? `page=${activeContext.activePage}` : null,
      typeof activeContext.activeWindow === "string" ? `window=${activeContext.activeWindow}` : null,
      routeRecommendations[0]?.kind ? `preferred_route=${routeRecommendations[0].kind}` : null,
      affordanceSummary.backgroundSafe.length ? `background_safe=${affordanceSummary.backgroundSafe.length}` : null,
    ]).join(" | ");
    if (tier === "minimal") {
      return {
        graphVersion: this.file.graphVersion,
        sliceId: typeof activeContext.sliceId === "string" ? activeContext.sliceId : `world-slice-${this.file.graphVersion}`,
        summary: summaryText,
        activeContext: {
          focusLeaseActive: Boolean(activeContext.focusLeaseActive),
          activePage: activeContext.activePage,
          activeWorkspace: activeContext.activeWorkspace,
          activeRepo: activeContext.activeRepo,
          activeGoals: Array.isArray(activeContext.activeGoals) ? capLength(activeContext.activeGoals as string[], 2) : [],
        },
        affordanceSummary,
        routeRecommendations,
        environmentFreshness: {
          lastUpdatedAt: this.file.lastUpdatedAt,
          stale: Date.now() - new Date(this.file.lastUpdatedAt).getTime() > 20 * 60_000,
        },
        attentionQueue: this.getAttentionQueueInternal(3),
        selectedContextTier: tier,
        routeModelVersion: ROUTE_MODEL_VERSION,
        routeStatsAvailable: this.file.worldRouteOutcomes.length > 0,
      };
    }
    const summary = await this.getSummary();
    return {
      graphVersion: summary.graphVersion,
      sliceId: typeof activeContext.sliceId === "string" ? activeContext.sliceId : `world-slice-${summary.graphVersion}`,
      summary: summaryText,
      activeContext: summary.activeContext,
      recentChanges: tier === "full" ? capLength(summary.recentChanges, 12) : capLength(summary.recentChanges, 6),
      affordanceSummary: summary.affordanceSummary,
      routeRecommendations: tier === "full" ? capLength(routeRecommendations, 6) : capLength(routeRecommendations, 4),
      distilledBeliefs: tier === "full" ? capLength(summary.distilledBeliefs, 8) : capLength(summary.distilledBeliefs, 6),
      activeGoals: tier === "full" ? capLength(summary.activeGoals, 6) : capLength(summary.activeGoals, 4),
      recentEpisodes: tier === "full" ? capLength(summary.recentEpisodes, 6) : capLength(summary.recentEpisodes, 4),
      attentionQueue: tier === "full" ? capLength(summary.attentionQueue, 8) : capLength(summary.attentionQueue, 6),
      environmentFreshness: summary.environmentFreshness,
      machineRoutineIds: summary.machineRoutineIds,
      knownDrives: capLength(summary.knownDrives, 8),
      selectedContextTier: tier,
      routeModelVersion: ROUTE_MODEL_VERSION,
      routeStatsAvailable: this.file.worldRouteOutcomes.length > 0,
    };
  }

  async getActiveContext(): Promise<Record<string, unknown>> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const activeGoals = this.file.worldGoals.filter((goal) => goal.status !== "completed").slice(0, 6);
    return {
      sliceId: `world-slice-${this.file.graphVersion}-${hashKey(`${this.file.lastUpdatedAt}:${this.file.worldEvents.length}`)}`,
      machineRoot: this.lookupLabel(this.file.liveState.activeMachineRootId),
      homeRootPath: this.file.liveState.activeHomeRootPath || null,
      knownDrives: Array.isArray(this.file.liveState.knownDriveIds)
        ? this.file.liveState.knownDriveIds.map((id) => this.lookupLabel(id)).filter(Boolean)
        : [],
      focusedWorkspace: this.lookupLabel(this.file.liveState.focusedWorkspaceId),
      focusedRepo: this.lookupLabel(this.file.liveState.focusedRepoId),
      activeWindow: this.lookupLabel(this.file.liveState.activeWindowId),
      activePage: this.lookupLabel(this.file.liveState.activePageId),
      activeWorkspace: this.lookupLabel(this.file.liveState.activeWorkspaceId),
      activeRepo: this.lookupLabel(this.file.liveState.activeRepoId),
      activeTerminalSession: this.lookupLabel(this.file.liveState.activeTerminalSessionId),
      browserMode: this.file.liveState.browserMode || null,
      focusLeaseActive: Boolean(this.file.liveState.focusLeaseActive),
      lastRunId: this.file.liveState.lastRunId || null,
      lastTask: this.file.liveState.lastTask || null,
      activeGoals: activeGoals.map((goal) => goal.title),
      activeGoalIds: activeGoals.map((goal) => goal.id),
      topBeliefs: sortByUpdatedAt(this.file.worldBeliefs)
        .filter((belief) => belief.status !== "expired")
        .slice(0, 5)
        .map((belief) => ({
          id: belief.id,
          kind: belief.kind,
          confidence: belief.confidence,
          status: belief.status,
        })),
    };
  }

  async getRecentChanges(limit = 20): Promise<WorldChange[]> {
    await this.initialize();
    return this.file.recentChanges.slice(0, clamp(Number(limit || 20), 1, 200));
  }

  async recordRouteDecision(input: RecordRouteDecisionInput): Promise<WorldRouteDecision> {
    await this.initialize();
    await this.expireBeliefsIfNeeded();
    const features = {
      ...this.buildRouteFeatureVector({
        kind: input.kind,
        task: input.task,
        taskSpeedClass: input.taskSpeedClass,
        toolFamily: input.toolFamily,
        contextTier: input.contextTier,
      }),
      ...(toObject(input.decisionFeatures) || {}),
    };
    const featureKey = this.featureKeyForRoute(features);
    const decisionId = `route_decision_${hashKey(`${input.runId || "local"}:${input.kind}:${featureKey}:${this.file.worldEvents.length}`)}`;
    await this.appendEvent({
      id: `route_decision_event_${decisionId}`,
      kind: "route.decision",
      summary: `Preferred route ${input.kind} for ${input.task || "the current machine state"}.`,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload: {
        id: decisionId,
        runId: input.runId || null,
        candidateId: input.candidateId || input.kind,
        kind: input.kind,
        task: input.task || null,
        taskSpeedClass: normalizeTaskSpeedClass(input.taskSpeedClass),
        contextTier: normalizeContextTier(input.contextTier),
        toolFamily: input.toolFamily || "generic",
        featureKey,
        heuristicScore: Number(input.heuristicScore || 0.5),
        adaptiveScore: Number(input.adaptiveScore || 0),
        finalScore: Number(input.finalScore || input.heuristicScore || 0.5),
        confidence: Number(input.confidence || 0.5),
        evidenceIds: input.evidenceIds || [],
        decisionFeatures: features,
      },
    });
    return this.file.worldRouteDecisions.find((decision) => decision.id === decisionId) as WorldRouteDecision;
  }

  async recordRouteOutcome(input: RecordRouteOutcomeInput): Promise<WorldRouteOutcome> {
    await this.initialize();
    const matchingDecision =
      (input.decisionId && this.file.worldRouteDecisions.find((decision) => decision.id === input.decisionId)) ||
      this.file.worldRouteDecisions.find((decision) => decision.runId && input.runId && decision.runId === input.runId) ||
      null;
    const routeKind = input.routeKind || matchingDecision?.kind || "route";
    const featureKey = input.featureKey || matchingDecision?.featureKey || this.featureKeyForRoute(this.buildRouteFeatureVector({ kind: routeKind }));
    const toolFamily = input.toolFamily || matchingDecision?.toolFamily || "generic";
    const outcomeId = `route_outcome_${hashKey(`${matchingDecision?.id || input.runId || "local"}:${routeKind}:${input.outcome}:${this.file.worldEvents.length}`)}`;
    await this.appendEvent({
      id: `route_outcome_event_${outcomeId}`,
      kind: "route.outcome",
      summary: input.summary || `Recorded ${input.outcome} for ${routeKind}.`,
      ...(input.runId ? { runId: input.runId } : {}),
      subjectId: "local-user-session",
      payload: {
        id: outcomeId,
        decisionId: matchingDecision?.id || input.decisionId || null,
        runId: input.runId || matchingDecision?.runId || null,
        routeKind,
        featureKey,
        toolFamily,
        outcome: input.outcome,
        advancedGoal: input.advancedGoal === true,
        verificationStatus: input.verificationStatus || "unknown",
        fallbackToRouteKind: input.fallbackToRouteKind || null,
        summary: input.summary || null,
      },
    });
    return this.file.worldRouteOutcomes.find((outcome) => outcome.id === outcomeId) as WorldRouteOutcome;
  }

  async getRouteStats(input?: { kind?: string; featureKey?: string; limit?: number }): Promise<WorldRouteStats[]> {
    await this.initialize();
    return this.getRouteStatsInternal(input);
  }

  async queryGraph(input: { query?: string; type?: string; limit?: number }): Promise<{ nodes: WorldEntity[]; edges: WorldRelation[] }> {
    await this.initialize();
    const limit = clamp(Number(input.limit || 12), 1, 100);
    const query = compactWhitespace(input.query).toLowerCase();
    const nodes = this.file.worldEntities.filter((entity) => {
      if (input.type && entity.type !== input.type) return false;
      if (!query) return true;
      return `${entity.label} ${entity.key} ${JSON.stringify(entity.data)}`.toLowerCase().includes(query);
    });
    const nodeIds = new Set(nodes.slice(0, limit).map((node) => node.id));
    const edges = this.file.worldRelations.filter((relation) => nodeIds.has(relation.from) || nodeIds.has(relation.to)).slice(0, limit * 2);
    return {
      nodes: nodes.slice(0, limit),
      edges,
    };
  }

  async getNeighbors(nodeId: string, limit = 16): Promise<{
    node: WorldEntity | null;
    neighbors: WorldEntity[];
    edges: WorldRelation[];
  }> {
    await this.initialize();
    const node = this.file.worldEntities.find((entity) => entity.id === nodeId) || null;
    if (!node) {
      return { node: null, neighbors: [], edges: [] };
    }
    const edges = this.file.worldRelations.filter((relation) => relation.from === nodeId || relation.to === nodeId).slice(0, clamp(Number(limit), 1, 100));
    const neighborIds = uniqueStrings(
      edges.flatMap((edge) => [edge.from === nodeId ? edge.to : edge.from])
    );
    return {
      node,
      neighbors: neighborIds
        .map((id) => this.file.worldEntities.find((entity) => entity.id === id))
        .filter((entity): entity is WorldEntity => Boolean(entity)),
      edges,
    };
  }

  async getAffordances(): Promise<WorldModelSummary["affordanceSummary"]> {
    await this.initialize();
    return this.inferAffordances();
  }

  async findRoutine(query: string, limit = 8): Promise<WorldRoutine[]> {
    await this.initialize();
    const normalizedQuery = compactWhitespace(query).toLowerCase();
    return sortByUpdatedAt(
      this.file.worldRoutines.filter((routine) => {
        if (!normalizedQuery) return true;
        return `${routine.label} ${routine.description} ${routine.triggers.join(" ")} ${routine.steps.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
    ).slice(0, clamp(Number(limit || 8), 1, 50));
  }

  async scoreRoute(input: {
    routes: Array<{
      id?: string;
      kind?: string;
      steps?: string[];
      requiresVisibleInteraction?: boolean;
      confidence?: number;
    }>;
  }): Promise<WorldPrediction[]> {
    return this.predictOutcomes({
      candidates: input.routes.map((route) => ({
        id: route.id,
        kind: route.kind,
        steps: route.steps,
        requiresVisibleInteraction: route.requiresVisibleInteraction,
        confidence: route.confidence,
      })),
      limit: input.routes.length || 6,
    });
  }

  async getStatus(): Promise<Record<string, unknown>> {
    await this.initialize();
    return {
      ok: true,
      version: this.file.version,
      graphVersion: this.file.graphVersion,
      loaded: this.loaded,
      storagePath: this.storagePath,
      lastUpdatedAt: this.file.lastUpdatedAt,
      eventCount: this.file.worldEvents.length,
      nodeCount: this.file.worldEntities.length,
      beliefCount: this.file.worldBeliefs.length,
      goalCount: this.file.worldGoals.length,
      episodeCount: this.file.worldEpisodes.length,
      routeDecisionCount: this.file.worldRouteDecisions.length,
      routeOutcomeCount: this.file.worldRouteOutcomes.length,
      routeModelVersion: ROUTE_MODEL_VERSION,
    };
  }
}
