import { NextResponse } from "next/server";
import { sendSupportEmail } from "@/lib/email";
import { headers } from "next/headers";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const SUPPORT_TO = process.env.SUPPORT_EMAIL ?? "Suat.Bastug@icloud.com";

function isValidEmail(value: string): boolean {
  return /^[^\s]+@[^\s]+\.[^\s]{2,}$/.test(value);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      const response = jsonError(req, {
        code: "VALIDATION_ERROR",
        message: "Message is required",
        status: 400,
      });
      recordApiResponse("/api/support", req, response, startedAt);
      return response;
    }
    if (email && !isValidEmail(email)) {
      const response = jsonError(req, {
        code: "VALIDATION_ERROR",
        message: "Invalid email format",
        status: 400,
      });
      recordApiResponse("/api/support", req, response, startedAt);
      return response;
    }

    const headerStore = await headers();
    const origin = headerStore.get("origin") ?? undefined;

    await sendSupportEmail({
      to: SUPPORT_TO,
      name: name || undefined,
      email: email || undefined,
      message,
      sourceUrl: origin,
    });

    const response = NextResponse.json({ success: true });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/support", req, response, startedAt);
    return response;
  } catch (err) {
    console.error("[support] send failed:", err);
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Failed to send email",
      status: 500,
    });
    recordApiResponse("/api/support", req, response, startedAt);
    return response;
  }
}
