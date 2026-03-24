import { requestJson, streamJsonEvents, type RequestAuth } from "@xpersona/vscode-core";
import { getBaseApiUrl, getModelHint } from "./config";
import { humanizeCutieHostHttpError } from "./cutie-host-http-error";
import { limitCutieModelMessages } from "./cutie-policy";
import {
  CutieStructuredProtocolError,
  normalizeProtocolResponsePayload,
  parseStructuredStreamEvent,
} from "./cutie-model-protocol";
import { extractVisibleAssistantText, looksLikeCutieToolArtifactText } from "./cutie-native-autonomy";
import type { CutieModelMessage, CutieModelTurnResult, CutieProtocolMode, CutieProtocolToolDefinition } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function rethrowWithHostHttpHint(error: unknown): never {
  const hint = humanizeCutieHostHttpError(error);
  if (hint) throw new Error(hint);
  throw error;
}

type StructuredTurnInput = {
  auth: RequestAuth;
  messages: CutieModelMessage[];
  tools: CutieProtocolToolDefinition[];
  maxToolsPerBatch: number;
  protocolMode?: CutieProtocolMode;
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
};

function buildStructuredRequestBody(input: StructuredTurnInput, stream: boolean): Record<string, unknown> {
  return {
    model: getModelHint(),
    protocol: "cutie_tools_v2",
    protocolMode: input.protocolMode || "native_tools",
    stream,
    messages: limitCutieModelMessages(input.messages),
    tools: input.tools,
    maxToolsPerBatch: input.maxToolsPerBatch,
  };
}

export class CutieModelClient {
  async completeTurn(input: {
    auth: RequestAuth;
    messages: CutieModelMessage[];
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ rawText: string; finalText: string; usage?: Record<string, unknown> | null; model?: string }> {
    let response: {
      text?: string;
      model?: string;
      usage?: Record<string, unknown> | null;
    };
    try {
      response = await requestJson<typeof response>(
        "POST",
        `${getBaseApiUrl()}/api/v1/cutie/model/chat`,
        input.auth,
        {
          model: getModelHint(),
          stream: false,
          messages: limitCutieModelMessages(input.messages),
          ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
          ...(typeof input.maxTokens === "number" ? { maxTokens: input.maxTokens } : {}),
        },
        {
          signal: input.signal,
        }
      );
    } catch (e) {
      rethrowWithHostHttpHint(e);
    }

    return {
      rawText: String(response.text || ""),
      finalText: String(response.text || ""),
      usage: response.usage && typeof response.usage === "object" ? response.usage : null,
      model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
    };
  }

  async completeStructuredTurn(input: StructuredTurnInput): Promise<CutieModelTurnResult> {
    return this.withStructuredProtocolRetry(() => this.completeStructuredTurnOnce(input));
  }

  async streamStructuredTurn(input: StructuredTurnInput): Promise<CutieModelTurnResult> {
    return this.withStructuredProtocolRetry(() => this.streamStructuredTurnOnce(input));
  }

  private async withStructuredProtocolRetry(factory: () => Promise<CutieModelTurnResult>): Promise<CutieModelTurnResult> {
    try {
      return await factory();
    } catch (error) {
      if (!(error instanceof CutieStructuredProtocolError)) {
        rethrowWithHostHttpHint(error);
      }
      try {
        return await factory();
      } catch (secondError) {
        if (secondError instanceof CutieStructuredProtocolError) {
          throw new Error(`Cutie server returned an invalid cutie_tools_v2 response. ${secondError.message}`);
        }
        rethrowWithHostHttpHint(secondError);
      }
    }
  }

  private async completeStructuredTurnOnce(input: StructuredTurnInput): Promise<CutieModelTurnResult> {
    let response: {
      response?: unknown;
      assistantText?: unknown;
      model?: string;
      usage?: Record<string, unknown> | null;
      modelAdapter?: unknown;
      modelCapabilities?: unknown;
      protocolMode?: unknown;
      orchestratorContractVersion?: unknown;
      portabilityMode?: unknown;
      transportModeUsed?: unknown;
      normalizationSource?: unknown;
      normalizationTier?: unknown;
      artifactExtractionShape?: unknown;
      fallbackModeUsed?: unknown;
      batchCollapsedToSingleAction?: unknown;
      type?: unknown;
      text?: unknown;
      toolCalls?: unknown;
      objectives?: unknown;
    };
    try {
      response = await requestJson<typeof response>(
        "POST",
        `${getBaseApiUrl()}/api/v1/cutie/model/chat`,
        input.auth,
        buildStructuredRequestBody(input, false),
        {
          signal: input.signal,
        }
      );
    } catch (error) {
      rethrowWithHostHttpHint(error);
    }

    const normalized = normalizeProtocolResponsePayload(response.response ?? response);
    return {
      response: normalized,
      assistantText: typeof response.assistantText === "string" ? response.assistantText : "",
      usage: response.usage && typeof response.usage === "object" ? response.usage : null,
      model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
      ...(typeof response.modelAdapter === "string" ? { modelAdapter: response.modelAdapter as CutieModelTurnResult["modelAdapter"] } : {}),
      ...(response.modelCapabilities && typeof response.modelCapabilities === "object"
        ? { modelCapabilities: response.modelCapabilities as CutieModelTurnResult["modelCapabilities"] }
        : {}),
      ...(typeof response.protocolMode === "string" ? { protocolMode: response.protocolMode as CutieProtocolMode } : {}),
      ...(typeof response.orchestratorContractVersion === "string"
        ? {
            orchestratorContractVersion:
              response.orchestratorContractVersion as CutieModelTurnResult["orchestratorContractVersion"],
          }
        : {}),
      ...(typeof response.portabilityMode === "string"
        ? { portabilityMode: response.portabilityMode as CutieModelTurnResult["portabilityMode"] }
        : {}),
      ...(typeof response.transportModeUsed === "string"
        ? { transportModeUsed: response.transportModeUsed as CutieModelTurnResult["transportModeUsed"] }
        : {}),
      ...(typeof response.normalizationSource === "string"
        ? { normalizationSource: response.normalizationSource as CutieModelTurnResult["normalizationSource"] }
        : {}),
      ...(typeof response.normalizationTier === "string"
        ? { normalizationTier: response.normalizationTier as CutieModelTurnResult["normalizationTier"] }
        : {}),
      ...(typeof response.artifactExtractionShape === "string"
        ? { artifactExtractionShape: response.artifactExtractionShape as CutieModelTurnResult["artifactExtractionShape"] }
        : {}),
      ...(typeof response.fallbackModeUsed === "string"
        ? { fallbackModeUsed: response.fallbackModeUsed as CutieModelTurnResult["fallbackModeUsed"] }
        : {}),
      ...(typeof response.batchCollapsedToSingleAction === "boolean"
        ? { batchCollapsedToSingleAction: response.batchCollapsedToSingleAction }
        : {}),
    };
  }

  private async streamStructuredTurnOnce(input: StructuredTurnInput): Promise<CutieModelTurnResult> {
    let assistantText = "";
    let rawAssistantText = "";
    let suppressedAssistantArtifact = "";
    let usage: Record<string, unknown> | null = null;
    let resolvedModel: string | undefined;
    let responsePayload: CutieModelTurnResult["response"] | null = null;
    let modelAdapter: CutieModelTurnResult["modelAdapter"];
    let modelCapabilities: CutieModelTurnResult["modelCapabilities"];
    let protocolMode: CutieModelTurnResult["protocolMode"];
    let orchestratorContractVersion: CutieModelTurnResult["orchestratorContractVersion"];
    let portabilityMode: CutieModelTurnResult["portabilityMode"];
    let transportModeUsed: CutieModelTurnResult["transportModeUsed"];
    let normalizationSource: CutieModelTurnResult["normalizationSource"];
    let normalizationTier: CutieModelTurnResult["normalizationTier"];
    let artifactExtractionShape: CutieModelTurnResult["artifactExtractionShape"];
    let fallbackModeUsed: CutieModelTurnResult["fallbackModeUsed"];
    let batchCollapsedToSingleAction: CutieModelTurnResult["batchCollapsedToSingleAction"];

    try {
      await streamJsonEvents(
        "POST",
        `${getBaseApiUrl()}/api/v1/cutie/model/chat`,
        input.auth,
        buildStructuredRequestBody(input, true),
        async (event, data) => {
          if (input.signal?.aborted) {
            throw new Error("Request aborted");
          }
          const parsed = parseStructuredStreamEvent(event, data);
          if (parsed.type === "assistant_delta") {
            rawAssistantText += parsed.text;
            const visibleText = extractVisibleAssistantText(rawAssistantText);
            if (looksLikeCutieToolArtifactText(rawAssistantText)) {
              suppressedAssistantArtifact = rawAssistantText.trim();
            }
            if (visibleText.length > assistantText.length) {
              const nextDelta = visibleText.slice(assistantText.length);
              assistantText = visibleText;
              await input.onDelta?.(nextDelta, assistantText);
            }
            return;
          }
          if (parsed.type === "noop") {
            return;
          }
          if (parsed.type === "meta") {
            if (parsed.usage && typeof parsed.usage === "object") {
              usage = parsed.usage;
            }
            if (parsed.model) {
              resolvedModel = parsed.model;
            }
            modelAdapter = parsed.modelAdapter || modelAdapter;
            modelCapabilities = parsed.modelCapabilities || modelCapabilities;
            protocolMode = parsed.protocolMode || protocolMode;
            orchestratorContractVersion = parsed.orchestratorContractVersion || orchestratorContractVersion;
            portabilityMode = parsed.portabilityMode || portabilityMode;
            transportModeUsed = parsed.transportModeUsed || transportModeUsed;
            normalizationSource = parsed.normalizationSource || normalizationSource;
            normalizationTier = parsed.normalizationTier || normalizationTier;
            artifactExtractionShape = parsed.artifactExtractionShape || artifactExtractionShape;
            fallbackModeUsed = parsed.fallbackModeUsed || fallbackModeUsed;
            batchCollapsedToSingleAction =
              parsed.batchCollapsedToSingleAction !== undefined
                ? parsed.batchCollapsedToSingleAction
                : batchCollapsedToSingleAction;
            return;
          }
          if (parsed.type === "error") {
            throw new Error(parsed.message);
          }
          responsePayload = parsed.response;
        },
        {
          signal: input.signal,
        }
      );
    } catch (error) {
      rethrowWithHostHttpHint(error);
    }

    if (!responsePayload) {
      throw new CutieStructuredProtocolError("Missing final or tool_batch event in cutie_tools_v2 stream.");
    }

    return {
      response: responsePayload,
      assistantText,
      ...(suppressedAssistantArtifact ? { suppressedAssistantArtifact } : {}),
      usage,
      model: resolvedModel,
      ...(modelAdapter ? { modelAdapter } : {}),
      ...(modelCapabilities ? { modelCapabilities } : {}),
      ...(protocolMode ? { protocolMode } : {}),
      ...(orchestratorContractVersion ? { orchestratorContractVersion } : {}),
      ...(portabilityMode ? { portabilityMode } : {}),
      ...(transportModeUsed ? { transportModeUsed } : {}),
      ...(normalizationSource ? { normalizationSource } : {}),
      ...(normalizationTier ? { normalizationTier } : {}),
      ...(artifactExtractionShape ? { artifactExtractionShape } : {}),
      ...(fallbackModeUsed ? { fallbackModeUsed } : {}),
      ...(batchCollapsedToSingleAction !== undefined ? { batchCollapsedToSingleAction } : {}),
    };
  }
}
