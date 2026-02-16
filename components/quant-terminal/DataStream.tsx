"use client";

interface LogEntry {
  time: number;
  type: string;
  message: string;
}

interface DataStreamProps {
  logs: LogEntry[];
}

export function DataStream({ logs }: DataStreamProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toISOString().split("T")[1].split(".")[0];
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "fill":
        return "text-bullish";
      case "error":
        return "text-bearish";
      case "warn":
        return "text-[var(--quant-warning)]";
      case "info":
        return "text-[var(--quant-accent)]";
      default:
        return "text-[var(--quant-neutral)]";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "fill":
        return "●";
      case "error":
        return "✕";
      case "warn":
        return "⚠";
      case "info":
        return "ℹ";
      default:
        return "•";
    }
  };

  return (
    <div className="h-28 bg-[var(--quant-bg-surface)] border-t border-[var(--quant-border)] flex">
      {/* Log Section */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--quant-bg-card)] border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-2">
            <svg className="w-3 h-3 text-[var(--quant-neutral)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--quant-neutral)]">System Log</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--quant-bullish)]"></span>
              <span className="text-[9px] text-[var(--quant-neutral)]">Fill</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--quant-bearish)]"></span>
              <span className="text-[9px] text-[var(--quant-neutral)]">Error</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--quant-accent)]"></span>
              <span className="text-[9px] text-[var(--quant-neutral)]">Info</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto quant-scrollbar p-2">
          <div className="space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-[11px] text-[var(--quant-neutral)] italic px-2 py-4 text-center">
                No activity yet. Execute your first position to begin.
              </div>
            ) : (
              logs.slice(0, 20).map((log, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 px-2 py-1 text-[11px] font-mono hover:bg-[var(--quant-bg-hover)] rounded transition-colors"
                >
                  <span className="text-[var(--quant-neutral)] tabular-nums flex-shrink-0">
                    {formatTime(log.time)}
                  </span>
                  <span className={`flex-shrink-0 ${getTypeColor(log.type)}`}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className={`${getTypeColor(log.type)} truncate`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="w-64 border-l border-[var(--quant-border)] flex flex-col">
        <div className="px-3 py-1.5 bg-[var(--quant-bg-card)] border-b border-[var(--quant-border)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--quant-neutral)]">Quick Stats</span>
        </div>
        <div className="flex-1 p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[var(--quant-neutral)]">Total Trades</span>
            <span className="text-xs font-mono font-bold">{logs.filter((l) => l.type === "fill").length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[var(--quant-neutral)]">Session Duration</span>
            <span className="text-xs font-mono">00:00:00</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[var(--quant-neutral)]">Avg Latency</span>
            <span className="text-xs font-mono text-bullish">23ms</span>
          </div>
          <div className="pt-2 border-t border-[var(--quant-border)]">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-[var(--quant-neutral)]">Status</span>
              <span className="text-[10px] text-bullish font-bold">OPERATIONAL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
