import { NextRequest, NextResponse } from "next/server";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewAll } from "@/lib/server-analytics";

/** 1×1 transparent GIF */
const GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function gifArrayBuffer(): ArrayBuffer {
  const binary = atob(GIF_B64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buf;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dedupe = searchParams.get("dedupe");
  const path = searchParams.get("p") || "/";
  const ref = searchParams.get("r") || "";

  const ua = req.headers.get("user-agent") ?? "";
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const cookie = req.headers.get("cookie") ?? "";

  const botName = getCrawlerName(ua);
  const isBot = botName !== null;

  if (dedupe !== "mw" && isBot) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const pageUrl = `${proto}://${host}${normalizedPath}`;

    void trackBotPageViewAll({
      pageUrl,
      path: normalizedPath,
      botName,
      userAgent: ua,
      xForwardedFor: xff,
      cookie,
      referrer: ref || undefined,
    });
  }

  return new NextResponse(new Blob([gifArrayBuffer()], { type: "image/gif" }), {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}

