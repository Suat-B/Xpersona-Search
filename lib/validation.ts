import { z } from "zod";
import { MIN_BET, MAX_BET } from "./constants";

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
