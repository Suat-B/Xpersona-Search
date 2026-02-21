"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Footer } from "@/components/home/Footer";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";

type VerifyState = "verifying" | "valid" | "invalid" | null;

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id")?.trim() ?? "";
  const domainId = searchParams?.get("domain_id")?.trim() ?? "";
  const nameParam = searchParams?.get("name")?.trim() ?? "";

  const [verifyState, setVerifyState] = useState<VerifyState>(null);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verification, setVerification] = useState<{
    fullDomain: string;
    cardUrl: string;
    dnsTxtRecord: string | null;
    txtRecordName: string;
    instructions: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId || !domainId) {
      setVerifyState("invalid");
      return;
    }
    setVerifyState("verifying");
    fetch(
      `/api/ans/verify-session?session_id=${encodeURIComponent(sessionId)}&domain_id=${encodeURIComponent(domainId)}`
    )
      .then((r) => r.json())
      .then((data: { valid?: boolean; name?: string }) => {
        if (data.valid && data.name) {
          setVerifyState("valid");
          setVerifiedName(data.name);
        } else {
          setVerifyState("invalid");
        }
      })
      .catch(() => setVerifyState("invalid"));
  }, [sessionId, domainId]);

  useEffect(() => {
    const name = verifiedName ?? nameParam;
    if (verifyState === "valid" && name && name.length >= 3) {
      fetch(`/api/ans/verification/${encodeURIComponent(name)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setVerification)
        .catch(() => setVerification(null));
    }
  }, [verifyState, verifiedName, nameParam]);

  const name = verifiedName ?? nameParam;
  const fullDomain = name ? `${name}.xpersona.agent` : "";
  const cardUrl = verification?.cardUrl ?? (name ? `https://xpersona.co/agent/${name}` : "");
  const instructions = verification?.instructions ?? [
    "Your domain is active.",
    `Agent Card: ${cardUrl}`,
    `Add TXT record _agent.${fullDomain} for DNS verification when ready.`,
  ];

  const copyDnsRecord = () => {
    if (!verification?.dnsTxtRecord) return;
    navigator.clipboard.writeText(verification.dnsTxtRecord);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (verifyState === "verifying") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <p className="text-[var(--text-secondary)] mb-4">Verifying payment…</p>
      </div>
    );
  }

  if (verifyState === "invalid") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <p className="text-[var(--text-secondary)] mb-4">
          Invalid or expired session. Complete payment to activate your domain.
        </p>
        <Link href="/" className="text-[#0ea5e9] hover:underline font-medium">
          Back to search
        </Link>
      </div>
    );
  }

  if (verifyState !== "valid" || !name || name.length < 3) {
    return null;
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="p-6 rounded-2xl border border-[#30d158]/40 bg-[#30d158]/10">
          <h1 className="text-xl font-bold text-[#30d158] mb-2">
            {fullDomain} is yours
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Payment successful. Your domain is now active.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Next steps
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-[var(--text-primary)]">
              {instructions.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          {verification?.dnsTxtRecord && (
            <div className="mt-4 p-3 rounded-lg bg-black/20 border border-[var(--border)]">
              <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                DNS TXT record
              </p>
              <code className="block text-xs text-[var(--text-primary)] break-all mb-2">
                {verification.txtRecordName} TXT &quot;{verification.dnsTxtRecord}&quot;
              </code>
              <button
                type="button"
                onClick={copyDnsRecord}
                className="text-sm font-medium text-[#0ea5e9] hover:underline"
              >
                {copied ? "Copied!" : "Copy DNS record"}
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[#0ea5e9] hover:underline"
            >
              View Agent Card →
            </Link>
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-[#0ea5e9] hover:underline"
            >
              Sign in to dashboard →
            </Link>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              First time? Set a password for your account
            </Link>
            <Link
              href="/"
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              Back to search
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <ANSMinimalHeader />
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center">
              Loading…
            </div>
          }
        >
          <SuccessContent />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
