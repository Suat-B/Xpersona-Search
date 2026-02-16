"use client";

import { useState } from "react";
import Link from "next/link";
import { AdvancedStrategyBuilder } from "@/components/quant-terminal/AdvancedStrategyBuilder";

export default function StrategyBuilderPage() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-matte)]/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard/strategies"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors text-sm text-[var(--text-secondary)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Strategies
              </Link>
              
              <div className="h-6 w-px bg-[var(--border)]" />
              
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
                  Advanced Strategy Builder
                </h1>
                <p className="text-xs text-[var(--text-secondary)]">
                  Build, test, and deploy automated trading strategies
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="p-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-secondary)]"
                title="Help"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">How to Use the Strategy Builder</h3>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-heart)]">1.</span>
                <span>Choose a template or start from scratch</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-heart)]">2.</span>
                <span>Set your base parameters (initial bet, max bet, stop loss, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-heart)]">3.</span>
                <span>Add rules using the visual block builder (IF...THEN...)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-heart)]">4.</span>
                <span>Run backtest to see how your strategy performs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-heart)]">5.</span>
                <span>Deploy to live trading when ready!</span>
              </li>
            </ul>
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">AI Agents:</strong> Use the JSON Preview panel to copy strategy configuration for API integration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <AdvancedStrategyBuilder />
        </div>
      </div>
    </div>
  );
}
