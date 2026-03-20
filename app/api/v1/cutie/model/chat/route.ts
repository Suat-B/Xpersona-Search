import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { unauthorized } from "@/lib/playground/http";

const CUTIE_ROUTER_BASE_URL = "https://router.huggingface.co/v1";

const zCutieMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(120_000),
});

const zCutieChatRequest = z.object({
  model: z.string().min(1).max(240).default("MiniMaxAI/MiniMax-M2.5:fastest"),
  messages: z.array(zCutieMessage).min(1).max(80),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(4096).optional(),
  stream: z.boolean().optional().default(true),
});

type HfRouterChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
  model?: string;
};

function sse(event: string, data: unknown): string {
  return `data: ${JSON.stringify({ event, data })}\n\n`;
}

async function readRawBody(request: NextRequest): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function extractOpenAiDelta(chunk: HfRouterChunk): string {
  return String(chunk.choices?.[0]?.delta?.content || "");
}

async function streamHfRouterResponse(input: {
  body: z.infer<typeof zCutieChatRequest>;
}): Promise<Response> {
  const token = String(process.env.HF_TOKEN || "").trim();
  if (!token) {
    return jsonResponse(
      {
        error: {
          code: "CUTIE_ROUTER_TOKEN_MISSING",
          message: "HF_TOKEN is not configured for the Cutie model proxy.",
        },
      },
      500
    );
  }

  const upstream = await fetch(`${CUTIE_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: input.body.model,
      messages: input.body.messages,
      stream: true,
      temperature: input.body.temperature ?? 0.2,
      max_tokens: input.body.maxTokens ?? 1200,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    return jsonResponse(
      {
        error: {
          code: "CUTIE_ROUTER_REQUEST_FAILED",
          message: raw || `Hugging Face Router request failed with ${upstream.status}.`,
        },
      },
      upstream.status || 502
    );
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  void (async () => {
    let rawBuffer = "";
    let finalText = "";
    let usage: Record<string, unknown> | null = null;
    let resolvedModel = input.body.model;

    const flushBlock = async (block: string) => {
      const lines = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (!lines.length) return;

      const payload = lines.join("\n").trim();
      if (!payload) return;
      if (payload === "[DONE]") {
        await writer.write(encoder.encode(sse("final", finalText)));
        await writer.write(
          encoder.encode(
            sse("meta", {
              model: resolvedModel,
              usage,
            })
          )
        );
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        return;
      }

      let parsed: HfRouterChunk;
      try {
        parsed = JSON.parse(payload) as HfRouterChunk;
      } catch {
        return;
      }

      if (typeof parsed.model === "string" && parsed.model.trim()) {
        resolvedModel = parsed.model.trim();
      }
      if (parsed.usage && typeof parsed.usage === "object") {
        usage = parsed.usage;
      }

      const delta = extractOpenAiDelta(parsed);
      if (delta) {
        finalText += delta;
        await writer.write(encoder.encode(sse("delta", { text: delta })));
      }

      if (parsed.choices?.[0]?.finish_reason) {
        await writer.write(
          encoder.encode(
            sse("status", {
              finishReason: parsed.choices[0].finish_reason,
            })
          )
        );
      }
    };

    try {
      await writer.write(encoder.encode(sse("ack", "Cutie model stream connected.")));

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        rawBuffer += decoder.decode(value, { stream: true });
        let boundary = rawBuffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = rawBuffer.slice(0, boundary);
          rawBuffer = rawBuffer.slice(boundary + 2);
          await flushBlock(block);
          boundary = rawBuffer.indexOf("\n\n");
        }
      }

      const trailing = rawBuffer.trim();
      if (trailing) {
        await flushBlock(trailing);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writer.write(
        encoder.encode(
          sse("error", {
            code: "CUTIE_STREAM_FAILED",
            message,
          })
        )
      );
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
      reader.releaseLock();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const raw = await readRawBody(request);
  const parsed = zCutieChatRequest.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "CUTIE_INVALID_REQUEST",
          message: "Invalid Cutie chat request.",
          issues: parsed.error.flatten(),
        },
      },
      400
    );
  }

  return streamHfRouterResponse({
    body: parsed.data,
  });
}
