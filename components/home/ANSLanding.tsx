"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  trackANSSearchSubmitted,
  trackANSResultState,
  trackANSClaimClicked,
} from "@/lib/ans-analytics";
import { sanitizeAgentName } from "@/lib/ans-validator";

type ResultState = "idle" | "loading" | "available" | "taken" | "invalid" | "error";

interface CheckResponse {
  success: boolean;
  state: "available" | "taken" | "invalid" | "error";
  name: string | null;
  fullDomain: string | null;
  suggestions: string[];
  cardUrl?: string | null;
  error?: string | null;
  code?: string | null;
}

function SearchSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export function ANSLanding() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ResultState>("idle");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const claimRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (state === "available" && claimRef.current) {
      claimRef.current.focus();
    }
  }, [state]);

  const handleInputBlur = useCallback(() => {
    const normalized = sanitizeAgentName(query);
    if (normalized !== query) {
      setQuery(normalized);
    }
  }, [query]);

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
        `/api/v1/ans/check?name=${encodeURIComponent(trimmed)}`
      );
      const data: CheckResponse = await res.json();

      if (res.status === 429) {
        const retrySeconds = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        const retryVal = Number.isNaN(retrySeconds) ? 60 : retrySeconds;
        setState("error");
        setResult({
          success: false,
          state: "error",
          name: null,
          fullDomain: null,
          suggestions: [],
          error: `Too many requests. Try again in ${retryVal}s.`,
        });
        trackANSResultState("error");
        return;
      }

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
    <section className="relative min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
        <div className="max-w-2xl w-full text-center space-y-8">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[var(--light-text-primary)]">
              Xpersona
            </h1>
            <p className="text-lg sm:text-xl text-[var(--light-text-secondary)] max-w-xl mx-auto leading-relaxed">
              The domain name system for AI agents. Human-readable. Cryptographically verified. Works with OpenClaw, A2A, MCP, and ANP.
            </p>
          </div>

          <div className="max-w-xl mx-auto mt-8" aria-live="polite" aria-atomic="true">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={handleInputBlur}
                  onKeyDown={handleKeyDown}
                  placeholder="Search your .agent name"
                  aria-label="Domain name search"
                  aria-invalid={state === "invalid" ? true : undefined}
                  className="w-full h-14 px-5 pr-32 bg-white border border-[var(--light-border)] rounded-2xl text-[var(--light-text-primary)] placeholder-[var(--light-text-tertiary)] focus:outline-none focus:border-[var(--light-accent)] focus:ring-[3px] focus:ring-[var(--light-accent-light)] transition-all duration-150"
                  disabled={state === "loading"}
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-[var(--light-text-tertiary)] pointer-events-none select-none">
                  .xpersona.agent
                </span>
              </div>
              <button
                onClick={handleSearch}
                disabled={state === "loading" || query.trim().length < 3}
                aria-label="Search domain availability"
                className="h-14 px-8 rounded-2xl bg-[var(--light-accent)] text-white font-semibold hover:bg-[var(--light-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--light-accent)] transition-all duration-150 inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                {state === "loading" ? (
                  <>
                    <SearchSpinner />
                    <span>Searchingâ€¦</span>
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {query.length > 0 && query.trim().length < 3 && state !== "invalid" && (
              <p className="mt-3 text-sm text-[var(--light-text-tertiary)] text-left pl-1">
                Enter at least 3 characters
              </p>
            )}

            {state === "available" && result?.fullDomain && (
              <div className="mt-6 p-6 rounded-2xl bg-[var(--light-success-bg)] border border-[var(--light-success-border)] border-l-4 border-l-[var(--light-success)] light-animate-fade-in-up">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--light-success)] text-white flex items-center justify-center">
                    <CheckIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--light-success)]">
                      {result.fullDomain} is available
                    </h3>
                    <p className="mt-1 text-sm text-[var(--light-text-secondary)]">
                      $10/year Â· Instant verification
                    </p>
                    <Link
                      ref={claimRef}
                      href={`/register?name=${encodeURIComponent(result.name ?? "")}`}
                      onClick={() => trackANSClaimClicked(result.fullDomain ?? "")}
                      className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--light-success)] text-white font-semibold hover:bg-[var(--light-success-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--light-success)] focus:ring-offset-2 scroll-mt-24"
                    >
                      Claim {result.fullDomain}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {state === "taken" && result?.fullDomain && (
              <div className="mt-6 p-6 rounded-2xl bg-white border border-[var(--light-border)] shadow-[var(--light-shadow-md)] light-animate-fade-in-up">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--light-text-quaternary)] text-white flex items-center justify-center">
                    <XIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--light-text-primary)]">
                      {result.fullDomain} is taken
                    </h3>
                    <p className="mt-2 text-sm text-[var(--light-text-secondary)]">
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
                        className="mt-3 text-sm font-medium text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] transition-colors"
                      >
                        Search for {suggestedName}.xpersona.agent â†’
                      </button>
                    )}
                    {result.cardUrl && (
                      <a
                        href={result.cardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] transition-colors ml-4"
                      >
                        View Agent Card â†’
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {state === "invalid" && result?.error && (
              <div className="mt-6 p-5 rounded-2xl bg-[var(--light-warning-bg)] border border-[var(--light-warning-border)] border-l-4 border-l-[var(--light-warning)] light-animate-fade-in-up">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-[var(--light-warning)]">
                    <AlertIcon />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[var(--light-text-primary)]">{result.error}</p>
                    {result.suggestions?.[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(result.suggestions![0]);
                          setState("idle");
                          setResult(null);
                        }}
                        className="mt-2 text-sm font-medium text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] transition-colors"
                      >
                        Try {result.suggestions[0]} â†’
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {state === "error" && (
              <div className="mt-6 p-5 rounded-2xl bg-[var(--light-error-bg)] border border-[var(--light-error-border)] border-l-4 border-l-[var(--light-error)] light-animate-fade-in-up">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-[var(--light-error)]">
                    <XIcon />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[var(--light-text-primary)]">
                      {result?.error ?? "Service temporarily unavailable."}
                    </p>
                    <button
                      type="button"
                      onClick={handleSearch}
                      className="mt-2 text-sm font-medium text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] transition-colors"
                    >
                      Try again â†’
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-16 sm:mt-24 max-w-4xl mx-auto">
            <div className="p-6 rounded-2xl bg-white border border-[var(--light-border)] shadow-[var(--light-shadow-card)] hover:shadow-[var(--light-shadow-card-hover)] hover:border-[var(--light-border-strong)] hover:-translate-y-1 transition-all duration-200">
              <div className="w-12 h-12 rounded-xl bg-[var(--light-accent-subtle)] text-[var(--light-accent)] flex items-center justify-center mb-4">
                <ShieldIcon />
              </div>
              <h3 className="text-base font-semibold text-[var(--light-text-primary)] mb-2">
                Cryptographic Identity
              </h3>
              <p className="text-sm text-[var(--light-text-secondary)] leading-relaxed">
                Each agent gets an ED25519 keypair for secure verification
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[var(--light-border)] shadow-[var(--light-shadow-card)] hover:shadow-[var(--light-shadow-card-hover)] hover:border-[var(--light-border-strong)] hover:-translate-y-1 transition-all duration-200">
              <div className="w-12 h-12 rounded-xl bg-[var(--light-accent-subtle)] text-[var(--light-accent)] flex items-center justify-center mb-4">
                <GlobeIcon />
              </div>
              <h3 className="text-base font-semibold text-[var(--light-text-primary)] mb-2">
                Universal Protocol
              </h3>
              <p className="text-sm text-[var(--light-text-secondary)] leading-relaxed">
                Works with A2A, MCP, ANP, and OpenClaw out of the box
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[var(--light-border)] shadow-[var(--light-shadow-card)] hover:shadow-[var(--light-shadow-card-hover)] hover:border-[var(--light-border-strong)] hover:-translate-y-1 transition-all duration-200 sm:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-xl bg-[var(--light-accent-subtle)] text-[var(--light-accent)] flex items-center justify-center mb-4">
                <BoltIcon />
              </div>
              <h3 className="text-base font-semibold text-[var(--light-text-primary)] mb-2">
                Instant Verification
              </h3>
              <p className="text-sm text-[var(--light-text-secondary)] leading-relaxed">
                DNS-based verification that&apos;s tamper-proof and decentralized
              </p>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[var(--light-border)]">
            <p className="text-xs text-[var(--light-text-tertiary)] uppercase tracking-wider mb-4">
              Compatible with
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              <span className="px-4 py-2 rounded-full bg-[var(--light-bg-tertiary)] text-sm font-medium text-[var(--light-text-secondary)]">A2A</span>
              <span className="px-4 py-2 rounded-full bg-[var(--light-bg-tertiary)] text-sm font-medium text-[var(--light-text-secondary)]">MCP</span>
              <span className="px-4 py-2 rounded-full bg-[var(--light-bg-tertiary)] text-sm font-medium text-[var(--light-text-secondary)]">ANP</span>
              <span className="px-4 py-2 rounded-full bg-[var(--light-bg-tertiary)] text-sm font-medium text-[var(--light-text-secondary)]">OpenClaw</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



