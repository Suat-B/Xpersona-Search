"use client";

import { useEffect, useState } from "react";

export function StrategiesCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/me/strategies?gameType=dice", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const strategies = d?.data?.strategies ?? [];
        setCount(Array.isArray(strategies) ? strategies.length : 0);
      })
      .catch(() => setCount(0));
  }, []);

  if (count === null) return <span>â€¦</span>;
  return <span>{count} {count === 1 ? "Strategy" : "Strategies"}</span>;
}



