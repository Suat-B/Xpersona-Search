import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCrawlRequest, normalizeDomainInput } from "@/lib/search/crawl-pipeline/http";
import { setDomainPolicy } from "@/lib/search/crawl-pipeline/domain-policy";

const BlockBodySchema = z.object({
  domain: z.string().trim().min(1).max(255),
  reason: z.string().trim().max(500).optional(),
  rpmLimit: z.number().int().min(1).max(2000).optional(),
  cooldownMinutes: z.number().int().min(0).max(24 * 60).optional(),
  updatedBy: z.string().trim().max(96).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedCrawlRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BlockBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const domain = normalizeDomainInput(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const cooldownUntil =
    parsed.data.cooldownMinutes && parsed.data.cooldownMinutes > 0
      ? new Date(Date.now() + parsed.data.cooldownMinutes * 60_000)
      : null;

  await setDomainPolicy({
    domain,
    mode: "BLOCK",
    rpmLimit: parsed.data.rpmLimit,
    reason: parsed.data.reason ?? "manual_block",
    cooldownUntil,
    updatedBy: parsed.data.updatedBy ?? "api",
  });

  return NextResponse.json({
    ok: true,
    domain,
    mode: "BLOCK",
    cooldownUntil: cooldownUntil?.toISOString() ?? null,
    updatedAt: new Date().toISOString(),
  });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorizedCrawlRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BlockBodySchema.pick({ domain: true, rpmLimit: true, updatedBy: true }).safeParse(
    await req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const domain = normalizeDomainInput(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  await setDomainPolicy({
    domain,
    mode: "ALLOW",
    rpmLimit: parsed.data.rpmLimit,
    reason: null,
    cooldownUntil: null,
    updatedBy: parsed.data.updatedBy ?? "api",
  });

  return NextResponse.json({
    ok: true,
    domain,
    mode: "ALLOW",
    updatedAt: new Date().toISOString(),
  });
}
