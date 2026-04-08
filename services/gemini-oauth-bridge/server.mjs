import http from "node:http";
import process from "node:process";
import { randomUUID } from "node:crypto";

const PORT = Number.parseInt(process.env.PORT || "8004", 10);
const HOST = process.env.HOST || "127.0.0.1";
const GOOGLE_API_BASE = (process.env.GEMINI_NATIVE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
const DEFAULT_MODELS = String(process.env.GEMINI_OAUTH_MODELS || "gemini-2.5-pro").split(",").map((item) => item.trim()).filter(Boolean);

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
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.input_text === "string") return part.input_text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildPromptFromMessages(messages) {
  return Array.isArray(messages)
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
}

function buildPromptFromResponsesInput(input) {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
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

function getBearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new Error("Gemini OAuth bridge requires a Bearer token.");
  }
  return header.slice(7).trim();
}

async function googleJson(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text().catch(() => "");
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { raw };
  }
  if (!response.ok) {
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      raw ||
      `Google API request failed with status ${response.status}`;
    throw new Error(String(message));
  }
  return parsed;
}

async function listModels(accessToken) {
  const parsed = await googleJson(`${GOOGLE_API_BASE}/models?pageSize=100`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const models = Array.isArray(parsed.models)
    ? parsed.models
        .map((item) => String(item?.name || "").trim().replace(/^models\//, ""))
        .filter(Boolean)
    : [];
  return models.length ? Array.from(new Set(models)) : [...DEFAULT_MODELS];
}

async function generateContent({ accessToken, model, prompt }) {
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt || "Hello" }],
      },
    ],
  };
  const parsed = await googleJson(`${GOOGLE_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = Array.isArray(parsed.candidates)
    ? parsed.candidates
        .flatMap((candidate) =>
          Array.isArray(candidate?.content?.parts)
            ? candidate.content.parts.map((part) => String(part?.text || "").trim()).filter(Boolean)
            : []
        )
        .join("\n")
        .trim()
    : "";
  return text || "";
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
        service: "gemini_oauth_bridge",
        baseUrl: GOOGLE_API_BASE,
        models: DEFAULT_MODELS,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const accessToken = getBearerToken(req);
      const models = await listModels(accessToken);
      sendJson(res, 200, {
        object: "list",
        data: models.map((id) => ({
          id,
          object: "model",
          created: 0,
          owned_by: "gemini_oauth_bridge",
        })),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      const accessToken = getBearerToken(req);
      const body = await readJsonBody(req);
      const model = String(body?.model || DEFAULT_MODELS[0] || "gemini-2.5-pro").trim();
      const prompt = buildPromptFromMessages(body?.messages);
      const text = await generateContent({ accessToken, model, prompt });
      sendJson(res, 200, buildChatCompletionResponse({ model, text }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/responses") {
      const accessToken = getBearerToken(req);
      const body = await readJsonBody(req);
      const model = String(body?.model || DEFAULT_MODELS[0] || "gemini-2.5-pro").trim();
      const prompt = buildPromptFromResponsesInput(body?.input);
      const text = await generateContent({ accessToken, model, prompt });
      sendJson(res, 200, buildResponsesApiResponse({ model, text }));
      return;
    }

    sendText(res, 404, "Not Found");
  } catch (error) {
    sendJson(res, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "gemini_bridge_error",
      },
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Gemini OAuth bridge listening on http://${HOST}:${PORT}\n`);
});
