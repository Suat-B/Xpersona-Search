import { z } from "zod";
import { MIN_BET, MAX_BET } from "./constants";

/** Coerce value to number. LLMs often send "10" instead of 10. */
export function coerceNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return fallback;
}

/** Coerce to integer. */
export function coerceInt(v: unknown, fallback = 0): number {
  return Math.floor(coerceNumber(v, fallback));
}

/** Coerce condition to "over" | "under". */
export function coerceCondition(v: unknown): "over" | "under" {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "under" ? "under" : "over";
}

export const diceBetSchema = z.object({
  amount: z.number().int().min(MIN_BET).max(MAX_BET),
  target: z.number().min(0).max(100),
  condition: z.enum(["over", "under"]),
});

export const checkoutSchema = z.object({
  packageId: z.string().uuid(),
});

const emailRegex = /^[^\s]+@[^\s]+\.[^\s]{2,}$/;
const nameRegex = /^[0-9A-Za-zÀ-ÖØ-öø-ÿ\-_()'*,.\s]{2,255}$/;

export const withdrawSchema = z.object({
  amount: z.coerce.number().int().min(1),
  wiseEmail: z.string().min(1, "Wise email is required").regex(emailRegex, "Enter a valid email address"),
  fullName: z.string().min(2, "Full name is required").max(255).regex(nameRegex, "Name can only contain letters, numbers, and basic punctuation"),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
});
