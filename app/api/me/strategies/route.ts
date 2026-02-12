import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  type GameType,
  GAME_TYPES,
  validateStrategyConfig,
} from "@/lib/strategies";

/** GET /api/me/strategies — List current user's strategies. Query: ?gameType=dice */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const url = new URL(request.url);
  const gameType = url.searchParams.get("gameType") as GameType | null;
  const validGame =
    gameType && GAME_TYPES.includes(gameType) ? gameType : null;

  const rows = await db
    .select({
      id: strategies.id,
      gameType: strategies.gameType,
      name: strategies.name,
      config: strategies.config,
      createdAt: strategies.createdAt,
    })
    .from(strategies)
    .where(eq(strategies.userId, authResult.user.id))
    .orderBy(desc(strategies.createdAt));

  const list = validGame ? rows.filter((r) => r.gameType === validGame) : rows;
  const strategiesWithMeta = list.map((r) => ({
    id: r.id,
    gameType: r.gameType,
    name: r.name,
    config: r.config,
    createdAt: r.createdAt,
  }));
  return NextResponse.json({
    success: true,
    data: { strategies: strategiesWithMeta },
  });
}

/** POST /api/me/strategies — Create a strategy. Body: { gameType, name, config } */
export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const gameType = body.gameType as GameType | undefined;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const config = body.config;

  if (
    !gameType ||
    !GAME_TYPES.includes(gameType) ||
    !name ||
    name.length > 100
  ) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "gameType and name required" },
      { status: 400 }
    );
  }

  if (!validateStrategyConfig(gameType, config)) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "Invalid config for game type" },
      { status: 400 }
    );
  }

  try {
    const [inserted] = await db
      .insert(strategies)
      .values({
        userId: authResult.user.id,
        gameType,
        name,
        config: config as object,
      })
      .returning({
        id: strategies.id,
        gameType: strategies.gameType,
        name: strategies.name,
        config: strategies.config,
        createdAt: strategies.createdAt,
      });

    if (!inserted) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Strategy insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: inserted,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Database or server error";
    const message = /unique|duplicate/i.test(raw) ? "A strategy with this name already exists. Use a different name." : raw;
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
