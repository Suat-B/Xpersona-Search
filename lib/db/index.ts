import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "dotenv";
import { Pool } from "pg";
import * as schema from "./schema";

// Ensure env vars are available even when this module is imported before script-level dotenv setup.
config({ path: ".env.local" });
config();

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local.");
}

// pg-connection-string v3: prefer/require/verify-ca will adopt weaker libpq semantics.
// Explicitly use verify-full to keep current (stronger) behavior and silence the warning.
const connectionString = rawUrl.replace(
  /sslmode=(?:prefer|require|verify-ca)(?=&|$)/gi,
  "sslmode=verify-full"
);

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
