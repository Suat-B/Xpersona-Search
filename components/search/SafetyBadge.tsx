interface Props {
  score: number;
}

export function SafetyBadge({ score }: Props) {
  const color =
    score >= 80
      ? "text-[var(--accent-success)]"
      : score >= 50
        ? "text-[var(--accent-warning)]"
        : "text-[var(--accent-danger)]";
  return (
    <span className={`text-sm font-medium ${color}`}>
      Safety: {score}/100
    </span>
  );
}
