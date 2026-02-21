"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { sanitizeAgentName } from "@/lib/ans-validator";

const PROTOCOLS = ["A2A", "MCP", "ANP", "OpenClaw"] as const;

const inputClass =
  "w-full rounded-xl border border-[var(--light-border)] bg-white px-4 py-3 text-[var(--light-text-primary)] placeholder-[var(--light-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--light-accent-light)] focus:border-[var(--light-accent)] transition-all";
const labelClass =
  "block text-xs font-medium text-[var(--light-text-secondary)] uppercase tracking-wider mb-2.5";

function RegisterForm() {
  const searchParams = useSearchParams();
  const nameParam = searchParams?.get("name")?.trim() ?? "";
  const [name, setName] = useState(nameParam);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [agentCardExpanded, setAgentCardExpanded] = useState(false);
  const [agentCard, setAgentCard] = useState({
    displayName: "",
    description: "",
    endpoint: "",
    capabilities: "",
    protocols: [] as string[],
  });
  const [result, setResult] = useState<{
    nextStep?: string;
    error?: string;
    domain?: { fullDomain?: string };
    payment?: { url?: string };
    verification?: { instructions?: string[] };
  } | null>(null);

  useEffect(() => {
    if (nameParam) setName(sanitizeAgentName(nameParam) || nameParam);
  }, [nameParam]);

  const handleNameBlur = useCallback(() => {
    const normalized = sanitizeAgentName(name);
    if (normalized !== name) setName(normalized);
  }, [name]);

  const fullDomain = name.trim() ? `${sanitizeAgentName(name) || name.trim().toLowerCase()}.xpersona.agent` : "";

  const buildAgentCardPayload = () => {
    const hasAny =
      agentCard.displayName ||
      agentCard.description ||
      agentCard.endpoint ||
      agentCard.capabilities.trim() ||
      agentCard.protocols.length > 0;
    if (!hasAny) return undefined;
    const capList = agentCard.capabilities
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const protoList = agentCard.protocols.filter((p) =>
      PROTOCOLS.includes(p as (typeof PROTOCOLS)[number])
    );
    return {
      name: agentCard.displayName || undefined,
      description: agentCard.description || undefined,
      endpoint: agentCard.endpoint.trim() ? agentCard.endpoint.trim() : undefined,
      capabilities: capList.length > 0 ? capList : undefined,
      protocols: protoList.length > 0 ? protoList : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRetryAfter(null);
    setResult(null);
    const normalizedName = sanitizeAgentName(name);
    if (normalizedName.length < 3) {
      setError("Domain name must be at least 3 characters");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    try {
      const agentCardPayload = buildAgentCardPayload();
      const res = await fetch("/api/ans/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          email: email.trim().toLowerCase(),
          ...(promoCode.trim() && { promoCode: promoCode.trim() }),
          ...(agentCardPayload && { agentCard: agentCardPayload }),
        }),
      });
      const data = await res.json().catch(() => ({}));

      const retryHeader = res.headers.get("Retry-After");
      if (res.status === 429) {
        const seconds = retryHeader ? parseInt(retryHeader, 10) : 60;
        setRetryAfter(Number.isNaN(seconds) ? 60 : seconds);
        setError(
          (data.error ?? "Too many requests. Wait a moment.") +
            (seconds ? ` Try again in ${seconds} seconds.` : "")
        );
        setLoading(false);
        return;
      }

      if (data.nextStep === "coming_soon") {
        setResult({
          nextStep: "coming_soon",
          error: data.error ?? "Registration will open soon",
          domain: data.domain,
        });
        setLoading(false);
        return;
      }

      if (data.nextStep === "taken") {
        setError(data.error ?? "This domain is already taken.");
        setLoading(false);
        return;
      }

      if (data.nextStep === "invalid") {
        setError(data.error ?? "Invalid domain name");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      if (data.nextStep === "payment_required" && data.payment?.url) {
        window.location.href = data.payment.url;
        return;
      }

      if (data.nextStep === "completed" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      setResult({
        nextStep: "payment_required",
        domain: data.domain,
        payment: data.payment,
        verification: data.verification,
      });
    } catch {
      setError("Could not connect. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-[var(--light-text-primary)] mb-2">
          Claim {fullDomain || "your domain"}
        </h1>
        <p className="text-sm text-[var(--light-text-secondary)] mb-6">
          $10/year · Human-readable identity · Cryptographic verification
        </p>

        {result?.nextStep === "payment_required" && result.payment?.url ? (
          <div className="p-6 rounded-2xl border border-[var(--light-border)] bg-white shadow-[var(--light-shadow-card)]">
            <p className="text-[var(--light-text-primary)] font-medium mb-2">
              Redirecting to payment…
            </p>
            <p className="text-sm text-[var(--light-text-secondary)] mb-4">
              If you are not redirected,{" "}
              <a
                href={result.payment.url}
                className="text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] font-medium transition-colors"
              >
                click here to complete payment
              </a>
              .
            </p>
          </div>
        ) : result?.nextStep === "coming_soon" ? (
          <div className="p-6 rounded-2xl border border-[var(--light-border)] bg-white shadow-[var(--light-shadow-card)]">
            <p className="text-[var(--light-text-primary)] font-medium">
              Registration will open soon
            </p>
            <p className="mt-2 text-sm text-[var(--light-text-secondary)]">
              We&apos;re putting the finishing touches on domain registration.
              Check back in a few days or follow us for updates.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-[var(--light-accent)] hover:text-[var(--light-accent-hover)] transition-colors"
            >
              Back to search
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className={labelClass}>
                Domain name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="yourname"
                className={inputClass}
                disabled={loading}
              />
              <p className="mt-1 text-xs text-[var(--light-text-tertiary)]">
                .xpersona.agent
              </p>
              {name.length > 0 && sanitizeAgentName(name).length < 3 && (
                <p className="mt-1 text-xs text-[var(--light-warning)]">
                  Enter at least 3 characters
                </p>
              )}
            </div>
            <div>
              <label htmlFor="promo" className={labelClass}>
                Promo code (optional)
              </label>
              <input
                id="promo"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="AGENT100"
                className={inputClass}
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                required
                disabled={loading}
              />
            </div>

            <div className="border border-[var(--light-border)] rounded-xl overflow-hidden bg-white mt-2">
              <button
                type="button"
                onClick={() => setAgentCardExpanded((e) => !e)}
                className="w-full px-4 py-4 text-left text-sm font-medium text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)] hover:bg-[var(--light-bg-hover)] flex items-center justify-between transition-colors"
              >
                Customize Agent Card
                <span className="text-[var(--light-text-tertiary)]" aria-hidden>
                  {agentCardExpanded ? "−" : "+"}
                </span>
              </button>
              {agentCardExpanded && (
                <div className="px-4 pb-5 pt-4 space-y-5 border-t border-[var(--light-border)]">
                  <div>
                    <label htmlFor="agent-display-name" className={labelClass}>
                      Display name
                    </label>
                    <input
                      id="agent-display-name"
                      type="text"
                      value={agentCard.displayName}
                      onChange={(e) =>
                        setAgentCard((a) => ({ ...a, displayName: e.target.value }))
                      }
                      placeholder="My Sweet Bot"
                      className={inputClass}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label htmlFor="agent-description" className={labelClass}>
                      Description
                    </label>
                    <textarea
                      id="agent-description"
                      value={agentCard.description}
                      onChange={(e) =>
                        setAgentCard((a) => ({ ...a, description: e.target.value }))
                      }
                      placeholder="Brief description of your agent"
                      rows={2}
                      className={inputClass}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label htmlFor="agent-endpoint" className={labelClass}>
                      Endpoint URL
                    </label>
                    <input
                      id="agent-endpoint"
                      type="url"
                      value={agentCard.endpoint}
                      onChange={(e) =>
                        setAgentCard((a) => ({ ...a, endpoint: e.target.value }))
                      }
                      placeholder="https://..."
                      className={inputClass}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label htmlFor="agent-capabilities" className={labelClass}>
                      Capabilities (comma-separated)
                    </label>
                    <input
                      id="agent-capabilities"
                      type="text"
                      value={agentCard.capabilities}
                      onChange={(e) =>
                        setAgentCard((a) => ({ ...a, capabilities: e.target.value }))
                      }
                      placeholder="trading, analysis"
                      className={inputClass}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <span className={labelClass}>Protocols</span>
                    <div className="flex flex-wrap gap-x-6 gap-y-3 mt-2">
                      {PROTOCOLS.map((p) => (
                        <label key={p} className="flex items-center gap-3 text-sm text-[var(--light-text-secondary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={agentCard.protocols.includes(p)}
                            onChange={(e) =>
                              setAgentCard((a) => ({
                                ...a,
                                protocols: e.target.checked
                                  ? [...a.protocols, p]
                                  : a.protocols.filter((x) => x !== p),
                              }))
                            }
                            disabled={loading}
                            className="rounded border-[var(--light-border)] text-[var(--light-accent)] focus:ring-[var(--light-accent)]"
                          />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-[var(--light-error)]">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || sanitizeAgentName(name).length < 3}
              className="w-full py-3 rounded-xl bg-[var(--light-accent)] text-white font-semibold hover:bg-[var(--light-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--light-accent)] transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              {loading ? "Checking…" : "Claim domain"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center">
          <Link href="/" className="text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors">
            Cancel
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ANSMinimalHeader />
      <div className="flex-1">
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-[var(--light-text-tertiary)]">Loading…</div>}>
          <RegisterForm />
        </Suspense>
      </div>
      <ANSMinimalFooter />
    </div>
  );
}
