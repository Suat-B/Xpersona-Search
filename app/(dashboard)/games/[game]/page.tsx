import { notFound } from "next/navigation";
import GameViewClient, { type GameSlug } from "./GameViewClient";

const GAMES: GameSlug[] = ["dice"];

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!GAMES.includes(game as GameSlug)) notFound();

  return <GameViewClient game={game as GameSlug} />;
}
