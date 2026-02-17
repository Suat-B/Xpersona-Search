"use client";

import { useState } from "react";

interface Position {
  id: string;
  timestamp: number;
  direction: "over" | "under";
  size: number;
  entry: number;
  exit: number;
  pnl: number;
  status: "open" | "closed";
}

interface PositionLedgerProps {
  positions: Position[];
  /** When true, AI mode is active — newest position gets entrance animation */
  aiModeActive?: boolean;
}

export function PositionLedger({ positions, aiModeActive = false }: PositionLedgerProps) {
  const [sortField, setSortField] = useState<keyof Position>("timestamp");
  const [sortDesc, setSortDesc] = useState(true);

  const sortedPositions = [...positions].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDesc ? bVal - aVal : aVal - bVal;
    }
    return sortDesc
      ? String(bVal).localeCompare(String(aVal))
      : String(aVal).localeCompare(String(bVal));
  });

  const handleSort = (field: keyof Position) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toISOString().split("T")[1].split(".")[0];
  };

  return (
    <div className="quant-panel flex flex-col h-full">
      <div className="quant-panel-header">
        <span>Position Ledger</span>
        <span className="text-[10px] text-[var(--quant-neutral)]">{positions.length} fills</span>
      </div>

      <div className="flex-1 overflow-auto quant-scrollbar">
        <table className="quant-table">
          <thead>
            <tr>
              {[
                { key: "timestamp", label: "Time", width: "65px" },
                { key: "direction", label: "Dir", width: "45px" },
                { key: "size", label: "Size", width: "50px" },
                { key: "entry", label: "Entry", width: "55px" },
                { key: "exit", label: "Exit", width: "55px" },
                { key: "pnl", label: "PnL", width: "55px" },
              ].map(({ key, label, width }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof Position)}
                  className="cursor-pointer hover:text-white transition-colors"
                  style={{ width, minWidth: width }}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    {sortField === key && (
                      <span className="text-[8px]">{sortDesc ? "▼" : "▲"}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPositions.slice(0, 50).map((position, i) => (
              <tr
                key={position.id}
                className={`group ${i === 0 && aiModeActive ? "animate-slide-in-from-bottom" : ""}`}
              >
                <td className="font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">{formatTime(position.timestamp)}</td>
                <td>
                  <span
                    className={`inline-flex px-1 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
                      position.direction === "over"
                        ? "bg-[var(--quant-accent)]/20 text-[var(--quant-accent)]"
                        : "bg-[var(--quant-purple)]/20 text-[var(--quant-purple)]"
                    }`}
                  >
                    {position.direction === "over" ? "LONG" : "SHORT"}
                  </span>
                </td>
                <td className="font-mono tabular-nums text-[11px] whitespace-nowrap">{position.size}</td>
                <td className="font-mono tabular-nums text-[11px] whitespace-nowrap">{position.entry.toFixed(2)}</td>
                <td className="font-mono tabular-nums text-[11px] whitespace-nowrap">{position.exit.toFixed(2)}</td>
                <td
                  className={`font-mono tabular-nums font-bold text-[11px] whitespace-nowrap ${
                    position.pnl >= 0 ? "text-bullish" : "text-bearish"
                  }`}
                >
                  {position.pnl >= 0 ? "+" : ""}
                  {position.pnl.toFixed(0)}
                </td>
              </tr>
            ))}
            {sortedPositions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-[var(--quant-neutral)]">
                  No positions executed
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
