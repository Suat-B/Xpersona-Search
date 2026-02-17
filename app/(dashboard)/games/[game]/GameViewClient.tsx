"use client";

import dynamic from "next/dynamic";

export type GameSlug = "dice";

const GamePageClient = dynamic(
  () => import("@/components/games/GamePageClient").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-secondary)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm">Loading game...</p>
        </div>
      </div>
    ),
  }
);

interface GameViewClientProps {
  game: GameSlug;
  initialBalance?: number | null;
}

export default function GameViewClient({ game, initialBalance }: GameViewClientProps) {
  return <GamePageClient game={game} initialBalance={initialBalance ?? undefined} />;
}
