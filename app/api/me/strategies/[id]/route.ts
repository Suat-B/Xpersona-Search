import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  type GameType,
  GAME_TYPES,
  validateStrategyConfig,
} from "@/lib/strategies";

/** GET /api/me/strategies/[id] */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { id } = await params;
  const [row] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, authResult.user.id)))
    .limit(1);
  if (!row) {
    return NextResponse.json(
      { success: false, error: "NOT_FOUND" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      gameType: row.gameType,
      name: row.name,
      config: row.config,
      createdAt: row.createdAt,
    },
  });
}

/** PATCH /api/me/strategies/[id] — Update name and/or config */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, authResult.user.id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "NOT_FOUND" },
      { status: 404 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const config = body.config;

  const updates: { name?: string; config?: object } = {};
  if (name !== undefined) updates.name = name;
  if (config !== undefined) {
    if (!validateStrategyConfig(existing.gameType as GameType, config)) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Invalid config" },
        { status: 400 }
      );
    }
    updates.config = config as object;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        id: existing.id,
        gameType: existing.gameType,
        name: existing.name,
        config: existing.config,
        createdAt: existing.createdAt,
      },
    });
  }

  const [updated] = await db
    .update(strategies)
    .set(updates)
    .where(eq(strategies.id, id))
    .returning({
      id: strategies.id,
      gameType: strategies.gameType,
      name: strategies.name,
      config: strategies.config,
      createdAt: strategies.createdAt,
    });
  return NextResponse.json({ success: true, data: updated });
}

/** DELETE /api/me/strategies/[id] */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { id } = await params;
  const [deleted] = await db
    .delete(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, authResult.user.id)))
    .returning({ id: strategies.id });
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "NOT_FOUND" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: { id: deleted.id } });
}
