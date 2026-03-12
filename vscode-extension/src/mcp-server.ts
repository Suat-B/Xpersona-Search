import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { loadInstructionBridge } from "./instruction-bridge";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

const workspaceRoot = process.env.PLAYGROUND_WORKSPACE_ROOT ? path.resolve(process.env.PLAYGROUND_WORKSPACE_ROOT) : process.cwd();
const baseApiUrl = String(process.env.PLAYGROUND_BASE_API_URL || "").trim().replace(/\/+$/, "");
const apiToken = String(process.env.PLAYGROUND_API_TOKEN || "").trim();

function send(message: Record<string, unknown>) {
  const json = JSON.stringify(message);
  const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  process.stdout.write(payload);
}

function success(id: JsonRpcId, result: Record<string, unknown>) {
  send({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcId, code: number, message: string) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function trimOutput(value: string, maxChars = 12000): string {
  const normalized = String(value || "");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n\n...[truncated ${normalized.length - maxChars} chars]`;
}

function normalizeRelPath(input: unknown): string | null {
  const cleaned = String(input || "").replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) return null;
  return cleaned;
}

function safeJoin(relPath: string): string | null {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return null;
  const joined = path.resolve(workspaceRoot, normalized);
  if (!joined.startsWith(workspaceRoot)) return null;
  return joined;
}

function runRg(query: string, limit = 20) {
  const result = spawnSync("rg", ["-n", "-i", "-S", "--hidden", "-g", "!node_modules", "-g", "!.git", query, "."], {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    return { ok: false, output: result.error.message };
  }
  const lines = String(result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(limit, 50)));
  return { ok: true, output: lines.join("\n") };
}

function buildTextContent(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

async function apiFetch(apiPath: string, init?: RequestInit) {
  if (!baseApiUrl || !apiToken) {
    throw new Error("Missing Playground API base URL or token for MCP server.");
  }
  const response = await fetch(`${baseApiUrl}${apiPath}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function handleToolsCall(name: string, args: Record<string, unknown>) {
  if (name === "workspace.search") {
    const result = runRg(String(args.query || ""), Number(args.limit || 20));
    return buildTextContent(result.ok ? trimOutput(result.output) : `Search failed: ${result.output}`);
  }
  if (name === "workspace.read_file") {
    const relPath = normalizeRelPath(args.path);
    const target = relPath ? safeJoin(relPath) : null;
    if (!target || !fs.existsSync(target)) return { ...buildTextContent("File not found."), isError: true };
    const text = fs.readFileSync(target, "utf8");
    return buildTextContent(trimOutput(text, 20000));
  }
  if (name === "workspace.validation_plan") {
    const relPath = normalizeRelPath(args.path);
    if (!relPath) return { ...buildTextContent("Invalid path."), isError: true };
    const ext = path.extname(relPath).toLowerCase();
    const commands = [`git diff --check -- ${relPath}`];
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) commands.push(`npm run lint -- ${relPath}`);
    if (ext === ".py") commands.push(`python -m py_compile ${safeJoin(relPath)}`);
    return buildTextContent(JSON.stringify({ file: relPath, commands }, null, 2));
  }
  if (name === "playground.run_get") {
    const runId = String(args.runId || "").trim();
    const result = await apiFetch(`/api/v1/playground/runs/${encodeURIComponent(runId)}`, { method: "GET" });
    return buildTextContent(JSON.stringify(result, null, 2));
  }
  if (name === "playground.run_control") {
    const runId = String(args.runId || "").trim();
    const action = String(args.action || "").trim();
    const note = String(args.note || "").trim();
    const result = await apiFetch(`/api/v1/playground/runs/${encodeURIComponent(runId)}/control`, {
      method: "POST",
      body: JSON.stringify({ action, ...(note ? { note } : {}) }),
    });
    return buildTextContent(JSON.stringify(result, null, 2));
  }
  if (name === "playground.memory_get") {
    const workspaceFingerprint = String(args.workspaceFingerprint || "").trim();
    const result = await apiFetch(`/api/v1/playground/memory/workspace?workspaceFingerprint=${encodeURIComponent(workspaceFingerprint)}`, {
      method: "GET",
    });
    return buildTextContent(JSON.stringify(result, null, 2));
  }
  if (name === "playground.instructions") {
    const snapshot = await loadInstructionBridge(workspaceRoot);
    return buildTextContent(JSON.stringify(snapshot, null, 2));
  }
  return { ...buildTextContent(`Unknown tool ${name}`), isError: true };
}

async function handleResourcesRead(uri: string) {
  if (uri === "playground://instructions/bridge") {
    const snapshot = await loadInstructionBridge(workspaceRoot);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
    };
  }
  if (uri === "playground://workspace/summary") {
    const rg = runRg(".", 200);
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: rg.ok ? trimOutput(rg.output) : rg.output,
        },
      ],
    };
  }
  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: "Unknown resource",
      },
    ],
  };
}

async function handleRequest(message: JsonRpcRequest) {
  const id = message.id ?? null;
  try {
    if (message.method === "initialize") {
      return success(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: "playground-agent-os",
          version: "0.0.55",
        },
      });
    }
    if (message.method === "notifications/initialized") {
      return;
    }
    if (message.method === "ping") {
      return success(id, {});
    }
    if (message.method === "tools/list") {
      return success(id, {
        tools: [
          {
            name: "workspace.search",
            description: "Search the workspace with ripgrep and return bounded textual results.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "number" },
              },
              required: ["query"],
            },
          },
          {
            name: "workspace.read_file",
            description: "Read a workspace file with path safety and bounded output.",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
              required: ["path"],
            },
          },
          {
            name: "workspace.validation_plan",
            description: "Return a bounded validation plan for a workspace file.",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
              required: ["path"],
            },
          },
          {
            name: "playground.run_get",
            description: "Hydrate a Playground run receipt and review state by run id.",
            inputSchema: {
              type: "object",
              properties: {
                runId: { type: "string" },
              },
              required: ["runId"],
            },
          },
          {
            name: "playground.run_control",
            description: "Pause, resume, cancel, or repair a Playground run.",
            inputSchema: {
              type: "object",
              properties: {
                runId: { type: "string" },
                action: { type: "string", enum: ["pause", "resume", "cancel", "repair"] },
                note: { type: "string" },
              },
              required: ["runId", "action"],
            },
          },
          {
            name: "playground.memory_get",
            description: "Read inspectable workspace memory for a workspace fingerprint.",
            inputSchema: {
              type: "object",
              properties: {
                workspaceFingerprint: { type: "string" },
              },
              required: ["workspaceFingerprint"],
            },
          },
          {
            name: "playground.instructions",
            description: "Load the instruction bridge generated from AGENTS.md and local skills.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      });
    }
    if (message.method === "tools/call") {
      const params = message.params || {};
      const name = String(params.name || "");
      const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
      const result = await handleToolsCall(name, args);
      return success(id, result);
    }
    if (message.method === "resources/list") {
      return success(id, {
        resources: [
          {
            uri: "playground://instructions/bridge",
            name: "Instruction Bridge",
            description: "Generated bridge from AGENTS.md and local skills.",
            mimeType: "application/json",
          },
          {
            uri: "playground://workspace/summary",
            name: "Workspace Summary",
            description: "Bounded workspace search snapshot.",
            mimeType: "text/plain",
          },
        ],
      });
    }
    if (message.method === "resources/read") {
      const uri = String(message.params?.uri || "");
      const result = await handleResourcesRead(uri);
      return success(id, result);
    }
    return failure(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    return failure(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on("data", async (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const headerText = buffer.slice(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(headerText);
    if (!match) {
      buffer = Buffer.alloc(0);
      return;
    }
    const contentLength = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) return;
    const body = buffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
    buffer = buffer.slice(bodyStart + contentLength);
    let message: JsonRpcRequest | null = null;
    try {
      message = JSON.parse(body) as JsonRpcRequest;
    } catch {
      message = null;
    }
    if (message) {
      await handleRequest(message);
    }
  }
});
