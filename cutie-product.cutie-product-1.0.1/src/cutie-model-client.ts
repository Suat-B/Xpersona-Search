import { requestJson, streamJsonEvents, type RequestAuth } from "@xpersona/vscode-core";
import { getBaseApiUrl, getModelHint } from "./config";
import type { CutieModelMessage, CutieModelTurnResult } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class CutieModelClient {
  async completeTurn(input: {
    auth: RequestAuth;
    messages: CutieModelMessage[];
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
  }): Promise<CutieModelTurnResult> {
    const response = await requestJson<{
      text?: string;
      model?: string;
      usage?: Record<string, unknown> | null;
    }>(
      "POST",
      `${getBaseApiUrl()}/api/v1/cutie/model/chat`,
      input.auth,
      {
        model: getModelHint(),
        stream: false,
        messages: input.messages,
        ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
        ...(typeof input.maxTokens === "number" ? { maxTokens: input.maxTokens } : {}),
      },
      {
        signal: input.signal,
      }
    );

    return {
      rawText: String(response.text || ""),
      finalText: String(response.text || ""),
      usage: response.usage && typeof response.usage === "object" ? response.usage : null,
      model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
    };
  }

  async streamTurn(input: {
    auth: RequestAuth;
    messages: CutieModelMessage[];
    signal?: AbortSignal;
    onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  }): Promise<CutieModelTurnResult> {
    let accumulated = "";
    let usage: Record<string, unknown> | null = null;
    let resolvedModel: string | undefined;
    const endpoint = `${getBaseApiUrl()}/api/v1/cutie/model/chat`;

    await streamJsonEvents(
      "POST",
      endpoint,
      input.auth,
      {
        model: getModelHint(),
        stream: true,
        messages: input.messages,
      },
      async (event, data) => {
        if (event === "delta") {
          const text = String(asRecord(data).text || "");
          if (!text) return;
          accumulated += text;
          await input.onDelta?.(text, accumulated);
          return;
        }
        if (event === "final" && typeof data === "string") {
          accumulated = data;
          return;
        }
        if (event === "meta") {
          const payload = asRecord(data);
          if (payload.usage && typeof payload.usage === "object") {
            usage = payload.usage as Record<string, unknown>;
          }
          if (typeof payload.model === "string") {
            resolvedModel = payload.model;
          }
          return;
        }
        if (event === "error") {
          const payload = asRecord(data);
          throw new Error(String(payload.message || "Cutie model request failed."));
        }
      },
      {
        signal: input.signal,
      }
    );

    if (!accumulated.trim()) {
      const fallback = await this.completeTurn({
        auth: input.auth,
        signal: input.signal,
        messages: input.messages,
      }).catch(() => null);

      if (fallback) {
        accumulated = fallback.finalText;
        resolvedModel = fallback.model || resolvedModel;
        if (fallback.usage && typeof fallback.usage === "object") {
          usage = fallback.usage;
        }
      }
    }

    return {
      rawText: accumulated,
      finalText: accumulated,
      usage,
      model: resolvedModel,
    };
  }
}
