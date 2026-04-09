import { describe, expect, it } from "vitest";
import { BrowserToolExecutor, collectBrowserContext } from "./browser-tool-executor.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
import type { MachineAutonomyPolicy } from "./machine-autonomy.js";

function buildPolicy(overrides: Partial<MachineAutonomyPolicy> = {}): MachineAutonomyPolicy {
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

function buildPendingToolCall(name: string, args: Record<string, unknown> = {}) {
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
      currentSessionKind: () => "existing" as const,
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
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
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
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_1",
          title: "Example",
          url: "https://example.com",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
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
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_snapshot_dom", { pageId: "page_1", limit: 10 })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.snapshotId).toBe("snap_1");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        url: "https://example.com",
        interactiveElementCount: 1,
      })
    );
  });

  it("blocks browser tools when browser-native autonomy is disabled", async () => {
    const runtime = {
      currentSessionKind: () => "none" as const,
      listPages: async () => [],
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy({ allowBrowserNative: false }));
    const result = await executor.execute(buildPendingToolCall("browser_list_pages"));

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("browser autonomy is disabled");
  });

  it("collects browser context for orchestration", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
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
      runtime: runtime as any,
      policy: buildPolicy(),
    });

    expect(context.mode).toBe("attached");
    expect((context.activePage as Record<string, unknown>).title).toBe("Inbox");
  });

  it("resolves a human-readable page reference before querying elements", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_yt",
          title: "YouTube",
          url: "https://www.youtube.com/",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      queryElements: async (_policy: MachineAutonomyPolicy, input: { pageId: string; query?: string }) => ({
        page: {
          id: input.pageId,
          title: "YouTube",
          url: "https://www.youtube.com/results?search_query=outdoor+boys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        matches: [
          {
            id: "element_1",
            selector: "input[name=\"search_query\"]",
            label: "Search",
          },
        ],
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_query_elements", {
        pageId: "YouTube (https://www.youtube.com/)",
        query: "search",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        pageId: "page_yt",
      })
    );
  });

  it("resolves generic page_1 aliases to the active page", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_active",
          title: "YouTube",
          url: "https://www.youtube.com/",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
        {
          id: "page_other",
          title: "about:blank",
          url: "about:blank",
          origin: "",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: false,
        },
      ],
      queryElements: async (_policy: MachineAutonomyPolicy, input: { pageId: string }) => ({
        page: {
          id: input.pageId,
          title: "YouTube",
          url: "https://www.youtube.com/",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        matches: [],
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_query_elements", {
        pageId: "page_1",
        query: "search",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        pageId: "page_active",
      })
    );
  });

  it("includes the real page id in active-page summaries", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      getActivePage: async () => ({
        id: "page_123",
        title: "YouTube",
        url: "https://www.youtube.com/",
        origin: "https://www.youtube.com",
        browserName: "Google Chrome",
        lane: "browser_native",
        active: true,
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(buildPendingToolCall("browser_get_active_page"));

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("page_123");
    expect(result.summary).toContain("YouTube");
  });

  it("runs a cohesive browser search mission through one tool", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      searchAndOpenBestResult: async (_policy: MachineAutonomyPolicy, input: { url: string; query: string }) => ({
        searchPage: {
          id: "page_search",
          title: "outdoor boys - YouTube",
          url: "https://www.youtube.com/results?search_query=outdoor+boys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_video",
          title: "Outdoor Boys - Alaska camp",
          url: "https://www.youtube.com/watch?v=abc123",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        clickedResult: {
          id: "element_video",
          selector: "a#video-title",
          label: "Outdoor Boys - Alaska camp",
          tagName: "a",
          role: "link",
          visible: true,
          score: 250,
        },
        candidates: [],
        directSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(input.query)}`,
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_search_and_open_best_result", {
        url: "https://www.youtube.com/",
        query: "outdoor boys",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("opened");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        query: "outdoor boys",
        finalPageUrl: "https://www.youtube.com/watch?v=abc123",
      })
    );
  });

  it("infers a site route for cohesive search missions from the query text", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      searchAndOpenBestResult: async (_policy: MachineAutonomyPolicy, input: { url: string; query: string }) => ({
        searchPage: {
          id: "page_search",
          title: "outdoor boys - YouTube",
          url: "https://www.youtube.com/results?search_query=outdoor+boys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_channel",
          title: "Outdoor Boys",
          url: "https://www.youtube.com/@OutdoorBoys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        clickedResult: {
          id: "element_channel",
          selector: "#main-link",
          label: "Outdoor Boys",
          tagName: "a",
          role: "link",
          visible: true,
          score: 180,
        },
        candidates: [],
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_search_and_open_best_result", {
        query: "outdoor boys youtube",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        query: "outdoor boys",
      })
    );
  });

  it("falls back to the active page for browser keypresses when pageId is omitted", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_active",
          title: "YouTube",
          url: "https://www.youtube.com/",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      pressKeys: async (_policy: MachineAutonomyPolicy, input: { pageId: string; keys: string[] }) => ({
        ok: true,
        url: "https://www.youtube.com/results?search_query=outdoor+boys",
        title: "outdoor boys - YouTube",
        pageId: input.pageId,
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_press_keys", {
        keys: ["Enter"],
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        keys: ["Enter"],
      })
    );
    expect(result.data?.pageId).toBe("page_active");
  });

  it("runs a cohesive browser login mission", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      loginAndContinue: async () => ({
        startPage: {
          id: "page_login",
          title: "Sign in",
          url: "https://example.com/login",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_home",
          title: "Dashboard",
          url: "https://example.com/dashboard",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        authenticated: true,
        submitted: true,
        actions: ["filled:Email or username", "filled:Password", "clicked:sign in"],
        matchedFields: [{ fieldLabel: "Email or username", selector: "input[name=\"email\"]" }],
        missingFields: [],
        missionLease: {
          leaseId: "lease_login",
          missionKind: "browser_login_and_continue",
          pageId: "page_login",
          sessionMode: "attached",
          state: "completed",
          conflictDetected: false,
          startedAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:02.000Z",
        },
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_login_and_continue", {
        url: "https://example.com/login",
        username: "person@example.com",
        password: "secret",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("login workflow");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        authenticated: true,
        submitted: true,
        finalPageUrl: "https://example.com/dashboard",
        leaseId: "lease_login",
        conflictDetected: false,
      })
    );
    expect(result.data?.missionLease).toEqual(
      expect.objectContaining({
        leaseId: "lease_login",
        missionKind: "browser_login_and_continue",
      })
    );
  });

  it("runs a cohesive browser form mission", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_form",
          title: "Checkout",
          url: "https://example.com/checkout",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      completeForm: async () => ({
        page: {
          id: "page_form",
          title: "Checkout",
          url: "https://example.com/checkout",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_done",
          title: "Confirmation",
          url: "https://example.com/confirmation",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        submitted: true,
        actions: ["filled:Email", "filled:ZIP", "clicked:submit"],
        matchedFields: [{ fieldLabel: "Email", selector: "input[name=\"email\"]" }],
        missingFields: [],
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_complete_form", {
        pageId: "active",
        fields: [
          { label: "Email", value: "person@example.com" },
          { label: "ZIP", value: "60601" },
        ],
        submit: true,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("form workflow");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        submitted: true,
        finalPageUrl: "https://example.com/confirmation",
      })
    );
  });

  it("runs a browser extract-and-decide mission", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      extractAndDecide: async () => ({
        page: {
          id: "page_results",
          title: "Results",
          url: "https://example.com/results",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_detail",
          title: "Outdoor Boys",
          url: "https://example.com/outdoor-boys",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        bestCandidate: {
          id: "candidate_1",
          selector: "a.result-link",
          label: "Outdoor Boys",
          tagName: "a",
          role: "link",
          visible: true,
          score: 220,
        },
        candidates: [],
        clicked: true,
        selectedOption: "Outdoor Boys",
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_extract_and_decide", {
        query: "outdoor boys",
        options: ["Outdoor Boys", "Other"],
        action: "click_best",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("opened");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        clicked: true,
        finalPageUrl: "https://example.com/outdoor-boys",
      })
    );
  });

  it("runs a browser workflow recovery mission", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      recoverWorkflow: async () => ({
        page: {
          id: "page_modal",
          title: "Modal blocking page",
          url: "https://example.com/dashboard",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_modal",
          title: "Dashboard",
          url: "https://example.com/dashboard",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        recovered: true,
        actionTaken: "clicked:continue",
        matchedElement: {
          id: "button_continue",
          selector: "button.continue",
          label: "Continue",
          tagName: "button",
          role: "button",
          visible: true,
          score: 140,
        },
        candidates: [],
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_recover_workflow", {
        goal: "continue to dashboard",
        preferredActionQuery: "continue",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Recovered");
    expect(result.data?.proof).toEqual(
      expect.objectContaining({
        recovered: true,
        actionTaken: "clicked:continue",
      })
    );
  });

  it("enforces screenshot policy for browser_capture_page when no reason is provided", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_1",
          title: "Example",
          url: "https://example.com",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      capturePage: async () => ({
        snapshotId: "snap_should_not_happen",
        mimeType: "image/png",
        dataBase64: "abc",
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_capture_page", {
        pageId: "page_1",
      })
    );

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("screenshot policy blocked");
  });

  it("captures screenshot when explicitly allowed and emits screenshot metadata", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_1",
          title: "Example",
          url: "https://example.com",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      capturePage: async () => ({
        snapshotId: "snap_1",
        mimeType: "image/png",
        dataBase64: "abcdef",
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_capture_page", {
        pageId: "page_1",
        screenshotReason: "explicit_user_request",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        screenshotCaptured: true,
        screenshotReason: "explicit_user_request",
        verificationRequired: true,
        verificationPassed: true,
      })
    );
  });

  it("enforces browser target guards before mutation tools", async () => {
    const guardCalls: Array<Record<string, unknown>> = [];
    const runtime = {
      currentSessionKind: () => "existing" as const,
      listPages: async () => [
        {
          id: "page_1",
          title: "Example",
          url: "https://example.com",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        },
      ],
      assertPageTarget: async (_policy: MachineAutonomyPolicy, input: Record<string, unknown>) => {
        guardCalls.push(input);
        return {
          id: "page_1",
          title: "Example",
          url: "https://example.com",
          origin: "https://example.com",
          browserName: "Google Chrome",
          lane: "browser_native",
          active: true,
        };
      },
      click: async () => ({
        ok: true,
        url: "https://example.com",
        title: "Example",
      }),
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_click", {
        pageId: "page_1",
        targetOrigin: "https://example.com",
        pageLeaseId: "lease_1",
      })
    );

    expect(result.ok).toBe(true);
    expect(guardCalls).toEqual([
      expect.objectContaining({
        pageId: "page_1",
        targetOrigin: "https://example.com",
        pageLeaseId: "lease_1",
      }),
    ]);
    expect(result.data).toEqual(
      expect.objectContaining({
        targetOrigin: "https://example.com",
        pageLeaseId: "lease_1",
        verificationRequired: true,
        verificationPassed: true,
      })
    );
  });

  it("switches to managed-only browser preference while the user is actively focused", async () => {
    let observedMode: string | null = null;
    const runtime = {
      currentSessionKind: () => "existing" as const,
      runWithSessionPreference: async (mode: "managed_only" | "reuse_first" | null, action: () => Promise<unknown>) => {
        observedMode = mode;
        return await action();
      },
      searchAndOpenBestResult: async () => ({
        searchPage: {
          id: "page_search",
          title: "outdoor boys - YouTube",
          url: "https://www.youtube.com/results?search_query=outdoor+boys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        finalPage: {
          id: "page_search",
          title: "Outdoor Boys",
          url: "https://www.youtube.com/@OutdoorBoys",
          origin: "https://www.youtube.com",
          browserName: "Google Chrome",
          lane: "browser_native" as const,
        },
        clickedResult: {
          id: "element_channel",
          selector: "#main-link",
          label: "Outdoor Boys",
          tagName: "a",
          role: "link",
          visible: true,
          score: 180,
        },
        candidates: [],
      }),
    };
    const policy = buildPolicy({ sessionPolicy: "attach_carefully" });
    const controller = new AutonomyExecutionController(policy);
    controller.updateFocusLease({
      surface: "desktop",
      source: "typing",
      leaseMs: 5000,
      active: true,
    });
    const executor = new BrowserToolExecutor(runtime as any, policy, controller);
    const result = await executor.execute(
      buildPendingToolCall("browser_search_and_open_best_result", {
        url: "https://www.youtube.com/",
        query: "outdoor boys",
      })
    );

    expect(result.ok).toBe(true);
    expect(observedMode).toBe("managed_only");
  });

  it("returns mission lease conflict metadata on browser mission failures", async () => {
    const runtime = {
      currentSessionKind: () => "existing" as const,
      searchAndOpenBestResult: async () => {
        const error = new Error("The leased page drifted away.");
        (error as Error & { browserMissionLease?: Record<string, unknown> }).browserMissionLease = {
          leaseId: "lease_conflict",
          missionKind: "browser_search_and_open_best_result",
          pageId: "page_search",
          sessionMode: "attached",
          state: "conflicted",
          conflictDetected: true,
          conflictReason: "The leased page drifted away.",
          startedAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:03.000Z",
        };
        throw error;
      },
    };
    const executor = new BrowserToolExecutor(runtime as any, buildPolicy());
    const result = await executor.execute(
      buildPendingToolCall("browser_search_and_open_best_result", {
        url: "https://www.youtube.com/",
        query: "outdoor boys",
      })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("drifted");
    expect(result.data?.missionLease).toEqual(
      expect.objectContaining({
        leaseId: "lease_conflict",
        conflictDetected: true,
        state: "conflicted",
      })
    );
  });
});
