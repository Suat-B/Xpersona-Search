import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies, strategyCode } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import {
  type GameType,
  GAME_TYPES,
  validateStrategyConfig,
} from "@/lib/strategies";
import { validatePythonStrategyCode } from "@/lib/strategy-python-validation";

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
  const strategyIds = list.map((r) => r.id);
  const codeRowsRes =
    strategyIds.length > 0
      ? await db
          .select({
            strategyId: strategyCode.strategyId,
            description: strategyCode.description,
          })
          .from(strategyCode)
          .where(inArray(strategyCode.strategyId, strategyIds))
      : [];

  const codeByStrategyId = new Map<string, { description: string | null }>();
  for (const c of codeRowsRes) {
    if (!codeByStrategyId.has(c.strategyId)) {
      codeByStrategyId.set(c.strategyId, { description: c.description });
    }
  }

  const strategiesWithMeta = list.map((r) => {
    const code = codeByStrategyId.get(r.id);
    return {
      id: r.id,
      gameType: r.gameType,
      name: r.name,
      config: r.config,
      createdAt: r.createdAt,
      hasPythonCode: Boolean(code),
      description: code?.description ?? undefined,
    };
  });
  return NextResponse.json({
    success: true,
    data: { strategies: strategiesWithMeta },
  });
}

/** POST /api/me/strategies — Create a strategy. Body: { gameType, name, config?, python_code?, description? } */
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
  const pythonCode = typeof body.python_code === "string" ? body.python_code : undefined;
  const description = typeof body.description === "string" ? body.description.trim() : undefined;

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

  if (pythonCode) {
    const validation = validatePythonStrategyCode(pythonCode);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: validation.errors.join("; "), validation_result: validation },
        { status: 400 }
      );
    }
    const strategyConfig = config && typeof config === "object" ? (config as object) : {};
    const [inserted] = await db
      .insert(strategies)
      .values({
        userId: authResult.user.id,
        gameType,
        name,
        config: strategyConfig,
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
        { success: false, error: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
    await db.insert(strategyCode).values({
      strategyId: inserted.id,
      pythonCode,
      description: description ?? "",
    });
    return NextResponse.json({
      success: true,
      data: { ...inserted, hasPythonCode: true },
    });
  }

  if (!validateStrategyConfig(gameType, config)) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "Invalid config for game type" },
      { status: 400 }
    );
  }

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
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: inserted,
  });
}
