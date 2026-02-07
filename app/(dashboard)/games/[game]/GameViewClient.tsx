"use client";

import dynamic from "next/dynamic";

export type GameSlug = "dice";

const GamePageClient = dynamic(
  () =>
    import("@/components/games/GamePageClient").then((m) => ({ default: m.default })),
  { ssr: false }
);

export default function GameViewClient({ game }: { game: GameSlug }) {
  return <GamePageClient game={game} />;
}
