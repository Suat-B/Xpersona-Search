"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DiceGame } from "@/components/games/DiceGame";
import { BlackjackGame } from "@/components/games/BlackjackGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { CrashGame } from "@/components/games/CrashGame";
import { SlotsGame } from "@/components/games/SlotsGame";

const GAMES = ["dice", "blackjack", "plinko", "crash", "slots"] as const;
type GameSlug = (typeof GAMES)[number];

export function GameView({ game }: { game: GameSlug }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-block text-sm text-[var(--accent-heart)] hover:underline"
      >
        ← Dashboard
      </Link>
      {!mounted ? (
        <div
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[var(--text-secondary)]"
          suppressHydrationWarning
        >
          Loading game…
        </div>
      ) : (
        <>
          {game === "dice" && <DiceGame />}
          {game === "blackjack" && <BlackjackGame />}
          {game === "plinko" && <PlinkoGame />}
          {game === "crash" && <CrashGame />}
          {game === "slots" && <SlotsGame />}
        </>
      )}
    </div>
  );
}
