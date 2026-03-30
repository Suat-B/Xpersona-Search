import { db } from "@/lib/db";
import { llmTrafficEvents } from "@/lib/db/schema";

type PersistedLlmTrafficEvent = {
  eventType: "crawler_hit" | "llm_referral" | "llm_conversion";
  path: string;
  pageType: string | null;
  botName: string | null;
  referrerHost: string | null;
  referrerSource: string | null;
  utmSource: string | null;
  sessionId: string | null;
  conversionType: string | null;
  userAgent: string;
  clientIp: string | null;
  referer: string | null;
};

export async function insertLlmTrafficEvent(input: PersistedLlmTrafficEvent): Promise<void> {
  await db.insert(llmTrafficEvents).values(input).catch((err) => {
    console.error("[llm-traffic] insert failed:", err);
  });
}
