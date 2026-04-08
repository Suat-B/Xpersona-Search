type CutieParityCommand =
  | { kind: "auth_status" }
  | { kind: "auth_sign_in" }
  | { kind: "auth_sign_out" }
  | { kind: "auth_set_key" }
  | { kind: "config_show" }
  | { kind: "usage" }
  | { kind: "checkout"; tier: "starter" | "builder" | "studio"; billing: "monthly" | "yearly" }
  | { kind: "connections_list" }
  | {
      kind: "connections_add";
      mode: "web" | "remote";
      name?: string;
      url?: string;
      transport?: "http" | "sse";
      authMode?: "none" | "bearer" | "api-key" | "oauth";
    }
  | { kind: "connections_import"; file: string }
  | { kind: "connections_test" | "connections_enable" | "connections_disable" | "connections_remove"; id: string }
  | { kind: "providers_list" }
  | { kind: "providers_open" | "providers_login" | "providers_import" | "providers_status" | "providers_test" | "providers_refresh" | "providers_default" | "providers_logout"; providerId: string; baseUrl?: string; model?: string; setDefault?: boolean }
  | { kind: "runs_list"; limit: number }
  | { kind: "runs_show" | "runs_tail" | "runs_stream" | "runs_export"; id: string }
  | { kind: "runs_control"; id: string; action: "pause" | "resume" | "cancel" | "repair" | "takeover" | "retry_last_turn" }
  | { kind: "jobs_list"; limit: number }
  | { kind: "jobs_run"; task: string; workspace?: string; lane?: "local_interactive" | "openhands_headless" | "openhands_remote"; mode?: "auto" | "plan" | "yolo" | "generate" | "debug" }
  | { kind: "jobs_show" | "jobs_tail"; id: string }
  | { kind: "jobs_control"; id: string; action: "pause" | "resume" | "cancel" }
  | { kind: "jobs_remote_health" }
  | { kind: "automations_list" }
  | { kind: "automations_create"; name: string; prompt: string; trigger: "manual" | "schedule_nl" | "file_event" | "process_event" | "notification"; scheduleText?: string; query?: string; topic?: string; workspace?: string; includes?: string[]; excludes?: string[] }
  | { kind: "automations_show" | "automations_run" | "automations_tail"; id: string }
  | { kind: "automations_control"; id: string; action: "pause" | "resume" }
  | { kind: "debug_agent_chat"; sessionId?: string; message?: string }
  | { kind: "debug_agent_show" | "debug_agent_tail"; sessionId: string }
  | { kind: "sessions_list"; limit: number }
  | { kind: "sessions_show"; sessionId: string }
  | { kind: "binary_inspect" | "binary_hexdump" | "binary_hash"; path: string; offset?: number; length?: number }
  | { kind: "execute"; file: string; sessionId?: string }
  | { kind: "replay"; sessionId: string; mode: "auto" | "plan" | "yolo" | "generate" | "debug" }
  | { kind: "index_upsert"; projectKey: string; path?: string }
  | { kind: "index_query"; projectKey: string; query: string; limit: number };

type ReplayMode = "auto" | "plan" | "yolo" | "generate" | "debug";
type JobLane = "local_interactive" | "openhands_headless" | "openhands_remote";
type JobMode = "auto" | "plan" | "yolo" | "generate" | "debug";
type AutomationTriggerKind = "manual" | "schedule_nl" | "file_event" | "process_event" | "notification";

function normalizePrompt(prompt: string): string {
  return String(prompt || "").trim();
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  }
  return tokens;
}

function readFlag(tokens: string[], ...names: string[]): string | undefined {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    for (const name of names) {
      if (token === `--${name}` || token === `-${name}`) {
        return tokens[index + 1];
      }
      if (token.startsWith(`--${name}=`)) {
        return token.slice(name.length + 3);
      }
    }
  }
  return undefined;
}

function parseIntFlag(tokens: string[], fallback: number, ...names: string[]): number {
  const raw = readFlag(tokens, ...names);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstPositional(tokens: string[], index: number): string | undefined {
  return tokens[index];
}

function extractNaturalId(prompt: string, noun: string): string | undefined {
  const match = new RegExp(`${noun}\\s+([A-Za-z0-9._:-]+)`, "i").exec(prompt);
  return match?.[1]?.trim() || undefined;
}

function asLimit(prompt: string, fallback = 20): number {
  const match = /\blimit\s+(\d{1,3})\b/i.exec(prompt);
  const parsed = match ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractQuoted(prompt: string): string | undefined {
  const match = /"([^"]+)"|'([^']+)'/.exec(prompt);
  return String(match?.[1] || match?.[2] || "").trim() || undefined;
}

function parseCliStyle(prompt: string): CutieParityCommand | null {
  const trimmed = normalizePrompt(prompt);
  const normalized = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const tokens = tokenizeCommand(normalized);
  if (!tokens.length) return null;

  const root = tokens[0] === "binary" ? tokens[1] : tokens[0];
  const offset = tokens[0] === "binary" ? 1 : 0;
  if (!root) return null;

  if (root === "login") return { kind: "auth_sign_in" };
  if (root === "usage") return { kind: "usage" };
  if (root === "checkout") {
    return {
      kind: "checkout",
      tier: (readFlag(tokens, "tier") as "starter" | "builder" | "studio") || "builder",
      billing: (readFlag(tokens, "billing") as "monthly" | "yearly") || "monthly",
    };
  }
  if (root === "inspect" || root === "hexdump" || root === "hash") {
    const path = tokens[offset + 1];
    if (!path) return null;
    if (root === "inspect") return { kind: "binary_inspect", path };
    if (root === "hash") return { kind: "binary_hash", path };
    return {
      kind: "binary_hexdump",
      path,
      offset: parseIntFlag(tokens, 0, "offset"),
      length: parseIntFlag(tokens, 256, "length"),
    };
  }
  if (root === "execute") {
    const file = readFlag(tokens, "file", "f");
    if (!file) return null;
    return { kind: "execute", file, sessionId: readFlag(tokens, "session", "s") };
  }
  if (root === "replay") {
    const sessionId = firstPositional(tokens, offset + 1);
    if (!sessionId) return null;
      return {
        kind: "replay",
        sessionId,
        mode: (readFlag(tokens, "mode", "m") as ReplayMode) || "plan",
      };
  }
  if (root === "index") {
    const sub = firstPositional(tokens, offset + 1);
    if (sub === "upsert") {
      const projectKey = readFlag(tokens, "project");
      if (!projectKey) return null;
      return { kind: "index_upsert", projectKey, path: readFlag(tokens, "path") };
    }
    if (sub === "query") {
      const projectKey = readFlag(tokens, "project");
      const query = tokens[tokens.length - 1];
      if (!projectKey || !query || query.startsWith("-")) return null;
      return { kind: "index_query", projectKey, query, limit: parseIntFlag(tokens, 8, "limit", "l") };
    }
    return null;
  }
  if (root === "auth") {
    const sub = firstPositional(tokens, offset + 1) || "status";
    if (sub === "status") return { kind: "auth_status" };
    if (sub === "sign-in" || sub === "login") return { kind: "auth_sign_in" };
    if (sub === "sign-out" || sub === "logout") return { kind: "auth_sign_out" };
    if (sub === "set-key") return { kind: "auth_set_key" };
    return null;
  }
  if (root === "config") {
    const sub = firstPositional(tokens, offset + 1) || "show";
    if (sub === "show") return { kind: "config_show" };
    return null;
  }
  if (root === "connections" || root === "mcp") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "connections_list" };
    if (sub === "add") {
      const mode = (firstPositional(tokens, offset + 2) as "web" | "remote") || "remote";
      return {
        kind: "connections_add",
        mode,
        name: readFlag(tokens, "name"),
        url: readFlag(tokens, "url"),
        transport: (readFlag(tokens, "transport") as "http" | "sse") || "http",
        authMode: (readFlag(tokens, "auth") as "none" | "bearer" | "api-key" | "oauth") || "none",
      };
    }
    if (sub === "import") {
      const file = readFlag(tokens, "file");
      return file ? { kind: "connections_import", file } : null;
    }
    const id = firstPositional(tokens, offset + 2);
    if (!id) return null;
    if (sub === "test") return { kind: "connections_test", id };
    if (sub === "enable") return { kind: "connections_enable", id };
    if (sub === "disable") return { kind: "connections_disable", id };
    if (sub === "remove") return { kind: "connections_remove", id };
    return null;
  }
  if (root === "provider" || root === "providers") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "providers_list" };
    const providerId = firstPositional(tokens, offset + 2);
    if (!providerId) return null;
    const baseUrl = readFlag(tokens, "base-url");
    const model = readFlag(tokens, "model");
    const setDefault = tokens.includes("--default");
    if (sub === "open") return { kind: "providers_open", providerId };
    if (sub === "login" || sub === "connect") return { kind: "providers_login", providerId, baseUrl, model, setDefault };
    if (sub === "import") return { kind: "providers_import", providerId, baseUrl, model, setDefault };
    if (sub === "status") return { kind: "providers_status", providerId };
    if (sub === "test") return { kind: "providers_test", providerId };
    if (sub === "refresh") return { kind: "providers_refresh", providerId };
    if (sub === "default") return { kind: "providers_default", providerId };
    if (sub === "disconnect" || sub === "logout" || sub === "remove") return { kind: "providers_logout", providerId };
    return null;
  }
  if (root === "runs") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "runs_list", limit: parseIntFlag(tokens, 20, "limit", "l") };
    const id = firstPositional(tokens, offset + 2);
    if (!id) return null;
    if (sub === "show") return { kind: "runs_show", id };
    if (sub === "tail") return { kind: "runs_tail", id };
    if (sub === "stream") return { kind: "runs_stream", id };
    if (sub === "export") return { kind: "runs_export", id };
    if (sub === "pause" || sub === "resume" || sub === "cancel" || sub === "repair" || sub === "takeover") {
      return { kind: "runs_control", id, action: sub };
    }
    if (sub === "retry-last-turn") return { kind: "runs_control", id, action: "retry_last_turn" };
    return null;
  }
  if (root === "sessions") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "sessions_list", limit: parseIntFlag(tokens, 20, "limit", "l") };
    const sessionId = firstPositional(tokens, offset + 2);
    return sessionId ? { kind: "sessions_show", sessionId } : null;
  }
  if (root === "jobs") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "jobs_list", limit: parseIntFlag(tokens, 20, "limit", "l") };
    if (sub === "remote-health") return { kind: "jobs_remote_health" };
    if (sub === "run" || sub === "create") {
      const task = tokens.slice(offset + 2).filter((token) => !token.startsWith("--")).join(" ").trim() || readFlag(tokens, "task");
      return task
        ? {
            kind: "jobs_run",
            task,
            workspace: readFlag(tokens, "workspace"),
            lane: readFlag(tokens, "lane") as JobLane,
            mode: readFlag(tokens, "mode") as JobMode,
          }
        : null;
    }
    const id = firstPositional(tokens, offset + 2);
    if (!id) return null;
    if (sub === "show") return { kind: "jobs_show", id };
    if (sub === "tail") return { kind: "jobs_tail", id };
    if (sub === "pause" || sub === "resume" || sub === "cancel") return { kind: "jobs_control", id, action: sub };
    return null;
  }
  if (root === "automations") {
    const sub = firstPositional(tokens, offset + 1) || "list";
    if (sub === "list") return { kind: "automations_list" };
    if (sub === "create") {
      const name = readFlag(tokens, "name");
      const promptValue = readFlag(tokens, "prompt");
      const trigger = readFlag(tokens, "trigger") as AutomationTriggerKind;
      if (!name || !promptValue || !trigger) return null;
      return {
        kind: "automations_create",
        name,
        prompt: promptValue,
        trigger,
        scheduleText: readFlag(tokens, "schedule-text"),
        query: readFlag(tokens, "query"),
        topic: readFlag(tokens, "topic"),
        workspace: readFlag(tokens, "workspace"),
      };
    }
    const id = firstPositional(tokens, offset + 2);
    if (!id) return null;
    if (sub === "show") return { kind: "automations_show", id };
    if (sub === "run") return { kind: "automations_run", id };
    if (sub === "tail") return { kind: "automations_tail", id };
    if (sub === "pause" || sub === "resume") return { kind: "automations_control", id, action: sub };
    return null;
  }
  if (root === "debug-agent") {
    const sub = firstPositional(tokens, offset + 1) || "chat";
    if (sub === "chat") {
      const sessionId = firstPositional(tokens, offset + 2);
      const message = tokens.slice(offset + 3).join(" ").trim();
      return { kind: "debug_agent_chat", ...(sessionId ? { sessionId } : {}), ...(message ? { message } : {}) };
    }
    const sessionId = firstPositional(tokens, offset + 2);
    if (!sessionId) return null;
    if (sub === "show") return { kind: "debug_agent_show", sessionId };
    if (sub === "tail") return { kind: "debug_agent_tail", sessionId };
    return null;
  }

  return null;
}

export function resolveCutieParityCommand(prompt: string): CutieParityCommand | null {
  const trimmed = normalizePrompt(prompt);
  if (!trimmed) return null;

  if (trimmed.startsWith("binary ") || trimmed.startsWith("/")) {
    return parseCliStyle(trimmed);
  }

  const lower = trimmed.toLowerCase();

  if (/^(show|check)\s+(auth|authentication)\s+status\b/.test(lower)) return { kind: "auth_status" };
  if (/^(sign in|login)\b/.test(lower)) return { kind: "auth_sign_in" };
  if (/^(sign out|logout)\b/.test(lower)) return { kind: "auth_sign_out" };
  if (/^(set api key|set key)\b/.test(lower)) return { kind: "auth_set_key" };
  if (/^(show|list)\s+config\b/.test(lower)) return { kind: "config_show" };
  if (/(show|check).*(usage|quota|limits)/.test(lower)) return { kind: "usage" };
  if (/(open|start).*(checkout|billing|subscription)/.test(lower)) return { kind: "checkout", tier: "builder", billing: "monthly" };

  if (/^(list|show)\s+(my\s+)?connections\b/.test(lower) || /^(list|show)\s+mcp\b/.test(lower)) {
    return { kind: "connections_list" };
  }
  if (/^(list|show)\s+(my\s+)?providers\b/.test(lower)) return { kind: "providers_list" };
  if (/^(list|show)\s+(my\s+)?runs\b/.test(lower)) return { kind: "runs_list", limit: asLimit(trimmed) };
  if (/^(list|show)\s+(my\s+)?jobs\b/.test(lower)) return { kind: "jobs_list", limit: asLimit(trimmed) };
  if (/^(list|show)\s+(my\s+)?automations\b/.test(lower)) return { kind: "automations_list" };
  if (/^(list|show)\s+(my\s+)?sessions\b/.test(lower)) return { kind: "sessions_list", limit: asLimit(trimmed) };
  if (/^show\s+run\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "run");
    return id ? { kind: "runs_show", id } : null;
  }
  if (/^(tail|stream)\s+run\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "run");
    return id ? { kind: "runs_tail", id } : null;
  }
  if (/^(pause|resume|cancel|repair|take over|takeover)\s+run\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "run");
    if (!id) return null;
    const action = lower.startsWith("pause")
      ? "pause"
      : lower.startsWith("resume")
        ? "resume"
        : lower.startsWith("cancel")
          ? "cancel"
          : lower.startsWith("repair")
            ? "repair"
            : "takeover";
    return { kind: "runs_control", id, action };
  }
  if (/^show\s+job\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "job");
    return id ? { kind: "jobs_show", id } : null;
  }
  if (/^(tail|stream)\s+job\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "job");
    return id ? { kind: "jobs_tail", id } : null;
  }
  if (/^(pause|resume|cancel)\s+job\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "job");
    if (!id) return null;
    const action = lower.startsWith("pause") ? "pause" : lower.startsWith("resume") ? "resume" : "cancel";
    return { kind: "jobs_control", id, action };
  }
  if (/remote\s+runtime\s+health|jobs?\s+remote\s+health/.test(lower)) return { kind: "jobs_remote_health" };
  if (/^(start|create)\s+job\b/.test(lower)) {
    return { kind: "jobs_run", task: trimmed.replace(/^(start|create)\s+job\b[:\s-]*/i, "").trim() || trimmed };
  }
  if (/^show\s+automation\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "automation");
    return id ? { kind: "automations_show", id } : null;
  }
  if (/^(run|pause|resume|tail|stream)\s+automation\b/.test(lower)) {
    const id = extractNaturalId(trimmed, "automation");
    if (!id) return null;
    if (lower.startsWith("run")) return { kind: "automations_run", id };
    if (lower.startsWith("pause") || lower.startsWith("resume")) {
      return { kind: "automations_control", id, action: lower.startsWith("pause") ? "pause" : "resume" };
    }
    return { kind: "automations_tail", id };
  }
  if (/^show\s+session\b/.test(lower)) {
    const sessionId = extractNaturalId(trimmed, "session");
    return sessionId ? { kind: "sessions_show", sessionId } : null;
  }
  if (/^(start|open|show)\s+debug\s+agent\b/.test(lower)) {
    return { kind: "debug_agent_chat", ...(extractQuoted(trimmed) ? { message: extractQuoted(trimmed) } : {}) };
  }
  if (/^show\s+debug\s+agent\s+session\b/.test(lower)) {
    const sessionId = extractNaturalId(trimmed, "session");
    return sessionId ? { kind: "debug_agent_show", sessionId } : null;
  }
  if (/^(tail|stream)\s+debug\s+agent\b/.test(lower)) {
    const sessionId = extractNaturalId(trimmed, "session");
    return sessionId ? { kind: "debug_agent_tail", sessionId } : null;
  }
  if (/^inspect\s+binary\b/.test(lower)) {
    const path = trimmed.replace(/^inspect\s+binary\b[:\s-]*/i, "").trim();
    return path ? { kind: "binary_inspect", path } : null;
  }
  if (/^hexdump\b/.test(lower)) {
    const path = trimmed.replace(/^hexdump\b[:\s-]*/i, "").trim();
    return path ? { kind: "binary_hexdump", path, offset: 0, length: 256 } : null;
  }
  if (/^(hash|checksum)\b/.test(lower)) {
    const path = trimmed.replace(/^(hash|checksum)\b[:\s-]*/i, "").trim();
    return path ? { kind: "binary_hash", path } : null;
  }

  return null;
}

export type { CutieParityCommand };
