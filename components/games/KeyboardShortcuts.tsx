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
    <div className="terminal-pane rounded-sm p-2">
      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
        Keyboard Shortcuts
      </h4>
      <div className="space-y-0.5">
        {shortcuts.map(({ key, action }) => (
          <div key={key} className="flex items-center justify-between text-[11px]">
            <kbd className="px-1.5 py-0.5 rounded-sm terminal-input font-mono text-[var(--text-secondary)] text-[10px]">
              {key}
            </kbd>
            <span className="text-[var(--text-tertiary)]">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
