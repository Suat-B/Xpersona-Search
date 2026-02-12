"use client";

import dynamic from "next/dynamic";

export type GameSlug = "dice";

const GamePageClient = dynamic(
  () => import("@/components/games/GamePageClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-secondary)]">
        Loading game…
      </div>
    ),
  }
);

export default function GameViewClient({ game }: { game: GameSlug }) {
  return <GamePageClient game={game} />;
}
