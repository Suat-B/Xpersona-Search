interface Props {
  score: number;
}

export function SafetyBadge({ score }: Props) {
  const color =
    score >= 80
      ? "text-green-500"
      : score >= 50
        ? "text-yellow-500"
        : "text-red-500";
  return (
    <span className={`text-sm font-medium ${color}`}>
      Safety: {score}/100
    </span>
  );
}
