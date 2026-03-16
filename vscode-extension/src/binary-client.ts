import { requestJson } from "./api-client";
import { getBaseApiUrl } from "./config";
import type {
  BinaryBuildRecord,
  BinaryTargetEnvironment,
  RequestAuth,
  RetrievalHints,
} from "./shared";

type BinaryContextPayload = {
  activeFile?: { path?: string; language?: string; selection?: string; content?: string };
  openFiles?: Array<{ path: string; language?: string; excerpt?: string }>;
};

export async function createBinaryBuild(input: {
  auth: RequestAuth;
  intent: string;
  workspaceFingerprint: string;
  historySessionId?: string | null;
  targetEnvironment: BinaryTargetEnvironment;
  context?: BinaryContextPayload;
  retrievalHints?: RetrievalHints;
}): Promise<BinaryBuildRecord> {
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${getBaseApiUrl()}/api/v1/binary/builds`,
    input.auth,
    {
      intent: input.intent,
      workspaceFingerprint: input.workspaceFingerprint,
      ...(input.historySessionId ? { historySessionId: input.historySessionId } : {}),
      targetEnvironment: input.targetEnvironment,
      ...(input.context ? { context: input.context } : {}),
      ...(input.retrievalHints ? { retrievalHints: input.retrievalHints } : {}),
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function getBinaryBuild(auth: RequestAuth, buildId: string): Promise<BinaryBuildRecord> {
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "GET",
    `${getBaseApiUrl()}/api/v1/binary/builds/${encodeURIComponent(buildId)}`,
    auth
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function validateBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  targetEnvironment: BinaryTargetEnvironment;
}): Promise<BinaryBuildRecord> {
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${getBaseApiUrl()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/validate`,
    input.auth,
    {
      targetEnvironment: input.targetEnvironment,
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function publishBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
}): Promise<BinaryBuildRecord> {
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${getBaseApiUrl()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/publish`,
    input.auth,
    {}
  );
  return (response?.data || response) as BinaryBuildRecord;
}
