import type { RequestAuth } from "@xpersona/vscode-core";
import { getModelHint } from "./config";
import {
  getCutieModelAdapterKind,
  inferFallbackModeUsed,
  resolveCutieModelCapabilities,
  resolveMaxToolsPerBatch,
  resolveProtocolMode,
} from "./cutie-model-capabilities";
import { CutieModelClient } from "./cutie-model-client";
import type {
  CutieModelCapabilityProfile,
  CutieModelMessage,
  CutieModelTurnResult,
  CutieNormalizationTier,
  CutieProtocolMode,
  CutieProtocolToolDefinition,
} from "./types";

type AdapterTurnInput = {
  auth: RequestAuth;
  messages: CutieModelMessage[];
  tools: CutieProtocolToolDefinition[];
  maxToolsPerBatch: number;
  desiredMode: CutieProtocolMode;
  stream?: boolean;
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
};

function resolveNormalizationTier(result: CutieModelTurnResult, resolvedMode: CutieProtocolMode): CutieNormalizationTier {
  if (result.normalizationSource === "text_tool_artifact") return "artifact_rescue";
  if (result.normalizationSource === "deterministic_bootstrap") return "deterministic_recovery";
  if (resolvedMode === "final_only" || result.normalizationSource === "plain_final") return "plain_final";
  return "transport_normalized";
}

function collapseToCanonicalSingleAction(result: CutieModelTurnResult): CutieModelTurnResult {
  if (result.response.type !== "tool_calls") return result;
  const first = result.response.tool_calls[0];
  if (!first) return result;
  return {
    ...result,
    response: {
      type: "tool_call",
      tool_call: first,
    },
    batchCollapsedToSingleAction: true,
  };
}

function applyTelemetry(result: CutieModelTurnResult, input: {
  capabilities: CutieModelCapabilityProfile;
  resolvedMode: CutieProtocolMode;
  requestedMode: CutieProtocolMode;
}): CutieModelTurnResult {
  const canonical = collapseToCanonicalSingleAction(result);
  const normalizationSource =
    canonical.normalizationSource || (input.resolvedMode === "final_only" ? "plain_final" : "plain_final");
  const normalizationTier = canonical.normalizationTier || resolveNormalizationTier(canonical, input.resolvedMode);
  return {
    ...canonical,
    modelAdapter: getCutieModelAdapterKind(),
    modelCapabilities: input.capabilities,
    protocolMode: input.resolvedMode,
    orchestratorContractVersion: "canonical_portability_v1",
    portabilityMode: "canonical_default",
    transportModeUsed: canonical.transportModeUsed || input.resolvedMode,
    normalizationSource,
    normalizationTier,
    fallbackModeUsed:
      canonical.fallbackModeUsed ||
      inferFallbackModeUsed({
        requestedMode: input.requestedMode,
        resolvedMode: input.resolvedMode,
        normalizationSource,
      }),
    repairTierEntered:
      canonical.repairTierEntered ||
      (normalizationTier === "artifact_rescue" ? "artifact_rescue" : "none"),
  };
}

export class CutieModelAdapter {
  constructor(private readonly client: CutieModelClient) {}

  describeSelectedModel(modelHint = getModelHint()): {
    modelHint: string;
    modelAdapter: ReturnType<typeof getCutieModelAdapterKind>;
    modelCapabilities: CutieModelCapabilityProfile;
  } {
    return {
      modelHint,
      modelAdapter: getCutieModelAdapterKind(),
      modelCapabilities: resolveCutieModelCapabilities(modelHint),
    };
  }

  async requestTurn(input: AdapterTurnInput): Promise<CutieModelTurnResult> {
    const modelHint = getModelHint();
    const capabilities = resolveCutieModelCapabilities(modelHint);
    const resolvedMode = resolveProtocolMode({
      desiredMode: input.desiredMode,
      capabilities,
    });
    const maxToolsPerBatch = resolveMaxToolsPerBatch({
      requested: input.maxToolsPerBatch,
      capabilities,
    });

    if (resolvedMode === "final_only") {
      const textResult = await this.client.completeTurn({
        auth: input.auth,
        messages: input.messages,
        signal: input.signal,
      });
      return applyTelemetry(
        {
          response: {
            type: "final",
            final: textResult.finalText.trim(),
          },
          assistantText: textResult.finalText.trim(),
          usage: textResult.usage,
          model: textResult.model,
          normalizationSource: "plain_final",
        },
        {
          capabilities,
          resolvedMode,
          requestedMode: input.desiredMode,
        }
      );
    }

    const result = input.stream === false
      ? await this.client.completeStructuredTurn({
          auth: input.auth,
          signal: input.signal,
          messages: input.messages,
          tools: input.tools,
          maxToolsPerBatch,
          protocolMode: resolvedMode,
        })
      : await this.client.streamStructuredTurn({
          auth: input.auth,
          signal: input.signal,
          messages: input.messages,
          tools: input.tools,
          maxToolsPerBatch,
          protocolMode: resolvedMode,
          onDelta: input.onDelta,
        });

    return applyTelemetry(result, {
      capabilities,
      resolvedMode,
      requestedMode: input.desiredMode,
    });
  }
}
