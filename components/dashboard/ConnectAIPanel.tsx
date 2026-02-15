"use client";

import Link from "next/link";

export function ConnectAIPanel() {
  return (
    <Link href="/dashboard/connect-ai" className="group block">
      <div className="agent-card p-6 transition-all duration-300 group-hover:scale-[1.01] overflow-hidden relative">
        {/* Subtle gradient overlay on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: "linear-gradient(135deg, rgba(14,165,233,0.06) 0%, rgba(14,165,233,0.04) 50%, transparent 100%)",
          }}
        />
        
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0ea5e9]/25 to-[#0ea5e9]/15 border border-[#0ea5e9]/30 text-[#0ea5e9] group-hover:shadow-[0_0_30px_rgba(14,165,233,0.2)] transition-shadow duration-300">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[var(--text-primary)] text-lg">
                  Connect AI
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/30">
                  AI-first
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
                Generate an API key and let OpenClaw, LangChain, or any AI play dice with your balance — same account, same credits.
              </p>
              
              <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                  One key, all frameworks
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                  REST API
                </span>
              </div>
            </div>
          </div>
          
          <span className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 px-5 py-2.5 text-sm font-medium text-[#0ea5e9] group-hover:bg-[#0ea5e9]/20 group-hover:border-[#0ea5e9]/60 group-hover:shadow-[0_0_20px_rgba(14,165,233,0.2)] transition-all duration-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Connect
          </span>
        </div>
      </div>
    </Link>
  );
}
