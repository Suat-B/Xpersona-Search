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
    { key: "Space / Enter", action: "Execute trade" },
    { key: "↑", action: "Increase bet" },
    { key: "↓", action: "Decrease bet" },
    { key: "1", action: "Half bet" },
    { key: "2", action: "Double bet" },
    { key: "M", action: "Max bet (10k)" },
  ];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2 uppercase tracking-wider">
        Keyboard Shortcuts
      </h4>
      <div className="space-y-1.5">
        {shortcuts.map(({ key, action }) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <kbd className="px-2 py-0.5 rounded bg-[var(--bg-matte)] border border-[var(--border)] font-mono text-[var(--text-secondary)]">
              {key}
            </kbd>
            <span className="text-[var(--text-secondary)]">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
