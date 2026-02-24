interface Props {
  protocol: string;
}

const COLORS: Record<string, string> = {
  A2A: "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] border-[var(--accent-heart)]/30",
  MCP: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  ANP: "bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] border-[var(--accent-teal)]/30",
  OPENCLEW: "bg-[var(--accent-warning)]/20 text-[var(--accent-warning)] border-[var(--accent-warning)]/30",
  OPENCLAW: "bg-[var(--accent-warning)]/20 text-[var(--accent-warning)] border-[var(--accent-warning)]/30",
  CUSTOM: "bg-[var(--text-quaternary)]/20 text-[var(--text-tertiary)] border-[var(--border)]",
};

/** Display label for protocol IDs (e.g. OPENCLEW -> OpenClaw). */
export const PROTOCOL_LABELS: Record<string, string> = {
  OPENCLEW: "OpenClaw",
  OPENCLAW: "OpenClaw",
  A2A: "A2A",
  MCP: "MCP",
  ANP: "ANP",
  CUSTOM: "Custom",
};

export function ProtocolBadge({ protocol }: Props) {
  const cls =
    COLORS[protocol] ??
    "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border-[var(--border)]";
  const label = PROTOCOL_LABELS[protocol] ?? protocol;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}
