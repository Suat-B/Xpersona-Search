import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

const BCRYPT_ROUNDS = 12;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * POST /api/me/link-email
 * Convert a temporary/guest account into a permanent email/password account.
 */
export async function POST(request: Request) {
  const authResult = await getAuthUser(request as never);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const { user } = authResult;
  if (user.isPermanent) {
    return NextResponse.json(
      { success: false, message: "This account already has email sign-in enabled." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const normalizedCurrentName = (user.name ?? "").trim();
    const shouldSetName =
      normalizedCurrentName.length === 0 ||
      normalizedCurrentName.toLowerCase() === "guest";
    const inferredName = email.split("@")[0]?.slice(0, 255) || null;

    await db
      .update(users)
      .set({
        email,
        passwordHash,
        accountType: "email",
        ...(shouldSetName ? { name: inferredName } : {}),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      data: { email },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isUniqueViolation =
      typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
    if (isUniqueViolation) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists" },
        { status: 409 }
      );
    }
    console.error("[me/link-email] error:", message);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
