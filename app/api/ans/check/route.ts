/**
 * GET /api/ans/check?name={query}
 * Check ANS domain availability. No auth required.
 * Per XPERSONA ANS.MD — deterministic response states.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  validateAgentName,
  getSuggestions,
  ANS_TLD,
} from "@/lib/ans-validator";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawName = url.searchParams.get("name");

  if (rawName === null || rawName === "") {
    return NextResponse.json(
      {
        success: true,
        state: "invalid" as const,
        name: null,
        fullDomain: null,
        suggestions: [],
        error: "Enter a domain name",
        code: "EMPTY",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const validation = validateAgentName(rawName);

    if (!validation.valid) {
      const suggestions = validation.normalized
        ? [validation.normalized]
        : [];
      return NextResponse.json(
        {
          success: true,
          state: "invalid" as const,
          name: null,
          fullDomain: null,
          suggestions,
          error: validation.error,
          code: validation.code,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const name = validation.normalized!;
    const fullDomain = `${name}.${ANS_TLD}`;

    const existing = await db
      .select({ id: ansDomains.id })
      .from(ansDomains)
      .where(eq(ansDomains.name, name))
      .limit(1);

    const taken = existing.length > 0;

    return NextResponse.json(
      {
        success: true,
        state: taken ? ("taken" as const) : ("available" as const),
        name,
        fullDomain,
        suggestions: taken ? getSuggestions(name) : [],
        error: null,
        code: null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      }
    );
  } catch (err) {
    console.error("[ANS check] Error:", err);
    return NextResponse.json(
      {
        success: false,
        state: "error" as const,
        error: "Service temporarily unavailable",
        code: "INTERNAL_ERROR",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
