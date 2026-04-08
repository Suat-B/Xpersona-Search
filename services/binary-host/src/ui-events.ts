type UiEventCategory =
  | "run_status"
  | "tool_request"
  | "tool_result"
  | "closure_started"
  | "closure_item_completed"
  | "closure_blocked"
  | "closure_completed"
  | "proof_captured"
  | "verification_passed"
  | "verification_failed"
  | "fallback_entered"
  | "fallback_recovered"
  | "intervention_requested"
  | "memory_applied"
  | "run_summary";

type UiEventLane = "browser_native" | "desktop_fallback" | "terminal";
type UiEventConfidence = "confident" | "verifying" | "recovering" | "blocked";
type UiEventSurface = "control_center" | "overlay" | "intervention";

type UiEventDescriptor = {
  category: UiEventCategory;
  title: string;
  summary: string;
  surfaceHint: UiEventSurface;
  lane?: UiEventLane;
  confidence?: UiEventConfidence;
  proof?: Record<string, unknown>;
  intervention?: {
    reason?: string;
    suggestedActions: string[];
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function laneFromToolName(toolName: string | undefined): UiEventLane | undefined {
  if (!toolName) return undefined;
  if (toolName.startsWith("browser_")) return "browser_native";
  if (toolName.startsWith("desktop_")) return "desktop_fallback";
  if (toolName === "run_command" || toolName.startsWith("terminal_")) return "terminal";
  return undefined;
}

function laneFromEventData(data: Record<string, unknown> | null): UiEventLane | undefined {
  const directLane = asString(data?.lane);
  if (directLane === "browser_native" || directLane === "desktop_fallback" || directLane === "terminal") {
    return directLane;
  }
  return laneFromToolName(asString(data?.name));
}

function summarizeTool(toolName: string | undefined): string {
  return toolName ? toolName.replace(/^browser_/, "").replace(/^desktop_/, "").replace(/_/g, " ") : "tool";
}

function buildProof(data: Record<string, unknown> | null): Record<string, unknown> | undefined {
  const result = asRecord(data?.result);
  const resultData = asRecord(result?.data);
  const proof = asRecord(resultData?.proof) || asRecord(data?.proof);
  if (!proof) return undefined;
  return proof;
}

function buildToolRequestUi(data: Record<string, unknown> | null): UiEventDescriptor {
  const toolCall = asRecord(data?.toolCall);
  const toolName = asString(toolCall?.name);
  const lane = laneFromToolName(toolName);
  return {
    category: "tool_request",
    title: toolName ? `Request ${summarizeTool(toolName)}` : "Tool requested",
    summary: asString(toolCall?.summary) || `Binary is preparing ${summarizeTool(toolName)}.`,
    surfaceHint: lane ? "overlay" : "control_center",
    lane,
    confidence: lane === "browser_native" ? "verifying" : undefined,
    proof: {
      pageId: asRecord(toolCall?.arguments)?.pageId,
      url: asRecord(toolCall?.arguments)?.url,
      executionVisibility: data?.executionVisibility,
      interactionMode: data?.interactionMode,
    },
  };
}

function buildToolResultUi(data: Record<string, unknown> | null): UiEventDescriptor {
  const lane = laneFromEventData(data);
  const result = asRecord(data?.result);
  const toolName = asString(data?.name) || asString(result?.name);
  const ok = data?.ok === true;
  const blocked = data?.blocked === true;
  let category: UiEventCategory = "tool_result";
  if (toolName === "browser_capture_page" || toolName === "browser_snapshot_dom" || toolName === "browser_read_text" || toolName === "browser_read_form_state") {
    category = "proof_captured";
  } else if (toolName === "browser_wait_for" && ok) {
    category = "verification_passed";
  } else if (!ok) {
    category = "verification_failed";
  }

  return {
    category,
    title: ok
      ? `${summarizeTool(toolName)} complete`
      : blocked
        ? `${summarizeTool(toolName)} blocked`
        : `${summarizeTool(toolName)} needs repair`,
    summary: asString(data?.summary) || asString(result?.summary) || "Tool finished.",
    surfaceHint: blocked ? "intervention" : lane ? "overlay" : "control_center",
    lane,
    confidence: blocked ? "blocked" : ok ? "confident" : "recovering",
    proof: buildProof(data),
    intervention: !ok
      ? {
          reason: asString(data?.summary) || asString(result?.error),
          suggestedActions: blocked ? ["takeover", "cancel"] : ["repair", "retry_last_turn", "takeover"],
        }
      : undefined,
  };
}

function buildStatusUi(eventName: string, data: Record<string, unknown> | null): UiEventDescriptor {
  const reason = asString(data?.reason);
  const message = asString(data?.message) || reason || eventName.replace(/^host\./, "").replace(/_/g, " ");
  if (eventName === "host.takeover_required" || eventName === "host.stall") {
    return {
      category: "intervention_requested",
      title: "Binary needs intervention",
      summary: message,
      surfaceHint: "intervention",
      confidence: "blocked",
      intervention: {
        reason: reason || message,
        suggestedActions: ["takeover", "repair", "resume", "cancel"],
      },
    };
  }
  if (eventName === "host.closure_blocked") {
    return {
      category: "closure_blocked",
      title: "Closure blocked",
      summary: message,
      surfaceHint: "intervention",
      confidence: "blocked",
      intervention: {
        reason: reason || message,
        suggestedActions: ["repair", "resume", "takeover", "cancel"],
      },
    };
  }
  if (eventName === "host.closure_completed") {
    return {
      category: "closure_completed",
      title: "Closure completed",
      summary: message,
      surfaceHint: "control_center",
      confidence: "confident",
    };
  }
  if (eventName === "host.checkpoint") {
    const checkpoint = asRecord(data?.checkpoint);
    return {
      category: "proof_captured",
      title: "Checkpoint captured",
      summary: asString(checkpoint?.summary) || "Binary captured a stable checkpoint.",
      surfaceHint: "control_center",
      confidence: "confident",
      proof: checkpoint || undefined,
    };
  }
  return {
    category: "run_status",
    title: "Run update",
    summary: message,
    surfaceHint: "control_center",
    confidence: eventName === "host.heartbeat" ? "verifying" : undefined,
  };
}

function buildMetaUi(data: Record<string, unknown> | null): UiEventDescriptor {
  const progressState = asRecord(data?.progressState);
  const loopState = asRecord(data?.loopState);
  const pendingToolCall = asRecord(data?.pendingToolCall);
  const pendingTool = asRecord(pendingToolCall?.toolCall);
  const closurePhase = asString(loopState?.closurePhase);
  const unfinishedChecklistItems = Array.isArray(data?.unfinishedChecklistItems)
    ? (data?.unfinishedChecklistItems as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const summaryParts = [
    closurePhase ? `closure ${closurePhase.replace(/_/g, " ")}` : asString(progressState?.status),
    asString(progressState?.nextDeterministicAction),
    asString(pendingTool?.name),
  ].filter(Boolean);
  const category: UiEventCategory =
    closurePhase === "blocked"
      ? "closure_blocked"
      : closurePhase === "complete"
        ? "closure_completed"
        : closurePhase
          ? unfinishedChecklistItems.length > 0
            ? "closure_started"
            : "closure_item_completed"
          : "run_status";
  return {
    category,
    title:
      category === "closure_blocked"
        ? "Closure blocked"
        : category === "closure_completed"
          ? "Closure completed"
          : closurePhase
            ? "Closure update"
            : "Plan updated",
    summary: summaryParts.join(" | ") || "Binary updated its plan state.",
    surfaceHint: "control_center",
    lane: laneFromToolName(asString(pendingTool?.name)),
    confidence: category === "closure_blocked" ? "blocked" : category === "closure_completed" ? "confident" : "verifying",
  };
}

function buildRunSummaryUi(data: unknown): UiEventDescriptor {
  return {
    category: "run_summary",
    title: "Run summary",
    summary: asString(data) || "Binary finished the current response.",
    surfaceHint: "control_center",
    confidence: "confident",
  };
}

export function decorateUiEvent(event: Record<string, unknown>): Record<string, unknown> {
  if (asRecord(event.ui)) return event;
  const eventName = asString(event.event) || "event";
  const data = asRecord(event.data);
  let ui: UiEventDescriptor | null = null;

  if (eventName === "tool_request") ui = buildToolRequestUi(data);
  else if (eventName === "tool_result") ui = buildToolResultUi(data);
  else if (eventName === "meta") ui = buildMetaUi(data);
  else if (eventName === "final") ui = buildRunSummaryUi(event.data);
  else if (eventName.startsWith("host.")) ui = buildStatusUi(eventName, data);
  else if (eventName === "run") {
    ui = {
      category: "run_status",
      title: "Hosted run attached",
      summary: `Adapter ${asString(data?.adapter) || "unknown"} is active.`,
      surfaceHint: "control_center",
      confidence: "verifying",
    };
  }

  return ui ? { ...event, ui } : event;
}
