import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res1 = await client.query(`SELECT source, status, public_searchable, count(*) FROM agents GROUP BY source, status, public_searchable`);
    console.log("--- Agents by Source, Status, Public Searchable ---");
    console.table(res1.rows);

    const res2 = await client.query(`SELECT count(*) FROM agents WHERE source = 'CLAWHUB'`);
    console.log("Total CLAWHUB:", res2.rows[0].count);

    const res3 = await client.query(`SELECT slug, name, created_at, updated_at FROM agents WHERE source = 'CLAWHUB' ORDER BY updated_at DESC LIMIT 5`);
    console.log("--- Latest 5 CLAWHUB Agents ---");
    console.table(res3.rows);

    await client.end();
}

main().catch(console.error);
