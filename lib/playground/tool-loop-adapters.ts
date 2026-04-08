import type {
  PlaygroundAdapter,
  PlaygroundToolName,
  ToolCallContract,
  ToolResultContract,
} from "@/lib/playground/contracts";
import {
  PLAYGROUND_TOOL_LOOP_TOOLS,
  resolvePlaygroundModelSelection,
  type PlaygroundResolvedModelSelection,
} from "@/lib/playground/model-registry";
import {
  continueOpenHandsGatewayRun,
  isOpenHandsGatewayEnabled,
  startOpenHandsGatewayRun,
  type OpenHandsGatewayEvent,
} from "@/lib/playground/openhands-gateway";
import type {
  AssistContextSelection,
  AssistConversationTurn,
  AssistPlan,
  AssistRuntimeInput,
  AssistTargetInference,
} from "@/lib/playground/orchestration";
import { buildContextPrompt, parseStructuredAssistResponse } from "@/lib/playground/orchestration";
import type { ExecuteAction } from "@/lib/playground/policy";

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_LOOP_MAX_TOKENS = 1_200;

function normalizeHfRouterModelId(model: string): string {
  const raw = String(model || "").trim();
  if (!raw) return "";
  // HF Router uses OpenAI-compatible APIs; strip local routing suffixes like ":fastest".
  return raw.includes(":") ? raw.split(":")[0].trim() : raw;
}

function coerceHfRouterMaxTokens(input: unknown, fallback: number): number {
  const value = typeof input === "number" ? input : Number(input);
  const base = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(256, Math.min(base, 4_096));
}

export type ToolLoopTurnInput = {
  request: AssistRuntimeInput;
  tom?: {
    enabled: boolean;
    userKey?: string;
    sessionId?: string;
    traceId?: string;
  };
  mcp?: {
    mcpServers: Record<string, Record<string, unknown>>;
  };
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  toolTrace: Array<{ status: string; summary: string; toolCall?: { name?: string }; toolResult?: ToolResultContract }>;
  loopSummary: { stepCount: number; mutationCount: number; repairCount: number };
  availableTools: PlaygroundToolName[];
  latestToolResult?: ToolResultContract | null;
  orchestratorRunId?: string | null;
  repairDirective?: {
    stage:
      | "post_inspection_mutation_required"
      | "target_path_repair"
      | "patch_repair"
      | "single_file_rewrite"
      | "pine_specialization";
    reason: string;
  } | null;
  onGatewayEvent?: (event: OpenHandsGatewayEvent) => Promise<void> | void;
};

export type ToolLoopTurnOutput = {
  adapter: PlaygroundAdapter;
  final: string;
  toolCall?: ToolCallContract;
  actions?: ExecuteAction[];
  logs: string[];
  modelSelection: PlaygroundResolvedModelSelection;
  orchestrator?: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  orchestratorRunId?: string | null;
  modelCandidate?: Record<string, unknown> | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
};

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeRelativePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

function getHfRouterToken(): string | null {
  const token =
    process.env.HF_ROUTER_TOKEN ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_TOKEN ||
    "";
  return token.trim() || null;
}

function buildHistoryPrompt(history: AssistConversationTurn[] | undefined): string {
  if (!history?.length) return "Recent session history: none.";
  return [
    "Recent session history:",
    ...history.slice(-6).map((turn) => `${turn.role.toUpperCase()}: ${turn.content.slice(0, 4_000)}`),
  ].join("\n");
}

function buildToolCatalog(tools: PlaygroundToolName[]): string {
  const details: Record<PlaygroundToolName, string> = {
    list_files: "List likely workspace files. Args: { query?: string, limit?: number }",
    read_file: "Read a workspace file. Args: { path: string, startLine?: number, endLine?: number }",
    search_workspace: "Search indexed/local workspace context. Args: { query: string, limit?: number }",
    get_diagnostics: "Return current IDE diagnostics. Args: { path?: string }",
    git_status: "Return git status summary. Args: {}",
    git_diff: "Return git diff summary. Args: { path?: string }",
    create_checkpoint: "Create a local undo checkpoint before mutation. Args: { reason?: string }",
    edit: "Patch an existing file. Args: { path: string, patch: string }",
    write_file: "Write full file contents. Args: { path: string, content: string, overwrite?: boolean }",
    mkdir: "Create a directory. Args: { path: string }",
    run_command: "Run a workspace command. Args: { command: string, timeoutMs?: number, category?: string }",
    get_workspace_memory: "Return persisted workspace memory/summary. Args: {}",
    binary_start_build:
      "Start a streaming binary build. Args: { intent: string, runtime?: 'node18' | 'node20' }",
    binary_refine_build: "Refine the active or specified binary build. Args: { buildId?: string, intent: string }",
    binary_cancel_build: "Cancel the active or specified binary build. Args: { buildId?: string }",
    binary_branch_build:
      "Create a branch from the active or specified binary build. Args: { buildId?: string, checkpointId?: string, intent?: string }",
    binary_rewind_build:
      "Rewind the active or specified binary build to a checkpoint. Args: { buildId?: string, checkpointId?: string }",
    binary_validate_build:
      "Validate the active or specified binary build. Args: { buildId?: string, runtime?: 'node18' | 'node20' }",
    binary_execute_build:
      "Execute an entrypoint on the active or specified binary build. Args: { buildId?: string, entryPoint?: string, args?: unknown[] }",
    binary_publish_build: "Publish the active or specified binary build. Args: { buildId?: string }",
    desktop_capture_screen: "Capture the current desktop and upload a snapshot. Args: { displayId?: string }",
    desktop_list_apps:
      "List discovered desktop applications with aliases and sources. Args: { limit?: number, refresh?: boolean }",
    desktop_get_active_window: "Return the currently focused desktop window. Args: {}",
    desktop_list_windows: "List currently visible desktop windows. Args: {}",
    desktop_open_app: "Open a desktop application. Args: { app: string, args?: string[] }",
    desktop_open_url: "Open a URL in the default browser. Args: { url: string }",
    desktop_focus_window: "Focus a desktop window. Args: { windowId?: string, title?: string, app?: string }",
    desktop_click:
      "Click on the desktop using normalized coordinates. Args: { displayId: string, viewport: { displayId: string, width: number, height: number }, normalizedX: number, normalizedY: number, button?: string, clickCount?: number }",
    desktop_type: "Type text into the focused desktop target. Args: { text: string, delayMs?: number }",
    desktop_keypress: "Send a desktop keypress chord or sequence. Args: { keys: string[] }",
    desktop_scroll:
      "Scroll on the desktop. Args: { displayId?: string, viewport?: { displayId: string, width: number, height: number }, normalizedX?: number, normalizedY?: number, deltaX?: number, deltaY?: number }",
    desktop_wait: "Wait for a period of time. Args: { durationMs: number }",
    world_get_summary: "Load the current machine world-model summary. Args: {}",
    world_get_active_context: "Load the current active machine context slice. Args: {}",
    world_query_graph: "Query world-model nodes and connected edges. Args: { query?: string, type?: string, limit?: number }",
    world_get_neighbors: "Load neighboring nodes and edges for a world-model node. Args: { nodeId: string, limit?: number }",
    world_get_recent_changes: "Load recent world-model changes and environment deltas. Args: { limit?: number }",
    world_get_route_stats: "Load learned route-performance stats from the world model. Args: { kind?: string, featureKey?: string, limit?: number }",
    world_get_affordances: "Load current machine affordances and blocked/background-safe routes. Args: {}",
    world_find_routine: "Find learned machine/app/browser/terminal routines. Args: { query?: string, limit?: number }",
    world_record_observation: "Commit a structured observation to the local world model. Args: { label: string, summary?: string, data?: object, runId?: string }",
    world_record_proof: "Commit proof to the local world model. Args: { label: string, summary?: string, toolName?: string, nodeIds?: string[], data?: object, runId?: string }",
    world_commit_memory: "Commit durable semantic memory to the local world model. Args: { label: string, summary?: string, scope?: string, tags?: string[], data?: object }",
    world_record_route_outcome:
      "Record explicit route feedback into the world model. Args: { decisionId?: string, runId?: string, routeKind?: string, featureKey?: string, toolFamily?: string, outcome: string, advancedGoal?: boolean, verificationStatus?: string, fallbackToRouteKind?: string, summary?: string }",
    world_score_route: "Score candidate routes against current machine affordances. Args: { routes: Array<{ id?: string, kind?: string, steps?: string[], requiresVisibleInteraction?: boolean, confidence?: number }> }",
    repo_get_summary:
      "Load the current repo cognition summary, including hotspots, likely tests, route hints, and learned repo habits. Args: { task?: string }",
    repo_query_symbols:
      "Query repo symbols discovered from the local repo model. Args: { query?: string, path?: string, limit?: number }",
    repo_find_references:
      "Find likely references for a symbol using the local repo model. Args: { symbol: string, limit?: number }",
    repo_get_change_impact:
      "Estimate which files and symbols are impacted by a candidate file or symbol change. Args: { path?: string, symbol?: string, limit?: number }",
    repo_get_validation_plan:
      "Load the repo's canonical validation and verifier plan. Args: { paths?: string[] }",
    repo_record_verification:
      "Record a verification receipt into local repo memory. Args: { label: string, summary?: string, status?: 'pending' | 'running' | 'passed' | 'failed', command?: string, failureCategory?: string, targetHint?: string }",
  };
  return tools.map((tool) => `- ${tool}: ${details[tool]}`).join("\n");
}

function buildToolLoopUserPrompt(input: ToolLoopTurnInput, tools: PlaygroundToolName[]): string {
  const traceLines =
    input.toolTrace.length > 0
      ? input.toolTrace
          .slice(-8)
          .map((entry) => {
            const tool = entry.toolCall?.name || entry.toolResult?.name || "final";
            return `- [${entry.status}] ${tool}: ${entry.summary.slice(0, 400)}`;
          })
          .join("\n")
      : "none";

  const resultSection = (() => {
    const lr = input.latestToolResult;
    if (!lr) return "Latest tool result: none.";
    const lines = [
      "Latest tool result:",
      `- tool: ${lr.name}`,
      `- ok: ${lr.ok}`,
      lr.blocked ? "- blocked: true" : "",
      `- summary: ${lr.summary.slice(0, 3_000)}`,
    ];
    if (lr.name === "read_file" && lr.ok && lr.data && typeof lr.data === "object") {
      const record = lr.data as Record<string, unknown>;
      const content = record.content;
      if (typeof content === "string" && content.trim()) {
        const maxChars = 100_000;
        const body = content.length <= maxChars ? content : `${content.slice(0, maxChars)}\n… [truncated for prompt]`;
        lines.push(
          `- file_content (range=${String(record.range ?? "?")}, lineCount=${String(record.lineCount ?? "?")}):\n${body}`
        );
      }
    }
    return lines.filter(Boolean).join("\n");
  })();
  const repairSection = input.repairDirective
    ? [
        "Repair directive:",
        `- stage: ${input.repairDirective.stage}`,
        `- reason: ${input.repairDirective.reason.slice(0, 3_000)}`,
      ].join("\n")
    : "Repair directive: none.";

  return [
    `Mode: ${input.request.mode}`,
    input.targetInference.path ? `Preferred target: ${input.targetInference.path}` : "Preferred target: infer from context.",
    `Loop stats: steps=${input.loopSummary.stepCount}, mutations=${input.loopSummary.mutationCount}, repairs=${input.loopSummary.repairCount}`,
    input.fallbackPlan.files.length
      ? `Required task files:\n${input.fallbackPlan.files.map((file) => `- ${file}`).join("\n")}`
      : "Required task files: none.",
    `Available tools:\n${buildToolCatalog(tools)}`,
    input.contextSelection.files.length
      ? `Context files:\n${input.contextSelection.files.map((item) => `- ${item.path} (${item.reason})`).join("\n")}`
      : "Context files: none.",
    buildHistoryPrompt(input.request.conversationHistory),
    buildContextPrompt(input.request.context),
    `Recent tool trace:\n${traceLines}`,
    resultSection,
    repairSection,
    `Plan objective: ${input.fallbackPlan.objective}`,
    input.fallbackPlan.acceptanceTests.length
      ? `Acceptance tests:\n${input.fallbackPlan.acceptanceTests.map((item) => `- ${item}`).join("\n")}`
      : "Acceptance tests: none.",
    "Return either one toolCall or a final answer. Do not return an actions array in tool_loop_v1.",
    "Desktop and whole-PC tasks are natural-language intent problems, not shortcut commands. Infer intent dynamically from the user's phrasing.",
    "Browser tasks are handled internally by OpenHands Browser Use. Do not emit browser_* tool calls for web interaction or verification.",
    "Use world_* tools to reason over the machine graph, recent environment changes, known routines, and route affordances instead of repeatedly re-inspecting raw machine state.",
    "Use repo_* tools to inspect the repo graph, validation plan, symbol relationships, and change impact before broad edits on coding tasks.",
    "Prefer repo_get_summary early in coding runs, then use repo_query_symbols, repo_find_references, repo_get_change_impact, and repo_get_validation_plan to tighten target selection and verification.",
    "Prefer world_get_active_context or world_get_summary early on long-horizon machine tasks, then drill deeper with world_query_graph, world_get_neighbors, or world_find_routine only when needed.",
    "For browser tasks, describe the user goal clearly and let the internal Browser Use runner perform the web interaction and verification.",
    "For desktop tasks, inspect first when uncertain. Prefer desktop_list_apps, desktop_get_active_window, desktop_list_windows, or desktop_capture_screen before acting if the target may be ambiguous.",
    "After a meaningful desktop action such as desktop_open_app, desktop_open_url, desktop_focus_window, typing, or keypress, prefer a verification turn before finishing when a read-only desktop tool can confirm the outcome.",
    "If proof does not match the user's intent, replan instead of repeatedly issuing the same desktop action.",
    "If a repair directive is present, follow it strictly and choose the narrowest next tool that can prove progress.",
    "After inspecting the trusted target on a code edit request, do not choose another observation tool unless the latest tool result explicitly blocked mutation or the repair directive requires a path check.",
    "Do not keep rewriting the same file while explicit task files remain missing or uncreated unless the latest tool result proves that missing-file issue is blocked.",
    "If the task explicitly asks to run tests, validate, lint, or confirm the project works, and the required task files already exist in the trace, prefer one run_command validation turn over another observation turn.",
    "When the task names a project folder and then lists files like README.md, package.json, src/index.js, or test/index.test.js, treat those files as belonging inside that project folder unless the trace proves otherwise.",
    "Do not create duplicate workspace-root package.json, README.md, src/*, or test/* files when the task clearly targets a nested project folder.",
    "For Node or JavaScript project scaffolds, prefer package.json test scripts that use built-in node:test such as `node --test` unless the existing project context proves a different runner is already configured.",
    "Do not invent obsolete or invalid Node CLI flags such as `--experimental-modulesloader` or unsupported loader spellings.",
    "If a validation command fails because a generated package.json script or test harness is wrong, repair the project files first and only then rerun validation.",
    "If the task asks for git init, branch creation, commits, or other repository closeout steps, do those after the project files and validation are in place instead of drifting into extra inspection.",
    `Task:\n${input.request.task}`,
  ].join("\n\n");
}

function buildTextActionsSystemPrompt(): string {
  return [
    "You are Playground, a stepwise coding orchestrator.",
    "Return JSON only.",
    "Choose exactly one of these shapes:",
    '{"toolCall":{"id":"call_1","name":"read_file","arguments":{"path":"src/app.ts"},"kind":"observe","summary":"Inspect the current file"}}',
    '{"final":"string"}',
    "Use at most one tool call per response.",
    "Prefer observation tools before mutation unless the trace already provides enough grounding.",
    "Only use tools from the provided catalog.",
    "Paths must stay workspace-relative.",
    "Never return an actions array in tool_loop_v1.",
    "Desktop automation requests are freeform. Use desktop inspection tools first when the machine target is ambiguous, and verify desktop actions before you finish when feasible.",
    "Browser automation requests are handled internally by OpenHands Browser Use. Do not emit browser_* tool calls.",
    "When the task centers on a named project folder, keep generated file paths inside that folder unless the task explicitly asks for a workspace-root file.",
    "For Node and JavaScript project scaffolds, use modern built-in node:test defaults like `node --test` unless the existing repo clearly uses another runner.",
    "Never invent obsolete Node flags or unsupported command syntaxes.",
    "When the task asks for git closeout such as init, branch, add, or commit, finish those steps once the project is validated instead of returning to generic observation.",
  ].join("\n");
}

function buildNativeToolsSystemPrompt(): string {
  return [
    "You are Playground, a stepwise coding orchestrator.",
    "Use tool calls when you need more workspace information or need to change the workspace.",
    "If the task is complete, respond with a concise final answer.",
    "Prefer observation tools before mutation unless prior tool results already grounded the change.",
    "Do not return batch actions or an actions array in tool_loop_v1.",
    "Treat desktop requests as dynamic machine-intent tasks. Prefer desktop inspection tools before desktop actions when uncertain, and verify meaningful desktop actions before finishing when feasible.",
  ].join("\n");
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const candidates = [
    String(text || "").trim(),
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(String(text || "").trim())?.[1] || "",
    extractBalancedJsonObject(text) || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeToolCall(value: unknown, availableTools: PlaygroundToolName[]): ToolCallContract | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name || "").trim() as PlaygroundToolName;
  if (!availableTools.includes(name)) return null;

  const args = record.arguments && typeof record.arguments === "object"
    ? ({ ...(record.arguments as Record<string, unknown>) } as Record<string, unknown>)
    : {};

  if (typeof args.path === "string") {
    const normalizedPath = sanitizeRelativePath(args.path);
    if (normalizedPath) {
      args.path = normalizedPath;
    } else if (name === "read_file" || name === "edit" || name === "write_file" || name === "mkdir") {
      return null;
    } else {
      delete args.path;
    }
  }

  if (name === "run_command") {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    if (!command) return null;
    args.command = command;
  }

  if (name === "write_file" && typeof args.content === "string") {
    args.content = decodeLikelyEscapedMultilineText(args.content);
  }

  if (name === "edit" && typeof args.patch === "string") {
    args.patch = decodeLikelyEscapedMultilineText(args.patch);
  }

  const id = compactWhitespace(String(record.id || `call_${Date.now().toString(36)}`)).slice(0, 120);
  const kind =
    record.kind === "observe" || record.kind === "mutate" || record.kind === "command"
      ? record.kind
      : name === "edit" || name === "write_file" || name === "mkdir" || name === "create_checkpoint"
        ? "mutate"
        : name === "run_command"
          ? "command"
          : "observe";

  return {
    id,
    name,
    arguments: args,
    kind,
    summary: typeof record.summary === "string" ? record.summary.slice(0, 4_000) : undefined,
  };
}

function decodeLikelyEscapedMultilineText(value: string): string {
  const raw = String(value || "");
  if (!raw || /[\r\n]/.test(raw) || !/\\n|\\r|\\t|\\"/.test(raw)) return raw;
  const decoded = raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
  return decoded.includes("\n") || decoded !== raw ? decoded : raw;
}

function extractToolLoopPayload(
  value: unknown,
  availableTools: PlaygroundToolName[],
  depth = 0
): { final: string; toolCall?: ToolCallContract } | null {
  if (depth > 3 || value == null) return null;

  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (!parsed) return null;
    return extractToolLoopPayload(parsed, availableTools, depth + 1);
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const toolCall = normalizeToolCall(record.toolCall, availableTools);
  if (toolCall) {
    const nested =
      typeof record.final === "string" ? extractToolLoopPayload(record.final, availableTools, depth + 1) : null;
    return {
      final:
        typeof record.final === "string"
          ? record.final.trim()
          : nested?.final || "",
      toolCall: nested?.toolCall || toolCall,
    };
  }

  for (const candidate of [record.final, record.message, record.content, record.response]) {
    const nested = extractToolLoopPayload(candidate, availableTools, depth + 1);
    if (nested?.toolCall) return nested;
  }

  if (typeof record.final === "string" && record.final.trim()) {
    return { final: record.final.trim() };
  }

  return null;
}

export function parseToolLoopJson(
  raw: string,
  availableTools: PlaygroundToolName[]
): Omit<
  ToolLoopTurnOutput,
  "adapter" | "logs" | "modelSelection" | "orchestrator" | "orchestratorVersion" | "orchestratorRunId"
> | null {
  const parsed = parseJsonCandidate(raw);
  if (!parsed) return null;

  const extracted = extractToolLoopPayload(parsed, availableTools);
  if (extracted?.toolCall) return extracted;

  if (Array.isArray(parsed.actions)) return null;

  const final = extracted?.final || (typeof parsed.final === "string" ? parsed.final.trim() : "");
  if (final) return { final };
  return null;
}

async function requestOpenHandsTurn(input: {
  selection: PlaygroundResolvedModelSelection;
  request: ToolLoopTurnInput["request"];
  tom?: ToolLoopTurnInput["tom"];
  mcp?: ToolLoopTurnInput["mcp"];
  targetInference: ToolLoopTurnInput["targetInference"];
  contextSelection: ToolLoopTurnInput["contextSelection"];
  fallbackPlan: ToolLoopTurnInput["fallbackPlan"];
  toolTrace: ToolLoopTurnInput["toolTrace"];
  loopSummary: ToolLoopTurnInput["loopSummary"];
  availableTools: PlaygroundToolName[];
  latestToolResult?: ToolResultContract | null;
  repairDirective?: ToolLoopTurnInput["repairDirective"];
  orchestratorRunId?: string | null;
  onGatewayEvent?: ToolLoopTurnInput["onGatewayEvent"];
}): Promise<ToolLoopTurnOutput> {
  const payload = {
    request: input.request,
    tom: input.tom,
    mcp: input.mcp,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    fallbackPlan: input.fallbackPlan,
    toolTrace: input.toolTrace,
    loopSummary: input.loopSummary,
    availableTools: input.availableTools,
    latestToolResult: input.latestToolResult || null,
    repairDirective: input.repairDirective || null,
    modelSelection: input.selection,
  };

  const response = input.orchestratorRunId
    ? await continueOpenHandsGatewayRun({
        runId: input.orchestratorRunId,
        payload,
        onEvent: input.onGatewayEvent,
      })
    : await startOpenHandsGatewayRun(payload, input.onGatewayEvent ? { onEvent: input.onGatewayEvent } : undefined);

  let final = response.final;
  let toolCall = response.toolCall;
  const logs = [
    "adapter=openhands_gateway",
    ...(response.logs || []),
  ];

  if (!toolCall && final) {
    const recovered = parseToolLoopJson(final, input.availableTools);
    if (recovered?.toolCall) {
      toolCall = recovered.toolCall;
      final = recovered.final || "";
      logs.push("repair=adapter_final_toolcall_recovered");
    }
  }

  return {
    adapter: response.adapter,
    final,
    toolCall,
    logs,
    modelSelection: input.selection,
    orchestrator: "openhands",
    orchestratorVersion: response.version || null,
    orchestratorRunId: response.runId,
    modelCandidate: response.modelCandidate || null,
    fallbackAttempt: response.fallbackAttempt || 0,
    failureReason: response.failureReason || null,
    persistenceDir: response.persistenceDir || null,
    conversationId: response.conversationId || null,
    fallbackTrail: response.fallbackTrail || [],
  };
}

function buildOpenAIToolSpec(name: PlaygroundToolName) {
  const shared = {
    type: "function",
    function: {
      name,
      description: name.replace(/_/g, " "),
      parameters: {
        type: "object",
        additionalProperties: true,
        properties: {},
      },
    },
  } as const;

  if (name === "read_file") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Read a workspace file.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            path: { type: "string" },
            startLine: { type: "number" },
            endLine: { type: "number" },
          },
          required: ["path"],
        },
      },
    };
  }

  if (name === "search_workspace") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Search workspace index or local fallback context.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    };
  }

  if (name === "edit") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Apply a patch to an existing workspace file.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            path: { type: "string" },
            patch: { type: "string" },
          },
          required: ["path", "patch"],
        },
      },
    };
  }

  if (name === "write_file") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Write a complete workspace file.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            path: { type: "string" },
            content: { type: "string" },
            overwrite: { type: "boolean" },
          },
          required: ["path", "content"],
        },
      },
    };
  }

  if (name === "mkdir") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Create a workspace directory.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
    };
  }

  if (name === "run_command") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Run a workspace command.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            command: { type: "string" },
            timeoutMs: { type: "number" },
            category: { type: "string" },
          },
          required: ["command"],
        },
      },
    };
  }

  if (name === "binary_start_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Start a streaming binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            intent: { type: "string" },
            runtime: { type: "string" },
          },
          required: ["intent"],
        },
      },
    };
  }

  if (name === "binary_refine_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Refine the active or specified binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
            intent: { type: "string" },
          },
          required: ["intent"],
        },
      },
    };
  }

  if (name === "binary_cancel_build" || name === "binary_publish_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: name === "binary_cancel_build" ? "Cancel the active or specified binary build." : "Publish the active or specified binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "binary_branch_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Create a branch from the active or specified binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
            checkpointId: { type: "string" },
            intent: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "binary_rewind_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Rewind the active or specified binary build to a checkpoint.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
            checkpointId: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "binary_validate_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Validate the active or specified binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
            runtime: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "binary_execute_build") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Execute an entrypoint on the active or specified binary build.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            buildId: { type: "string" },
            entryPoint: { type: "string" },
            args: { type: "array", items: {} },
          },
        },
      },
    };
  }

  if (name === "desktop_capture_screen") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Capture the current desktop and upload a snapshot.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            displayId: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "desktop_list_apps") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "List discovered desktop applications with aliases and sources.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            limit: { type: "number" },
            refresh: { type: "boolean" },
          },
        },
      },
    };
  }

  if (name === "desktop_open_app") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Open a desktop application.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            app: { type: "string" },
            args: { type: "array", items: { type: "string" } },
          },
          required: ["app"],
        },
      },
    };
  }

  if (name === "desktop_open_url") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Open a URL in the default browser.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
      },
    };
  }

  if (name === "desktop_focus_window") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Focus a desktop window.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            windowId: { type: "string" },
            title: { type: "string" },
            app: { type: "string" },
          },
        },
      },
    };
  }

  if (name === "desktop_click") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Click on the desktop using normalized coordinates.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            displayId: { type: "string" },
            viewport: {
              type: "object",
              properties: {
                displayId: { type: "string" },
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["displayId", "width", "height"],
            },
            normalizedX: { type: "number" },
            normalizedY: { type: "number" },
            button: { type: "string" },
            clickCount: { type: "number" },
          },
          required: ["displayId", "viewport", "normalizedX", "normalizedY"],
        },
      },
    };
  }

  if (name === "desktop_type") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Type text into the focused desktop target.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            text: { type: "string" },
            delayMs: { type: "number" },
          },
          required: ["text"],
        },
      },
    };
  }

  if (name === "desktop_keypress") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Send a desktop keypress chord or sequence.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            keys: { type: "array", items: { type: "string" } },
          },
          required: ["keys"],
        },
      },
    };
  }

  if (name === "desktop_scroll") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Scroll on the desktop.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            displayId: { type: "string" },
            viewport: {
              type: "object",
              properties: {
                displayId: { type: "string" },
                width: { type: "number" },
                height: { type: "number" },
              },
            },
            normalizedX: { type: "number" },
            normalizedY: { type: "number" },
            deltaX: { type: "number" },
            deltaY: { type: "number" },
          },
        },
      },
    };
  }

  if (name === "desktop_wait") {
    return {
      ...shared,
      function: {
        ...shared.function,
        description: "Wait for a period of time.",
        parameters: {
          type: "object",
          additionalProperties: true,
          properties: {
            durationMs: { type: "number" },
          },
          required: ["durationMs"],
        },
      },
    };
  }

  return shared;
}

async function callTextActionsTurn(input: ToolLoopTurnInput, tools: PlaygroundToolName[]): Promise<string | null> {
  const token = getHfRouterToken();
  if (!token) return null;
  const selection = resolvePlaygroundModelSelection({
    requested: input.request.model,
    userConnectedModels: input.request.userConnectedModels,
  });
  const model = normalizeHfRouterModelId(selection.resolvedEntry.model);
  if (!model) throw new Error("HF router model is not configured.");
  const response = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: coerceHfRouterMaxTokens(input.request.maxTokens, DEFAULT_LOOP_MAX_TOKENS),
      messages: [
        { role: "system", content: buildTextActionsSystemPrompt() },
        { role: "user", content: buildToolLoopUserPrompt(input, tools) },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`HF router request failed (${response.status}): ${raw}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  return String(payload.choices?.[0]?.message?.content || "").trim() || null;
}

async function callNativeToolTurn(input: ToolLoopTurnInput, tools: PlaygroundToolName[]): Promise<{
  toolCall?: ToolCallContract;
  final?: string;
}> {
  const token = getHfRouterToken();
  if (!token) throw new Error("HF router token is not configured.");
  const selection = resolvePlaygroundModelSelection({
    requested: input.request.model,
    userConnectedModels: input.request.userConnectedModels,
  });
  const model = normalizeHfRouterModelId(selection.resolvedEntry.model);
  if (!model) throw new Error("HF router model is not configured.");
  const response = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: coerceHfRouterMaxTokens(input.request.maxTokens, DEFAULT_LOOP_MAX_TOKENS),
      tool_choice: "auto",
      tools: tools.map((tool) => buildOpenAIToolSpec(tool)),
      messages: [
        { role: "system", content: buildNativeToolsSystemPrompt() },
        { role: "user", content: buildToolLoopUserPrompt(input, tools) },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`HF router request failed (${response.status}): ${raw}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          function?: {
            name?: string;
            arguments?: string;
          };
        }>;
      };
    }>;
  };
  const message = payload.choices?.[0]?.message;
  const toolCallRaw = message?.tool_calls?.[0];
  if (toolCallRaw?.function?.name) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(String(toolCallRaw.function.arguments || "{}")) as Record<string, unknown>;
    } catch {
      args = {};
    }
    const normalized = normalizeToolCall(
      {
        id: toolCallRaw.id || `call_${Date.now().toString(36)}`,
        name: toolCallRaw.function.name,
        arguments: args,
      },
      tools
    );
    if (normalized) return { toolCall: normalized };
  }

  const content = String(message?.content || "").trim();
  if (!content) return {};
  const parsed = parseToolLoopJson(content, tools);
  if (parsed?.toolCall) return { toolCall: parsed.toolCall };
  if (parsed?.final) return { final: parsed.final };
  if (parseJsonCandidate(content)) {
    throw new Error("Native tool response used an unsupported tool_loop_v1 JSON shape.");
  }
  return {};
}

export function selectToolLoopAdapter(input?: {
  requestedModel?: string;
  userConnectedModels?: ToolLoopTurnInput["request"]["userConnectedModels"];
}): {
  adapter: PlaygroundAdapter;
  modelSelection: PlaygroundResolvedModelSelection;
} {
  const modelSelection = resolvePlaygroundModelSelection({
    requested: input?.requestedModel,
    userConnectedModels: input?.userConnectedModels,
  });
  const capabilities = modelSelection.resolvedEntry.capabilities;
  const adapter: PlaygroundAdapter = capabilities.supportsNativeToolCalls
    ? "native_tools"
    : capabilities.supportsTextActions
      ? "text_actions"
      : "deterministic_batch";
  return {
    adapter,
    modelSelection,
  };
}

export async function requestToolLoopTurn(input: ToolLoopTurnInput): Promise<ToolLoopTurnOutput> {
  const selection = selectToolLoopAdapter({
    requestedModel: input.request.model,
    userConnectedModels: input.request.userConnectedModels,
  });
  const clientTools = input.request.clientCapabilities?.supportedTools || PLAYGROUND_TOOL_LOOP_TOOLS;
  const availableTools = PLAYGROUND_TOOL_LOOP_TOOLS.filter(
    (tool): tool is PlaygroundToolName =>
      clientTools.includes(tool) && input.availableTools.includes(tool)
  );
  const fallbackPlan = input.fallbackPlan;

  if (!isOpenHandsGatewayEnabled()) {
    throw new Error("OpenHands is not configured. Set OPENHANDS_GATEWAY_URL before using hosted coding orchestration.");
  }

  return requestOpenHandsTurn({
    selection: selection.modelSelection,
    request: input.request,
    tom: input.tom,
    mcp: input.mcp,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    fallbackPlan,
    toolTrace: input.toolTrace,
    loopSummary: input.loopSummary,
    availableTools,
    latestToolResult: input.latestToolResult,
    repairDirective: input.repairDirective,
    orchestratorRunId: input.orchestratorRunId,
    onGatewayEvent: input.onGatewayEvent,
  });
}
