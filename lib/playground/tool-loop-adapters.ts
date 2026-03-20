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
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  toolTrace: Array<{ status: string; summary: string; toolCall?: { name?: string }; toolResult?: ToolResultContract }>;
  loopSummary: { stepCount: number; mutationCount: number; repairCount: number };
  availableTools: PlaygroundToolName[];
  latestToolResult?: ToolResultContract | null;
};

export type ToolLoopTurnOutput = {
  adapter: PlaygroundAdapter;
  final: string;
  toolCall?: ToolCallContract;
  actions?: ExecuteAction[];
  logs: string[];
  modelSelection: PlaygroundResolvedModelSelection;
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
    desktop_capture_screen: "Capture the current desktop and upload a snapshot. Args: { displayId?: string }",
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

  const resultSection = input.latestToolResult
    ? [
        "Latest tool result:",
        `- tool: ${input.latestToolResult.name}`,
        `- ok: ${input.latestToolResult.ok}`,
        input.latestToolResult.blocked ? "- blocked: true" : "",
        `- summary: ${input.latestToolResult.summary.slice(0, 3_000)}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "Latest tool result: none.";

  return [
    `Mode: ${input.request.mode}`,
    input.targetInference.path ? `Preferred target: ${input.targetInference.path}` : "Preferred target: infer from context.",
    `Loop stats: steps=${input.loopSummary.stepCount}, mutations=${input.loopSummary.mutationCount}, repairs=${input.loopSummary.repairCount}`,
    `Available tools:\n${buildToolCatalog(tools)}`,
    input.contextSelection.files.length
      ? `Context files:\n${input.contextSelection.files.map((item) => `- ${item.path} (${item.reason})`).join("\n")}`
      : "Context files: none.",
    buildHistoryPrompt(input.request.conversationHistory),
    buildContextPrompt(input.request.context),
    `Recent tool trace:\n${traceLines}`,
    resultSection,
    `Plan objective: ${input.fallbackPlan.objective}`,
    "Return either one toolCall or a final answer. Do not return an actions array in tool_loop_v1.",
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
  ].join("\n");
}

function buildNativeToolsSystemPrompt(): string {
  return [
    "You are Playground, a stepwise coding orchestrator.",
    "Use tool calls when you need more workspace information or need to change the workspace.",
    "If the task is complete, respond with a concise final answer.",
    "Prefer observation tools before mutation unless prior tool results already grounded the change.",
    "Do not return batch actions or an actions array in tool_loop_v1.",
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
    if (!normalizedPath) return null;
    args.path = normalizedPath;
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

export function parseToolLoopJson(
  raw: string,
  availableTools: PlaygroundToolName[]
): Omit<ToolLoopTurnOutput, "adapter" | "logs" | "modelSelection"> | null {
  const parsed = parseJsonCandidate(raw);
  if (!parsed) return null;

  const toolCall = normalizeToolCall(parsed.toolCall, availableTools);
  if (toolCall) {
    return {
      final: typeof parsed.final === "string" ? parsed.final.trim() : "",
      toolCall,
    };
  }

  if (Array.isArray(parsed.actions)) return null;

  const final = typeof parsed.final === "string" ? parsed.final.trim() : "";
  if (final) return { final };
  return null;
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
  const selection = resolvePlaygroundModelSelection({ requested: input.request.model });
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
  const selection = resolvePlaygroundModelSelection({ requested: input.request.model });
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

export function selectToolLoopAdapter(requestedModel?: string): {
  adapter: PlaygroundAdapter;
  modelSelection: PlaygroundResolvedModelSelection;
} {
  const modelSelection = resolvePlaygroundModelSelection({ requested: requestedModel });
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
  const selection = selectToolLoopAdapter(input.request.model);
  const clientTools = input.request.clientCapabilities?.supportedTools || PLAYGROUND_TOOL_LOOP_TOOLS;
  const availableTools = PLAYGROUND_TOOL_LOOP_TOOLS.filter(
    (tool): tool is PlaygroundToolName =>
      clientTools.includes(tool) && input.availableTools.includes(tool)
  );
  const fallbackPlan = input.fallbackPlan;

  if (selection.adapter === "native_tools") {
    try {
      const response = await callNativeToolTurn(input, availableTools);
      if (response.toolCall) {
        return {
          adapter: "native_tools",
          final: "",
          toolCall: response.toolCall,
          logs: ["adapter=native_tools"],
          modelSelection: selection.modelSelection,
        };
      }
      return {
        adapter: "native_tools",
        final: response.final || "Tool loop completed.",
        logs: ["adapter=native_tools", "native_tools=final_without_tool_call"],
        modelSelection: selection.modelSelection,
      };
    } catch (error) {
      if (!selection.modelSelection.resolvedEntry.capabilities.supportsTextActions) {
        throw error;
      }
      const raw = await callTextActionsTurn(input, availableTools);
      const parsed = parseToolLoopJson(raw || "", availableTools);
      if (parsed) {
        return {
          adapter: "text_actions",
          final: parsed.final || "",
          toolCall: parsed.toolCall,
          logs: [
            "adapter=native_tools",
            `native_tools_error=${error instanceof Error ? error.message : String(error)}`,
            "adapter_fallback=text_actions",
          ],
          modelSelection: selection.modelSelection,
        };
      }
      throw error;
    }
  }

  if (selection.adapter === "text_actions") {
    const raw = await callTextActionsTurn(input, availableTools);
    const parsed = parseToolLoopJson(raw || "", availableTools);
    if (parsed) {
      return {
        adapter: "text_actions",
        final: parsed.final || "",
        toolCall: parsed.toolCall,
        logs: ["adapter=text_actions"],
        modelSelection: selection.modelSelection,
      };
    }
  }

  const deterministic = parseStructuredAssistResponse({
    raw: input.request.task,
    mode: "yolo",
    targetPath: input.targetInference.path,
    fallbackPlan,
  });
  return {
    adapter: "deterministic_batch",
    final: deterministic.final,
    actions: deterministic.actions,
    logs: ["adapter=deterministic_batch"],
    modelSelection: selection.modelSelection,
  };
}
