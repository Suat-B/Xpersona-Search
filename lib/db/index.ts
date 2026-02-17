import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error("❌ DATABASE_URL is not set. Database connection will fail.");
}

// pg-connection-string v3: prefer/require/verify-ca will adopt weaker libpq semantics.
// Explicitly use verify-full to keep current (stronger) behavior and silence the warning.
const connectionString = rawUrl
  ? rawUrl.replace(/sslmode=(?:prefer|require|verify-ca)(?=&|$)/gi, "sslmode=verify-full")
  : "postgres://placeholder:placeholder@localhost:5432/xpersona";

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
