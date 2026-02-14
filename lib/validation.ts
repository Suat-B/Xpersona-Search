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
