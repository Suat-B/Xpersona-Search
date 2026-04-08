import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number.parseInt(process.env.PORT || "8002", 10);
const HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_MODELS = String(process.env.QWEN_PORTAL_MODELS || "qwen-plus").split(",").map((item) => item.trim()).filter(Boolean);
const QWEN_CLI_PATH = resolveQwenCliPath();
function normalizeRequestedModel(model) {
  const normalized = String(model || "").trim();
  if (!normalized) return null;
  if (normalized === "qwen-plus" || normalized === "qwen_portal") {
    return "coder-model";
  }
  return normalized;
}

function resolveQwenCliPath() {
  const configured = String(process.env.BINARY_QWEN_CLI_PATH || "").trim();
  if (configured) return configured;
  if (process.platform === "win32") {
    return path.join(
      os.homedir(),
      ".trae",
      "extensions",
      "playgroundai.xpersona-playground-0.0.59",
      "node_modules",
      "@qwen-code",
      "sdk",
      "dist",
      "cli",
      "cli.js"
    );
  }
  return "qwen";
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function flattenContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        if (typeof part.text === "string") return part.text;
        if (typeof part.input_text === "string") return part.input_text;
        if (typeof part.content === "string") return part.content;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildPromptFromMessages(messages) {
  const transcript = Array.isArray(messages)
    ? messages
        .map((message) => {
          if (!message || typeof message !== "object") return "";
          const role = String(message.role || "user").toUpperCase();
          const content = flattenContent(message.content);
          return content ? `${role}:\n${content}` : "";
        })
        .filter(Boolean)
        .join("\n\n")
    : "";
  return [
    "You are acting as the Qwen runtime route for Binary.",
    "Respond with the assistant message content for the conversation below.",
    transcript || "USER:\nHello",
  ].join("\n\n");
}

function buildPromptFromResponsesInput(input) {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        if (typeof item.content === "string") return item.content;
        if (Array.isArray(item.content)) return flattenContent(item.content);
        if (typeof item.text === "string") return item.text;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function extractAssistantText(events) {
  const resultEvent = [...events].reverse().find((entry) => entry?.type === "result" && typeof entry.result === "string");
  if (resultEvent?.result) return String(resultEvent.result).trim();
  const assistantText = [...events]
    .reverse()
    .find(
      (entry) =>
        entry?.type === "assistant" &&
        entry?.message &&
        Array.isArray(entry.message.content) &&
        entry.message.content.some((part) => part?.type === "text" && typeof part.text === "string")
    );
  if (assistantText?.message?.content) {
    return assistantText.message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  return "";
}

function runQwenPrompt({ prompt, model }) {
  return new Promise((resolve, reject) => {
    const args = [];
    let command = QWEN_CLI_PATH;
    if (QWEN_CLI_PATH.endsWith(".js")) {
      command = process.execPath;
      args.push(QWEN_CLI_PATH);
    }
    args.push("--auth-type", "qwen-oauth", "--output-format", "json", "--approval-mode", "yolo");
    const effectiveModel = normalizeRequestedModel(model);
    if (effectiveModel) args.push("--model", effectiveModel);
    args.push("--prompt", prompt);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const rawStdout = Buffer.concat(stdout).toString("utf8").trim();
      const rawStderr = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(rawStderr || rawStdout || `Qwen CLI exited with code ${code}`));
        return;
      }
      try {
        const events = JSON.parse(rawStdout);
        const text = extractAssistantText(Array.isArray(events) ? events : []);
        if (!text) {
          reject(new Error("Qwen bridge could not extract assistant text from the CLI response."));
          return;
        }
        resolve({ text, events: Array.isArray(events) ? events : [] });
      } catch (error) {
        reject(new Error(`Qwen bridge failed to parse CLI output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

function buildChatCompletionResponse({ model, text }) {
  return {
    id: `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: text,
        },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function buildResponsesApiResponse({ model, text }) {
  return {
    id: `resp_${randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        id: `msg_${randomUUID()}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text,
            annotations: [],
          },
        ],
      },
    ],
    output_text: text,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      sendJson(res, 200, {
        ok: true,
        service: "qwen_portal_bridge",
        cliPath: QWEN_CLI_PATH,
        models: DEFAULT_MODELS,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: DEFAULT_MODELS.map((id) => ({
          id,
          object: "model",
          created: 0,
          owned_by: "qwen_portal_bridge",
        })),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readJsonBody(req);
      const model = String(body?.model || DEFAULT_MODELS[0] || "qwen-plus").trim();
      const prompt = buildPromptFromMessages(body?.messages);
      const { text } = await runQwenPrompt({ prompt, model });
      sendJson(res, 200, buildChatCompletionResponse({ model, text }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/responses") {
      const body = await readJsonBody(req);
      const model = String(body?.model || DEFAULT_MODELS[0] || "qwen-plus").trim();
      const prompt = buildPromptFromResponsesInput(body?.input);
      const { text } = await runQwenPrompt({ prompt, model });
      sendJson(res, 200, buildResponsesApiResponse({ model, text }));
      return;
    }

    sendText(res, 404, "Not Found");
  } catch (error) {
    sendJson(res, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "qwen_bridge_error",
      },
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Qwen portal bridge listening on http://${HOST}:${PORT}\n`);
});
