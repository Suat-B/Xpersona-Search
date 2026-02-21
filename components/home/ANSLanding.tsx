"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  trackANSSearchSubmitted,
  trackANSResultState,
  trackANSClaimClicked,
} from "@/lib/ans-analytics";

type ResultState = "idle" | "loading" | "available" | "taken" | "invalid" | "error";

interface CheckResponse {
  success: boolean;
  state: "available" | "taken" | "invalid" | "error";
  name: string | null;
  fullDomain: string | null;
  suggestions: string[];
  error?: string | null;
  code?: string | null;
}

export function ANSLanding() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ResultState>("idle");
  const [result, setResult] = useState<CheckResponse | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setState("invalid");
      setResult({
        success: true,
        state: "invalid",
        name: null,
        fullDomain: null,
        suggestions: [],
        error: "Enter at least 3 characters",
        code: "INVALID_LENGTH",
      });
      return;
    }

    setState("loading");
    setResult(null);
    trackANSSearchSubmitted(trimmed);

    try {
      const res = await fetch(
        `/api/ans/check?name=${encodeURIComponent(trimmed)}`
      );
      const data: CheckResponse = await res.json();

      if (!res.ok) {
        setState("error");
        setResult({
          success: false,
          state: "error",
          name: null,
          fullDomain: null,
          suggestions: [],
          error: data.error ?? "Couldn't check. Try again.",
        });
        return;
      }

      if (data.state === "invalid") {
        setState("invalid");
        setResult(data);
        trackANSResultState("invalid");
        return;
      }

      if (data.state === "error") {
        setState("error");
        setResult(data);
        trackANSResultState("error");
        return;
      }

      if (data.state === "available") {
        setState("available");
        setResult(data);
        trackANSResultState("available", data.name ?? undefined);
        return;
      }

      if (data.state === "taken") {
        setState("taken");
        setResult(data);
        trackANSResultState("taken", data.name ?? undefined);
        return;
      }
    } catch {
      setState("error");
      setResult({
        success: false,
        state: "error",
        name: null,
        fullDomain: null,
        suggestions: [],
        error: "Couldn't check. Try again.",
      });
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const suggestedName = result?.suggestions?.[0];

  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--text-primary)]">
          Xpersona
          <span className="text-[var(--accent-heart)]" aria-hidden>
            {" "}♥
          </span>
        </h1>
        <p className="text-lg text-[var(--text-secondary)]">
          Claim your .agent identity
        </p>

        <div className="max-w-xl mx-auto mt-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative flex items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] focus-within:border-[#0ea5e9]/50 transition-colors">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search your .agent name"
                aria-label="Domain name search"
                className="w-full px-5 py-4 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none rounded-2xl"
                disabled={state === "loading"}
              />
              <span className="absolute right-4 text-sm text-[var(--text-tertiary)] pointer-events-none">
                .xpersona.agent
              </span>
            </div>
            <button
              onClick={handleSearch}
              disabled={state === "loading" || query.trim().length < 3}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {state === "loading" ? "Searching…" : "Search"}
            </button>
          </div>

          {state === "available" && result?.fullDomain && (
            <div className="mt-6 p-6 rounded-2xl border border-[#30d158]/40 bg-[#30d158]/10">
              <h3 className="text-lg font-semibold text-[#30d158]">
                {result.fullDomain} is available
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                $10/year · Instant verification
              </p>
              <Link
                href={`/register?name=${encodeURIComponent(result.name ?? "")}`}
                onClick={() => trackANSClaimClicked(result.fullDomain ?? "")}
                className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#30d158] text-white font-semibold hover:bg-[#30d158]/90 transition-colors"
              >
                Claim {result.fullDomain}
              </Link>
            </div>
          )}

          {state === "taken" && result?.fullDomain && (
            <div className="mt-6 p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {result.fullDomain} is taken
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Try: {result.suggestions?.join(", ") ?? "another name"}
              </p>
              {suggestedName && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery(suggestedName);
                    setState("idle");
                    setResult(null);
                  }}
                  className="mt-3 text-sm font-medium text-[#0ea5e9] hover:underline"
                >
                  Search for {suggestedName}.xpersona.agent
                </button>
              )}
            </div>
          )}

          {state === "invalid" && result?.error && (
            <div className="mt-6 p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10">
              <p className="text-sm text-amber-200">{result.error}</p>
              {result.suggestions?.[0] && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery(result.suggestions![0]);
                    setState("idle");
                    setResult(null);
                  }}
                  className="mt-2 text-sm font-medium text-amber-300 hover:underline"
                >
                  Try {result.suggestions[0]}
                </button>
              )}
            </div>
          )}

          {state === "error" && (
            <div className="mt-6 p-4 rounded-2xl border border-[var(--border)] bg-red-500/10">
              <p className="text-sm text-red-200">
                {result?.error ?? "Service temporarily unavailable."}
              </p>
              <button
                type="button"
                onClick={handleSearch}
                className="mt-2 text-sm font-medium text-red-300 hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
