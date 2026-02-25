export type ApiMeta = {
  requestId: string;
  version: "v1";
  timestamp: string;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: ApiMeta;
};

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
};

export type ApiErrorEnvelope = {
  success: false;
  error: ApiError;
  meta: ApiMeta;
};

export type SearchOutcomePayload = {
  querySignature: string;
  selectedResultId: string;
  outcome: "success" | "failure" | "timeout";
  taskType?: string;
  query?: string;
  failureCode?: "auth" | "rate_limit" | "tool_error" | "schema_mismatch";
  executionPath?: "single" | "delegated" | "bundled";
  budgetExceeded?: boolean;
  latencyMs?: number;
  costUsd?: number;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
};

export type RequestOptions = {
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
};

export type ClientConfig = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class XpersonaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://xpersona.co").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async postSearchOutcome(
    payload: SearchOutcomePayload,
    options: RequestOptions = {}
  ): Promise<ApiSuccess<Record<string, unknown>>> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/search/outcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as
      | ApiSuccess<Record<string, unknown>>
      | ApiErrorEnvelope;

    if (!response.ok || json.success === false) {
      const message =
        json && "error" in json
          ? `${json.error.code}: ${json.error.message}`
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return json;
  }
}
