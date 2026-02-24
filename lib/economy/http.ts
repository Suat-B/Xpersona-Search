import { NextResponse } from "next/server";

export function economyError(err: unknown, fallback = "INTERNAL_ERROR") {
  const message = err instanceof Error ? err.message : fallback;

  if (message.startsWith("FORBIDDEN_")) {
    return NextResponse.json({ success: false, error: message }, { status: 403 });
  }
  if (message.startsWith("INVALID_JOB_TRANSITION")) {
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
  if (message.includes("NOT_FOUND")) {
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }
  if (message.includes("NOT_ACCEPTED") || message.includes("NOT_FUNDED") || message.includes("NOT_REFUNDABLE") || message.includes("INVALID_RELEASE_STATE")) {
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
  if (message.includes("REQUIRED") || message.includes("MISSING") || message.includes("NOT_READY")) {
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
  return NextResponse.json({ success: false, error: fallback, message }, { status: 500 });
}