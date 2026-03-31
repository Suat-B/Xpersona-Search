import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig } from "./config.js";
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const ORIGINAL_HOME = process.env.HOME;
let tempHome = null;
afterEach(async () => {
    process.env.USERPROFILE = ORIGINAL_USERPROFILE;
    process.env.HOME = ORIGINAL_HOME;
    if (tempHome) {
        await rm(tempHome, { recursive: true, force: true });
        tempHome = null;
    }
});
async function withTempHome() {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "binary-cli-config-"));
    process.env.USERPROFILE = tempHome;
    process.env.HOME = tempHome;
    return tempHome;
}
describe("cli config", () => {
    it("defaults TOM to enabled", async () => {
        await withTempHome();
        const config = await loadConfig();
        expect(config.tomEnabled).toBe(true);
    });
    it("persists TOM preferences across save/load", async () => {
        await withTempHome();
        await saveConfig({
            baseUrl: "http://localhost:3000",
            localHostUrl: "http://127.0.0.1:7777",
            mode: "auto",
            model: "Binary IDE",
            reasoning: "medium",
            includeIdeContext: true,
            transport: "auto",
            tomEnabled: false,
        });
        const config = await loadConfig();
        expect(config.tomEnabled).toBe(false);
    });
});
