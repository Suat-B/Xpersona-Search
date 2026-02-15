import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { subscribeToBetEvents } from "@/lib/bet-events";

const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * GET /api/me/live-feed
 * Server-Sent Events stream of bet activity for the authenticated user.
 * Use EventSource with credentials to receive real-time bet updates when
 * AI or API plays on the user's behalf.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return new Response(
      JSON.stringify({ success: false, error: authResult.error }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const userId = authResult.user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream may be closed
        }
      };

      const unsubscribe = subscribeToBetEvents(userId, (payload) => {
        send(`data: ${JSON.stringify({ type: "bet", bet: payload.bet })}\n\n`);
      });

      const heartbeat = setInterval(() => {
        send(`: heartbeat\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      if (request.signal) {
        request.signal.addEventListener("abort", cleanup);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
