import { notFound } from "next/navigation";
import Link from "next/link";
import { DiceGame } from "@/components/games/DiceGame";
import { BlackjackGame } from "@/components/games/BlackjackGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { CrashGame } from "@/components/games/CrashGame";
import { SlotsGame } from "@/components/games/SlotsGame";

const GAMES = ["dice", "blackjack", "plinko", "crash", "slots"] as const;

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!GAMES.includes(game as (typeof GAMES)[number])) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-block text-sm text-[var(--accent-heart)] hover:underline"
      >
        ← Dashboard
      </Link>
      {game === "dice" && <DiceGame />}
      {game === "blackjack" && <BlackjackGame />}
      {game === "plinko" && <PlinkoGame />}
      {game === "crash" && <CrashGame />}
      {game === "slots" && <SlotsGame />}
    </div>
  );
}
