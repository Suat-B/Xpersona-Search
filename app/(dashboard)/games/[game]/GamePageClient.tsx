"use client";

import dynamic from "next/dynamic";
import type { GameSlug } from "./page";

const GameViewClient = dynamic(() => import("./GameViewClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-secondary)]">
      Loading game…
    </div>
  ),
});

interface GamePageClientProps {
  game: GameSlug;
  initialBalance: number | null;
}

export function GamePageClient({ game, initialBalance }: GamePageClientProps) {
  return <GameViewClient game={game} initialBalance={initialBalance} />;
}
