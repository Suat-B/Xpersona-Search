import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { GamePageClient } from "./GamePageClient";

export type GameSlug = "dice";

const GAMES: GameSlug[] = ["dice"];

async function getBalanceForUser(): Promise<number | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const [u] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
      return u ? Number(u.credits) : null;
    }
    const cookieStore = await cookies();
    const userId = getAuthUserFromCookie(cookieStore);
    if (userId) {
      const [u] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return u ? Number(u.credits) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!game || !(GAMES as readonly string[]).includes(game)) notFound();

  const serverBalance = await getBalanceForUser();

  return (
    <GamePageClient
      game={game as GameSlug}
      initialBalance={serverBalance}
    />
  );
}
