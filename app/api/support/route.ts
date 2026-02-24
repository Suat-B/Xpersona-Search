import { NextResponse } from "next/server";
import { sendSupportEmail } from "@/lib/email";
import { headers } from "next/headers";

const SUPPORT_TO = process.env.SUPPORT_EMAIL ?? "Suat.Bastug@icloud.com";

function isValidEmail(value: string): boolean {
  return /^[^\s]+@[^\s]+\.[^\s]{2,}$/.test(value);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ success: false, message: "Message is required" }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[support] send failed:", err);
    return NextResponse.json({ success: false, message: "Failed to send email" }, { status: 500 });
  }
}
