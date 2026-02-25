import { createHash } from "crypto";

export function hashPayload(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}
