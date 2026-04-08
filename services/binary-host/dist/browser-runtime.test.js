import { describe, expect, it } from "vitest";
import { BrowserRuntimeController, buildBrowserSiteSearchUrl, inferBrowserMissionUrlFromQuery, rankBrowserResultCandidates, stripBrowserSiteHintFromQuery, } from "./browser-runtime.js";
describe("BrowserRuntimeController selector inference", () => {
    it("infers a typeable selector from the latest snapshot", () => {
        const controller = new BrowserRuntimeController();
        controller.pageStates.set("page_1", {
            pageId: "page_1",
            targetId: "page_1",
            lastActivatedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            lastSnapshotId: "snap_1",
            recentConsole: [],
            recentNetwork: [],
            worldModel: {
                checkpoints: [],
                knownElementRefs: [],
                recentNavigations: [],
            },
        });
        controller.snapshots.set("snap_1", {
            id: "snap_1",
            pageId: "page_1",
            capturedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            url: "https://www.youtube.com/",
            title: "YouTube",
            workflowCheckpoint: "YouTube",
            interactiveElements: [
                { id: "button_1", selector: "button.search", label: "Search", tagName: "button", role: "button", visible: true },
                { id: "input_1", selector: "input[name=\"search_query\"]", label: "Search", tagName: "input", role: "combobox", visible: true },
            ],
        });
        const selector = controller.resolveSelector("page_1", undefined, undefined, "type");
        expect(selector).toBe("input[name=\"search_query\"]");
    });
    it("infers a clickable selector from the latest snapshot", () => {
        const controller = new BrowserRuntimeController();
        controller.pageStates.set("page_1", {
            pageId: "page_1",
            targetId: "page_1",
            lastActivatedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            lastSnapshotId: "snap_1",
            recentConsole: [],
            recentNetwork: [],
            worldModel: {
                checkpoints: [],
                knownElementRefs: [],
                recentNavigations: [],
            },
        });
        controller.snapshots.set("snap_1", {
            id: "snap_1",
            pageId: "page_1",
            capturedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            url: "https://www.youtube.com/results?search_query=outdoor+boys",
            title: "outdoor boys - YouTube",
            workflowCheckpoint: "outdoor boys",
            interactiveElements: [
                { id: "result_1", selector: "a#video-title", label: "Outdoor Boys - Alaska adventure", tagName: "a", role: "link", visible: true },
                { id: "meta_1", selector: "div.metadata", label: "Metadata", tagName: "div", role: "div", visible: true },
            ],
        });
        const selector = controller.resolveSelector("page_1", undefined, undefined, "click");
        expect(selector).toBe("a#video-title");
    });
    it("keeps a caller selector but also offers the inferred fallback selector", () => {
        const controller = new BrowserRuntimeController();
        controller.pageStates.set("page_1", {
            pageId: "page_1",
            targetId: "page_1",
            lastActivatedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            lastSnapshotId: "snap_1",
            recentConsole: [],
            recentNetwork: [],
            worldModel: {
                checkpoints: [],
                knownElementRefs: [],
                recentNavigations: [],
            },
        });
        controller.snapshots.set("snap_1", {
            id: "snap_1",
            pageId: "page_1",
            capturedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            url: "https://www.youtube.com/",
            title: "YouTube",
            workflowCheckpoint: "YouTube",
            interactiveElements: [
                { id: "input_1", selector: "input[name=\"search_query\"]", label: "Search", tagName: "input", role: "combobox", visible: true },
            ],
        });
        const selectors = controller.resolveSelectorCandidates("page_1", undefined, "input#search", "type");
        expect(selectors).toEqual(["input#search", "input[name=\"search_query\"]"]);
    });
    it("builds direct site search routes for supported domains", () => {
        expect(buildBrowserSiteSearchUrl("https://www.youtube.com/", "outdoor boys")).toBe("https://www.youtube.com/results?search_query=outdoor%20boys");
        expect(buildBrowserSiteSearchUrl("https://github.com/", "browser mission")).toBe("https://github.com/search?q=browser%20mission");
    });
    it("infers common browser missions from plain-language queries", () => {
        expect(inferBrowserMissionUrlFromQuery("outdoor boys youtube")).toBe("https://www.youtube.com/");
        expect(stripBrowserSiteHintFromQuery("outdoor boys youtube", "https://www.youtube.com/")).toBe("outdoor boys");
    });
    it("ranks likely video results above search controls", () => {
        const ranked = rankBrowserResultCandidates([
            {
                id: "search_input",
                selector: "input[name=\"search_query\"]",
                label: "Search",
                tagName: "input",
                role: "combobox",
                visible: true,
                score: 200,
            },
            {
                id: "video_1",
                selector: "a#video-title",
                label: "Outdoor Boys - Alaska adventure",
                tagName: "a",
                role: "link",
                href: "/watch?v=abc123",
                visible: true,
                score: 120,
            },
        ], "outdoor boys", "https://www.youtube.com/results?search_query=outdoor+boys");
        expect(ranked[0]?.id).toBe("video_1");
    });
    it("prefers full YouTube videos over shorts when the query does not ask for shorts", () => {
        const ranked = rankBrowserResultCandidates([
            {
                id: "short_1",
                selector: "a.yt-short-link",
                label: "Outdoor Boys quick camp short",
                tagName: "a",
                role: "link",
                href: "/shorts/abc123",
                visible: true,
                score: 120,
            },
            {
                id: "watch_1",
                selector: "a#video-title",
                label: "Outdoor Boys winter cabin build",
                tagName: "a",
                role: "link",
                href: "/watch?v=xyz987",
                visible: true,
                score: 90,
            },
        ], "outdoor boys", "https://www.youtube.com/results?search_query=outdoor+boys");
        expect(ranked[0]?.id).toBe("watch_1");
    });
    it("keeps mission final page pinned even if active-page state drifts elsewhere", async () => {
        const controller = new BrowserRuntimeController();
        const policy = {
            enabled: true,
            allowBrowserNative: true,
        };
        controller.openPage = async () => ({
            id: "page_search",
            title: "outdoor boys - YouTube",
            url: "https://www.youtube.com/results?search_query=outdoor+boys",
            origin: "https://www.youtube.com",
            browserName: "Google Chrome",
            lane: "browser_native",
            active: false,
        });
        controller.waitForMissionResults = async () => { };
        controller.collectMissionCandidates = async () => [
            {
                id: "video_1",
                selector: "a#video-title",
                label: "Outdoor Boys",
                tagName: "a",
                role: "link",
                href: "/watch?v=abc123",
                visible: true,
                score: 220,
            },
        ];
        controller.click = async () => ({ ok: true });
        controller.resolveMissionResultPage = async (_policy, pageId, fallback) => pageId === "page_search"
            ? {
                id: "page_search",
                title: "Outdoor Boys",
                url: "https://www.youtube.com/watch?v=abc123",
                origin: "https://www.youtube.com",
                browserName: "Google Chrome",
                lane: "browser_native",
                active: false,
            }
            : fallback;
        controller.getActivePage = async () => ({
            id: "user_page",
            title: "Different tab",
            url: "https://example.com/",
            origin: "https://example.com",
            browserName: "Google Chrome",
            lane: "browser_native",
            active: true,
        });
        const result = await controller.searchAndOpenBestResult(policy, {
            url: "https://www.youtube.com/",
            query: "outdoor boys",
        });
        expect(result.searchPage.id).toBe("page_search");
        expect(result.finalPage?.id).toBe("page_search");
        expect(result.finalPage?.url).toContain("watch?v=abc123");
        expect(result.missionLease).toEqual(expect.objectContaining({
            pageId: "page_search",
            missionKind: "browser_search_and_open_best_result",
            state: "completed",
            conflictDetected: false,
        }));
    });
    it("marks a mission lease as conflicted when the leased page drifts to another origin", async () => {
        const controller = new BrowserRuntimeController();
        const policy = {
            enabled: true,
            allowBrowserNative: true,
        };
        const page = {
            id: "page_search",
            title: "Results",
            url: "https://www.youtube.com/results?search_query=outdoor+boys",
            origin: "https://www.youtube.com",
            browserName: "Google Chrome",
            lane: "browser_native",
            active: false,
        };
        controller.getPageById = async () => ({
            ...page,
            title: "Example Domain",
            url: "https://example.com/",
            origin: "https://example.com",
        });
        controller.createMissionLease(page, "browser_search_and_open_best_result");
        const resolved = await controller.resolveMissionResultPage(policy, page.id, page);
        const lease = controller.pageLeases.get(page.id);
        expect(resolved?.origin).toBe("https://example.com");
        expect(lease).toEqual(expect.objectContaining({
            state: "conflicted",
            conflictDetected: true,
        }));
        expect(String(lease?.conflictReason || "")).toContain("drifted");
    });
    it("surfaces the active browser mission lease in collected context", async () => {
        const controller = new BrowserRuntimeController();
        const policy = {
            enabled: true,
            allowBrowserNative: true,
        };
        const activePage = {
            id: "page_1",
            title: "YouTube",
            url: "https://www.youtube.com/",
            origin: "https://www.youtube.com",
            browserName: "Google Chrome",
            lane: "browser_native",
            active: true,
        };
        controller.session = {
            mode: "managed",
            browserName: "Google Chrome",
        };
        controller.listPages = async () => [activePage];
        controller.getActivePage = async () => activePage;
        controller.snapshotDom = async () => ({
            snapshotId: "snap_1",
            pageId: "page_1",
            url: activePage.url,
            title: activePage.title,
            interactiveElements: [],
            workflowCheckpoint: "YouTube",
        });
        controller.pageStates.set("page_1", {
            pageId: "page_1",
            targetId: "page_1",
            lastActivatedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            recentConsole: [],
            recentNetwork: [],
            worldModel: {
                checkpoints: [],
                knownElementRefs: [],
                recentNavigations: [],
            },
        });
        controller.pageLeases.set("page_1", {
            leaseId: "lease_1",
            missionKind: "browser_complete_form",
            pageId: "page_1",
            sessionMode: "managed",
            startedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
            updatedAt: new Date("2026-04-02T00:00:05.000Z").toISOString(),
            state: "active",
            expectedUrl: activePage.url,
            expectedOrigin: activePage.origin,
            lastObservedUrl: activePage.url,
            lastObservedTitle: activePage.title,
            conflictDetected: false,
        });
        const context = await controller.collectContext(policy);
        expect(context.activeMissionLease).toEqual(expect.objectContaining({
            leaseId: "lease_1",
            missionKind: "browser_complete_form",
            pageId: "page_1",
            state: "active",
            conflictDetected: false,
        }));
    });
    it("drops a managed session when reuse-first browser preference is requested", async () => {
        const controller = new BrowserRuntimeController();
        let closed = false;
        controller.session = {
            mode: "managed",
            browserName: "Google Chrome",
            endpoint: "http://127.0.0.1:9222",
            browserWsUrl: "ws://127.0.0.1:9222/devtools/browser/1",
        };
        controller.browserConnection = {
            close: () => {
                closed = true;
            },
        };
        await controller.runWithSessionPreference("reuse_first", async () => {
            expect(controller.sessionModeOverride).toBe("reuse_first");
            expect(controller.session).toBeNull();
        });
        expect(closed).toBe(true);
        expect(controller.sessionModeOverride).toBeNull();
    });
});
