import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and, like } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired link" },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
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
      return NextResponse.json(
        { success: false, message: "Invalid or expired link. Please request a new reset." },
        { status: 400 }
      );
    }

    if (vt.expires < now) {
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, vt.identifier));
      return NextResponse.json(
        { success: false, message: "Invalid or expired link. Please request a new reset." },
        { status: 400 }
      );
    }

    const userId = vt.identifier.replace(/^reset:/, "");
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired link" },
        { status: 400 }
      );
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-password] error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
