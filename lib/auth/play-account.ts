import { randomBytes, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createAgentToken, hashApiKey } from "@/lib/auth-utils";
import { generateAgentId } from "@/lib/agent-id";
import { SIGNUP_BONUS } from "@/lib/constants";

export type PlayAccountResult = {
  userId: string;
  email: string;
  token: string;
  apiKey: string;
  apiKeyPrefix: string;
  agentId: string;
};

export async function createPlayAccount(): Promise<PlayAccountResult | null> {
  const agentId = generateAgentId();
  const email = `play_${randomUUID()}@xpersona.co`;
  const rawKey = "xp_" + randomBytes(32).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.slice(0, 11);
  const name = `Player_${apiKeyPrefix.slice(4, 8)}`;

  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      accountType: "agent",
      agentId,
      credits: SIGNUP_BONUS,
      lastFaucetAt: null,
      apiKeyHash,
      apiKeyPrefix,
      apiKeyCreatedAt: new Date(),
    })
    .returning({ id: users.id });

  if (!user) return null;
  const token = createAgentToken(user.id);
  return { userId: user.id, email, token, apiKey: rawKey, apiKeyPrefix, agentId };
}
