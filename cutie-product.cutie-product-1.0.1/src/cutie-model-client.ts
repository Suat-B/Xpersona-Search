import { streamJsonEvents, type RequestAuth } from "@xpersona/vscode-core";
import { getBaseApiUrl, getModelHint } from "./config";
import type { CutieModelMessage, CutieModelTurnResult } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class CutieModelClient {
  async streamTurn(input: {
    auth: RequestAuth;
    messages: CutieModelMessage[];
    signal?: AbortSignal;
    onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  }): Promise<CutieModelTurnResult> {
    let accumulated = "";
    let usage: Record<string, unknown> | null = null;
    let resolvedModel: string | undefined;

    await streamJsonEvents(
      "POST",
      `${getBaseApiUrl()}/api/v1/cutie/model/chat`,
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

    return {
      rawText: accumulated,
      finalText: accumulated,
      usage,
      model: resolvedModel,
    };
  }
}
