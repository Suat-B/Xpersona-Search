import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const ip = getClientIp(request);
  const limit = checkRateLimit(ip, "forgot-password");
  if (!limit.ok) {
    const response = jsonError(request, {
      code: "RATE_LIMITED",
      message: "Too many attempts. Please try again later.",
      status: 429,
      retryAfterMs: (limit.retryAfter ?? 900) * 1000,
    });
    recordApiResponse("/api/auth/forgot-password", request, response, startedAt);
    return response;
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Email is required",
        status: 400,
      });
      recordApiResponse("/api/auth/forgot-password", request, response, startedAt);
      return response;
    }

    if (!isValidEmail(email)) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid email format",
        status: 400,
      });
      recordApiResponse("/api/auth/forgot-password", request, response, startedAt);
      return response;
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.email, email),
          eq(users.accountType, "email"),
          isNotNull(users.passwordHash)
        )
      )
      .limit(1);

    if (user?.id) {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      const identifier = `reset:${user.id}`;

      await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

      await db.insert(verificationTokens).values({
        identifier,
        token,
        expires,
      });

      try {
        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (err) {
        console.error("[forgot-password] email send failed:", err);
      }
    }

    const response = NextResponse.json({ success: true });
    applyRequestIdHeader(response, request);
    recordApiResponse("/api/auth/forgot-password", request, response, startedAt);
    return response;
  } catch (err) {
    console.error("[forgot-password] error:", err);
    const response = NextResponse.json({ success: true });
    applyRequestIdHeader(response, request);
    recordApiResponse("/api/auth/forgot-password", request, response, startedAt);
    return response;
  }
}
