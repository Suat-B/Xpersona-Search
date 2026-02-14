import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { user } = authResult;
  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      credits: user.credits,
      apiKeyPrefix: user.apiKeyPrefix,
      createdAt: user.createdAt,
      lastFaucetAt: user.lastFaucetAt,
      isAdmin: isAdmin(user),
    },
  });
}
