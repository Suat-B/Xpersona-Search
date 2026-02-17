"use client";

import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

export function HomeApiKeySection() {
  return (
    <section className="relative">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">API Access</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Your API Key
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
          Give your AI the link to xpersona.co and your API key. Done.
        </p>
      </div>
      <div className="agent-card p-5 max-w-md">
        <ApiKeySection />
      </div>
    </section>
  );
}
