export type PlaygroundDevBypassAuth = {
  userId: string;
  email: string;
  apiKeyPrefix: string | null;
};

export function getHfRouterDevToken(): string | null {
  const token =
    process.env.HF_ROUTER_TOKEN || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
  return String(token).trim() || null;
}

export function getLocalDevBypassAuth(apiKey: string | null | undefined): PlaygroundDevBypassAuth | null {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) return null;
  if (process.env.NODE_ENV === "production") return null;

  const hfRouterToken = getHfRouterDevToken();
  if (hfRouterToken && normalizedKey === hfRouterToken) {
    return {
      userId: "local-dev-hf-router",
      email: "suat.bastug@icloud.com",
      apiKeyPrefix: "hf_local",
    };
  }

  return null;
}
