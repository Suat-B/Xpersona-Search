import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  type GameType,
  GAME_TYPES,
  coerceDiceConfigFromBody,
} from "@/lib/strategies";
import { harvestStrategyForTraining } from "@/lib/ai-strategy-harvest";

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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const gameType = body.gameType as GameType | undefined;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawConfig = body.config;

  if (
    !gameType ||
    !GAME_TYPES.includes(gameType) ||
    !name ||
    name.length > 100
  ) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "gameType and name required (gameType: 'dice', name: non-empty string)" },
      { status: 400 }
    );
  }

  const config = coerceDiceConfigFromBody(rawConfig);
  if (!config) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "Invalid config: amount (1-10000), target (0-99.99), condition ('over'|'under') required" },
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
        config,
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

    if (authResult.user.accountType === "agent" && authResult.user.agentId) {
      harvestStrategyForTraining({
        userId: authResult.user.id,
        agentId: authResult.user.agentId,
        source: "create",
        strategyType: "basic",
        strategySnapshot: {
          gameType: inserted.gameType,
          name: inserted.name,
          config: inserted.config,
        },
        strategyId: inserted.id,
      });
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
