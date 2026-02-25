import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SIGNUP_BONUS } from "@/lib/constants";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const BCRYPT_ROUNDS = 12;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() || null : null;

    if (!email || !password) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Email and password are required",
        status: 400,
      });
      recordApiResponse("/api/auth/register", request, response, startedAt);
      return response;
    }

    if (!isValidEmail(email)) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid email format",
        status: 400,
      });
      recordApiResponse("/api/auth/register", request, response, startedAt);
      return response;
    }

    if (password.length < 8) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters",
        status: 400,
      });
      recordApiResponse("/api/auth/register", request, response, startedAt);
      return response;
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      const response = jsonError(request, {
        code: "EMAIL_EXISTS",
        message: "An account with this email already exists",
        status: 400,
      });
      recordApiResponse("/api/auth/register", request, response, startedAt);
      return response;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [user] = await db
      .insert(users)
      .values({
        email,
        name: name ?? email.split("@")[0] ?? "User",
        passwordHash,
        accountType: "email",
        credits: SIGNUP_BONUS,
      })
      .returning({ id: users.id });

    if (!user) {
      const response = jsonError(request, {
        code: "INTERNAL_ERROR",
        message: "Failed to create account",
        status: 500,
      });
      recordApiResponse("/api/auth/register", request, response, startedAt);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      data: { userId: user.id },
    });
    applyRequestIdHeader(response, request);
    recordApiResponse("/api/auth/register", request, response, startedAt);
    return response;
  } catch (err) {
    console.error("[auth/register] error:", err);
    const response = jsonError(request, {
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "Failed to create account",
      status: 500,
    });
    recordApiResponse("/api/auth/register", request, response, startedAt);
    return response;
  }
}
