"use client";

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  const shortcuts = [
    {
      category: "Trading",
      items: [
        { key: "Space", description: "Execute position" },
        { key: "Ctrl + Enter", description: "Execute position (alternative)" },
        { key: "Ctrl + Space", description: "Toggle auto-trading" },
        { key: "T", description: "Toggle direction (Over/Under)" },
      ],
    },
    {
      category: "Position Sizing",
      items: [
        { key: "↑", description: "Increase size by 10" },
        { key: "↓", description: "Decrease size by 10" },
        { key: "Shift + ↑", description: "Increase size by 100" },
        { key: "Shift + ↓", description: "Decrease size by 100" },
      ],
    },
    {
      category: "Target Adjustment",
      items: [
        { key: "→", description: "Increase target by 0.1" },
        { key: "←", description: "Decrease target by 0.1" },
        { key: "Shift + →", description: "Increase target by 1.0" },
        { key: "Shift + ←", description: "Decrease target by 1.0" },
      ],
    },
    {
      category: "Navigation",
      items: [
        { key: "Ctrl + K", description: "Show keyboard shortcuts" },
        { key: "Esc", description: "Close modal / Stop auto-trading" },
        { key: "Tab", description: "Next field" },
        { key: "Shift + Tab", description: "Previous field" },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="quant-panel w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in-up">
        <div className="quant-panel-header">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--quant-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span>Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--quant-neutral)] hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto quant-scrollbar p-6">
          <div className="grid grid-cols-2 gap-6">
            {shortcuts.map((category) => (
              <div key={category.category} className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-accent)]">
                  {category.category}
                </h3>
                <div className="space-y-2">
                  {category.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between group">
                      <kbd className="px-2 py-1 bg-[var(--quant-bg-card)] border border-[var(--quant-border)] rounded text-[11px] font-mono font-bold text-white">
                        {item.key}
                      </kbd>
                      <span className="text-xs text-[var(--quant-neutral)] group-hover:text-white transition-colors">
                        {item.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--quant-border)] bg-[var(--quant-bg-card)]">
          <p className="text-[11px] text-center text-[var(--quant-neutral)]">
            Press <kbd className="px-1.5 py-0.5 bg-[var(--quant-bg-primary)] rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
