import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  return NextResponse.json({
    success: true,
    data: { balance: authResult.user.credits },
  });
}
