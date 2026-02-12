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
