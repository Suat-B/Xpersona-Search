import { NextRequest, NextResponse } from "next/server";
import {
  INTERNAL_LLM_TRAFFIC_HEADER,
  recordLlmTrafficEvent,
  type LlmTrafficEventType,
} from "@/lib/llm-traffic";

const VALID_EVENT_TYPES = new Set<LlmTrafficEventType>([
  "crawler_hit",
  "llm_referral",
  "llm_conversion",
]);

export async function POST(req: NextRequest) {
  if (req.headers.get(INTERNAL_LLM_TRAFFIC_HEADER) !== "1") {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "BAD_JSON" }, { status: 400 });
  }

  const eventType = typeof payload.eventType === "string" ? (payload.eventType as LlmTrafficEventType) : null;
  const path = typeof payload.path === "string" ? payload.path : null;
  if (!eventType || !VALID_EVENT_TYPES.has(eventType) || !path) {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  recordLlmTrafficEvent({
    eventType,
    path,
    pageType: typeof payload.pageType === "string" ? payload.pageType : null,
    botName: typeof payload.botName === "string" ? payload.botName : null,
    referrerHost: typeof payload.referrerHost === "string" ? payload.referrerHost : null,
    referrerSource: typeof payload.referrerSource === "string" ? payload.referrerSource : null,
    utmSource: typeof payload.utmSource === "string" ? payload.utmSource : null,
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
    conversionType: typeof payload.conversionType === "string" ? payload.conversionType : null,
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent : req.headers.get("user-agent"),
    xForwardedFor: typeof payload.xForwardedFor === "string" ? payload.xForwardedFor : req.headers.get("x-forwarded-for"),
    referer: typeof payload.referer === "string" ? payload.referer : req.headers.get("referer"),
  });

  return NextResponse.json({ success: true });
}
