import type { Mode, RuntimeBackend, RuntimePhase } from "./shared";

export type SlashCommand =
  | { kind: "help" }
  | { kind: "new" }
  | { kind: "plan" }
  | { kind: "auto" }
  | { kind: "runtime"; runtime: RuntimeBackend }
  | { kind: "key" }
  | { kind: "signin" }
  | { kind: "signout" }
  | { kind: "undo" }
  | { kind: "status" }
  | { kind: "unknown"; raw: string };

function normalizeCommandText(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSlashCommand(text: string): SlashCommand | null {
  const normalized = normalizeCommandText(text);
  if (!normalized.startsWith("/")) return null;

  const lower = normalized.toLowerCase();
  if (lower === "/help") return { kind: "help" };
  if (lower === "/new") return { kind: "new" };
  if (lower === "/plan") return { kind: "plan" };
  if (lower === "/auto") return { kind: "auto" };
  if (lower === "/key") return { kind: "key" };
  if (lower === "/signin") return { kind: "signin" };
  if (lower === "/signout") return { kind: "signout" };
  if (lower === "/undo") return { kind: "undo" };
  if (lower === "/status") return { kind: "status" };
  if (lower === "/runtime cutie") return { kind: "runtime", runtime: "cutie" };
  if (lower === "/runtime qwen") return { kind: "runtime", runtime: "qwenCode" };
  if (lower === "/runtime hosted") return { kind: "runtime", runtime: "playgroundApi" };
  if (lower === "/runtime cloud") return { kind: "runtime", runtime: "playgroundApi" };
  return { kind: "unknown", raw: normalized };
}

export function buildSlashCommandHelpMessage(prefix?: string): string {
  const lines = [
    prefix || "Slash commands:",
    "- /help",
    "- /new",
    "- /plan",
    "- /auto",
    "- /runtime cutie",
    "- /runtime hosted",
    "- /runtime qwen",
    "- /runtime cloud (alias for hosted)",
    "- /key",
    "- /signin",
    "- /signout",
    "- /undo",
    "- /status",
  ];
  return lines.join("\n");
}

export function describeRuntimePhase(phase: RuntimePhase): string {
  switch (phase) {
    case "radar":
      return "Draft ready";
    case "clarify":
      return "Needs clarification";
    case "collecting_context":
      return "Collecting context";
    case "waiting_for_cutie":
      return "Waiting for Cutie";
    case "waiting_for_qwen":
      return "Waiting for Qwen";
    case "awaiting_approval":
      return "Awaiting tool approval";
    case "applying_result":
      return "Applying result";
    case "saving_session":
      return "Saving session";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

export function buildSlashStatusMessage(input: {
  runtime: RuntimeBackend;
  mode: Mode;
  authLabel: string;
  runtimePhase: RuntimePhase;
  sessionId?: string | null;
  attachedFiles?: string[];
  attachedSelectionPath?: string | null;
}): string {
  const sessionLabel = input.sessionId?.trim() || "New chat";
  const runtimeLabel =
    input.runtime === "qwenCode" ? "Qwen Code" : input.runtime === "playgroundApi" ? "Hosted runtime" : "Cutie";
  const lines = [
    "Binary IDE status:",
    `- Runtime: ${runtimeLabel}`,
    `- Mode: ${input.mode === "plan" ? "Plan" : input.mode === "yolo" ? "Yolo" : "Auto"}`,
    `- Auth: ${input.authLabel}`,
    `- Phase: ${describeRuntimePhase(input.runtimePhase)}`,
    `- Session: ${sessionLabel}`,
    input.attachedFiles?.length ? `- Attached files: ${input.attachedFiles.join(", ")}` : "",
    input.attachedSelectionPath ? `- Attached selection: ${input.attachedSelectionPath}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
