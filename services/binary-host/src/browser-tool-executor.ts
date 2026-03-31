import { BrowserRuntimeController, type BrowserPageSummary } from "./browser-runtime.js";
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

function summarizePage(page: BrowserPageSummary | null | undefined): string {
  if (!page) return "No active browser page was resolved.";
  return `${page.title || "Untitled"} (${page.url || "about:blank"})`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function collectBrowserContext(input: {
  runtime: BrowserRuntimeController;
  policy: MachineAutonomyPolicy;
  pageLimit?: number;
  elementLimit?: number;
}): Promise<Record<string, unknown>> {
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

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};
    const decision = this.executionController?.decide(pendingToolCall);
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
        return ok(toolCall, `Observed ${pages.length} browser page(s).`, { ...receipt(false, "managed"), pages });
      }

      if (toolCall.name === "browser_get_active_page") {
        const page = await this.runtime.getActivePage(this.policy);
        return ok(toolCall, summarizePage(page), { ...receipt(false, "managed"), page });
      }

      if (toolCall.name === "browser_open_page") {
        const url = String(args.url || "").trim();
        if (!url) return fail(toolCall, "browser_open_page requires a URL.");
        const page = await this.runtime.openPage(this.policy, url);
        return ok(toolCall, `Opened ${summarizePage(page)}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_focus_page") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_focus_page requires pageId.");
        const page = await this.runtime.focusPage(this.policy, pageId);
        return ok(toolCall, `Focused ${summarizePage(page)}.`, {
          ...receipt(true, "existing"),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_navigate") {
        const pageId = String(args.pageId || "").trim();
        const url = String(args.url || "").trim();
        if (!pageId || !url) return fail(toolCall, "browser_navigate requires pageId and url.");
        const page = await this.runtime.navigate(this.policy, { pageId, url });
        return ok(toolCall, `Navigated to ${page.url}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          page,
          proof: { url: page.url, title: page.title },
        });
      }

      if (toolCall.name === "browser_snapshot_dom") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_snapshot_dom requires pageId.");
        const snapshot = await this.runtime.snapshotDom(this.policy, {
          pageId,
          query: typeof args.query === "string" ? args.query : undefined,
          limit: clamp(Number(args.limit || 16), 1, 40),
        });
        return ok(toolCall, `Captured DOM snapshot for ${snapshot.title || snapshot.url}.`, {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
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
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_query_elements requires pageId.");
        const result = await this.runtime.queryElements(this.policy, {
          pageId,
          query: typeof args.query === "string" ? args.query : undefined,
          limit: clamp(Number(args.limit || 12), 1, 24),
        });
        return ok(toolCall, `Found ${result.matches.length} browser element(s) on ${summarizePage(result.page)}.`, {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          page: result.page,
          matches: result.matches,
          proof: { pageId, matchCount: result.matches.length },
        });
      }

      if (toolCall.name === "browser_click") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_click requires pageId.");
        const result = await this.runtime.click(this.policy, {
          pageId,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.ok === false ? "Browser click did not find the requested element." : `Clicked on ${result.title || result.url || "the page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, ok: result.ok },
        });
      }

      if (toolCall.name === "browser_type") {
        const pageId = String(args.pageId || "").trim();
        const text = String(args.text || "");
        if (!pageId || !text) return fail(toolCall, "browser_type requires pageId and text.");
        const result = await this.runtime.type(this.policy, {
          pageId,
          text,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.ok === false ? "Browser typing did not reach a typeable element." : `Typed into ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, typed: result.typed },
        });
      }

      if (toolCall.name === "browser_press_keys") {
        const pageId = String(args.pageId || "").trim();
        const keys = Array.isArray(args.keys) ? args.keys.map((item) => String(item)) : [];
        if (!pageId || !keys.length) return fail(toolCall, "browser_press_keys requires pageId and keys.");
        const result = await this.runtime.pressKeys(this.policy, { pageId, keys });
        return ok(toolCall, `Pressed ${keys.join(" + ")} on ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, keys },
        });
      }

      if (toolCall.name === "browser_scroll") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_scroll requires pageId.");
        const result = await this.runtime.scroll(this.policy, {
          pageId,
          deltaY: Number(args.deltaY || 640),
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, `Scrolled ${result.title || result.url || "the active page"}.`, {
          ...receipt(decision?.executionVisibility === "visible_required", decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { url: result.url, title: result.title, scrollY: result.scrollY },
        });
      }

      if (toolCall.name === "browser_wait_for") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_wait_for requires pageId.");
        const result = await this.runtime.waitFor(this.policy, {
          pageId,
          durationMs: clamp(Number(args.durationMs || 2_000), 0, 30_000),
          selector: typeof args.selector === "string" ? args.selector : undefined,
          text: typeof args.text === "string" ? args.text : undefined,
          urlIncludes: typeof args.urlIncludes === "string" ? args.urlIncludes : undefined,
          titleIncludes: typeof args.titleIncludes === "string" ? args.titleIncludes : undefined,
        });
        return ok(toolCall, result.ok === true ? "Observed the requested browser condition." : "Browser condition did not become true before timeout.", {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { ok: result.ok, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_read_text") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_read_text requires pageId.");
        const result = await this.runtime.readText(this.policy, {
          pageId,
          elementId: typeof args.elementId === "string" ? args.elementId : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
        });
        return ok(toolCall, result.found === false ? "Browser text target was not found." : "Read text from the browser page.", {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { found: result.found, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_read_form_state") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_read_form_state requires pageId.");
        const result = await this.runtime.readFormState(this.policy, { pageId });
        const controls = Array.isArray(result.controls) ? result.controls : [];
        return ok(toolCall, `Read ${controls.length} form control(s) from the browser page.`, {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          ...result,
          proof: { controlCount: controls.length, url: result.url, title: result.title },
        });
      }

      if (toolCall.name === "browser_capture_page") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_capture_page requires pageId.");
        const result = await this.runtime.capturePage(this.policy, { pageId });
        return ok(toolCall, "Captured a browser screenshot for verification.", {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          snapshotId: result.snapshotId,
          mimeType: result.mimeType,
          byteLength: String(result.dataBase64 || "").length,
          proof: { snapshotId: result.snapshotId, mimeType: result.mimeType },
        });
      }

      if (toolCall.name === "browser_get_network_activity") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_get_network_activity requires pageId.");
        const entries = await this.runtime.getNetworkActivity(this.policy, {
          pageId,
          limit: clamp(Number(args.limit || 20), 1, 40),
        });
        return ok(toolCall, `Observed ${entries.length} recent browser network event(s).`, {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          entries,
          proof: { eventCount: entries.length },
        });
      }

      if (toolCall.name === "browser_get_console_messages") {
        const pageId = String(args.pageId || "").trim();
        if (!pageId) return fail(toolCall, "browser_get_console_messages requires pageId.");
        const entries = await this.runtime.getConsoleMessages(this.policy, {
          pageId,
          limit: clamp(Number(args.limit || 20), 1, 40),
        });
        return ok(toolCall, `Observed ${entries.length} recent browser console message(s).`, {
          ...receipt(false, decision?.managedSessionPreferred ? "managed" : "existing"),
          pageId,
          entries,
          proof: { eventCount: entries.length },
        });
      }
    } catch (error) {
      return fail(toolCall, error instanceof Error ? error.message : String(error));
    }

    if (String(toolCall.name || "").startsWith("browser_")) {
      return fail(
        toolCall,
        `Binary Host has not implemented ${toolCall.name} yet. Prefer browser_list_pages, browser_get_active_page, browser_open_page, browser_navigate, browser_snapshot_dom, browser_query_elements, browser_click, browser_type, browser_press_keys, browser_scroll, browser_wait_for, browser_read_text, browser_read_form_state, browser_capture_page, browser_get_network_activity, or browser_get_console_messages for now.`,
        true
      );
    }

    return fail(toolCall, `Unsupported browser tool ${toolCall.name}.`, true);
  }
}
