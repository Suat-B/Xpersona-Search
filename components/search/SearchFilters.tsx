"use client";

interface Props {
  facets?: { protocols?: Array<{ protocol: string[]; count: number }> };
  selectedProtocols: string[];
  onProtocolChange: (p: string[]) => void;
  minSafety: number;
  onSafetyChange: (n: number) => void;
  sort: string;
  onSortChange: (s: string) => void;
}

export function SearchFilters({
  selectedProtocols,
  onProtocolChange,
  minSafety,
  onSafetyChange,
  sort,
  onSortChange,
}: Props) {
  const protocols = ["A2A", "MCP", "ANP", "OPENCLEW"];

  const toggleProtocol = (p: string) => {
    if (selectedProtocols.includes(p)) {
      onProtocolChange(selectedProtocols.filter((x) => x !== p));
    } else {
      onProtocolChange([...selectedProtocols, p]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Protocol</h3>
        <div className="flex flex-wrap gap-2">
          {protocols.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleProtocol(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedProtocols.includes(p)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-400 hover:bg-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">
          Min Safety
        </h3>
        <input
          type="range"
          min={0}
          max={100}
          value={minSafety}
          onChange={(e) => onSafetyChange(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-slate-400 mt-1">{minSafety}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Sort</h3>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
        >
          <option value="rank">By Rank</option>
          <option value="safety">By Safety</option>
          <option value="popularity">By Popularity</option>
          <option value="freshness">By Freshness</option>
        </select>
      </div>
    </div>
  );
}
