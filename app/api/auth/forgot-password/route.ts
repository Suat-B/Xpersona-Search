import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

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
  const ip = getClientIp(request);
  const limit = checkRateLimit(ip, "forgot-password");
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, message: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter ?? 900) },
      }
    );
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[forgot-password] error:", err);
    return NextResponse.json({ success: true });
  }
}
