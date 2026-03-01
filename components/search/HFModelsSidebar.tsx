"use client";

import { useState } from "react";

// Inline SVG icons to avoid dependency issues
const ChevronDown = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const ChevronRight = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const SlidersHorizontal = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M7 12h10"/>
    <path d="M10 18h4"/>
  </svg>
);

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterSection({ title, children, defaultOpen = true }: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 px-1 text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
        )}
      </button>
      {isOpen && <div className="pb-4">{children}</div>}
    </div>
  );
}

interface CheckboxItemProps {
  label: string;
  count?: number;
  icon?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

function CheckboxItem({ label, count, icon, checked = false, onChange }: CheckboxItemProps) {
  return (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent-heart)] focus:ring-[var(--accent-heart)] focus:ring-offset-0"
      />
      {icon && <span className="text-[var(--text-tertiary)]">{icon}</span>}
      <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
        {label}
      </span>
      {count !== undefined && (
        <span className="ml-auto text-xs text-[var(--text-quaternary)]">{count}</span>
      )}
    </label>
  );
}

interface ProtocolBadgeProps {
  label: string;
  color: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

function ProtocolBadge({ label, color, checked = false, onChange }: ProtocolBadgeProps) {
  return (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent-heart)] focus:ring-[var(--accent-heart)]"
      />
      <span
        className="px-2 py-0.5 rounded text-xs font-medium"
        style={{ backgroundColor: `${color}20`, color: color, border: `1px solid ${color}40` }}
      >
        {label}
      </span>
    </label>
  );
}

interface HFModelsSidebarProps {
  selectedTasks: string[];
  onTaskChange: (tasks: string[]) => void;
  selectedProtocols: string[];
  onProtocolChange: (protocols: string[]) => void;
  selectedCapabilities: string[];
  onCapabilityChange: (capabilities: string[]) => void;
  minRank: number;
  onMinRankChange: (rank: number) => void;
  selectedVerification?: string[];
  onVerificationChange?: (levels: string[]) => void;
}

const TASKS = [
  { id: "text-generation", label: "Text Generation", icon: "💬" },
  { id: "image-text", label: "Image-Text-to-Text", icon: "🖼️" },
  { id: "image-generation", label: "Text-to-Image", icon: "🎨" },
  { id: "code", label: "Code Assistant", icon: "💻" },
  { id: "trading", label: "Trading", icon: "📈" },
  { id: "research", label: "Research", icon: "🔬" },
  { id: "data-analysis", label: "Data Analysis", icon: "📊" },
  { id: "automation", label: "Automation", icon: "⚙️" },
];

const PROTOCOLS = [
  { id: "A2A", label: "A2A", color: "#8b5cf6" },
  { id: "MCP", label: "MCP", color: "#10b981" },
  { id: "ANP", label: "ANP", color: "#f59e0b" },
  { id: "OPENCLEW", label: "OpenClaw", color: "#ec4899" },
];

const CAPABILITIES = [
  { id: "web-search", label: "Web Search" },
  { id: "file-processing", label: "File Processing" },
  { id: "api-integration", label: "API Integration" },
  { id: "real-time", label: "Real-time" },
  { id: "multi-modal", label: "Multi-modal" },
  { id: "code-execution", label: "Code Execution" },
  { id: "memory", label: "Memory" },
  { id: "planning", label: "Planning" },
];

const VERIFICATION_LEVELS = [
  { id: "verified", label: "Verified Only", color: "#10b981" },
  { id: "bronze", label: "Bronze+", color: "#cd7f32" },
  { id: "silver", label: "Silver+", color: "#c0c0c0" },
  { id: "gold", label: "Gold Only", color: "#ffd700" },
];

export function HFModelsSidebar({
  selectedTasks,
  onTaskChange,
  selectedProtocols,
  onProtocolChange,
  selectedCapabilities,
  onCapabilityChange,
  minRank,
  onMinRankChange,
  selectedVerification = [],
  onVerificationChange = () => {},
}: HFModelsSidebarProps) {
  const [filterText, setFilterText] = useState("");

  const toggleTask = (taskId: string) => {
    if (selectedTasks.includes(taskId)) {
      onTaskChange(selectedTasks.filter((t) => t !== taskId));
    } else {
      onTaskChange([...selectedTasks, taskId]);
    }
  };

  const toggleProtocol = (protocolId: string) => {
    if (selectedProtocols.includes(protocolId)) {
      onProtocolChange(selectedProtocols.filter((p) => p !== protocolId));
    } else {
      onProtocolChange([...selectedProtocols, protocolId]);
    }
  };

  const toggleCapability = (capId: string) => {
    if (selectedCapabilities.includes(capId)) {
      onCapabilityChange(selectedCapabilities.filter((c) => c !== capId));
    } else {
      onCapabilityChange([...selectedCapabilities, capId]);
    }
  };

  const toggleVerification = (levelId: string) => {
    if (selectedVerification.includes(levelId)) {
      onVerificationChange(selectedVerification.filter((v) => v !== levelId));
    } else {
      onVerificationChange([...selectedVerification, levelId]);
    }
  };

  return (
    <aside className="w-64 flex-shrink-0">
      {/* Filter by name */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by name"
            className="w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]"
          />
        </div>
      </div>

      {/* Tasks Section */}
      <FilterSection title="Tasks">
        <div className="space-y-1">
          {TASKS.map((task) => (
            <CheckboxItem
              key={task.id}
              label={task.label}
              icon={<span className="text-sm">{task.icon}</span>}
              checked={selectedTasks.includes(task.id)}
              onChange={() => toggleTask(task.id)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Rank Range Slider */}
      <FilterSection title="Minimum Rank">
        <div className="px-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-2">
            <span>0</span>
            <span>{minRank}</span>
            <span>100</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={minRank}
            onChange={(e) => onMinRankChange(Number(e.target.value))}
            className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full appearance-none cursor-pointer accent-[var(--accent-heart)]"
          />
          <div className="mt-2 text-xs text-[var(--text-tertiary)]">
            Minimum: {minRank}/100
          </div>
        </div>
      </FilterSection>

      {/* Protocols Section */}
      <FilterSection title="Protocols">
        <div className="space-y-1">
          {PROTOCOLS.map((protocol) => (
            <ProtocolBadge
              key={protocol.id}
              label={protocol.label}
              color={protocol.color}
              checked={selectedProtocols.includes(protocol.id)}
              onChange={() => toggleProtocol(protocol.id)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Capabilities Section */}
      <FilterSection title="Capabilities">
        <div className="space-y-1">
          {CAPABILITIES.map((cap) => (
            <CheckboxItem
              key={cap.id}
              label={cap.label}
              checked={selectedCapabilities.includes(cap.id)}
              onChange={() => toggleCapability(cap.id)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Verification Section */}
      <FilterSection title="Verification">
        <div className="space-y-1">
          {VERIFICATION_LEVELS.map((level) => (
            <CheckboxItem
              key={level.id}
              label={level.label}
              checked={selectedVerification.includes(level.id)}
              onChange={() => toggleVerification(level.id)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Clear Filters */}
      <div className="pt-4">
        <button
          onClick={() => {
            onTaskChange([]);
            onProtocolChange([]);
            onCapabilityChange([]);
            onMinRankChange(0);
            setFilterText("");
          }}
          className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Clear all filters
        </button>
      </div>
    </aside>
  );
}
