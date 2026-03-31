import { describe, expect, it } from "vitest";
import { BrowserToolExecutor, collectBrowserContext } from "./browser-tool-executor.js";
function buildPolicy(overrides = {}) {
    return {
        enabled: true,
        alwaysOn: true,
        allowAppLaunch: true,
        allowShellCommands: true,
        allowUrlOpen: true,
        allowFileOpen: true,
        allowDesktopObservation: true,
        allowBrowserNative: true,
        allowEventAgents: true,
        allowWholeMachineAccess: true,
        allowElevation: true,
        focusPolicy: "never_steal",
        sessionPolicy: "attach_carefully",
        allowVisibleFallback: false,
        autonomyPosture: "near_total",
        suppressForegroundWhileTyping: true,
        focusLeaseTtlMs: 4000,
        preferTerminalForCoding: true,
        browserAttachMode: "existing_or_managed",
        allowedBrowsers: ["chrome", "edge", "brave", "arc", "chromium"],
        blockedDomains: [],
        elevatedTrustDomains: [],
        updatedAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
        ...overrides,
    };
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
describe("BrowserToolExecutor", () => {
    it("lists pages through the browser-native lane", async () => {
        const runtime = {
            listPages: async () => [
                {
                    id: "page_1",
                    title: "Inbox",
                    url: "https://mail.google.com/mail/u/0/#inbox",
                    origin: "https://mail.google.com",
                    browserName: "Google Chrome",
                    lane: "browser_native",
                },
            ],
        };
        const executor = new BrowserToolExecutor(runtime, buildPolicy());
        const result = await executor.execute(buildPendingToolCall("browser_list_pages"));
        expect(result.ok).toBe(true);
        expect(result.data?.lane).toBe("browser_native");
        expect(result.data?.pages).toEqual([
            expect.objectContaining({
                id: "page_1",
                title: "Inbox",
            }),
        ]);
    });
    it("returns structured DOM proof for browser snapshots", async () => {
        const runtime = {
            snapshotDom: async () => ({
                snapshotId: "snap_1",
                pageId: "page_1",
                url: "https://example.com",
                title: "Example",
                workflowCheckpoint: "Example | https://example.com | Sign in",
                interactiveElements: [
                    {
                        id: "element_1",
                        selector: "#login",
                        label: "Sign in",
                        role: "button",
                        tagName: "button",
                    },
                ],
            }),
        };
        const executor = new BrowserToolExecutor(runtime, buildPolicy());
        const result = await executor.execute(buildPendingToolCall("browser_snapshot_dom", { pageId: "page_1", limit: 10 }));
        expect(result.ok).toBe(true);
        expect(result.data?.snapshotId).toBe("snap_1");
        expect(result.data?.proof).toEqual(expect.objectContaining({
            url: "https://example.com",
            interactiveElementCount: 1,
        }));
    });
    it("blocks browser tools when browser-native autonomy is disabled", async () => {
        const runtime = {
            listPages: async () => [],
        };
        const executor = new BrowserToolExecutor(runtime, buildPolicy({ allowBrowserNative: false }));
        const result = await executor.execute(buildPendingToolCall("browser_list_pages"));
        expect(result.ok).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.summary).toContain("browser autonomy is disabled");
    });
    it("collects browser context for orchestration", async () => {
        const runtime = {
            collectContext: async () => ({
                mode: "attached",
                browserName: "Google Chrome",
                activePage: {
                    id: "page_1",
                    title: "Inbox",
                    url: "https://mail.google.com/mail/u/0/#inbox",
                    origin: "https://mail.google.com",
                    browserName: "Google Chrome",
                },
                openPages: [
                    {
                        id: "page_1",
                        title: "Inbox",
                        url: "https://mail.google.com/mail/u/0/#inbox",
                        origin: "https://mail.google.com",
                        browserName: "Google Chrome",
                    },
                ],
            }),
        };
        const context = await collectBrowserContext({
            runtime: runtime,
            policy: buildPolicy(),
        });
        expect(context.mode).toBe("attached");
        expect(context.activePage.title).toBe("Inbox");
    });
});
