import { handlers } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = async (request: NextRequest) => {
  try {
    return await handlers.GET(request);
  } catch (err) {
    if (err instanceof Response) return err;
    const errorType =
      typeof err === "object" && err && "type" in err ? String((err as { type?: unknown }).type) : "AUTH_ERROR";
    return NextResponse.json({ error: errorType }, { status: 500 });
  }
};

export const POST = async (request: NextRequest) => {
  try {
    return await handlers.POST(request);
  } catch (err) {
    if (err instanceof Response) return err;
    const errorType =
      typeof err === "object" && err && "type" in err ? String((err as { type?: unknown }).type) : "AUTH_ERROR";
    return NextResponse.json({ error: errorType }, { status: 500 });
  }
};
