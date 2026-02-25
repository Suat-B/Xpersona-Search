import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyReceiptSignature } from "@/lib/trust/receipts";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

const VerifySchema = z.object({
  payload: z.record(z.unknown()),
  payloadHash: z.string().min(1),
  signature: z.string().min(1),
  keyId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const valid = verifyReceiptSignature({
    payload: parsed.data.payload,
    payloadHash: parsed.data.payloadHash,
    signature: parsed.data.signature,
    keyId: parsed.data.keyId,
  });

  const response = NextResponse.json({ valid });
  applyRequestIdHeader(response, req);
  return response;
}
