/**
 * Safe fetch + parse. Never uses Response.json() which throws on empty body.
 * Use this instead of fetch().then(r => r.json()) to avoid "Unexpected end of JSON input".
 */
export async function safeFetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
  const text = await res.text();
  let data: T;
  try {
    data = (text.length > 0 ? JSON.parse(text) : {}) as T;
  } catch {
    data = {} as T;
  }
  return { ok: res.ok, status: res.status, data };
}

const BALANCE_RETRY_DELAYS_MS = [0, 500, 1500];
const BALANCE_API = "/api/me/balance";

type BalanceResponse = {
  success?: boolean;
  data?: { balance?: number; faucetCredits?: number; withdrawable?: number };
};

/**
 * Fetch balance with retry on 401. Handles race where auth (e.g. EnsureGuest)
 * may not be ready on first request. Returns balance or null if failed.
 */
export async function fetchBalanceWithRetry(): Promise<number | null> {
  const data = await fetchBalanceDataWithRetry();
  return data ? data.balance : null;
}

/**
 * Fetch full balance data (balance, faucetCredits, withdrawable) with retry on 401.
 */
export async function fetchBalanceDataWithRetry(): Promise<{
  balance: number;
  faucetCredits: number;
  withdrawable: number;
} | null> {
  for (let i = 0; i < BALANCE_RETRY_DELAYS_MS.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, BALANCE_RETRY_DELAYS_MS[i]));
    }
    const { ok, status, data } = await safeFetchJson<BalanceResponse>(BALANCE_API);
    if (ok && data?.success && data?.data) {
      return {
        balance: data.data.balance ?? 0,
        faucetCredits: data.data.faucetCredits ?? 0,
        withdrawable: data.data.withdrawable ?? 0,
      };
    }
    if (status !== 401) break; // Only retry on 401 (auth not ready)
  }
  return null;
}
