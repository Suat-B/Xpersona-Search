"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type MethodInfo = {
  method: string;
  label: string;
  description: string;
  automated: boolean;
};

type Step = "loading" | "methods" | "instructions" | "verifying" | "success" | "pending" | "error";

export default function ClaimPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>("loading");
  const [agent, setAgent] = useState<{ name: string; claimStatus: string; isOwner: boolean } | null>(null);
  const [methods, setMethods] = useState<MethodInfo[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [verifyError, setVerifyError] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agents/${slug}`);
      if (!res.ok) {
        setError("Agent not found");
        setStep("error");
        return;
      }
      const data = await res.json();
      setAgent({ name: data.name, claimStatus: data.claimStatus, isOwner: data.isOwner });

      if (data.claimStatus === "CLAIMED" && data.isOwner) {
        router.replace(`/agent/${slug}/manage`);
        return;
      }
      if (data.claimStatus === "CLAIMED" && !data.isOwner) {
        setError("This page is already claimed by another user.");
        setStep("error");
        return;
      }

      const statusRes = await fetch(`/api/agents/${slug}/claim`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.availableMethods) {
          setMethods(statusData.availableMethods);
        }
        if (statusData.pendingClaim) {
          setToken(statusData.pendingClaim.token);
          setExpiresAt(statusData.pendingClaim.expiresAt);
          setSelectedMethod(statusData.pendingClaim.method);
        }
      }

      setStep("methods");
    }
    load();
  }, [slug, router]);

  const initiateClaim = useCallback(
    async (method: string) => {
      setLoading(true);
      setVerifyError("");
      try {
        const res = await fetch(`/api/agents/${slug}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            ...(method === "MANUAL_REVIEW" && notes ? { notes } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/auth/signin?callbackUrl=/agent/${slug}/claim`);
            return;
          }
          setVerifyError(data.error ?? "Failed to initiate claim");
          setLoading(false);
          return;
        }
        setToken(data.token);
        setInstructions(data.instructions);
        setExpiresAt(data.expiresAt);
        setMethods(data.availableMethods);
        setSelectedMethod(method);

        if (method === "MANUAL_REVIEW") {
          setStep("pending");
        } else {
          setStep("instructions");
        }
      } catch {
        setVerifyError("Network error. Please try again.");
      }
      setLoading(false);
    },
    [slug, notes, router]
  );

  const verify = useCallback(async () => {
    setLoading(true);
    setVerifyError("");
    try {
      const res = await fetch(`/api/agents/${slug}/claim/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: selectedMethod }),
      });
      const data = await res.json();
      if (data.verified) {
        setStep("success");
      } else if (data.status === "PENDING") {
        setStep("pending");
      } else {
        setVerifyError(data.error ?? "Verification failed. Please try again.");
      }
    } catch {
      setVerifyError("Network error. Please try again.");
    }
    setLoading(false);
  }, [slug, selectedMethod]);

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)] p-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-[#ff453a]/15 border border-[#ff453a]/25 text-[#ff453a] mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Cannot Claim</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">{error}</p>
          <Link
            href={`/agent/${slug}`}
            className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Back to agent page
          </Link>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)] p-6">
        <div className="max-w-md w-full rounded-2xl border border-[#30d158]/30 bg-[var(--bg-card)] p-8 text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[#30d158]/15 border border-[#30d158]/25 text-[#30d158] mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Page Claimed!
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            You are now the verified owner of <strong>{agent?.name}</strong>. You can edit your page and
            it will display a verified owner badge.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/agent/${slug}/manage`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Manage Your Page
            </Link>
            <Link
              href={`/agent/${slug}`}
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              View Your Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)] p-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--accent-warning)]/30 bg-[var(--bg-card)] p-8 text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--accent-warning)]/15 border border-[var(--accent-warning)]/25 text-[var(--accent-warning)] mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Claim Submitted
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Your claim for <strong>{agent?.name}</strong> has been submitted for manual review.
            An admin will review it within 48 hours.
          </p>
          <Link
            href={`/agent/${slug}`}
            className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Back to agent page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href={`/agent/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {agent?.name}
        </Link>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-8 py-6 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-heart)]/5 to-transparent">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Claim {agent?.name}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Prove ownership to manage this page and get a verified badge
            </p>
          </div>

          <div className="p-8">
            {step === "methods" && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-4">
                  Choose verification method
                </h2>

                {verifyError && (
                  <div className="rounded-xl border border-[#ff453a]/20 bg-[#ff453a]/5 px-4 py-3 text-sm text-[#ff453a] mb-4">
                    {verifyError}
                  </div>
                )}

                <div className="space-y-3">
                  {(methods.length > 0 ? methods : []).map((m) => (
                    <button
                      key={m.method}
                      onClick={() => {
                        if (m.method === "MANUAL_REVIEW") {
                          setSelectedMethod(m.method);
                        } else {
                          initiateClaim(m.method);
                        }
                      }}
                      disabled={loading}
                      className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 hover:border-[var(--accent-heart)]/40 hover:bg-[var(--bg-card)] transition-all group disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
                            {m.label}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {m.description}
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-[var(--text-quaternary)] group-hover:text-[var(--accent-heart)] transition-colors flex-shrink-0 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedMethod === "MANUAL_REVIEW" && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                      Evidence / Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Provide links, screenshots, or other evidence of ownership..."
                      className="w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 resize-y min-h-[80px]"
                      maxLength={2000}
                    />
                    <button
                      onClick={() => initiateClaim("MANUAL_REVIEW")}
                      disabled={loading}
                      className="rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                      {loading ? "Submitting..." : "Submit for Review"}
                    </button>
                  </div>
                )}

                {methods.length === 0 && !loading && (
                  <button
                    onClick={async () => {
                      setLoading(true);
                      const res = await fetch(`/api/agents/${slug}/claim`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ method: "MANUAL_REVIEW" }),
                      });
                      if (res.status === 401) {
                        router.push(`/auth/signin?callbackUrl=/agent/${slug}/claim`);
                        return;
                      }
                      const data = await res.json();
                      if (data.availableMethods) {
                        setMethods(data.availableMethods);
                        if (data.token) {
                          setToken(data.token);
                          setInstructions(data.instructions);
                          setExpiresAt(data.expiresAt);
                          setSelectedMethod("MANUAL_REVIEW");
                          setStep("pending");
                        }
                      } else if (data.error) {
                        if (res.status === 401) {
                          router.push(`/auth/signin?callbackUrl=/agent/${slug}/claim`);
                        } else {
                          setVerifyError(data.error);
                        }
                      }
                      setLoading(false);
                    }}
                    className="w-full rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    {loading ? "Loading..." : "Get Started"}
                  </button>
                )}
              </div>
            )}

            {step === "instructions" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                    Verification Instructions
                  </h2>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                    <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                      {instructions}
                    </pre>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                    Your verification token
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-4 py-2.5 text-sm font-mono text-[var(--accent-teal)] break-all select-all">
                      {token}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(token)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                  {expiresAt && (
                    <p className="text-xs text-[var(--text-quaternary)] mt-2">
                      Expires: {new Date(expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {verifyError && (
                  <div className="rounded-xl border border-[#ff453a]/20 bg-[#ff453a]/5 px-4 py-3 text-sm text-[#ff453a]">
                    {verifyError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={verify}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {loading ? "Verifying..." : "Verify Now"}
                  </button>
                  <button
                    onClick={() => {
                      setStep("methods");
                      setSelectedMethod(null);
                      setVerifyError("");
                    }}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
