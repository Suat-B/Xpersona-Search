import { classifyIntent } from "./assistant-ux";

function normalizeLoopText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatTargets(targets: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (targets || [])
        .map((target) => String(target || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 2);
}

export function containsGenericProjectClarification(text: string): boolean {
  const normalized = normalizeLoopText(text);
  if (!normalized) return false;

  const looksLikeMenuLoop =
    normalized.includes("are you looking to") &&
    (normalized.includes("something else entirely") ||
      normalized.includes("examine or modify this file") ||
      normalized.includes("help modify or debug") ||
      normalized.includes("understand what it does"));

  const looksLikeScopedClarificationLoop =
    normalized.includes("let me know what you'd like to do") &&
    (normalized.includes("examine or modify this file") ||
      normalized.includes("troubleshoot an issue with it") ||
      normalized.includes("understand what it does"));

  const looksLikeWouldYouLikeLoop =
    (normalized.includes("would you like me to") || normalized.includes("how can i help you with this")) &&
    ((normalized.includes("read") && normalized.includes("file")) ||
      normalized.includes("explain what") ||
      normalized.includes("fix an issue") ||
      normalized.includes("help with an issue") ||
      normalized.includes("something else")) &&
    (normalized.includes("let me know") || normalized.includes("how can i help"));

  return (
    looksLikeMenuLoop ||
    looksLikeScopedClarificationLoop ||
    looksLikeWouldYouLikeLoop ||
    normalized.includes("could you clarify what you'd like me to help with regarding the") ||
    normalized.includes("if you're looking for help with the") ||
    normalized.includes("within the project scope") ||
    (normalized.includes("need assistance with any code changes") &&
      normalized.includes("project")) ||
    (normalized.includes("what you'd like me to help with") &&
      normalized.includes("project"))
  );
}

export function buildProjectLoopRecoveryMessage(input: {
  task: string;
  workspaceTargets?: string[];
  workspaceRoot?: string | null;
}): string {
  const intent = classifyIntent(input.task);
  const targets = formatTargets(input.workspaceTargets);

  if (intent === "change" && targets.length) {
    return `I can work directly in ${targets[0]}. If that's the right place for this change, I can patch it there instead of bouncing back to project-level clarification.`;
  }

  if (intent === "explain" && targets.length) {
    return `I can stay focused on ${targets[0]} and expand on it directly instead of stepping back to a generic project question.`;
  }

  if (intent === "find" && targets.length) {
    return `I can search from ${targets[0]} and the surrounding workspace context instead of asking a broad project-scope question.`;
  }

  if (targets.length === 1) {
    return `I can stay grounded in ${targets[0]} instead of falling back to a generic project-scope clarification.`;
  }

  if (targets.length > 1) {
    return `I can stay grounded in ${targets.join(" and ")} instead of falling back to a generic project-scope clarification.`;
  }

  const workspaceRoot = String(input.workspaceRoot || "").trim();
  return workspaceRoot
    ? `I can stay grounded in the workspace at ${workspaceRoot} instead of falling back to a generic project-scope clarification.`
    : "I can stay grounded in the current workspace instead of falling back to a generic project-scope clarification.";
}
