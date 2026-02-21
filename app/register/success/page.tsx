"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Footer } from "@/components/home/Footer";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";

function SuccessContent() {
  const searchParams = useSearchParams();
  const name = searchParams?.get("name")?.trim() ?? "";

  const fullDomain = name ? `${name}.xpersona.agent` : "";
  const instructions = [
    "Your domain is active.",
    `Agent Card: https://xpersona.co/api/ans/card/${name}`,
    `Add TXT record _agent.${fullDomain} for DNS verification when ready.`,
  ];

  if (!name || name.length < 3) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <p className="text-[var(--text-secondary)] mb-4">Invalid success page.</p>
        <Link href="/" className="text-[#0ea5e9] hover:underline font-medium">
          Back to search
        </Link>
      </div>
    );
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

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/api/ans/card/${name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[#0ea5e9] hover:underline"
            >
              View Agent Card →
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
