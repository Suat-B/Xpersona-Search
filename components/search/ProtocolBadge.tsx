interface Props {
  protocol: string;
}

const COLORS: Record<string, string> = {
  A2A: "bg-blue-500/20 text-blue-300",
  MCP: "bg-purple-500/20 text-purple-300",
  ANP: "bg-cyan-500/20 text-cyan-300",
  OPENCLEW: "bg-amber-500/20 text-amber-300",
  CUSTOM: "bg-slate-500/20 text-slate-300",
};

export function ProtocolBadge({ protocol }: Props) {
  const cls = COLORS[protocol] ?? "bg-slate-600/30 text-slate-400";
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{protocol}</span>;
}
