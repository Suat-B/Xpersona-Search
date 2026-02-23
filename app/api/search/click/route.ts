import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { recordSearchClick, hashQuery } from "@/lib/search/click-tracking";
import { checkSearchRateLimit } from "@/lib/search/rate-limit";

const ClickSchema = z.object({
  query: z.string().min(1).max(500),
  agentId: z.string().uuid(),
  position: z.number().int().min(0).max(1000),
});

export async function POST(req: NextRequest) {
  const rlResult = await checkSearchRateLimit(req);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rlResult.retryAfter ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let params: z.infer<typeof ClickSchema>;
  try {
    params = ClickSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw err;
  }

  const queryHash = hashQuery(params.query);

  await recordSearchClick({
    queryHash,
    agentId: params.agentId,
    position: params.position,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
