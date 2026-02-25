import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and, like } from "drizzle-orm";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!token) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid or expired link",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    if (!password || password.length < 8) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    if (password !== confirmPassword) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Passwords do not match",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    const now = new Date();
    const [vt] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          like(verificationTokens.identifier, "reset:%"),
          eq(verificationTokens.token, token)
        )
      )
      .limit(1);

    if (!vt) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid or expired link. Please request a new reset.",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    if (vt.expires < now) {
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, vt.identifier));
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid or expired link. Please request a new reset.",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    const userId = vt.identifier.replace(/^reset:/, "");
    if (!userId) {
      const response = jsonError(request, {
        code: "VALIDATION_ERROR",
        message: "Invalid or expired link",
        status: 400,
      });
      recordApiResponse("/api/auth/reset-password", request, response, startedAt);
      return response;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));

    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, vt.identifier),
          eq(verificationTokens.token, token)
        )
      );

    const response = NextResponse.json({ success: true });
    applyRequestIdHeader(response, request);
    recordApiResponse("/api/auth/reset-password", request, response, startedAt);
    return response;
  } catch (err) {
    console.error("[reset-password] error:", err);
    const response = jsonError(request, {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      status: 500,
    });
    recordApiResponse("/api/auth/reset-password", request, response, startedAt);
    return response;
  }
}
