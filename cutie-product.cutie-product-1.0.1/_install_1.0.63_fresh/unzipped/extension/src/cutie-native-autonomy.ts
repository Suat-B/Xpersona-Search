import type {
  CutieAutonomyMode,
  CutieRepairTactic,
  CutieTargetAcquisitionPhase,
  CutieTaskGoal,
} from "./types";

export const DIRECT_MUTATION_REPAIR_CAP = 4;
export const UNLIMITED_DIRECT_MUTATION_REPAIR_CAP = 12;

function stripCodeFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function stripMentionTokens(prompt: string): string {
  return String(prompt || "")
    .replace(/@window:"[^"]+"/gi, " ")
    .replace(/@"[^"]+"/g, " ")
    .replace(/@window:[^\s]+/gi, " ")
    .replace(/@[A-Za-z0-9_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsBroadWorkspaceDiscovery(prompt: string): boolean {
  return /\b(entire|whole|across|all|every|workspace|repo|repository|project|multiple files|many files)\b/i.test(prompt);
}

function wantsCurrentFileInspection(prompt: string): boolean {
  return /\b(this file|current file|active file|open file|in this file|in the current file|here in this file)\b/i.test(prompt);
}

function referencesActiveEditingContext(prompt: string): boolean {
  const normalized = stripMentionTokens(prompt).toLowerCase();
  if (!normalized) return false;
  return /\b(here|in here|right here|this code|this script|this strategy)\b/.test(normalized);
}

function hasActionVerb(prompt: string): boolean {
  return /\b(add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make|remove|delete|improve|enhance|extend|append|insert)\b/i.test(
    stripMentionTokens(prompt)
  );
}

export function selectCodeChangeAutonomyMode(input: {
  goal: CutieTaskGoal;
  prompt: string;
  mentionedPaths?: string[];
  activeFilePath?: string | null;
  openFilePaths?: string[];
  objectiveBasedRuns?: boolean;
}): CutieAutonomyMode {
  if (input.goal !== "code_change") return "objective";
  if (input.objectiveBasedRuns === false) return "direct";

  const mentionedPaths = Array.isArray(input.mentionedPaths) ? input.mentionedPaths.filter(Boolean) : [];
  const activeFilePath = String(input.activeFilePath || "").trim();
  const openFilePaths = Array.isArray(input.openFilePaths) ? input.openFilePaths.filter(Boolean) : [];
  const stripped = stripMentionTokens(input.prompt);

  const hasSingularExplicitTarget = mentionedPaths.length === 1;
  const hasImplicitEditorTarget =
    mentionedPaths.length === 0 &&
    (wantsCurrentFileInspection(input.prompt) || referencesActiveEditingContext(input.prompt)) &&
    Boolean(activeFilePath || openFilePaths[0]);
  const hasSingleTarget = hasSingularExplicitTarget || hasImplicitEditorTarget;
  const hasBroadSignals = wantsBroadWorkspaceDiscovery(input.prompt);
  const hasMultiTargetSignals =
    mentionedPaths.length > 1 ||
    /\b(files|modules|components|screens|routes|across|throughout|everywhere|multiple|repo-wide|project-wide)\b/i.test(stripped);

  if (hasSingleTarget && hasActionVerb(input.prompt) && !hasBroadSignals && !hasMultiTargetSignals) {
    return "direct";
  }

  if (hasBroadSignals || hasMultiTargetSignals) {
    return "objective";
  }

  return hasSingleTarget ? "direct" : "objective";
}

export function resolveNativeNextToolHints(input: {
  goal: CutieTaskGoal;
  autonomyMode?: CutieAutonomyMode;
  preferredTargetPath?: string | null;
  targetAcquisitionPhase?: CutieTargetAcquisitionPhase;
  currentRepairTactic?: CutieRepairTactic;
  hasCompletedRead: boolean;
  hasCompletedMutation: boolean;
  hasVerifiedOutcome?: boolean;
  noOpConclusion?: string | null;
}): string[] {
  if (input.goal !== "code_change") return [];
  if (input.autonomyMode !== "direct") return [];
  if (input.noOpConclusion) {
    return input.hasVerifiedOutcome ? [] : ["run_command", "get_diagnostics"];
  }
  if (input.hasCompletedMutation) {
    return input.hasVerifiedOutcome ? [] : ["run_command", "get_diagnostics"];
  }
  if (!input.preferredTargetPath) {
    return ["search_workspace", "list_files"];
  }
  if (!input.hasCompletedRead) {
    return ["read_file"];
  }
  if (
    input.targetAcquisitionPhase === "semantic_recovery" ||
    input.currentRepairTactic === "semantic_search" ||
    input.currentRepairTactic === "example_search" ||
    input.currentRepairTactic === "command_assisted_repair"
  ) {
    return ["run_command", "search_workspace", "patch_file", "write_file"];
  }
  if (input.currentRepairTactic === "full_rewrite") {
    return ["write_file", "run_command"];
  }
  return ["patch_file", "run_command", "write_file"];
}

export function findToolArtifactStart(raw: string): number {
  const text = stripCodeFence(String(raw || ""));
  if (!text.trim()) return -1;

  const directPatterns = [
    /\[TOOL_CALL\]/i,
    /\[\/TOOL_CALL\]/i,
    /\btool_call\s*:/i,
    /\btool_calls\s*:/i,
    /"tool_call"\s*:/i,
    /"tool_calls"\s*:/i,
    /"toolCalls"\s*:/i,
    /"type"\s*:\s*"tool_batch"/i,
  ];
  for (const pattern of directPatterns) {
    const match = pattern.exec(text);
    if (match?.index !== undefined) return match.index;
  }

  const trimmed = text.trimStart();
  const leadingOffset = text.length - trimmed.length;
  if (/^(?:\{|\[)/.test(trimmed)) {
    if (/"type"\s*:\s*"tool_(?:call|calls)"/i.test(trimmed)) return leadingOffset;
    if (/"name"\s*:\s*"[^"]+"\s*,?[\s\S]*"arguments"\s*:/i.test(trimmed)) return leadingOffset;
  }

  return -1;
}

export function looksLikeCutieToolArtifactText(raw: string): boolean {
  return findToolArtifactStart(raw) >= 0;
}

export function extractVisibleAssistantText(raw: string): string {
  const text = String(raw || "");
  const artifactStart = findToolArtifactStart(text);
  if (artifactStart < 0) return text;
  return text.slice(0, artifactStart).trimEnd();
}
