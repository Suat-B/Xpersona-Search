type LegacyErrorShape = {
  error?: unknown;
  message?: unknown;
};

type V1ErrorShape = {
  success?: false;
  error?: {
    message?: unknown;
  } | unknown;
};

type V1SuccessShape<T> = {
  success?: true;
  data?: T;
};

/**
 * Unwraps /api/v1 envelope payloads and remains compatible with legacy raw payloads.
 */
export function unwrapClientResponse<T>(payload: unknown): T {
  if (payload && typeof payload === "object") {
    const v1 = payload as V1SuccessShape<T>;
    if (v1.success === true && "data" in v1) {
      return v1.data as T;
    }
  }
  return payload as T;
}

/**
 * Extracts a readable error message from v1 and legacy payloads.
 */
export function extractClientErrorMessage(
  payload: unknown,
  fallback = "Request failed"
): string {
  if (!payload || typeof payload !== "object") return fallback;

  const v1 = payload as V1ErrorShape;
  if (v1.success === false) {
    if (typeof v1.error === "string" && v1.error.trim().length > 0) return v1.error;
    if (v1.error && typeof v1.error === "object") {
      const message = (v1.error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim().length > 0) return message;
    }
  }

  const legacy = payload as LegacyErrorShape;
  if (typeof legacy.error === "string" && legacy.error.trim().length > 0) {
    return legacy.error;
  }
  if (typeof legacy.message === "string" && legacy.message.trim().length > 0) {
    return legacy.message;
  }

  return fallback;
}

