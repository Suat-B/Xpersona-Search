import { notFound } from "next/navigation";
import { GameView } from "@/components/games/GameView";

const GAMES = ["dice", "blackjack", "plinko", "crash", "slots"] as const;

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!GAMES.includes(game as (typeof GAMES)[number])) notFound();
  return <GameView game={game as (typeof GAMES)[number]} />;
}
