import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as never);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }
  const { user } = authResult;

  if (!user.isPermanent && user.accountType !== "email") {
    return NextResponse.json(
      { success: false, message: "Change password is not available for this account type." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword) {
      return NextResponse.json(
        { success: false, message: "Current password is required" },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row?.passwordHash) {
      return NextResponse.json(
        { success: false, message: "Change password is not available for this account." },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[change-password] error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
