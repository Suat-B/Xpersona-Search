"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 focus:border-[#0ea5e9]/50";
const labelClass =
  "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nameParam = searchParams?.get("name")?.trim() ?? "";
  const [name, setName] = useState(nameParam);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    nextStep?: string;
    error?: string;
    domain?: { fullDomain?: string };
  } | null>(null);

  useEffect(() => {
    if (nameParam) setName(nameParam);
  }, [nameParam]);

  const fullDomain = name.trim() ? `${name.trim().toLowerCase()}.xpersona.agent` : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (name.trim().length < 3) {
      setError("Domain name must be at least 3 characters");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ans/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));

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

      setResult({
        nextStep: "payment_required",
        domain: data.domain,
      });
    } catch {
      setError("Could not connect. Please try again.");
    }
    setLoading(false);
  };

  if (!nameParam || nameParam.length < 3) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <p className="text-[var(--text-secondary)] mb-4">
          Enter a domain name to get started.
        </p>
        <Link
          href="/"
          className="text-[#0ea5e9] hover:underline font-medium"
        >
          Search for a name
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Claim {fullDomain || "your domain"}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          $10/year · Human-readable identity · Cryptographic verification
        </p>

        {result?.nextStep === "coming_soon" ? (
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
            <p className="text-[var(--text-primary)] font-medium">
              Registration will open soon
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              We&apos;re putting the finishing touches on domain registration.
              Check back in a few days or follow us for updates.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-[#0ea5e9] hover:underline"
            >
              Back to search
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelClass}>
                Domain name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="yourname"
                className={inputClass}
                disabled
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                .xpersona.agent
              </p>
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
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Checking…" : "Claim domain"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center">
          <Link href="/" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            Cancel
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center">Loading…</div>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
