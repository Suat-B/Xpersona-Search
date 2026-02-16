"use client";

import { useEffect, useCallback } from "react";

interface UseKeyboardShortcutsProps {
  onRoll: () => void;
  onIncreaseBet: () => void;
  onDecreaseBet: () => void;
  onHalfBet: () => void;
  onDoubleBet: () => void;
  onMaxBet: () => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onRoll,
  onIncreaseBet,
  onDecreaseBet,
  onHalfBet,
  onDoubleBet,
  onMaxBet,
  disabled = false,
}: UseKeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          onRoll();
          break;
        case "ArrowUp":
          e.preventDefault();
          onIncreaseBet();
          break;
        case "ArrowDown":
          e.preventDefault();
          onDecreaseBet();
          break;
        case "1":
          e.preventDefault();
          onHalfBet();
          break;
        case "2":
          e.preventDefault();
          onDoubleBet();
          break;
        case "m":
        case "M":
          e.preventDefault();
          onMaxBet();
          break;
      }
    },
    [disabled, onRoll, onIncreaseBet, onDecreaseBet, onHalfBet, onDoubleBet, onMaxBet]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export function KeyboardShortcutsHelp() {
  const shortcuts = [
    { key: "Space / Enter", action: "Place order" },
    { key: "↑", action: "Increase position" },
    { key: "↓", action: "Decrease position" },
    { key: "1", action: "Half position" },
    { key: "2", action: "Double position" },
    { key: "M", action: "Max position (10k)" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 rounded-full bg-[#0ea5e9]" />
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          Shortcuts
        </h4>
      </div>
      <div className="space-y-1">
        {shortcuts.map(({ key, action }) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <kbd className="px-1.5 py-0.5 rounded-lg bg-white/[0.04] border border-[var(--border)] font-mono text-[var(--text-secondary)] text-[10px]">
              {key}
            </kbd>
            <span className="text-[var(--text-tertiary)]">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
