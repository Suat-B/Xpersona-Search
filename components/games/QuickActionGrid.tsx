"use client";

import type { DiceProgressionType } from "@/lib/strategies";

const MAX_BET = 10000;
const MIN_BET = 1;

export interface QuickActionGridConfig {
  amount: number;
  target: number;
  condition: "over" | "under";
  progressionType?: DiceProgressionType;
}

interface QuickActionGridProps {
  target: number;
  condition: "over" | "under";
  amount: number;
  balance: number;
  progressionType?: string;
  disabled?: boolean;
  recentResults?: { win: boolean }[];
  onTargetChange: (v: number) => void;
  onConditionChange: (v: "over" | "under") => void;
  onAmountChange: (v: number) => void;
  onLoadConfig?: (config: QuickActionGridConfig) => void;
}

interface StrategyDef {
  id: string;
  label: string;
  config: QuickActionGridConfig;
  icon: React.ReactNode;
}

interface ToolDef {
  id: string;
  label: string;
  isActive?: (p: QuickActionGridProps) => boolean;
  onClick: (p: QuickActionGridProps) => void;
  icon: React.ReactNode;
}

function ScissorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.7 8.7l6.6 6.6M8.7 15.3l6.6-6.6" />
    </svg>
  );
}

function CrosshairIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

function ChartUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6h6v6M3 9V3h6v6M21 18v-4h-4v4M21 13V9h-4v4" />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function SpiralIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4a8 8 0 018 8c0 2-1 4-2 5-1 1-2 1-3 1H9" />
      <path d="M12 4a8 8 0 00-8 8c0 2 1 4 2 5 1 1 2 1 3 1h1" />
      <path d="M12 20a8 8 0 01-8-8c0-2 1-4 2-5 1-1 2-1 3-1h1" />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0112 4.5v3a2.5 2.5 0 01-2.5 2.5H7a2.5 2.5 0 01-2.5-2.5v-3A2.5 2.5 0 017 2h2.5zM12 7v1.5a2.5 2.5 0 002.5 2.5h2a2.5 2.5 0 002.5-2.5V7" />
      <path d="M12 7H9.5a2.5 2.5 0 00-2.5 2.5v3a2.5 2.5 0 002.5 2.5H12" />
      <path d="M12 14v2a3 3 0 01-3 3H7a3 3 0 01-3-3v-2" />
    </svg>
  );
}

function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M9 9h6M9 15h6" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function ArrowsSwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h.01M16 8h.01M8 16h.01M16 16h.01M12 12h.01" />
    </svg>
  );
}

function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-4 8 0s6 4 8 0 4-4 6-4" />
      <path d="M2 17c2-3 6-3 8 0s6 3 8 0 4-3 6-3" />
    </svg>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

function MinimizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 2v3a2 2 0 012 2h3M3 16v-3a2 2 0 012-2h3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

const STRATEGIES: StrategyDef[] = [
  { id: "scalp", label: "Scalp", config: { amount: 10, target: 48, condition: "over", progressionType: "flat" }, icon: <ScissorsIcon className="w-3 h-3" /> },
  { id: "sniper", label: "Sniper", config: { amount: 10, target: 95, condition: "under", progressionType: "flat" }, icon: <CrosshairIcon className="w-3 h-3" /> },
  { id: "martingale", label: "Martingale", config: { amount: 10, target: 50, condition: "over", progressionType: "martingale" }, icon: <ChartUpIcon className="w-3 h-3" /> },
  { id: "paroli", label: "Paroli", config: { amount: 10, target: 50, condition: "over", progressionType: "paroli" }, icon: <LayersIcon className="w-3 h-3" /> },
  { id: "fibonacci", label: "Fibonacci", config: { amount: 10, target: 45, condition: "over", progressionType: "fibonacci" }, icon: <SpiralIcon className="w-3 h-3" /> },
  { id: "kelly", label: "Kelly", config: { amount: 10, target: 50, condition: "over", progressionType: "kelly" }, icon: <BrainIcon className="w-3 h-3" /> },
  { id: "coinflip", label: "Coin Flip", config: { amount: 10, target: 50, condition: "over", progressionType: "flat" }, icon: <CoinIcon className="w-3 h-3" /> },
  { id: "grind", label: "Grind", config: { amount: 10, target: 30, condition: "under", progressionType: "oscar" }, icon: <GearIcon className="w-3 h-3" /> },
];

function isStrategyActive(props: QuickActionGridProps, def: StrategyDef): boolean {
  const { target, condition, amount, progressionType = "flat" } = props;
  const c = def.config;
  return (
    Math.abs(target - c.target) < 0.5 &&
    condition === c.condition &&
    Math.abs(amount - c.amount) < 1 &&
    (c.progressionType ? progressionType === c.progressionType : true)
  );
}

const TOOLS: ToolDef[] = [
  {
    id: "flip",
    label: "Flip",
    icon: <ArrowsSwapIcon className="w-3 h-3" />,
    onClick: (p) => p.onConditionChange(p.condition === "over" ? "under" : "over"),
  },
  {
    id: "randomize",
    label: "Random",
    icon: <DiceIcon className="w-3 h-3" />,
    onClick: (p) => {
      const t = Math.round(5 + Math.random() * 90);
      p.onTargetChange(t);
      p.onConditionChange(Math.random() >= 0.5 ? "over" : "under");
    },
  },
  {
    id: "meanrevert",
    label: "Mean Revert",
    icon: <WaveIcon className="w-3 h-3" />,
    onClick: (p) => {
      const last10 = (p.recentResults ?? []).slice(-10);
      const wins = last10.filter((r) => r.win).length;
      const newTarget = wins >= 6 ? Math.max(5, p.target - 15) : Math.min(95, p.target + 15);
      p.onTargetChange(Math.round(newTarget));
    },
  },
  {
    id: "allin",
    label: "All In",
    isActive: (p) => p.amount >= Math.min(p.balance, MAX_BET) - 0.5,
    icon: <FlameIcon className="w-3 h-3" />,
    onClick: (p) => p.onAmountChange(Math.min(p.balance, MAX_BET)),
  },
  {
    id: "minsize",
    label: "Min",
    isActive: (p) => p.amount <= MIN_BET + 0.5,
    icon: <MinimizeIcon className="w-3 h-3" />,
    onClick: (p) => p.onAmountChange(MIN_BET),
  },
  {
    id: "hedge",
    label: "Hedge",
    icon: <ShieldIcon className="w-3 h-3" />,
    onClick: (p) => {
      p.onConditionChange(p.condition === "over" ? "under" : "over");
      p.onAmountChange(Math.max(MIN_BET, Math.floor(p.amount / 2)));
    },
  },
  {
    id: "10x",
    label: "10x",
    isActive: (p) => p.target >= 89,
    icon: <RocketIcon className="w-3 h-3" />,
    onClick: (p) => p.onTargetChange(90),
  },
  {
    id: "safe",
    label: "Safe",
    isActive: (p) => Math.abs(p.target - 25) < 1 && p.condition === "under",
    icon: <LockIcon className="w-3 h-3" />,
    onClick: (p) => {
      p.onTargetChange(25);
      p.onConditionChange("under");
    },
  },
];

export function QuickActionGrid({
  target,
  condition,
  amount,
  balance,
  progressionType,
  disabled = false,
  recentResults = [],
  onTargetChange,
  onConditionChange,
  onAmountChange,
  onLoadConfig,
}: QuickActionGridProps) {
  const props: QuickActionGridProps = { target, condition, amount, balance, progressionType, disabled, recentResults, onTargetChange, onConditionChange, onAmountChange, onLoadConfig };

  const btnBase = "rounded-sm border text-[9px] font-semibold uppercase tracking-wider min-h-[36px] lg:min-h-0 py-1.5 px-2 flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const btnIdle = "bg-white/[0.03] border-white/[0.08] text-[var(--text-tertiary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]";
  const btnActive = "bg-[#0ea5e9]/15 text-[#0ea5e9] border-[#0ea5e9]/30";

  return (
    <div className="w-full space-y-2 pt-2">
      <div className="space-y-1.5">
        <span className="block text-[8px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]/70">Strategies</span>
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-1">
          {STRATEGIES.map((def) => {
            const active = onLoadConfig && isStrategyActive(props, def);
            return (
              <button
                key={def.id}
                type="button"
                disabled={disabled || !onLoadConfig}
                onClick={() => onLoadConfig?.(def.config)}
                className={`${btnBase} ${active ? btnActive : btnIdle}`}
              >
                {def.icon}
                {def.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pt-1.5 border-t border-white/[0.06]" />
      <div className="space-y-1.5">
        <span className="block text-[8px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]/70">Quick Tools</span>
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-1">
          {TOOLS.map((def) => {
            const active = def.isActive?.(props) ?? false;
            return (
              <button
                key={def.id}
                type="button"
                disabled={disabled}
                onClick={() => def.onClick(props)}
                className={`${btnBase} ${active ? btnActive : btnIdle}`}
              >
                {def.icon}
                {def.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
