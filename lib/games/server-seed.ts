import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { serverSeeds } from "@/lib/db/schema";
import { hashSeed } from "./rng";

export async function createServerSeed(): Promise<{ id: string; seed: string; seedHash: string }> {
  const seed = randomBytes(32).toString("hex");
  const seedHash = hashSeed(seed);
  const [row] = await db
    .insert(serverSeeds)
    .values({ seedHash, seed, used: true })
    .returning({ id: serverSeeds.id });
  if (!row) throw new Error("Failed to create server seed");
  return { id: row.id, seed, seedHash };
}
