"use client";

import { useState } from "react";
import { HFModelsSidebar } from "./HFModelsSidebar";

const FilterIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

interface HFMobileFiltersProps {
  selectedTasks: string[];
  onTaskChange: (tasks: string[]) => void;
  selectedProtocols: string[];
  onProtocolChange: (protocols: string[]) => void;
  selectedCapabilities: string[];
  onCapabilityChange: (capabilities: string[]) => void;
  minRank: number;
  onMinRankChange: (rank: number) => void;
}

export function HFMobileFilters({
  selectedTasks,
  onTaskChange,
  selectedProtocols,
  onProtocolChange,
  selectedCapabilities,
  onCapabilityChange,
  minRank,
  onMinRankChange,
}: HFMobileFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount =
    selectedTasks.length +
    selectedProtocols.length +
    selectedCapabilities.length +
    (minRank > 0 ? 1 : 0);

  return (
    <>
      {/* Mobile Filter Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent-heart)] hover:text-[var(--accent-heart)] transition-colors"
      >
        <FilterIcon className="w-4 h-4" />
        <span>Filters</span>
        {activeFiltersCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-[var(--accent-heart)] text-white rounded-full">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-80 bg-[var(--bg-matte)] border-r border-[var(--border)] z-50 overflow-y-auto lg:hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Filters
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
                >
                  <XIcon className="w-5 h-5 text-[var(--text-tertiary)]" />
                </button>
              </div>
              <HFModelsSidebar
                selectedTasks={selectedTasks}
                onTaskChange={onTaskChange}
                selectedProtocols={selectedProtocols}
                onProtocolChange={onProtocolChange}
                selectedCapabilities={selectedCapabilities}
                onCapabilityChange={onCapabilityChange}
                minRank={minRank}
                onMinRankChange={onMinRankChange}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
