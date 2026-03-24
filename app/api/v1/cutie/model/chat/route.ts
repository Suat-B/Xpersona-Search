import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { unauthorized } from "@/lib/playground/http";
import {
  resolveServerMaxToolsPerBatch,
  resolveServerModelCapabilities,
  resolveServerProtocolMode,
  type CutieServerProtocolMode,
} from "./capabilities";
import {
  finalizeStreamingToolCalls,
  mergeStreamingToolCalls,
  normalizeStructuredCutieTurnResult,
  stripCutieToolArtifactText,
  type StreamingToolCallAccumulator,
} from "./structured";

const CUTIE_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const CUTIE_ORCHESTRATOR_CONTRACT_VERSION = "canonical_portability_v1";
const CUTIE_PORTABILITY_MODE = "canonical_default";

const zCutieMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(120_000),
});

const zCutieToolDefinition = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4_000).optional().default(""),
  kind: z.string().optional(),
  domain: z.string().optional(),
  inputSchema: z.record(z.unknown()).optional().default({}),
});

const zCutieChatRequest = z.object({
  model: z.string().min(1).max(240).default("openai/gpt-oss-120b:fastest"),
  protocol: z.enum(["cutie_tools_v2"]).optional(),
  protocolMode: z.enum(["native_tools", "text_extraction", "final_only"]).optional(),
  messages: z.array(zCutieMessage).min(1).max(80),
  tools: z.array(zCutieToolDefinition).max(64).optional().default([]),
  maxToolsPerBatch: z.number().int().min(1).max(8).optional().default(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(4096).optional(),
  stream: z.boolean().optional().default(true),
});

type HfRouterToolCall = {
  id?: string | null;
  index?: number | null;
  type?: string | null;
  function?: {
    name?: string | null;
    arguments?: string | null;
  } | null;
};

type HfRouterChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: HfRouterToolCall[] | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
  model?: string;
};

type HfRouterNonStreamResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: HfRouterToolCall[] | null;
    };
  }>;
  usage?: Record<string, unknown>;
  model?: string;
};

function sse(event: string, data: unknown): string {
  return `data: ${JSON.stringify({ event, data })}\n\n`;
}

function resolveNormalizationTier(input: {
  normalizationSource: "upstream_tool_calls" | "streamed_tool_calls" | "text_tool_artifact" | "plain_final";
}): "transport_normalized" | "artifact_rescue" | "plain_final" {
  if (input.normalizationSource === "text_tool_artifact") return "artifact_rescue";
  if (input.normalizationSource === "plain_final") return "plain_final";
  return "transport_normalized";
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

function buildAllowedToolNames(input: z.infer<typeof zCutieChatRequest>): Set<string> {
  return new Set((input.tools || []).map((tool) => String(tool.name || "").trim()).filter(Boolean));
}

function extractOpenAiDelta(chunk: HfRouterChunk): string {
  return String(chunk.choices?.[0]?.delta?.content || "");
}

function mapCutieToolsForUpstream(tools: z.infer<typeof zCutieToolDefinition>[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters:
        tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)
          ? tool.inputSchema
          : { type: "object", properties: {}, additionalProperties: true },
    },
  }));
}

function buildUpstreamRequestBody(input: { body: z.infer<typeof zCutieChatRequest> }): Record<string, unknown> {
  const capabilities = resolveServerModelCapabilities(input.body.model);
  const resolvedMode = resolveServerProtocolMode({
    requestedMode: input.body.protocolMode as CutieServerProtocolMode | undefined,
    capabilities,
  });
  const maxToolsPerBatch = resolveServerMaxToolsPerBatch({
    requested: input.body.maxToolsPerBatch ?? 1,
    capabilities,
  });
  const payload: Record<string, unknown> = {
    model: input.body.model,
    messages: input.body.messages,
    stream: input.body.stream,
    temperature: input.body.temperature ?? 0.2,
    max_tokens: input.body.maxTokens ?? 1200,
  };
  if (
    input.body.protocol === "cutie_tools_v2" &&
    resolvedMode === "native_tools" &&
    capabilities.nativeTools !== "none" &&
    input.body.tools.length
  ) {
    payload.tools = mapCutieToolsForUpstream(input.body.tools);
    payload.tool_choice = "auto";
    if (maxToolsPerBatch > 1) {
      payload.parallel_tool_calls = true;
    }
  }
  return payload;
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

  const protocolActive = input.body.protocol === "cutie_tools_v2";
  const capabilities = resolveServerModelCapabilities(input.body.model);
  const allowedToolNames = buildAllowedToolNames(input.body);
  const resolvedMode = resolveServerProtocolMode({
    requestedMode: input.body.protocolMode as CutieServerProtocolMode | undefined,
    capabilities,
  });
  const maxToolsPerBatch = resolveServerMaxToolsPerBatch({
    requested: input.body.maxToolsPerBatch ?? 1,
    capabilities,
  });

  const upstream = await fetch(`${CUTIE_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildUpstreamRequestBody(input)),
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
    let rawAssistantText = "";
    let emittedAssistantText = "";
    let finalText = "";
    let usage: Record<string, unknown> | null = null;
    let resolvedModel = input.body.model;
    let terminalEventSent = false;
    const streamedToolCalls: StreamingToolCallAccumulator[] = [];

    const emitTerminalEvent = async () => {
      if (terminalEventSent) return;
      terminalEventSent = true;
      let normalizationSource: "upstream_tool_calls" | "streamed_tool_calls" | "text_tool_artifact" | "plain_final" =
        "plain_final";
      let artifactExtractionShape: string | undefined;
      let batchCollapsedToSingleAction: boolean | undefined;
      if (protocolActive) {
        const normalized = normalizeStructuredCutieTurnResult({
          assistantText: rawAssistantText,
          upstreamToolCalls: finalizeStreamingToolCalls(streamedToolCalls, allowedToolNames, maxToolsPerBatch),
          allowedToolNames,
          maxToolsPerBatch,
          streamedToolCalls: true,
        });
        normalizationSource = normalized.normalizationSource;
        artifactExtractionShape = normalized.artifactExtractionShape;
        batchCollapsedToSingleAction = normalized.batchCollapsedToSingleAction;
        if (normalized.response.type === "tool_batch") {
          await writer.write(encoder.encode(sse("tool_batch", { toolCalls: normalized.response.toolCalls })));
        } else {
          await writer.write(encoder.encode(sse("final", { text: normalized.response.text })));
        }
      } else {
        await writer.write(encoder.encode(sse("final", { text: finalText })));
      }
      await writer.write(
        encoder.encode(
          sse("meta", {
            model: resolvedModel,
            usage,
            modelAdapter: CUTIE_ORCHESTRATOR_CONTRACT_VERSION,
            modelCapabilities: capabilities,
            protocolMode: resolvedMode,
            orchestratorContractVersion: CUTIE_ORCHESTRATOR_CONTRACT_VERSION,
            portabilityMode: CUTIE_PORTABILITY_MODE,
            transportModeUsed: resolvedMode,
            normalizationSource,
            normalizationTier: resolveNormalizationTier({ normalizationSource }),
            ...(artifactExtractionShape ? { artifactExtractionShape } : {}),
            ...(batchCollapsedToSingleAction !== undefined
              ? { batchCollapsedToSingleAction }
              : {}),
            fallbackModeUsed:
              resolvedMode === "text_extraction" || normalizationSource === "text_tool_artifact"
                ? "text_extraction"
                : "none",
          })
        )
      );
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    };

    const flushBlock = async (block: string) => {
      const lines = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (!lines.length) return;

      const payload = lines.join("\n").trim();
      if (!payload) return;
      if (payload === "[DONE]") {
        await emitTerminalEvent();
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
        if (protocolActive) {
          rawAssistantText += delta;
          const visibleText = stripCutieToolArtifactText(rawAssistantText);
          const nextDelta = visibleText.slice(emittedAssistantText.length);
          emittedAssistantText = visibleText;
          if (nextDelta) {
            await writer.write(encoder.encode(sse("assistant_delta", { text: nextDelta })));
          }
        } else {
          finalText += delta;
          await writer.write(encoder.encode(sse("delta", { text: delta })));
        }
      }

      if (protocolActive) {
        mergeStreamingToolCalls(streamedToolCalls, parsed.choices?.[0]?.delta?.tool_calls || []);
      }

      if (!protocolActive && parsed.choices?.[0]?.finish_reason) {
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
      await emitTerminalEvent();
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

async function requestHfRouterResponse(input: {
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

  const protocolActive = input.body.protocol === "cutie_tools_v2";
  const capabilities = resolveServerModelCapabilities(input.body.model);
  const allowedToolNames = buildAllowedToolNames(input.body);
  const resolvedMode = resolveServerProtocolMode({
    requestedMode: input.body.protocolMode as CutieServerProtocolMode | undefined,
    capabilities,
  });
  const maxToolsPerBatch = resolveServerMaxToolsPerBatch({
    requested: input.body.maxToolsPerBatch ?? 1,
    capabilities,
  });

  const upstream = await fetch(`${CUTIE_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildUpstreamRequestBody({ body: { ...input.body, stream: false } })),
  });

  if (!upstream.ok) {
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

  const data = (await upstream.json().catch(() => ({}))) as HfRouterNonStreamResponse;
  const text = String(data.choices?.[0]?.message?.content || "");

  if (protocolActive) {
    const normalized = normalizeStructuredCutieTurnResult({
      assistantText: text,
      upstreamToolCalls: data.choices?.[0]?.message?.tool_calls,
      allowedToolNames,
      maxToolsPerBatch,
    });
    return jsonResponse({
      response: normalized.response,
      assistantText: normalized.assistantText,
      model: data.model || input.body.model,
      usage: data.usage || null,
      modelAdapter: CUTIE_ORCHESTRATOR_CONTRACT_VERSION,
      modelCapabilities: capabilities,
      protocolMode: resolvedMode,
      orchestratorContractVersion: CUTIE_ORCHESTRATOR_CONTRACT_VERSION,
      portabilityMode: CUTIE_PORTABILITY_MODE,
      transportModeUsed: resolvedMode,
      normalizationSource: normalized.normalizationSource,
      normalizationTier: resolveNormalizationTier({ normalizationSource: normalized.normalizationSource }),
      ...(normalized.artifactExtractionShape ? { artifactExtractionShape: normalized.artifactExtractionShape } : {}),
      ...(normalized.batchCollapsedToSingleAction !== undefined
        ? { batchCollapsedToSingleAction: normalized.batchCollapsedToSingleAction }
        : {}),
      fallbackModeUsed:
        resolvedMode === "text_extraction" || normalized.normalizationSource === "text_tool_artifact"
          ? "text_extraction"
          : "none",
    });
  }

  return jsonResponse({
    text,
    model: data.model || input.body.model,
    usage: data.usage || null,
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

  if (parsed.data.stream === false) {
    return requestHfRouterResponse({
      body: parsed.data,
    });
  }

  return streamHfRouterResponse({
    body: parsed.data,
  });
}
