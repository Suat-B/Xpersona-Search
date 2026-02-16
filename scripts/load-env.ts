/** Load .env.local first so process.env is set before db and other modules. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
