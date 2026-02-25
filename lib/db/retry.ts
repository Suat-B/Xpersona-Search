const DEFAULT_RETRY_DELAYS_MS = [0, 50, 200, 600];

function isRetryableDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset") ||
    msg.includes("too many clients") ||
    msg.includes("server closed the connection")
  );
}

export async function retryDb<T>(
  fn: () => Promise<T>,
  opts?: { delaysMs?: number[] }
): Promise<T> {
  const delays = opts?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[i]));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || i === delays.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}
