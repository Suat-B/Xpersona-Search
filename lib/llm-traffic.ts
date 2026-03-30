import type { LlmTrafficEventType } from "@/lib/llm-traffic-shared";

const UA_MAX = 512;
const REF_MAX = 512;
const PATH_MAX = 2048;
const SESSION_ID_MAX = 128;
const REFERRER_HOST_MAX = 255;
const REFERRER_SOURCE_MAX = 64;
const PAGE_TYPE_MAX = 64;
const CONVERSION_TYPE_MAX = 64;
const BOT_NAME_MAX = 64;
export type LlmTrafficEventRecordInput = {
  eventType: LlmTrafficEventType;
  path: string;
  pageType?: string | null;
  botName?: string | null;
  referrerHost?: string | null;
  referrerSource?: string | null;
  utmSource?: string | null;
  sessionId?: string | null;
  conversionType?: string | null;
  userAgent: string | null;
  xForwardedFor: string | null;
  referer: string | null;
};

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function firstForwardedIp(xff: string | null): string | null {
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first ? truncate(first, 128) : null;
}

function shouldSample(): boolean {
  const raw = process.env.LLM_TRAFFIC_LOG_SAMPLE_RATE?.trim();
  const rate = raw === undefined || raw === "" ? 1 : Number(raw);
  if (!Number.isFinite(rate)) return true;
  const bounded = Math.min(1, Math.max(0, rate));
  if (bounded <= 0) return false;
  if (bounded >= 1) return true;
  return Math.random() < bounded;
}

export async function recordLlmTrafficEvent(input: LlmTrafficEventRecordInput): Promise<void> {
  if (!shouldSample()) return;

  const { insertLlmTrafficEvent } = await import("@/lib/llm-traffic-store");

  await insertLlmTrafficEvent({
    eventType: input.eventType,
    path: truncate((input.path || "/").replace(/\s+/g, " "), PATH_MAX),
    pageType: input.pageType ? truncate(input.pageType, PAGE_TYPE_MAX) : null,
    botName: input.botName ? truncate(input.botName, BOT_NAME_MAX) : null,
    referrerHost: input.referrerHost ? truncate(input.referrerHost, REFERRER_HOST_MAX) : null,
    referrerSource: input.referrerSource ? truncate(input.referrerSource, REFERRER_SOURCE_MAX) : null,
    utmSource: input.utmSource ? truncate(input.utmSource, REF_MAX) : null,
    sessionId: input.sessionId ? truncate(input.sessionId, SESSION_ID_MAX) : null,
    conversionType: input.conversionType ? truncate(input.conversionType, CONVERSION_TYPE_MAX) : null,
    userAgent: truncate(input.userAgent ?? "", UA_MAX),
    clientIp: firstForwardedIp(input.xForwardedFor),
    referer: input.referer ? truncate(input.referer, REF_MAX) : null,
  });
}
