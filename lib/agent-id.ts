/**
 * Agent ID (AID) generation for audit trail.
 * Format: aid_ + 8 alphanumeric chars. Stable, distinguishable, URL-safe.
 */
import { customAlphabet } from "nanoid";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 8;
const generateSuffix = customAlphabet(ALPHABET, LENGTH);

/**
 * Generate a unique agent ID: aid_<8 chars>.
 * Collision probability is negligible (36^8 combinations).
 */
export function generateAgentId(): string {
  return `aid_${generateSuffix()}`;
}
