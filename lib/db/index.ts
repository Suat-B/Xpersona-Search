import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Database connection will fail.");
}

const pool = new Pool({
  connectionString: connectionString || "postgres://placeholder:placeholder@localhost:5432/xpersona",
});

export const db = drizzle(pool, { schema });
export * from "./schema";
