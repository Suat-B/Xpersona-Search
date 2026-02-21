/**
 * POST /api/ans/register
 * Start ANS domain registration. Per XPERSONA ANS.MD.
 * Stub: returns coming_soon until Stripe/DNS integration is ready.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateAgentName,
  ANS_TLD,
} from "@/lib/ans-validator";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const RegisterSchema = z.object({
  name: z.string().min(1).max(63),
  email: z.string().email(),
  agentCard: z
    .object({
      name: z.string(),
      description: z.string().optional(),
      endpoint: z.string().url().optional(),
      capabilities: z.array(z.string()).optional(),
      protocols: z.array(z.enum(["A2A", "MCP", "ANP", "OpenClaw"])).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  const parseResult = RegisterSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Invalid request",
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { name, email, agentCard } = parseResult.data;

  const validation = validateAgentName(name);
  if (!validation.valid) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "invalid",
        error: validation.error,
        code: validation.code,
      },
      { status: 400 }
    );
  }

  const normalizedName = validation.normalized!;
  const fullDomain = `${normalizedName}.${ANS_TLD}`;

  try {
    const existing = await db
      .select({ id: ansDomains.id })
      .from(ansDomains)
      .where(eq(ansDomains.name, normalizedName))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          nextStep: "taken",
          error: "Domain is already registered",
          code: "DOMAIN_UNAVAILABLE",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[ANS register] DB check error:", err);
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Service temporarily unavailable",
      },
      { status: 500 }
    );
  }

  // Stub: Registration flow not yet wired (Stripe, DNS, etc.)
  // Return explicit contract for future implementation
  return NextResponse.json(
    {
      success: false,
      nextStep: "coming_soon",
      error: "Registration will open soon",
      domain: {
        name: normalizedName,
        fullDomain,
        status: "PENDING_VERIFICATION",
      },
    },
    { status: 200 }
  );
}
