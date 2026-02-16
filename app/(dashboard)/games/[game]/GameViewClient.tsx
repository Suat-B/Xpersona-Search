"use client";

import dynamic from "next/dynamic";

export type GameSlug = "dice";

const QuantDiceGame = dynamic(
  () => import("@/components/quant-terminal/QuantDiceGame").then((mod) => mod.QuantDiceGame),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[#010101] text-[var(--quant-neutral)] font-mono">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--quant-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm">Initializing QUANTUM Terminal...</p>
          <p className="text-xs mt-2 opacity-50">Loading quant components</p>
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
  return <QuantDiceGame initialBalance={initialBalance ?? undefined} />;
}
