import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

// GET /api/me/advanced-strategies - List all advanced strategies for the current user
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const strategies = await db
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
      .where(eq(advancedStrategies.userId, authResult.user.id))
      .orderBy(advancedStrategies.createdAt);

    return NextResponse.json({
      success: true,
      data: { strategies },
    });
  } catch (error) {
    console.error("Error fetching advanced strategies:", error);
    return NextResponse.json(
      { error: "Failed to fetch strategies" },
      { status: 500 }
    );
  }
}

// POST /api/me/advanced-strategies - Create a new advanced strategy
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json() as AdvancedDiceStrategy;

    // Validate required fields
    if (!body.name || !body.baseConfig || !body.rules) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate base config
    if (
      typeof body.baseConfig.amount !== "number" ||
      typeof body.baseConfig.target !== "number" ||
      !["over", "under"].includes(body.baseConfig.condition)
    ) {
      return NextResponse.json(
        { error: "Invalid base configuration" },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await db
      .select({ id: advancedStrategies.id })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.userId, authResult.user.id),
          eq(advancedStrategies.name, body.name)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Strategy with this name already exists" },
        { status: 409 }
      );
    }

    // Create strategy
    const [newStrategy] = await db
      .insert(advancedStrategies)
      .values({
        userId: authResult.user.id,
        name: body.name,
        description: body.description,
        baseConfig: body.baseConfig,
        rules: body.rules,
        globalLimits: body.globalLimits,
        executionMode: body.executionMode || "sequential",
        isPublic: body.isPublic || false,
        tags: body.tags,
      })
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
      data: { strategy: newStrategy },
    });
  } catch (error) {
    console.error("Error creating advanced strategy:", error);
    return NextResponse.json(
      { error: "Failed to create strategy" },
      { status: 500 }
    );
  }
}
