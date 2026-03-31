"use client";

import { useCallback, useEffect, useState } from "react";

type ConnectionRow = {
  id: string;
  provider: string;
  alias: string;
  displayName: string;
  authMode: string;
  baseUrl: string | null;
  defaultModel: string | null;
  status: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  browserAuthSupported: boolean;
};

type ConnectionState = {
  platformDefaultModelAlias: string;
  browserAuth: { enabled: boolean; reason: string };
  preferences: {
    preferredChatModelSource: "platform" | "user_connected";
    fallbackToPlatformModel: boolean;
    preferredModelAlias: string | null;
  };
  connections: ConnectionRow[];
};

const EMPTY_STATE: ConnectionState = {
  platformDefaultModelAlias: "kimi-k2",
  browserAuth: { enabled: false, reason: "Not enabled on this deployment." },
  preferences: {
    preferredChatModelSource: "platform",
    fallbackToPlatformModel: true,
    preferredModelAlias: null,
  },
  connections: [],
};

export function PlaygroundConnectedModelsCard() {
  const [state, setState] = useState<ConnectionState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("gpt-5.4");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [displayName, setDisplayName] = useState("Your OpenAI model");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/playground-model-connections", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ConnectionState;
        message?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || "Could not load connected models.");
      }
      setState(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connected models.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePreferences = useCallback(
    async (partial: Partial<ConnectionState["preferences"]>) => {
      setMessage(null);
      setError(null);
      const res = await fetch("/api/v1/me/playground-model-preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ConnectionState["preferences"];
        message?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || "Could not save preferences.");
      }
      setState((prev) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          ...json.data,
        },
      }));
    },
    []
  );

  const connect = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Paste an OpenAI API key first.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/me/playground-model-connections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          authMode: "api_key",
          apiKey,
          defaultModel,
          baseUrl,
          displayName,
          makeDefault: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Could not connect your OpenAI model.");
      }
      setApiKey("");
      setMessage("OpenAI connection saved. Chat can now use your connected model.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect your OpenAI model.");
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, defaultModel, displayName, load]);

  const disconnect = useCallback(async (connectionId: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/me/playground-model-connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Could not disconnect model.");
      }
      setMessage("Disconnected your model.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect model.");
    } finally {
      setSaving(false);
    }
  }, [load]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">BYOM</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Connect your own OpenAI model</h2>
          <p className="mt-1 text-sm text-slate-600">
            Chat can use your connected OpenAI model while Binary keeps the orchestrator on the platform-owned runtime for tool reliability.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
          Platform fallback {state.preferences.fallbackToPlatformModel ? "on" : "off"}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Default model</span>
              <input
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm text-slate-700">
            <span>Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span>OpenAI API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void connect()}
              disabled={saving}
              className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Connect OpenAI"}
            </button>
            <span className="text-xs text-slate-500">
              Browser auth: {state.browserAuth.enabled ? "available" : state.browserAuth.reason}
            </span>
          </div>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Chat policy</p>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <label className="flex items-center justify-between gap-3">
                <span>Prefer connected model for chat</span>
                <input
                  type="checkbox"
                  checked={state.preferences.preferredChatModelSource === "user_connected"}
                  onChange={(event) =>
                    void savePreferences({
                      preferredChatModelSource: event.target.checked ? "user_connected" : "platform",
                    }).catch((err) => setError(err instanceof Error ? err.message : "Could not save preference."))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Fall back to platform if your model fails</span>
                <input
                  type="checkbox"
                  checked={state.preferences.fallbackToPlatformModel}
                  onChange={(event) =>
                    void savePreferences({
                      fallbackToPlatformModel: event.target.checked,
                    }).catch((err) => setError(err instanceof Error ? err.message : "Could not save preference."))
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Connected models</p>
            <div className="mt-3 space-y-3">
              {loading ? <p className="text-sm text-slate-500">Loading connections...</p> : null}
              {!loading && state.connections.length === 0 ? (
                <p className="text-sm text-slate-500">No connected models yet.</p>
              ) : null}
              {state.connections.map((connection) => (
                <div key={connection.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{connection.displayName}</p>
                      <p className="text-xs text-slate-500">
                        {connection.alias}
                        {connection.defaultModel ? ` • ${connection.defaultModel}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void disconnect(connection.id)}
                      disabled={saving}
                      className="text-xs font-medium text-rose-700 underline underline-offset-4"
                    >
                      Disconnect
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {connection.status}
                    {connection.lastValidatedAt ? ` • validated ${new Date(connection.lastValidatedAt).toLocaleString()}` : ""}
                  </p>
                  {connection.lastValidationError ? (
                    <p className="mt-2 text-xs text-rose-700">{connection.lastValidationError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
