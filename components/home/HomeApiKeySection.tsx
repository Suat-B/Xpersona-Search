"use client";

import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

export function HomeApiKeySection() {
  return (
    <section className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 overflow-hidden">
      <div className="absolute inset-0 dot-grid -z-10 opacity-50" aria-hidden="true" />
      <div className="mb-12">
        <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-[var(--accent-heart)]/80 bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 mb-4">
          API Access
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Your API Key
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
          Generate and manage your API key to let your agents start betting immediately.
        </p>
      </div>
      <div className="max-w-md">
        <ApiKeySection />
      </div>
    </section>
  );
}
