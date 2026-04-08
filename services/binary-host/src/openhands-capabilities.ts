import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type BinaryExecutionLane = "local_interactive" | "openhands_headless" | "openhands_remote";

export type BinaryTaskSpeedClass = "chat_only" | "simple_action" | "tool_heavy" | "deep_code";

export type BinaryHostWorkspaceTrustMode =
  | "untrusted"
  | "trusted_read_only"
  | "trusted_full_access"
  | "trusted_prompt_commands";

export type BinaryPluginPackId =
  | "web-debug"
  | "qa-repair"
  | "dependency-maintenance"
  | "productivity-backoffice";

export type BinaryPluginPack = {
  id: BinaryPluginPackId;
  title: string;
  description: string;
  source: "binary_managed" | "repo_local" | "requested";
  status: "available" | "missing";
  loadedLazily: boolean;
  skillCount: number;
  mcpServerCount: number;
};

export type BinarySkillSource = {
  id: string;
  label: string;
  kind: "repo_local" | "user" | "org";
  path?: string;
  available: boolean;
  loadedLazily: boolean;
};

export type BinaryRemoteRuntimeHealth = {
  configured: boolean;
  available: boolean;
  executionLane: "openhands_remote";
  gatewayUrl?: string;
  status: "ready" | "degraded" | "unavailable";
  message: string;
  compatibility: "gateway_compatible" | "agent_server" | "unknown";
  checkedAt: string;
  details?: string;
};

type ResolveExecutionLaneInput = {
  task: string;
  workspaceTrustMode: BinaryHostWorkspaceTrustMode;
  taskSpeedClass: BinaryTaskSpeedClass;
  detach?: boolean;
  automationId?: string;
  automationTriggerKind?: string;
  probeSession?: boolean;
  expectedLongRun?: boolean;
  requireIsolation?: boolean;
  explicitLane?: BinaryExecutionLane;
  remoteConfigured?: boolean;
  nativeDesktopTask?: boolean;
  browserTask?: boolean;
};

const BUILTIN_PLUGIN_PACKS: Record<BinaryPluginPackId, Omit<BinaryPluginPack, "source" | "status">> = {
  "web-debug": {
    id: "web-debug",
    title: "Web Debug",
    description: "Bias OpenHands toward browser diagnostics, console/network inspection, and frontend repair loops.",
    loadedLazily: true,
    skillCount: 3,
    mcpServerCount: 1,
  },
  "qa-repair": {
    id: "qa-repair",
    title: "QA Repair",
    description: "Focus OpenHands on repro, targeted test repair, and validation-first fixes.",
    loadedLazily: true,
    skillCount: 4,
    mcpServerCount: 0,
  },
  "dependency-maintenance": {
    id: "dependency-maintenance",
    title: "Dependency Maintenance",
    description: "Guide OpenHands through package audits, upgrades, changelog review, and guarded remediation.",
    loadedLazily: true,
    skillCount: 3,
    mcpServerCount: 1,
  },
  "productivity-backoffice": {
    id: "productivity-backoffice",
    title: "Productivity Backoffice",
    description: "Bundle routine office, inbox, spreadsheet, and follow-up automation helpers.",
    loadedLazily: true,
    skillCount: 2,
    mcpServerCount: 2,
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function taskLooksLikeBrowser(task: string): boolean {
  return /\b(browser|website|web app|page|tab|url|login|navigate|click)\b/i.test(task);
}

function taskLooksLikeNativeDesktop(task: string): boolean {
  return /\b(open app|launch|notepad|calculator|discord|slack|outlook|file explorer|desktop)\b/i.test(task);
}

function taskLooksLikeDependencyWork(task: string): boolean {
  return /\b(package|packages|dependency|dependencies|upgrade|npm audit|requirements|pip|pnpm|yarn|lockfile)\b/i.test(task);
}

function taskLooksLikeQaRepair(task: string): boolean {
  return /\b(test|failing|broken|regression|qa|repair|fix)\b/i.test(task);
}

function taskLooksLikeBackoffice(task: string): boolean {
  return /\b(email|calendar|spreadsheet|invoice|follow up|crm|backoffice|ops|ops task)\b/i.test(task);
}

export function resolveExecutionLane(input: ResolveExecutionLaneInput): {
  lane: BinaryExecutionLane;
  reason: string;
} {
  if (input.explicitLane) {
    return {
      lane: input.explicitLane,
      reason: "Explicit execution lane requested by the caller.",
    };
  }

  const nativeTask = input.nativeDesktopTask ?? taskLooksLikeNativeDesktop(input.task);
  const browserTask = input.browserTask ?? taskLooksLikeBrowser(input.task);
  if (!input.detach && !input.probeSession && nativeTask) {
    return {
      lane: "local_interactive",
      reason: "Native desktop work stays local and interactive to protect latency and focus handling.",
    };
  }
  if (!input.detach && !input.probeSession && browserTask && input.taskSpeedClass !== "deep_code") {
    return {
      lane: "local_interactive",
      reason: "Interactive browser work stays on the fast local path.",
    };
  }

  const shouldGoLong =
    input.detach ||
    input.probeSession ||
    Boolean(input.automationId) ||
    Boolean(input.automationTriggerKind) ||
    Boolean(input.expectedLongRun) ||
    input.taskSpeedClass === "deep_code" ||
    input.taskSpeedClass === "tool_heavy";

  if (input.requireIsolation && input.remoteConfigured) {
    return {
      lane: "openhands_remote",
      reason: "Isolation was requested and a remote OpenHands runtime is available.",
    };
  }

  if (
    shouldGoLong &&
    input.remoteConfigured &&
    (input.workspaceTrustMode === "untrusted" || input.workspaceTrustMode === "trusted_read_only")
  ) {
    return {
      lane: "openhands_remote",
      reason: "Long-running work prefers the remote OpenHands lane when the workspace is not fully trusted.",
    };
  }

  if (shouldGoLong) {
    return {
      lane: "openhands_headless",
      reason: "Long-running, detached, automation, or probe work uses the headless OpenHands lane by default.",
    };
  }

  return {
    lane: "local_interactive",
    reason: "Short interactive requests stay on the fast local OpenHands path.",
  };
}

export function shouldEnableSampledTracing(input: {
  lane: BinaryExecutionLane;
  debugMode?: boolean;
  probeSession?: boolean;
  failed?: boolean;
}): boolean {
  return Boolean(
    input.debugMode ||
      input.probeSession ||
      input.failed ||
      input.lane === "openhands_headless" ||
      input.lane === "openhands_remote"
  );
}

export function resolveOpenHandsSkillSources(workspaceRoot?: string): BinarySkillSource[] {
  const repoSkillPath = workspaceRoot ? path.join(workspaceRoot, ".openhands", "skills") : "";
  const userSkillPath = path.join(os.homedir(), ".openhands", "skills");
  const orgSkillPath = String(process.env.OPENHANDS_ORG_SKILLS_DIR || "").trim();
  const sources: BinarySkillSource[] = [
    {
      id: "repo-local",
      label: "Repo-local OpenHands skills",
      kind: "repo_local",
      ...(repoSkillPath ? { path: repoSkillPath } : {}),
      available: Boolean(repoSkillPath && existsSync(repoSkillPath)),
      loadedLazily: true,
    },
    {
      id: "user-default",
      label: "User OpenHands skills",
      kind: "user",
      path: userSkillPath,
      available: existsSync(userSkillPath),
      loadedLazily: true,
    },
  ];
  if (orgSkillPath) {
    sources.push({
      id: "org-default",
      label: "Organization OpenHands skills",
      kind: "org",
      path: orgSkillPath,
      available: existsSync(orgSkillPath),
      loadedLazily: true,
    });
  }
  return sources;
}

function normalizeRequestedPluginId(value: string): BinaryPluginPackId | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "web-debug" ||
    normalized === "qa-repair" ||
    normalized === "dependency-maintenance" ||
    normalized === "productivity-backoffice"
  ) {
    return normalized;
  }
  return null;
}

export function resolveOpenHandsPluginPacks(input: {
  task: string;
  requestedPacks?: string[];
}): BinaryPluginPack[] {
  const requested = new Set<BinaryPluginPackId>();
  for (const raw of input.requestedPacks || []) {
    const normalized = normalizeRequestedPluginId(raw);
    if (normalized) requested.add(normalized);
  }

  if (taskLooksLikeBrowser(input.task)) requested.add("web-debug");
  if (taskLooksLikeQaRepair(input.task)) requested.add("qa-repair");
  if (taskLooksLikeDependencyWork(input.task)) requested.add("dependency-maintenance");
  if (taskLooksLikeBackoffice(input.task)) requested.add("productivity-backoffice");

  return [...requested].map((id) => ({
    ...BUILTIN_PLUGIN_PACKS[id],
    source: "binary_managed",
    status: "available",
  }));
}

export async function getRemoteRuntimeHealth(): Promise<BinaryRemoteRuntimeHealth> {
  const gatewayUrl = String(
    process.env.OPENHANDS_REMOTE_GATEWAY_URL || process.env.OPENHANDS_AGENT_SERVER_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!gatewayUrl) {
    return {
      configured: false,
      available: false,
      executionLane: "openhands_remote",
      status: "unavailable",
      message: "No remote OpenHands gateway or Agent Server URL is configured.",
      compatibility: "unknown",
      checkedAt: nowIso(),
    };
  }

  const candidatePaths = ["/health", "/v1/healthz", "/"];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    for (const candidatePath of candidatePaths) {
      try {
        const response = await fetch(`${gatewayUrl}${candidatePath}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) {
          continue;
        }
        const raw = await response.text().catch(() => "");
        const compatibility =
          candidatePath === "/health"
            ? "gateway_compatible"
            : candidatePath === "/v1/healthz"
              ? "agent_server"
              : "unknown";
        return {
          configured: true,
          available: true,
          executionLane: "openhands_remote",
          gatewayUrl,
          status: compatibility === "unknown" ? "degraded" : "ready",
          message:
            compatibility === "gateway_compatible"
              ? "Remote OpenHands gateway is reachable."
              : compatibility === "agent_server"
                ? "Remote OpenHands Agent Server is reachable."
                : "Remote OpenHands runtime is reachable but returned an unknown health shape.",
          compatibility,
          checkedAt: nowIso(),
          ...(raw.trim() ? { details: raw.slice(0, 8_000) } : {}),
        };
      } catch {
        // Try the next well-known path.
      }
    }
    return {
      configured: true,
      available: false,
      executionLane: "openhands_remote",
      gatewayUrl,
      status: "unavailable",
      message: "Remote OpenHands runtime is configured but not reachable.",
      compatibility: "unknown",
      checkedAt: nowIso(),
    };
  } finally {
    clearTimeout(timer);
  }
}
