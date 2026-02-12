"use client";

import { useParams, notFound } from "next/navigation";
import dynamic from "next/dynamic";

export type GameSlug = "dice";

const GAMES: GameSlug[] = ["dice"];

const GameViewClient = dynamic(() => import("./GameViewClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-secondary)]">
      Loading game…
    </div>
  ),
});

export default function GamePage() {
  const params = useParams();
  const game = params?.game as string | undefined;
  if (!game || !(GAMES as readonly string[]).includes(game)) notFound();
  return <GameViewClient game={game as GameSlug} />;
}
