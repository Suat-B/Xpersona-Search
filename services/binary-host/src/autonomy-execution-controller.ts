import type { MachineAutonomyPolicy } from "./machine-autonomy.js";

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

export type ExecutionVisibility = "background" | "low_focus" | "visible_required";
export type ForegroundDisruptionRisk = "none" | "low" | "medium" | "high";
export type InteractionMode =
  | "terminal"
  | "structured_desktop"
  | "managed_browser"
  | "attached_browser"
  | "visible_desktop";
export type FocusPolicy = "never_steal" | "avoid_if_possible" | "allowed";
export type SessionPolicy = "attach_carefully" | "managed_only" | "live_session";
export type ExecutionLane =
  | "terminal_background"
  | "structured_background"
  | "managed_session_background"
  | "attached_session_low_focus"
  | "visible_desktop_fallback";

export type FocusLease = {
  surface: "desktop" | "cli" | "unknown";
  source: string;
  active: boolean;
  updatedAt: string;
  expiresAt: string;
};

export type ExecutionPolicyDecision = {
  lane: ExecutionLane;
  executionVisibility: ExecutionVisibility;
  foregroundDisruptionRisk: ForegroundDisruptionRisk;
  interactionMode: InteractionMode;
  focusPolicy: FocusPolicy;
  sessionPolicy: SessionPolicy;
  backgroundSafe: boolean;
  requiresVisibleInteraction: boolean;
  focusLeaseActive: boolean;
  focusSuppressed: boolean;
  managedSessionPreferred: boolean;
  browserSessionPreference?: "managed_only" | "reuse_first" | null;
  visibleFallbackReason?: string;
  summary: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDesktopObserveTool(name: string): boolean {
  return (
    name === "desktop_list_apps" ||
    name === "desktop_get_active_window" ||
    name === "desktop_list_windows" ||
    name === "desktop_query_controls" ||
    name === "desktop_read_control" ||
    name === "desktop_wait_for_control"
  );
}

function isBrowserObserveTool(name: string): boolean {
  return (
    name === "browser_list_pages" ||
    name === "browser_get_active_page" ||
    name === "browser_snapshot_dom" ||
    name === "browser_query_elements" ||
    name === "browser_wait_for" ||
    name === "browser_read_text" ||
    name === "browser_read_form_state" ||
    name === "browser_capture_page" ||
    name === "browser_get_network_activity" ||
    name === "browser_get_console_messages"
  );
}

function isBrowserInteractiveTool(name: string): boolean {
  return (
    name === "browser_open_page" ||
    name === "browser_search_and_open_best_result" ||
    name === "browser_login_and_continue" ||
    name === "browser_complete_form" ||
    name === "browser_extract_and_decide" ||
    name === "browser_recover_workflow" ||
    name === "browser_focus_page" ||
    name === "browser_navigate" ||
    name === "browser_click" ||
    name === "browser_type" ||
    name === "browser_press_keys" ||
    name === "browser_scroll"
  );
}

function isTerminalTool(name: string): boolean {
  return name === "run_command" || name.startsWith("terminal_");
}

function defaultDecision(policy: MachineAutonomyPolicy): ExecutionPolicyDecision {
  return {
    lane: "structured_background",
    executionVisibility: "background",
    foregroundDisruptionRisk: "none",
    interactionMode: "structured_desktop",
    focusPolicy: policy.focusPolicy,
    sessionPolicy: policy.sessionPolicy,
    backgroundSafe: true,
    requiresVisibleInteraction: false,
    focusLeaseActive: false,
    focusSuppressed: false,
    managedSessionPreferred: policy.sessionPolicy !== "live_session",
    browserSessionPreference: policy.sessionPolicy === "managed_only" ? "managed_only" : null,
    summary: "Binary selected a background-safe execution path.",
  };
}

function wantsVisibleForeground(toolCall: ToolCall): boolean {
  const args = toolCall.arguments || {};
  return (
    asBoolean(args.allowForeground) ||
    asBoolean(args.foreground) ||
    asBoolean(args.activate) ||
    asBoolean(args.bringToFront) ||
    asBoolean(args.visible)
  );
}

export class AutonomyExecutionController {
  private focusLease: FocusLease | null = null;

  constructor(private readonly policy: MachineAutonomyPolicy) {}

  updateFocusLease(input: {
    surface?: "desktop" | "cli" | "unknown";
    source?: string;
    leaseMs?: number;
    active?: boolean;
  }): FocusLease | null {
    const leaseMs = Math.max(500, Math.min(30_000, Number(input.leaseMs || this.policy.focusLeaseTtlMs || 4_000)));
    const active = input.active !== false;
    if (!active) {
      this.focusLease = null;
      return null;
    }
    const now = Date.now();
    this.focusLease = {
      surface: input.surface || "unknown",
      source: asString(input.source) || "activity",
      active: true,
      updatedAt: nowIso(),
      expiresAt: new Date(now + leaseMs).toISOString(),
    };
    return this.focusLease;
  }

  getFocusLease(): FocusLease | null {
    if (!this.focusLease) return null;
    if (new Date(this.focusLease.expiresAt).getTime() <= Date.now()) {
      this.focusLease = null;
      return null;
    }
    return this.focusLease;
  }

  decide(pendingToolCall: PendingToolCall): ExecutionPolicyDecision {
    const toolCall = pendingToolCall.toolCall;
    const toolName = String(toolCall.name || "");
    const explicitForeground = wantsVisibleForeground(toolCall);
    const focusLease = this.getFocusLease();
    const focusLeaseActive =
      Boolean(focusLease) &&
      this.policy.suppressForegroundWhileTyping &&
      focusLease?.surface === "desktop";

    let decision = defaultDecision(this.policy);

    if (isTerminalTool(toolName)) {
      decision = {
        lane: "terminal_background",
        executionVisibility: "background",
        foregroundDisruptionRisk: "none",
        interactionMode: "terminal",
        focusPolicy: this.policy.focusPolicy,
        sessionPolicy: this.policy.sessionPolicy,
        backgroundSafe: true,
        requiresVisibleInteraction: false,
        focusLeaseActive,
        focusSuppressed: false,
        managedSessionPreferred: false,
        browserSessionPreference: null,
        summary: "Binary selected the terminal lane for a background-safe coding or system step.",
      };
    } else if (toolName.startsWith("desktop_")) {
      if (toolName === "desktop_wait" || isDesktopObserveTool(toolName)) {
        decision = {
          ...decision,
          lane: "structured_background",
          executionVisibility: "background",
          foregroundDisruptionRisk: "none",
          interactionMode: "structured_desktop",
          focusLeaseActive,
          summary: "Binary can inspect the desktop without changing visible focus.",
        };
      } else if (toolName === "desktop_focus_window" || explicitForeground) {
        decision = {
          ...decision,
          lane: "visible_desktop_fallback",
          executionVisibility: "visible_required",
          foregroundDisruptionRisk: "high",
          interactionMode: "visible_desktop",
          backgroundSafe: false,
          requiresVisibleInteraction: true,
          focusLeaseActive,
          summary: "This desktop step requires visible foreground interaction.",
          visibleFallbackReason: "Window activation is required for this step.",
        };
      } else {
        decision = {
          ...decision,
          lane: "attached_session_low_focus",
          executionVisibility: "low_focus",
          foregroundDisruptionRisk: toolName === "desktop_open_url" ? "high" : "medium",
          interactionMode: toolName === "desktop_open_url" ? "visible_desktop" : "structured_desktop",
          backgroundSafe: false,
          requiresVisibleInteraction: toolName === "desktop_open_url",
          focusLeaseActive,
          summary: "Binary is attempting a lower-disruption desktop action without forcing focus if it can avoid it.",
          ...(toolName === "desktop_open_url"
            ? { visibleFallbackReason: "Opening a URL typically activates a visible browser window." }
            : {}),
        };
      }
    } else if (toolName.startsWith("browser_")) {
      const sessionPolicy = this.policy.sessionPolicy;
      const managedPreferred = sessionPolicy === "managed_only";
      if (isBrowserObserveTool(toolName)) {
        decision = {
          lane: managedPreferred ? "managed_session_background" : "attached_session_low_focus",
          executionVisibility: managedPreferred ? "background" : "low_focus",
          foregroundDisruptionRisk: managedPreferred ? "none" : "low",
          interactionMode: managedPreferred ? "managed_browser" : "attached_browser",
          focusPolicy: this.policy.focusPolicy,
          sessionPolicy,
          backgroundSafe: managedPreferred,
          requiresVisibleInteraction: false,
          focusLeaseActive,
          focusSuppressed: false,
          managedSessionPreferred: managedPreferred,
          browserSessionPreference: managedPreferred ? "managed_only" : "reuse_first",
          summary: managedPreferred
            ? "Binary selected a managed browser session so inspection can stay in the background."
            : "Binary is carefully reusing the user's signed-in browser first and will only isolate if reuse is unavailable.",
        };
      } else if (toolName === "browser_focus_page" || explicitForeground) {
        decision = {
          lane: "visible_desktop_fallback",
          executionVisibility: "visible_required",
          foregroundDisruptionRisk: "high",
          interactionMode: "visible_desktop",
          focusPolicy: this.policy.focusPolicy,
          sessionPolicy,
          backgroundSafe: false,
          requiresVisibleInteraction: true,
          focusLeaseActive,
          focusSuppressed: false,
          managedSessionPreferred: false,
          browserSessionPreference: null,
          visibleFallbackReason: "Focusing a live page would pull the browser to the foreground.",
          summary: "This browser step requires a visible foreground handoff.",
        };
      } else if (isBrowserInteractiveTool(toolName)) {
        const shouldPreferManaged = managedPreferred || focusLeaseActive;
        decision = {
          lane: shouldPreferManaged ? "managed_session_background" : "attached_session_low_focus",
          executionVisibility: shouldPreferManaged ? "background" : "low_focus",
          foregroundDisruptionRisk: shouldPreferManaged ? "low" : "medium",
          interactionMode: shouldPreferManaged ? "managed_browser" : "attached_browser",
          focusPolicy: this.policy.focusPolicy,
          sessionPolicy,
          backgroundSafe: shouldPreferManaged,
          requiresVisibleInteraction: false,
          focusLeaseActive,
          focusSuppressed: false,
          managedSessionPreferred: shouldPreferManaged,
          browserSessionPreference: managedPreferred ? "managed_only" : "reuse_first",
          summary: shouldPreferManaged
            ? managedPreferred
              ? "Binary selected a managed browser session so the workflow stays isolated."
              : "Binary will try your existing signed-in browser first, then your real profile, and only fall back to an isolated session if reuse is not stable."
            : "Binary is using a low-focus attached browser path and will avoid visible fallback if possible.",
        };
      }
    }

    if (
      focusLeaseActive &&
      decision.executionVisibility !== "background" &&
      this.policy.focusPolicy !== "allowed" &&
      !explicitForeground
    ) {
      return {
        ...decision,
        focusSuppressed: true,
        summary: "Binary deferred a focus-stealing step because you are actively using Binary IDE.",
        visibleFallbackReason:
          decision.visibleFallbackReason ||
          "Binary will not steal focus while an active desktop focus lease is held.",
      };
    }

    if (
      decision.executionVisibility === "visible_required" &&
      !this.policy.allowVisibleFallback &&
      !explicitForeground
    ) {
      return {
        ...decision,
        focusSuppressed: true,
        summary: "Binary blocked a visible fallback step because automatic foreground activation is disabled.",
        visibleFallbackReason:
          decision.visibleFallbackReason || "Automatic visible fallback is disabled by host policy.",
      };
    }

    return decision;
  }

  buildReceipt(decision: ExecutionPolicyDecision, input?: { focusStolen?: boolean; sessionKind?: "managed" | "existing" | "none" }): Record<string, unknown> {
    const focusStolen =
      typeof input?.focusStolen === "boolean"
        ? input.focusStolen
        : decision.executionVisibility === "visible_required" && !decision.focusSuppressed;
    return {
      lane: decision.interactionMode === "terminal" ? "terminal" : decision.interactionMode === "visible_desktop" ? "desktop_fallback" : "browser_native",
      executionVisibility: decision.executionVisibility,
      foregroundDisruptionRisk: decision.foregroundDisruptionRisk,
      interactionMode: decision.interactionMode,
      focusPolicy: decision.focusPolicy,
      sessionPolicy: decision.sessionPolicy,
      backgroundSafe: decision.backgroundSafe,
      requiresVisibleInteraction: decision.requiresVisibleInteraction,
      focusLeaseActive: decision.focusLeaseActive,
      focusSuppressed: decision.focusSuppressed,
      focusStolen,
      ranInBackground: decision.executionVisibility === "background" && !decision.focusSuppressed,
      sessionKind: input?.sessionKind || (decision.managedSessionPreferred ? "managed" : "existing"),
      ...(decision.visibleFallbackReason ? { visibleFallbackReason: decision.visibleFallbackReason } : {}),
      executionSummary: decision.summary,
    };
  }
}
