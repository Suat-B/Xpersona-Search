import type { Mode, RuntimeBackend, RuntimePhase } from "./shared";

export type SlashCommand =
  | { kind: "help" }
  | { kind: "new" }
  | { kind: "plan" }
  | { kind: "auto" }
  | { kind: "detach"; task: string }
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
  const detachMatch = /^\/detach(?:\s+([\s\S]+))?$/i.exec(normalized);
  if (detachMatch) {
    return { kind: "detach", task: String(detachMatch[1] || "").trim() };
  }
  if (lower === "/key") return { kind: "key" };
  if (lower === "/signin") return { kind: "signin" };
  if (lower === "/signout") return { kind: "signout" };
  if (lower === "/undo") return { kind: "undo" };
  if (lower === "/status") return { kind: "status" };
  if (lower === "/runtime hosted") return { kind: "runtime", runtime: "playgroundApi" };
  if (lower === "/runtime cloud") return { kind: "runtime", runtime: "playgroundApi" };
  if (lower === "/runtime qwen") return { kind: "runtime", runtime: "qwenCode" };
  return { kind: "unknown", raw: normalized };
}

export function buildSlashCommandHelpMessage(prefix?: string): string {
  const lines = [
    prefix || "Slash commands:",
    "- /help",
    "- /new",
    "- /plan",
    "- /auto",
    "- /detach <task>",
    "- /runtime hosted",
    "- /runtime cloud (alias for hosted)",
    "- /runtime qwen",
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
      return "Waiting for the standard runtime profile";
    case "waiting_for_qwen":
      return "Waiting for local Qwen";
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
    input.runtime === "playgroundApi"
      ? "Hosted OpenHands runtime"
      : input.runtime === "qwenCode"
        ? "Local Qwen Code (legacy)"
        : "Hosted standard profile";
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
