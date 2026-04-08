import {
  BrowserRuntimeController,
  inferBrowserMissionUrlFromQuery,
  stripBrowserSiteHintFromQuery,
  type BrowserPageSummary,
} from "./browser-runtime.js";
import type { MachineAutonomyPolicy } from "./machine-autonomy.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

type BrowserMissionLeasePayload = {
  leaseId: string;
  missionKind: string;
  pageId: string;
  state: string;
  sessionMode: string;
  conflictDetected: boolean;
  conflictReason?: string;
  startedAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function fail(toolCall: ToolCall, summary: string, blocked = false): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: false,
    blocked,
    summary,
    error: summary,
    createdAt: nowIso(),
  };
}

function ok(toolCall: ToolCall, summary: string, data: Record<string, unknown> = {}): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: true,
    summary,
    data: {
      lane: "browser_native",
      ...data,
    },
    createdAt: nowIso(),
  };
}

function missionLeasePayload(value: unknown): BrowserMissionLeasePayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.leaseId !== "string" || typeof record.pageId !== "string") return undefined;
  return {
    leaseId: record.leaseId,
    missionKind: typeof record.missionKind === "string" ? record.missionKind : "browser_mission",
    pageId: record.pageId,
    state: typeof record.state === "string" ? record.state : "active",
    sessionMode: typeof record.sessionMode === "string" ? record.sessionMode : "attached",
    conflictDetected: record.conflictDetected === true,
    ...(typeof record.conflictReason === "string" && record.conflictReason ? { conflictReason: record.conflictReason } : {}),
    startedAt: typeof record.startedAt === "string" ? record.startedAt : nowIso(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : nowIso(),
  };
}

function withLeaseConflictNote(summary: string, lease: BrowserMissionLeasePayload | undefined): string {
  if (!lease?.conflictDetected) return summary;
  return `${summary} Binary also detected page interference on the leased tab${lease.conflictReason ? `: ${lease.conflictReason}` : "."}`;
}

function summarizePage(page: BrowserPageSummary | null | undefined): string {
  if (!page) return "No active browser page was resolved.";
  return `${page.title || "Untitled"} (${page.url || "about:blank"})`;
}

function normalizePageReference(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function pageReferenceCandidates(page: BrowserPageSummary): string[] {
  const title = String(page.title || "").trim();
  const url = String(page.url || "").trim();
  const origin = String(page.origin || "").trim();
  return [
    page.id,
    title,
    url,
    origin,
    title && url ? `${title} (${url})` : "",
    title && origin ? `${title} (${origin})` : "",
  ]
    .map((item) => normalizePageReference(item))
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function collectBrowserContext(input: {
  runtime: BrowserRuntimeController;
  policy: MachineAutonomyPolicy;
  pageLimit?: number;
  elementLimit?: number;
  fast?: boolean;
}): Promise<Record<string, unknown>> {
  if (input.fast) {
    const sessionKind = input.runtime.currentSessionKind();
    return {
      mode: sessionKind === "managed" ? "managed" : sessionKind === "existing" ? "attached" : "unavailable",
      sessionHint: {
        attachedToExistingSession: sessionKind === "existing",
      },
      deferred: true,
    };
  }
  const context = await input.runtime.collectContext(input.policy, {
    pageLimit: clamp(input.pageLimit ?? 8, 1, 20),
    elementLimit: clamp(input.elementLimit ?? 12, 1, 24),
  });
  return context as Record<string, unknown>;
}

export class BrowserToolExecutor {
  constructor(
    private readonly runtime: BrowserRuntimeController,
    private readonly policy: MachineAutonomyPolicy,
    private readonly executionController?: AutonomyExecutionController
  ) {}

  private async resolvePageId(pageRef: unknown, allowActiveFallback = false): Promise<string> {
    const raw = String(pageRef || "").trim();
    let pages = await this.runtime.listPages(this.policy);
    for (let attempt = 0; !pages.length && attempt < 2; attempt += 1) {
      await sleep(250);
      pages = await this.runtime.listPages(this.policy);
    }
    if (!pages.length) {
      throw new Error("Binary could not find any browser pages to target.");
    }

    const activePage = pages.find((page) => page.active) || pages[0];
    if (!raw) {
      if (allowActiveFallback && activePage) {
        return activePage.id;
      }
      throw new Error("Browser action requires pageId.");
    }

    if (pages.some((page) => page.id === raw)) {
      return raw;
    }

    const normalized = normalizePageReference(raw);
    if (
      normalized === "active" ||
      normalized === "current" ||
      normalized === "default" ||
      normalized === "page" ||
      normalized === "page_1" ||
      normalized === "page1"
    ) {
      if (activePage) return activePage.id;
    }

    const ordinalMatch = normalized.match(/^page[_\s-]?(\d+)$/);
    if (ordinalMatch) {
      const index = Math.max(1, Number(ordinalMatch[1] || 1)) - 1;
      const orderedPages = [...pages].sort((left, right) => Number(Boolean(right.active)) - Number(Boolean(left.active)));
      if (orderedPages[index]) {
        return orderedPages[index].id;
      }
    }

    const exactMatches = pages.filter((page) => pageReferenceCandidates(page).includes(normalized));
    if (exactMatches.length === 1) {
      return exactMatches[0].id;
    }

    const fuzzyMatches = pages.filter((page) =>
      pageReferenceCandidates(page).some((candidate) => candidate.includes(normalized) || normalized.includes(candidate))
    );
    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0].id;
    }

    if (activePage && pageReferenceCandidates(activePage).some((candidate) => candidate.includes(normalized) || normalized.includes(candidate))) {
      return activePage.id;
    }

    const nonBlankPages = pages.filter((page) => !/about:blank/i.test(String(page.url || "")));
    if (/^[a-f0-9]{12,}$/i.test(raw)) {
      if (activePage && !/about:blank/i.test(String(activePage.url || ""))) {
        return activePage.id;
      }
      if (nonBlankPages.length === 1) {
        return nonBlankPages[0].id;
      }
    }

    const available = pages
      .slice(0, 6)
      .map((page) => `${page.id}: ${summarizePage(page)}`)
      .join("; ");
    throw new Error(
      `Browser page ${raw} was not found. Use browser_list_pages or browser_get_active_page and pass an existing page id. Available pages: ${available}`
    );
  }

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};
    const decision = this.executionController?.decide(pendingToolCall);
    const sessionKind = () => this.runtime.currentSessionKind();
    const runtimeWithSessionPreference = this.runtime as BrowserRuntimeController & {
      runWithSessionPreference?: <T>(mode: "managed_only" | "reuse_first" | null, action: () => Promise<T>) => Promise<T>;
    };
    const runMission = async <T>(operation: () => Promise<T>): Promise<T> =>
      typeof runtimeWithSessionPreference.runWithSessionPreference === "function"
        ? await runtimeWithSessionPreference.runWithSessionPreference(
            decision?.browserSessionPreference ?? (decision?.managedSessionPreferred ? "managed_only" : null),
            operation
          )
        : await operation();
    const receipt = (focusStolen = false, sessionKind: "managed" | "existing" | "none" = "none") =>
      this.executionController && decision
        ? this.executionController.buildReceipt(decision, { focusStolen, sessionKind })
        : {};

    if (!this.policy.enabled || !this.policy.allowBrowserNative) {
      if (String(toolCall.name || "").startsWith("browser_")) {
        return fail(
          toolCall,
          "Binary Host blocked browser-native automation because browser autonomy is disabled. Fall back to desktop_open_url or desktop tools only if the orchestrator decides that fallback is necessary.",
          true
        );
      }
    }

    if (decision?.focusSuppressed) {
      return {
        ...fail(toolCall, decision.summary, true),
        data: receipt(false, "none"),
      };
    }

    try {
      if (toolCall.name === "browser_list_pages") {
        const pages = await this.runtime.listPages(this.policy);
        return ok(toolCall, `Observed ${pages.length} browser page(s).`, { ...receipt(false, sessionKind()), pages });
      }

      if (toolCall.name === "browser_get_active_page") {
        const page = await this.runtime.getActivePage(this.policy);
        return ok(
          toolCall,
          page ? `Active page ${page.id}: ${summarizePage(page)}` : summarizePage(page),
          { ...receipt(false, sessionKind()), page }
        );
      }

      if (toolCall.name === "browser_open_page") {
        const url = String(args.url || "").trim();
        if (!url) return fail(toolCall, "browser_open_page requires a URL.");
        const page = await this.runtime.openPage(this.policy, url);
        return ok(toolCall, `Opened ${summarizePage(page)}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_search_and_open_best_result") {
          let url = typeof args.url === "string" ? args.url.trim() : "";
          const pageId = args.pageId ? await this.resolvePageId(args.pageId) : undefined;
          let query = String(args.query || "").trim();
          if (!url && !pageId) {
            const inferredUrl = inferBrowserMissionUrlFromQuery(query);
            if (inferredUrl) {
              url = inferredUrl;
              query = stripBrowserSiteHintFromQuery(query, inferredUrl);
            }
          }
          if (!query || (!url && !pageId)) {
            return fail(toolCall, "browser_search_and_open_best_result requires query and either url or pageId.");
          }
          const result = await runMission(() => this.runtime.searchAndOpenBestResult(this.policy, {
            ...(url ? { url } : {}),
            ...(pageId ? { pageId } : {}),
            query,
            ...(typeof args.resultQuery === "string" && args.resultQuery.trim() ? { resultQuery: args.resultQuery.trim() } : {}),
            ...(Number.isFinite(Number(args.limit)) ? { limit: clamp(Number(args.limit), 1, 24) } : {}),
          }));
        const lease = missionLeasePayload(result.missionLease);
        return ok(
          toolCall,
          withLeaseConflictNote(
            result.clickedResult
              ? `Searched for ${query} and opened ${result.clickedResult.label || result.finalPage?.title || "the best result"}.`
              : `Searched for ${query} but could not find a confident result to open.`,
            lease
          ),
          {
            ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
            searchPage: result.searchPage,
            finalPage: result.finalPage,
            clickedResult: result.clickedResult,
            candidates: result.candidates,
            ...(lease ? { missionLease: lease } : {}),
            ...(result.directSearchUrl ? { directSearchUrl: result.directSearchUrl } : {}),
            proof: {
              query,
              searchPageUrl: result.searchPage.url,
              finalPageUrl: result.finalPage?.url,
              clickedLabel: result.clickedResult?.label,
              ...(lease
                ? {
                    leaseId: lease.leaseId,
                    conflictDetected: lease.conflictDetected,
                  }
                : {}),
            },
          }
        );
      }

      if (toolCall.name === "browser_login_and_continue") {
        const result = await runMission(async () => await this.runtime.loginAndContinue(this.policy, {
          ...(typeof args.url === "string" && args.url.trim() ? { url: args.url.trim() } : {}),
          ...(args.pageId ? { pageId: await this.resolvePageId(args.pageId, true) } : {}),
          ...(typeof args.username === "string" ? { username: args.username } : {}),
          ...(typeof args.password === "string" ? { password: args.password } : {}),
          ...(typeof args.submitQuery === "string" ? { submitQuery: args.submitQuery } : {}),
          ...(typeof args.continueQuery === "string" ? { continueQuery: args.continueQuery } : {}),
          ...(typeof args.waitForText === "string" ? { waitForText: args.waitForText } : {}),
          ...(typeof args.waitForUrlIncludes === "string" ? { waitForUrlIncludes: args.waitForUrlIncludes } : {}),
        }));
        const lease = missionLeasePayload(result.missionLease);
        return ok(
          toolCall,
          withLeaseConflictNote(
            result.authenticated
              ? "Completed the login workflow and verified the page continued."
              : "Attempted the login workflow, but Binary could not fully verify the authenticated state.",
            lease
          ),
          {
            ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
            startPage: result.startPage,
            finalPage: result.finalPage,
            authenticated: result.authenticated,
            submitted: result.submitted,
            actions: result.actions,
            matchedFields: result.matchedFields,
            missingFields: result.missingFields,
            ...(lease ? { missionLease: lease } : {}),
            proof: {
              authenticated: result.authenticated,
              submitted: result.submitted,
              finalPageUrl: result.finalPage?.url,
              actionCount: result.actions.length,
              ...(lease
                ? {
                    leaseId: lease.leaseId,
                    conflictDetected: lease.conflictDetected,
                  }
                : {}),
            },
          }
        );
      }

      if (toolCall.name === "browser_complete_form") {
        const fields = Array.isArray(args.fields)
          ? args.fields.map((item) => (typeof item === "object" && item ? (item as Record<string, unknown>) : {}))
          : [];
        const result = await runMission(async () => await this.runtime.completeForm(this.policy, {
          ...(typeof args.url === "string" && args.url.trim() ? { url: args.url.trim() } : {}),
          ...(args.pageId ? { pageId: await this.resolvePageId(args.pageId, true) } : {}),
          fields: fields.map((field) => ({
            ...(typeof field.label === "string" ? { label: field.label } : {}),
            ...(typeof field.name === "string" ? { name: field.name } : {}),
            ...(typeof field.query === "string" ? { query: field.query } : {}),
            ...(typeof field.value === "string" ? { value: field.value } : {}),
            ...(typeof field.checked === "boolean" ? { checked: field.checked } : {}),
            ...(typeof field.required === "boolean" ? { required: field.required } : {}),
            ...(typeof field.kind === "string" ? { kind: field.kind } : {}),
          })),
          submit: args.submit === true,
          ...(typeof args.submitQuery === "string" ? { submitQuery: args.submitQuery } : {}),
          ...(typeof args.waitForText === "string" ? { waitForText: args.waitForText } : {}),
          ...(typeof args.waitForUrlIncludes === "string" ? { waitForUrlIncludes: args.waitForUrlIncludes } : {}),
        }));
        const lease = missionLeasePayload(result.missionLease);
        return ok(
          toolCall,
          withLeaseConflictNote(
            result.submitted
              ? "Completed the form workflow and submitted it."
              : "Filled the form fields without submitting.",
            lease
          ),
          {
            ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
            page: result.page,
            finalPage: result.finalPage,
            submitted: result.submitted,
            actions: result.actions,
            matchedFields: result.matchedFields,
            missingFields: result.missingFields,
            ...(lease ? { missionLease: lease } : {}),
            proof: {
              submitted: result.submitted,
              finalPageUrl: result.finalPage?.url,
              matchedFieldCount: result.matchedFields.length,
              missingFieldCount: result.missingFields.length,
              ...(lease
                ? {
                    leaseId: lease.leaseId,
                    conflictDetected: lease.conflictDetected,
                  }
                : {}),
            },
          }
        );
      }

      if (toolCall.name === "browser_extract_and_decide") {
        const action =
          typeof args.action === "string" && args.action.trim().toLowerCase() === "click_best" ? "click_best" : "none";
        const result = await runMission(async () => await this.runtime.extractAndDecide(this.policy, {
          ...(typeof args.url === "string" && args.url.trim() ? { url: args.url.trim() } : {}),
          ...(args.pageId ? { pageId: await this.resolvePageId(args.pageId, true) } : {}),
          query: String(args.query || "").trim(),
          ...(Array.isArray(args.options) ? { options: args.options.map((item) => String(item)) } : {}),
          action,
          ...(Number.isFinite(Number(args.limit)) ? { limit: clamp(Number(args.limit), 1, 24) } : {}),
        }));
        const lease = missionLeasePayload(result.missionLease);
        return ok(
          toolCall,
          withLeaseConflictNote(
            result.bestCandidate
              ? action === "click_best"
                ? `Extracted the likely match and opened ${result.bestCandidate.label || "the best candidate"}.`
                : `Extracted the likely match: ${result.bestCandidate.label || "best candidate"}.`
              : "Binary could not extract a confident candidate from the page.",
            lease
          ),
          {
            ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
            page: result.page,
            finalPage: result.finalPage,
            bestCandidate: result.bestCandidate,
            candidates: result.candidates,
            clicked: result.clicked,
            ...(lease ? { missionLease: lease } : {}),
            ...(result.selectedOption ? { selectedOption: result.selectedOption } : {}),
            proof: {
              clicked: result.clicked,
              finalPageUrl: result.finalPage?.url,
              candidateCount: result.candidates.length,
              bestLabel: result.bestCandidate?.label,
              ...(lease
                ? {
                    leaseId: lease.leaseId,
                    conflictDetected: lease.conflictDetected,
                  }
                : {}),
            },
          }
        );
      }

      if (toolCall.name === "browser_recover_workflow") {
        const result = await runMission(async () => await this.runtime.recoverWorkflow(this.policy, {
          ...(typeof args.url === "string" && args.url.trim() ? { url: args.url.trim() } : {}),
          ...(args.pageId ? { pageId: await this.resolvePageId(args.pageId, true) } : {}),
          ...(typeof args.goal === "string" ? { goal: args.goal } : {}),
          ...(typeof args.preferredActionQuery === "string" ? { preferredActionQuery: args.preferredActionQuery } : {}),
          ...(typeof args.waitForText === "string" ? { waitForText: args.waitForText } : {}),
          ...(typeof args.waitForUrlIncludes === "string" ? { waitForUrlIncludes: args.waitForUrlIncludes } : {}),
          ...(Number.isFinite(Number(args.limit)) ? { limit: clamp(Number(args.limit), 1, 24) } : {}),
        }));
        const lease = missionLeasePayload(result.missionLease);
        return ok(
          toolCall,
          withLeaseConflictNote(
            result.recovered
              ? `Recovered the browser workflow${result.actionTaken ? ` by ${result.actionTaken}` : ""}.`
              : "Binary attempted workflow recovery but could not verify the page was unstuck.",
            lease
          ),
          {
            ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
            page: result.page,
            finalPage: result.finalPage,
            recovered: result.recovered,
            actionTaken: result.actionTaken,
            matchedElement: result.matchedElement,
            candidates: result.candidates,
            ...(lease ? { missionLease: lease } : {}),
            proof: {
              recovered: result.recovered,
              finalPageUrl: result.finalPage?.url,
              actionTaken: result.actionTaken,
              candidateCount: result.candidates.length,
              ...(lease
                ? {
                    leaseId: lease.leaseId,
                    conflictDetected: lease.conflictDetected,
                  }
                : {}),
            },
          }
        );
      }

      if (toolCall.name === "browser_focus_page") {
        const pageId = await this.resolvePageId(args.pageId);
        const page = await this.runtime.focusPage(this.policy, pageId);
        return ok(toolCall, `Focused ${summarizePage(page)}.`, {
          ...receipt(true, sessionKind()),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_navigate") {
        const pageId = await this.resolvePageId(args.pageId);
        const url = String(args.url || "").trim();
        if (!url) return fail(toolCall, "browser_navigate requires pageId and url.");
        const page = await this.runtime.navigate(this.policy, { pageId, url });
        return ok(toolCall, `Navigated to ${page.url}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_snapshot_dom") {
        const pageId = await this.resolvePageId(args.pageId);
        const snapshot = await this.runtime.snapshotDom(this.policy, {
          pageId,
          query: typeof args.query === "string" ? args.query : undefined,
          limit: clamp(Number(args.limit || 16), 1, 40),
        });
        return ok(toolCall, `Captured DOM snapshot for ${snapshot.title || snapshot.url}.`, {
          ...receipt(false, sessionKind()),
          snapshotId: snapshot.snapshotId,
          pageId: snapshot.pageId,
          url: snapshot.url,
          title: snapshot.title,
          interactiveElements: snapshot.interactiveElements,
          workflowCheckpoint: snapshot.workflowCheckpoint,
          affordanceGraph: snapshot.interactiveElements.map((item) => ({
            id: item.id,
            label: item.label,
            selector: item.selector,
            role: item.role,
            tagName: item.tagName,
          })),
          proof: {
            url: snapshot.url,
            title: snapshot.title,
            interactiveElementCount: snapshot.interactiveElements.length,
          },
        });
      }

      if (toolCall.name === "browser_query_elements") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.queryElements(this.policy, {
          pageId,
          query: typeof args.query === "string" ? args.query : undefined,
          limit: clamp(Number(args.limit || 12), 1, 24),
        });
        return ok(toolCall, `Found ${result.matches.length} browser element(s) on ${summarizePage(result.page)}.`, {
          ...receipt(false, sessionKind()),
          page: result.page,
          matches: result.matches,
          proof: { pageId, matchCount: result.matches.length },
        });
      }

      if (toolCall.name === "browser_click") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.click(this.policy, {
          pageId,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.ok === false ? "Browser click did not find the requested element." : `Clicked on ${result.title || result.url || "the page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, ok: result.ok },
        });
      }

      if (toolCall.name === "browser_type") {
        const pageId = await this.resolvePageId(args.pageId);
        const text = String(args.text || "");
        if (!text) return fail(toolCall, "browser_type requires pageId and text.");
        const result = await this.runtime.type(this.policy, {
          pageId,
          text,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.ok === false ? "Browser typing did not reach a typeable element." : `Typed into ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, typed: result.typed },
        });
      }

      if (toolCall.name === "browser_press_keys") {
        const pageId = await this.resolvePageId(args.pageId, true);
        const keys = Array.isArray(args.keys) ? args.keys.map((item) => String(item)) : [];
        if (!keys.length) return fail(toolCall, "browser_press_keys requires keys.");
        const result = await this.runtime.pressKeys(this.policy, { pageId, keys });
        return ok(toolCall, `Pressed ${keys.join(" + ")} on ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, keys },
        });
      }

      if (toolCall.name === "browser_scroll") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.scroll(this.policy, {
          pageId,
          deltaY: Number(args.deltaY || 640),
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, `Scrolled ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", sessionKind()),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, scrollY: result.scrollY },
        });
      }

      if (toolCall.name === "browser_wait_for") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.waitFor(this.policy, {
          pageId,
          durationMs: clamp(Number(args.durationMs || 2_000), 0, 30_000),
          selector: typeof args.selector === "string" ? args.selector : undefined,
          text: typeof args.text === "string" ? args.text : undefined,
          urlIncludes: typeof args.urlIncludes === "string" ? args.urlIncludes : undefined,
          titleIncludes: typeof args.titleIncludes === "string" ? args.titleIncludes : undefined,
        });
        return ok(toolCall, result.ok === true ? "Observed the requested browser condition." : "Browser condition did not become true before timeout.", {
          ...receipt(false, sessionKind()),
          pageId,
          ...result,
          proof: { ok: result.ok, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_read_text") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.readText(this.policy, {
          pageId,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.found === false ? "Browser text target was not found." : "Read text from the browser page.", {
          ...receipt(false, sessionKind()),
          pageId,
          ...result,
          proof: { found: result.found, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_read_form_state") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.readFormState(this.policy, { pageId });
        const controls = Array.isArray(result.controls) ? result.controls : [];
        return ok(toolCall, `Read ${controls.length} form control(s) from the browser page.`, {
          ...receipt(false, sessionKind()),
          pageId,
          ...result,
          proof: { controlCount: controls.length, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_capture_page") {
        const pageId = await this.resolvePageId(args.pageId);
        const result = await this.runtime.capturePage(this.policy, { pageId });
        return ok(toolCall, "Captured a browser screenshot for verification.", {
          ...receipt(false, sessionKind()),
          pageId,
          snapshotId: result.snapshotId,
          mimeType: result.mimeType,
          byteLength: String(result.dataBase64 || "").length,
          proof: { snapshotId: result.snapshotId, mimeType: result.mimeType },
        });
      }

      if (toolCall.name === "browser_get_network_activity") {
        const pageId = await this.resolvePageId(args.pageId);
        const entries = await this.runtime.getNetworkActivity(this.policy, {
          pageId,
          limit: clamp(Number(args.limit || 20), 1, 40),
        });
        return ok(toolCall, `Observed ${entries.length} recent browser network event(s).`, {
          ...receipt(false, sessionKind()),
          pageId,
          entries,
          proof: { eventCount: entries.length },
        });
      }

      if (toolCall.name === "browser_get_console_messages") {
        const pageId = await this.resolvePageId(args.pageId);
        const entries = await this.runtime.getConsoleMessages(this.policy, {
          pageId,
          limit: clamp(Number(args.limit || 20), 1, 40),
        });
        return ok(toolCall, `Observed ${entries.length} recent browser console message(s).`, {
          ...receipt(false, sessionKind()),
          pageId,
          entries,
          proof: { eventCount: entries.length },
        });
      }
    } catch (error) {
      const failure = fail(toolCall, error instanceof Error ? error.message : String(error));
      const lease = missionLeasePayload((error as { browserMissionLease?: unknown })?.browserMissionLease);
      if (lease) {
        failure.data = {
          lane: "browser_native",
          missionLease: lease,
        };
      }
      return failure;
    }

    if (String(toolCall.name || "").startsWith("browser_")) {
        return fail(
          toolCall,
          `Binary Host has not implemented ${toolCall.name} yet. Prefer browser_search_and_open_best_result, browser_login_and_continue, browser_complete_form, browser_extract_and_decide, browser_recover_workflow, browser_list_pages, browser_get_active_page, browser_open_page, browser_navigate, browser_snapshot_dom, browser_query_elements, browser_click, browser_type, browser_press_keys, browser_scroll, browser_wait_for, browser_read_text, browser_read_form_state, browser_capture_page, browser_get_network_activity, or browser_get_console_messages for now.`,
          true
        );
      }

    return fail(toolCall, `Unsupported browser tool ${toolCall.name}.`, true);
  }
}
