import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { RepoModelService } from "./repo-model.js";
import { RepoToolExecutor } from "./repo-tool-executor.js";
const tempRoots = [];
async function createExecutor() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "binary-repo-tool-"));
    tempRoots.push(root);
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }, null, 2), "utf8");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "feature.ts"), "export const feature = () => 'ok';\n", "utf8");
    const service = new RepoModelService(path.join(root, "repo-model.json"));
    await service.initialize();
    const executor = new RepoToolExecutor(service, root);
    return { root, service, executor };
}
function buildPendingToolCall(name, args = {}) {
    return {
        step: 1,
        adapter: "test",
        requiresClientExecution: true,
        createdAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
        toolCall: {
            id: `${name}_1`,
            name,
            arguments: args,
        },
    };
}
afterEach(async () => {
    while (tempRoots.length) {
        const root = tempRoots.pop();
        if (root) {
            await fs.rm(root, { recursive: true, force: true });
        }
    }
});
describe("RepoToolExecutor", () => {
    it("serves repo summaries and validation plans", async () => {
        const { executor } = await createExecutor();
        const summary = await executor.execute(buildPendingToolCall("repo_get_summary", { task: "Implement feature" }));
        const symbols = await executor.execute(buildPendingToolCall("repo_query_symbols", { query: "feature" }));
        const validation = await executor.execute(buildPendingToolCall("repo_get_validation_plan"));
        expect(summary.ok).toBe(true);
        expect(summary.data?.stack).toBe("node_js_ts");
        expect(summary.data?.searchStrategy).toBeTruthy();
        expect(symbols.ok).toBe(true);
        expect(symbols.data?.engine).toBeTruthy();
        expect(symbols.summary).toContain("via");
        expect(symbols.data?.recommendedNextTool).toBeTruthy();
        expect(validation.ok).toBe(true);
        expect(validation.data?.primaryCommand).toBe("npm test");
    });
    it("records verification receipts through the repo tool surface", async () => {
        const { executor } = await createExecutor();
        const receipt = await executor.execute(buildPendingToolCall("repo_record_verification", {
            label: "Node tests passed",
            summary: "npm test passed",
            status: "passed",
            command: "npm test",
        }));
        const validation = await executor.execute(buildPendingToolCall("repo_get_validation_plan"));
        expect(receipt.ok).toBe(true);
        expect(validation.ok).toBe(true);
        const receipts = Array.isArray(validation.data?.receipts) ? validation.data.receipts : [];
        expect(receipts.length).toBeGreaterThan(0);
        expect(receipts[0]).toContain("npm test passed");
    });
});
