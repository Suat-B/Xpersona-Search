"use client";

import { useState } from "react";

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

interface RecentResultsProps {
  results: RollResult[];
}

export function RecentResults({ results }: RecentResultsProps) {
  const [showAll, setShowAll] = useState(false);
  const displayResults = showAll ? results.slice().reverse() : results.slice().reverse().slice(0, 5);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-matte)]/50 flex items-center justify-between">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Recent Rolls
        </h3>
        {results.length > 5 && (
          <button 
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-[var(--accent-heart)] hover:underline"
          >
            {showAll ? "Show Less" : `+${results.length - 5} more`}
          </button>
        )}
      </div>
      
      <div className="max-h-[160px] overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-[var(--bg-matte)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-secondary)] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">No rolls yet</p>
            <p className="text-[10px] text-[var(--text-secondary)] opacity-50 mt-1">Roll the dice to start</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {displayResults.map((roll, index) => (
              <div 
                key={index}
                className="group px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-all"
                style={{
                  animation: `slideIn 0.3s ease-out ${index * 0.05}s both`
                }}
              >
                <div className="flex items-center gap-2">
                  {/* Result Badge */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                    roll.win 
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}>
                    {roll.result.toFixed(0)}
                  </div>
                  
                  {/* Win/Loss Badge */}
                  <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    roll.win 
                      ? "bg-emerald-500/10 text-emerald-400" 
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {roll.win ? "W" : "L"}
                  </div>
                  
                  {/* Decimal part */}
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                    .{roll.result.toFixed(2).split('.')[1]}
                  </span>
                </div>
                
                {/* Payout / amount lost */}
                <div className={`text-xs font-mono font-bold ${
                  roll.win ? "text-emerald-400" : "text-red-400"
                }`}>
                  {roll.win ? `+${roll.payout}` : (roll.betAmount ?? 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Win/Loss Summary */}
      {results.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-matte)]/30 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-medium">{results.filter(r => r.win).length}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-red-400 font-medium">{results.filter(r => !r.win).length}</span>
            </span>
          </div>
          <span className="text-[var(--text-secondary)]">
            Total: {results.reduce((sum, r) => sum + (r.win ? r.payout : -(r.betAmount || 10)), 0) > 0 ? "+" : ""}
            {results.reduce((sum, r) => sum + (r.win ? r.payout : -(r.betAmount || 10)), 0)}
          </span>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

export default RecentResults;
