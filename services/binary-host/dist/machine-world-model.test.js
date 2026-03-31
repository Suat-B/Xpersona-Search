import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MachineWorldModelService } from "./machine-world-model.js";
const tempRoots = [];
async function createService() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "binary-world-model-"));
    tempRoots.push(root);
    const filePath = path.join(root, "world-model.json");
    const service = new MachineWorldModelService(filePath);
    await service.initialize();
    return { service, filePath };
}
afterEach(async () => {
    while (tempRoots.length) {
        const root = tempRoots.pop();
        if (root) {
            await fs.rm(root, { recursive: true, force: true });
        }
    }
});
describe("MachineWorldModelService", () => {
    it("ingests desktop and browser snapshots into a persistent local graph", async () => {
        const { service } = await createService();
        await service.ingestSnapshot({
            runId: "run_1",
            task: "Open Gmail and inspect the compose flow",
            workspaceRoot: "c:\\repo",
            desktopContext: {
                platform: "win32-test",
                activeWindow: {
                    id: "101",
                    title: "Binary IDE",
                    app: "electron",
                },
                discoveredApps: [{ id: "steam", name: "Steam", aliases: ["steam"], source: "windows_shortcut" }],
            },
            browserContext: {
                mode: "attached",
                browserName: "Chrome",
                activePage: {
                    id: "page_1",
                    title: "Inbox",
                    url: "https://mail.google.com/mail/u/0/#inbox",
                    origin: "https://mail.google.com",
                },
            },
            focusLease: {
                surface: "desktop",
                source: "typing",
            },
        });
        const summary = await service.getSummary();
        expect(summary.nodeCount).toBeGreaterThan(0);
        expect(summary.edgeCount).toBeGreaterThan(0);
        expect(summary.activeContext.activeWorkspace).toContain("repo");
        expect(summary.activeContext.activePage).toContain("Inbox");
        expect(summary.affordanceSummary.blocked).toContain("visible_foreground_activation");
    });
    it("distills terminal and browser routines from successful tool receipts", async () => {
        const { service } = await createService();
        await service.recordToolReceipt({
            runId: "run_2",
            task: "Fix auth hook and verify it",
            workspaceRoot: "c:\\repo",
            pendingToolCall: {
                step: 2,
                toolCall: {
                    id: "tc_1",
                    name: "run_command",
                    arguments: {
                        command: "npm test",
                    },
                },
            },
            toolResult: {
                name: "run_command",
                ok: true,
                summary: "npm test passed",
                data: {
                    terminalState: {
                        cwd: "c:\\repo",
                        projectRoot: "c:\\repo",
                        stack: "node_js_ts",
                        lastCommand: "npm test",
                        lastCommandOutcome: "succeeded",
                    },
                    proof: {
                        title: "Validation passed",
                    },
                },
            },
        });
        await service.recordToolReceipt({
            runId: "run_2",
            task: "Inspect dashboard export page",
            pendingToolCall: {
                step: 3,
                toolCall: {
                    id: "tc_2",
                    name: "browser_snapshot_dom",
                    arguments: {
                        pageId: "page_2",
                    },
                },
            },
            toolResult: {
                name: "browser_snapshot_dom",
                ok: true,
                summary: "Captured DOM snapshot for Dashboard.",
                data: {
                    pageId: "page_2",
                    url: "https://app.example.com/dashboard",
                    title: "Dashboard",
                    proof: {
                        title: "Dashboard",
                    },
                },
            },
        });
        const routines = await service.findRoutine("", 10);
        const changes = await service.getRecentChanges(10);
        expect(routines.length).toBeGreaterThanOrEqual(2);
        expect(routines.some((routine) => routine.label.includes("Terminal flow"))).toBe(true);
        expect(routines.some((routine) => routine.label.includes("Browser flow"))).toBe(true);
        expect(changes.some((change) => change.kind === "proof_recorded")).toBe(true);
    });
});
