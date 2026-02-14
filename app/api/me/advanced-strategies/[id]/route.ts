import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

// GET /api/me/advanced-strategies/[id] - Get a single strategy
export async function GET(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const resolved = await context.params;
  const id = typeof resolved.id === "string" ? resolved.id : resolved.id?.[0];
  if (!id) return NextResponse.json({ error: "Invalid route" }, { status: 400 });

  try {
    const [strategy] = await db
      .select({
        id: advancedStrategies.id,
        name: advancedStrategies.name,
        description: advancedStrategies.description,
        baseConfig: advancedStrategies.baseConfig,
        rules: advancedStrategies.rules,
        globalLimits: advancedStrategies.globalLimits,
        executionMode: advancedStrategies.executionMode,
        isPublic: advancedStrategies.isPublic,
        tags: advancedStrategies.tags,
        createdAt: advancedStrategies.createdAt,
        updatedAt: advancedStrategies.updatedAt,
      })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.id, id),
          eq(advancedStrategies.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { error: "Strategy not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { strategy },
    });
  } catch (error) {
    console.error("Error fetching strategy:", error);
    return NextResponse.json(
      { error: "Failed to fetch strategy" },
      { status: 500 }
    );
  }
}

// PATCH /api/me/advanced-strategies/[id] - Update a strategy
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const resolved = await context.params;
  const id = typeof resolved.id === "string" ? resolved.id : resolved.id?.[0];
  if (!id) return NextResponse.json({ error: "Invalid route" }, { status: 400 });

  try {
    // Check ownership
    const [existing] = await db
      .select({ id: advancedStrategies.id, name: advancedStrategies.name })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.id, id),
          eq(advancedStrategies.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Strategy not found" },
        { status: 404 }
      );
    }

    const body = await request.json() as Partial<AdvancedDiceStrategy>;

    // Check for name conflict if renaming
    if (body.name && body.name !== existing.name) {
      const [nameConflict] = await db
        .select({ id: advancedStrategies.id })
        .from(advancedStrategies)
        .where(
          and(
            eq(advancedStrategies.userId, authResult.user.id),
            eq(advancedStrategies.name, body.name)
          )
        )
        .limit(1);

      if (nameConflict) {
        return NextResponse.json(
          { error: "Strategy with this name already exists" },
          { status: 409 }
        );
      }
    }

    // Build update object
    const updateData: Partial<typeof advancedStrategies.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.baseConfig !== undefined) updateData.baseConfig = body.baseConfig;
    if (body.rules !== undefined) updateData.rules = body.rules;
    if (body.globalLimits !== undefined) updateData.globalLimits = body.globalLimits;
    if (body.executionMode !== undefined) updateData.executionMode = body.executionMode;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    if (body.tags !== undefined) updateData.tags = body.tags;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(advancedStrategies)
      .set(updateData)
      .where(eq(advancedStrategies.id, id))
      .returning({
        id: advancedStrategies.id,
        name: advancedStrategies.name,
        description: advancedStrategies.description,
        baseConfig: advancedStrategies.baseConfig,
        rules: advancedStrategies.rules,
        globalLimits: advancedStrategies.globalLimits,
        executionMode: advancedStrategies.executionMode,
        isPublic: advancedStrategies.isPublic,
        tags: advancedStrategies.tags,
        createdAt: advancedStrategies.createdAt,
        updatedAt: advancedStrategies.updatedAt,
      });

    return NextResponse.json({
      success: true,
      data: { strategy: updated },
    });
  } catch (error) {
    console.error("Error updating strategy:", error);
    return NextResponse.json(
      { error: "Failed to update strategy" },
      { status: 500 }
    );
  }
}

// DELETE /api/me/advanced-strategies/[id] - Delete a strategy
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const resolved = await context.params;
  const id = typeof resolved.id === "string" ? resolved.id : resolved.id?.[0];
  if (!id) return NextResponse.json({ error: "Invalid route" }, { status: 400 });

  try {
    // Check ownership
    const [existing] = await db
      .select({ id: advancedStrategies.id })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.id, id),
          eq(advancedStrategies.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Strategy not found" },
        { status: 404 }
      );
    }

    await db
      .delete(advancedStrategies)
      .where(eq(advancedStrategies.id, id));

    return NextResponse.json({
      success: true,
      message: "Strategy deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting strategy:", error);
    return NextResponse.json(
      { error: "Failed to delete strategy" },
      { status: 500 }
    );
  }
}
