import { track as vercelTrack } from "@vercel/analytics/server";

export type BotAnalyticsHeaders = {
  "user-agent": string;
  "x-forwarded-for": string;
  cookie: string;
  referer: string;
};

const GA4_COLLECT = "https://www.google-analytics.com/mp/collect";

function getGa4MeasurementId(): string | undefined {
  return process.env.GA4_MEASUREMENT_ID?.trim() || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() || undefined;
}

function getGa4ApiSecret(): string | undefined {
  return process.env.GA4_API_SECRET?.trim() || undefined;
}

/**
 * Stable pseudo client_id for GA4 (not PII; used only for bot session bucketing).
 */
export async function ga4ClientIdForBot(ua: string, xForwardedFor: string, path: string): Promise<string> {
  const payload = `${ua}|${xForwardedFor}|${path}`;
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return `bot.${hex}`;
}

/**
 * Headers shaped for @vercel/analytics/server `track()` (origin `o` uses referer).
 */
export function buildVercelTrackHeaders(input: {
  pageUrl: string;
  userAgent: string;
  xForwardedFor: string;
  cookie: string;
}): BotAnalyticsHeaders {
  return {
    "user-agent": input.userAgent,
    "x-forwarded-for": input.xForwardedFor,
    cookie: input.cookie,
    referer: input.pageUrl,
  };
}

export async function trackBotPageViewVercel(
  pageUrl: string,
  properties: { path: string; botName: string },
  trackHeaders: BotAnalyticsHeaders
): Promise<void> {
  await vercelTrack(
    "bot_pageview",
    {
      path: properties.path,
      bot_name: properties.botName,
    },
    { request: { headers: trackHeaders } }
  );
}

export async function trackBotPageViewGA4(input: {
  pageUrl: string;
  path: string;
  title?: string;
  referrer?: string;
  userAgent: string;
  xForwardedFor: string;
}): Promise<void> {
  const measurementId = getGa4MeasurementId();
  const apiSecret = getGa4ApiSecret();
  if (!measurementId || !apiSecret) return;

  const clientId = await ga4ClientIdForBot(input.userAgent, input.xForwardedFor, input.path);

  const url = new URL(GA4_COLLECT);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  const body = {
    client_id: clientId,
    user_agent: input.userAgent.slice(0, 512),
    events: [
      {
        name: "page_view",
        params: {
          page_location: input.pageUrl,
          page_path: input.path,
          page_title: input.title ?? input.path,
          page_referrer: input.referrer ?? "",
          engagement_time_msec: 1,
          bot_traffic: "1",
        },
      },
    ],
  };

  await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    /* ignore */
  });
}

export async function trackBotPageViewAll(input: {
  pageUrl: string;
  path: string;
  botName: string;
  userAgent: string;
  xForwardedFor: string;
  cookie: string;
  title?: string;
  referrer?: string;
}): Promise<void> {
  const trackHeaders = buildVercelTrackHeaders({
    pageUrl: input.pageUrl,
    userAgent: input.userAgent,
    xForwardedFor: input.xForwardedFor,
    cookie: input.cookie,
  });

  await Promise.all([
    trackBotPageViewVercel(
      input.pageUrl,
      { path: input.path, botName: input.botName },
      trackHeaders
    ).catch(() => {
      /* ignore */
    }),
    trackBotPageViewGA4({
      pageUrl: input.pageUrl,
      path: input.path,
      title: input.title,
      referrer: input.referrer,
      userAgent: input.userAgent,
      xForwardedFor: input.xForwardedFor,
    }),
  ]);
}
