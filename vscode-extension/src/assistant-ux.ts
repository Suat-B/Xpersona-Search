import type {
  ContextConfidence,
  ContextPreview,
  ContextSummary,
  FollowUpAction,
  IntentKind,
} from "./shared";

function uniquePaths(values: Iterable<string>, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "").trim().replace(/\\/g, "/");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function classifyIntent(task: string): IntentKind {
  const text = String(task || "").trim().toLowerCase();
  if (!text) return "ask";

  if (
    /\b(fix|change|update|edit|modify|patch|refactor|rewrite|implement|add|create|remove|delete|rename|replace|apply|wire|support|improve|clean up|make)\b/.test(
      text
    )
  ) {
    return "change";
  }

  if (
    /\b(explain|why|walk me through|help me understand|what does|what is happening|summarize|break down|expand on|elaborate on|build on)\b/.test(
      text
    )
  ) {
    return "explain";
  }

  if (/\b(find|search|locate|where is|grep|look for|show me references|trace)\b/.test(text)) {
    return "find";
  }

  return "ask";
}

export function isEditLikeIntent(intent: IntentKind): boolean {
  return intent === "change";
}

export function assessContextConfidence(input: {
  intent: IntentKind;
  resolvedFiles: string[];
  candidateFiles: string[];
  attachedFiles: string[];
  memoryFiles?: string[];
  hasAttachedSelection: boolean;
  explicitReferenceCount: number;
  selectedFilesCount: number;
  diagnosticsCount: number;
}): {
  confidence: ContextConfidence;
  score: number;
  rationale: string;
} {
  let score = 0.18;
  const reasons: string[] = [];

  if (input.hasAttachedSelection) {
    score += 0.44;
    reasons.push("attached selection");
  }
  if (input.attachedFiles.length) {
    score += 0.28;
    reasons.push("manual file attachment");
  }
  if (input.explicitReferenceCount > 0) {
    score += 0.26;
    reasons.push("explicit file reference");
  }
  if (input.resolvedFiles.length === 1) {
    score += 0.22;
    reasons.push("single likely target");
  } else if (input.resolvedFiles.length > 1) {
    score += 0.12;
    reasons.push("multiple likely targets");
  }
  if (input.selectedFilesCount > 0) {
    score += 0.1;
    reasons.push("relevant snippets");
  }
  if (input.memoryFiles?.length) {
    score += 0.05;
    reasons.push("workspace memory hints");
  }
  if (input.diagnosticsCount > 0) {
    score += 0.05;
    reasons.push("live diagnostics");
  }
  if (input.intent === "change" && !input.resolvedFiles.length) {
    score -= 0.24;
    reasons.push("no resolved edit target");
  }
  if (input.candidateFiles.length > Math.max(1, input.resolvedFiles.length + 1)) {
    score -= 0.16;
    reasons.push("multiple candidates");
  }

  const bounded = Math.max(0, Math.min(score, 1));
  const confidence: ContextConfidence =
    bounded >= 0.72 ? "high" : bounded >= 0.48 ? "medium" : "low";

  return {
    confidence,
    score: bounded,
    rationale: reasons.length ? reasons.join(", ") : "basic workspace context",
  };
}

export function buildContextSummary(preview: ContextPreview): ContextSummary {
  return {
    ...(preview.workspaceRoot ? { workspaceRoot: preview.workspaceRoot } : {}),
    likelyTargets: uniquePaths(preview.resolvedFiles, 4),
    candidateTargets: uniquePaths(preview.candidateFiles, 4),
    attachedFiles: uniquePaths(preview.attachedFiles, 4),
    memoryTargets: uniquePaths(preview.memoryFiles, 4),
    ...(preview.attachedSelection ? { attachedSelection: preview.attachedSelection } : {}),
    note:
      preview.confidence === "high"
        ? "Ready to move fast"
        : preview.confidence === "medium"
          ? "Likely right, but worth a quick glance"
          : "Needs a target check before editing",
  };
}

export function buildContextPreviewMessage(preview: ContextPreview): string {
  const attachedTargets = uniquePaths(
    [...preview.resolvedFiles, ...preview.attachedFiles, ...preview.selectedFiles],
    4
  );
  const sections = [
    `Context preview: ${preview.intent.toUpperCase()} | ${preview.confidence.toUpperCase()} confidence`,
    attachedTargets.length ? `Attached: ${attachedTargets.join(", ")}` : "",
    preview.attachedSelection ? `Selection: ${preview.attachedSelection.path}` : "",
  ].filter(Boolean);
  return sections.join("\n");
}

export function buildClarificationActions(input: {
  candidateFiles: string[];
}): FollowUpAction[] {
  return input.candidateFiles.slice(0, 4).map((pathValue) => ({
    id: `target:${pathValue}`,
    label: pathValue.split("/").pop() || pathValue,
    kind: "target" as const,
    targetPath: pathValue,
    detail: pathValue,
    emphasized: true,
  }));
}

export function buildFollowUpActions(input: {
  intent: IntentKind;
  lastTask: string;
  preview: ContextPreview;
  patchConfidence?: "high" | "needs_review" | null;
}): FollowUpAction[] {
  return [];
}

export function buildPatchConfidence(input: {
  intent: IntentKind;
  preview: ContextPreview;
  didMutate: boolean;
}): "high" | "needs_review" | null {
  if (input.intent !== "change" || !input.didMutate) return null;
  return input.preview.confidence === "high" && input.preview.diagnostics.length > 0
    ? "high"
    : "needs_review";
}
