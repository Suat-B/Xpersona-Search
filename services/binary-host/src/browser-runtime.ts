import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { MachineAutonomyPolicy } from "./machine-autonomy.js";

type JsonRecord = Record<string, any>;
type BrowserFamily = "chrome" | "edge" | "brave" | "arc" | "chromium";
type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
};

type CdpTargetInfo = {
  id: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type BrowserSession = {
  browserId: string;
  browserName: string;
  mode: "attached" | "managed";
  endpoint: string;
  browserWsUrl: string;
  port?: number;
  executablePath?: string;
  userDataDir?: string;
  process?: ChildProcess;
};

type BrowserPageState = {
  pageId: string;
  targetId: string;
  lastActivatedAt: string;
  lastSnapshotId?: string;
  recentConsole: BrowserConsoleEntry[];
  recentNetwork: BrowserNetworkEntry[];
  worldModel: {
    checkpoints: string[];
    knownElementRefs: string[];
    recentNavigations: string[];
  };
};

type ElementRefRecord = {
  id: string;
  pageId: string;
  selector: string;
  label: string;
  tagName?: string;
  role?: string;
  text?: string;
};

type SnapshotRecord = {
  id: string;
  pageId: string;
  capturedAt: string;
  url: string;
  title: string;
  interactiveElements: BrowserElementSummary[];
  workflowCheckpoint: string;
};

type PendingCommand = {
  resolve: (value: JsonRecord) => void;
  reject: (reason?: unknown) => void;
};

const CDP_TIMEOUT_MS = 15_000;
const BROWSER_READY_TIMEOUT_MS = 15_000;
const MAX_CONSOLE_EVENTS = 60;
const MAX_NETWORK_EVENTS = 120;
const MAX_SNAPSHOTS = 80;
const CANDIDATE_DEBUG_PORTS = [9222, 9223, 9333, 9334, 9444];

const BROWSER_FAMILY_LABELS: Record<BrowserFamily, string> = {
  chrome: "Google Chrome",
  edge: "Microsoft Edge",
  brave: "Brave",
  arc: "Arc",
  chromium: "Chromium",
};

function nowIso(): string {
  return new Date().toISOString();
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function limitArray<T>(values: T[], maxItems: number): T[] {
  return values.slice(Math.max(0, values.length - maxItems));
}

function originFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeBrowserList(policy: MachineAutonomyPolicy): BrowserFamily[] {
  const preferred = Array.isArray(policy.allowedBrowsers) ? policy.allowedBrowsers : [];
  const mapped = preferred
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item): item is BrowserFamily =>
      item === "chrome" || item === "edge" || item === "brave" || item === "arc" || item === "chromium"
    );
  return mapped.length ? mapped : ["chrome", "edge", "brave", "arc", "chromium"];
}

function browserExecutableCandidates(family: BrowserFamily): string[] {
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LocalAppData || path.join(os.homedir(), "AppData", "Local");
    if (family === "chrome") {
      return [
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      ];
    }
    if (family === "edge") {
      return [
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      ];
    }
    if (family === "brave") {
      return [
        path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      ];
    }
    if (family === "arc") {
      return [
        path.join(localAppData, "Programs", "Arc", "Arc.exe"),
        path.join(programFiles, "Arc", "Arc.exe"),
      ];
    }
    return [
      path.join(programFiles, "Chromium", "Application", "chrome.exe"),
      path.join(programFilesX86, "Chromium", "Application", "chrome.exe"),
    ];
  }

  if (process.platform === "darwin") {
    const applications = "/Applications";
    const homeApplications = path.join(os.homedir(), "Applications");
    const appName =
      family === "chrome"
        ? "Google Chrome.app"
        : family === "edge"
          ? "Microsoft Edge.app"
          : family === "brave"
            ? "Brave Browser.app"
            : family === "arc"
              ? "Arc.app"
              : "Chromium.app";
    return [
      path.join(applications, appName, "Contents", "MacOS", appName.replace(".app", "")),
      path.join(homeApplications, appName, "Contents", "MacOS", appName.replace(".app", "")),
    ];
  }

  return [];
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function resolveExecutable(policy: MachineAutonomyPolicy): Promise<{ family: BrowserFamily; executablePath: string } | null> {
  for (const family of normalizeBrowserList(policy)) {
    for (const candidate of browserExecutableCandidates(family)) {
      if (await pathExists(candidate)) {
        return { family, executablePath: candidate };
      }
    }
  }
  return null;
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`CDP request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
}

async function waitForVersion(endpoint: string, timeoutMs: number): Promise<JsonRecord> {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await fetchJson<JsonRecord>(`${endpoint}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for browser debugger at ${endpoint}`);
}

async function discoverExistingSession(policy: MachineAutonomyPolicy): Promise<BrowserSession | null> {
  const explicitEndpoint = String(process.env.BINARY_BROWSER_CDP_URL || "").trim().replace(/\/+$/, "");
  const candidates = explicitEndpoint
    ? [explicitEndpoint]
    : CANDIDATE_DEBUG_PORTS.map((port) => `http://127.0.0.1:${port}`);
  const allowedFamilies = normalizeBrowserList(policy);

  for (const endpoint of candidates) {
    try {
      const version = await fetchJson<JsonRecord>(`${endpoint}/json/version`);
      const browserLabel = String(version.Browser || version.browser || "").trim();
      const browserNameLower = browserLabel.toLowerCase();
      const family = allowedFamilies.find((item) => browserNameLower.includes(item));
      if (!family && allowedFamilies.length) continue;
      const browserWsUrl = String(version.webSocketDebuggerUrl || "").trim();
      if (!browserWsUrl) continue;
      return {
        browserId: `attached:${endpoint}`,
        browserName: browserLabel || BROWSER_FAMILY_LABELS[family || allowedFamilies[0]],
        mode: "attached",
        endpoint,
        browserWsUrl,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function launchManagedBrowser(policy: MachineAutonomyPolicy): Promise<BrowserSession> {
  const resolved = await resolveExecutable(policy);
  if (!resolved) {
    throw new Error("Binary could not find a supported Chromium-family browser to launch.");
  }
  const port = await allocatePort();
  const userDataDir = path.join(os.tmpdir(), `binary-browser-profile-${port}`);
  await fs.mkdir(userDataDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "about:blank",
  ];
  const child = spawn(resolved.executablePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  const endpoint = `http://127.0.0.1:${port}`;
  const version = await waitForVersion(endpoint, BROWSER_READY_TIMEOUT_MS);
  const browserWsUrl = String(version.webSocketDebuggerUrl || "").trim();
  if (!browserWsUrl) {
    throw new Error("Managed browser did not expose a CDP websocket URL.");
  }
  return {
    browserId: `managed:${port}`,
    browserName: String(version.Browser || BROWSER_FAMILY_LABELS[resolved.family]).trim(),
    mode: "managed",
    endpoint,
    browserWsUrl,
    port,
    executablePath: resolved.executablePath,
    userDataDir,
    process: child,
  };
}

export type BrowserPageSummary = {
  id: string;
  title: string;
  url: string;
  origin: string;
  browserName: string;
  lane: "browser_native";
  active?: boolean;
};

export type BrowserElementSummary = {
  id: string;
  selector: string;
  label: string;
  text?: string;
  role?: string;
  tagName?: string;
  type?: string;
  href?: string;
  disabled?: boolean;
  visible?: boolean;
};

export type BrowserDomSnapshot = {
  snapshotId: string;
  pageId: string;
  url: string;
  title: string;
  interactiveElements: BrowserElementSummary[];
  workflowCheckpoint: string;
};

export type BrowserConsoleEntry = {
  at: string;
  level: string;
  text: string;
};

export type BrowserNetworkEntry = {
  at: string;
  phase: "request" | "response" | "failed";
  url: string;
  method?: string;
  status?: number;
  resourceType?: string;
  errorText?: string;
};

export type BrowserContextState = {
  mode: "unavailable" | "attached" | "managed";
  browserName?: string;
  activePage?: {
    id: string;
    title: string;
    url: string;
    origin: string;
    browserName: string;
  };
  openPages?: Array<{
    id: string;
    title: string;
    url: string;
    origin: string;
    browserName: string;
  }>;
  recentSnapshots?: Array<{
    snapshotId: string;
    pageId: string;
    url: string;
    title: string;
    capturedAt: string;
  }>;
  visibleInteractiveElements?: Array<{
    id: string;
    selector: string;
    label: string;
    role?: string;
    tagName?: string;
  }>;
  recentNetworkActivity?: BrowserNetworkEntry[];
  recentConsoleMessages?: BrowserConsoleEntry[];
  sessionHint?: {
    attachedToExistingSession: boolean;
    authenticatedLikely: boolean;
  };
};

class CdpConnection {
  private socket: WebSocketLike | null = null;
  private readonly pending = new Map<number, PendingCommand>();
  private nextId = 1;
  private readyPromise: Promise<void> | null = null;
  private readonly eventListeners = new Set<(method: string, params: JsonRecord, sessionId?: string) => void>();

  constructor(private readonly url: string) {}

  async ensureOpen(): Promise<void> {
    if (this.socket && this.socket.readyState === 1) return;
    if (this.readyPromise) return await this.readyPromise;

    const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
    if (!WebSocketCtor) {
      throw new Error("WebSocket support is unavailable in this Node runtime.");
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocketCtor(this.url);
      this.socket = socket;
      socket.onopen = () => {
        this.readyPromise = null;
        resolve();
      };
      socket.onerror = (event) => {
        this.readyPromise = null;
        reject(event instanceof Error ? event : new Error(`Failed to connect to ${this.url}`));
      };
      socket.onclose = () => {
        this.readyPromise = null;
        this.socket = null;
        for (const [id, pending] of this.pending) {
          this.pending.delete(id);
          pending.reject(new Error(`CDP connection closed for ${this.url}`));
        }
      };
      socket.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : String(event.data || "");
        let parsed: JsonRecord;
        try {
          parsed = JSON.parse(raw) as JsonRecord;
        } catch {
          return;
        }
        if (typeof parsed.id === "number") {
          const pending = this.pending.get(parsed.id);
          if (!pending) return;
          this.pending.delete(parsed.id);
          if (parsed.error) pending.reject(new Error(String((parsed.error as JsonRecord).message || "CDP command failed")));
          else pending.resolve((parsed.result as JsonRecord) || {});
          return;
        }
        if (typeof parsed.method === "string") {
          for (const listener of this.eventListeners) {
            listener(parsed.method, (parsed.params as JsonRecord) || {}, typeof parsed.sessionId === "string" ? parsed.sessionId : undefined);
          }
        }
      };
    });
    await this.readyPromise;
  }

  async command(method: string, params?: JsonRecord, sessionId?: string): Promise<JsonRecord> {
    await this.ensureOpen();
    if (!this.socket) throw new Error(`CDP socket unavailable for ${this.url}`);
    const id = this.nextId++;
    const payload: JsonRecord = { id, method, ...(params ? { params } : {}), ...(sessionId ? { sessionId } : {}) };
    return await new Promise<JsonRecord>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, CDP_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
      });
      this.socket?.send(JSON.stringify(payload));
    });
  }

  onEvent(listener: (method: string, params: JsonRecord, sessionId?: string) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.readyPromise = null;
  }
}

function buildElementLookupScript(input: { query?: string; limit: number }): string {
  return `(() => {
    const query = ${JSON.stringify(String(input.query || "").trim().toLowerCase())};
    const limit = ${Math.max(1, Math.min(input.limit, 40))};
    const tags = "a,button,input,textarea,select,label,summary,[role=button],[role=link],[tabindex]";
    const elements = Array.from(document.querySelectorAll(tags));
    function textOf(el) {
      return [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.innerText, el.textContent, el.getAttribute("value")]
        .filter(Boolean)
        .map((item) => String(item))
        .join(" ")
        .replace(/\\s+/g, " ")
        .trim();
    }
    function cssPath(el) {
      if (!(el instanceof Element)) return "";
      if (el.id) return "#" + CSS.escape(el.id);
      const dataTestId = el.getAttribute("data-testid");
      if (dataTestId) return '[data-testid="' + String(dataTestId).replace(/"/g, '\\"') + '"]';
      const parts = [];
      let current = el;
      while (current && current.nodeType === 1 && parts.length < 6) {
        let part = current.localName;
        if (!part) break;
        const name = current.getAttribute("name");
        if (name) {
          part += '[name="' + String(name).replace(/"/g, '\\"') + '"]';
          parts.unshift(part);
          break;
        }
        const parent = current.parentElement;
        if (!parent) {
          parts.unshift(part);
          break;
        }
        const siblings = Array.from(parent.children).filter((item) => item.localName === current.localName);
        if (siblings.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    }
    function roleOf(el) {
      return el.getAttribute("role") || el.tagName.toLowerCase();
    }
    const matches = [];
    for (const el of elements) {
      const label = textOf(el);
      const haystack = (label + " " + cssPath(el) + " " + roleOf(el)).toLowerCase();
      if (query && !haystack.includes(query)) continue;
      const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : { width: 0, height: 0 };
      matches.push({
        selector: cssPath(el),
        label: label || el.tagName.toLowerCase(),
        text: label || "",
        role: roleOf(el),
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        href: el.getAttribute("href") || "",
        disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
        visible: rect.width > 0 && rect.height > 0,
      });
      if (matches.length >= limit) break;
    }
    return { url: location.href, title: document.title || "", matches };
  })()`;
}

function buildFormStateScript(): string {
  return `(() => {
    const controls = Array.from(document.querySelectorAll("input, textarea, select"));
    function labelFor(el) {
      const id = el.getAttribute("id");
      if (id) {
        const explicit = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (explicit) return explicit.textContent || "";
      }
      const parentLabel = el.closest("label");
      return parentLabel ? parentLabel.textContent || "" : "";
    }
    return {
      url: location.href,
      title: document.title || "",
      controls: controls.slice(0, 40).map((el) => ({
        selector: (() => {
          if (el.id) return "#" + CSS.escape(el.id);
          const name = el.getAttribute("name");
          if (name) return el.tagName.toLowerCase() + '[name="' + String(name).replace(/"/g, '\\"') + '"]';
          return el.tagName.toLowerCase();
        })(),
        label: String(labelFor(el)).replace(/\\s+/g, " ").trim(),
        name: el.getAttribute("name") || "",
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        value: "value" in el ? String(el.value ?? "") : "",
        checked: Boolean("checked" in el ? el.checked : false),
        disabled: Boolean(el.disabled),
      })),
    };
  })()`;
}

function buildReadTextScript(selector: string): string {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { found: false, text: "", url: location.href, title: document.title || "" };
    return {
      found: true,
      text: String(element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim(),
      url: location.href,
      title: document.title || "",
    };
  })()`;
}

function buildClickScript(selector: string): string {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: "Element not found", url: location.href, title: document.title || "" };
    element.scrollIntoView({ block: "center", inline: "center" });
    if (typeof element.focus === "function") element.focus();
    if (typeof element.click === "function") element.click();
    else element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return { ok: true, url: location.href, title: document.title || "", text: String(element.innerText || element.textContent || "").trim() };
  })()`;
}

function buildTypeScript(selector: string, text: string): string {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: "Element not found", url: location.href, title: document.title || "" };
    element.scrollIntoView({ block: "center", inline: "center" });
    if (typeof element.focus === "function") element.focus();
    if ("value" in element) {
      element.value = ${JSON.stringify(text)};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, typed: ${JSON.stringify(text)}.length, url: location.href, title: document.title || "" };
    }
    return { ok: false, reason: "Target element is not typeable", url: location.href, title: document.title || "" };
  })()`;
}

function buildKeypressScript(keys: string[]): string {
  return `(() => {
    const target = document.activeElement || document.body;
    for (const key of ${JSON.stringify(keys)}) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      if (key === "Enter" && target instanceof HTMLElement && typeof target.click === "function") target.click();
    }
    return { ok: true, keys: ${JSON.stringify(keys)}, url: location.href, title: document.title || "" };
  })()`;
}

function buildScrollScript(deltaY: number, selector?: string): string {
  return `(() => {
    const target = ${JSON.stringify(selector || "")} ? document.querySelector(${JSON.stringify(selector || "")}) : null;
    if (target && typeof target.scrollBy === "function") target.scrollBy({ top: ${Math.trunc(deltaY)}, left: 0, behavior: "instant" });
    else window.scrollBy({ top: ${Math.trunc(deltaY)}, left: 0, behavior: "instant" });
    return { ok: true, scrollY: window.scrollY, url: location.href, title: document.title || "" };
  })()`;
}

function buildWaitConditionScript(input: {
  selector?: string;
  text?: string;
  urlIncludes?: string;
  titleIncludes?: string;
}): string {
  return `(() => {
    const selectorOk = !${JSON.stringify(input.selector || "")} || Boolean(document.querySelector(${JSON.stringify(input.selector || "")}));
    const bodyText = String(document.body?.innerText || document.body?.textContent || "").toLowerCase();
    const textOk = !${JSON.stringify((input.text || "").toLowerCase())} || bodyText.includes(${JSON.stringify((input.text || "").toLowerCase())});
    const urlOk = !${JSON.stringify(input.urlIncludes || "")} || location.href.includes(${JSON.stringify(input.urlIncludes || "")});
    const titleOk = !${JSON.stringify((input.titleIncludes || "").toLowerCase())} || String(document.title || "").toLowerCase().includes(${JSON.stringify((input.titleIncludes || "").toLowerCase())});
    return { ok: selectorOk && textOk && urlOk && titleOk, selectorOk, textOk, urlOk, titleOk, url: location.href, title: document.title || "" };
  })()`;
}

export class BrowserRuntimeController {
  private session: BrowserSession | null = null;
  private browserConnection: CdpConnection | null = null;
  private readonly pageStates = new Map<string, BrowserPageState>();
  private readonly pageSessionIds = new Map<string, string>();
  private readonly elementRefs = new Map<string, ElementRefRecord>();
  private readonly snapshots = new Map<string, SnapshotRecord>();
  private lastActivePageId: string | null = null;

  async getStatus(policy: MachineAutonomyPolicy): Promise<JsonRecord> {
    const pages = policy.allowBrowserNative ? await this.listPages(policy).catch(() => []) : [];
    return {
      enabled: policy.enabled,
      allowBrowserNative: policy.allowBrowserNative,
      browserAttachMode: policy.browserAttachMode,
      allowedBrowsers: normalizeBrowserList(policy),
      mode: this.session?.mode || "unavailable",
      browserName: this.session?.browserName || null,
      endpoint: this.session?.endpoint || null,
      pageCount: pages.length,
      activePageId: this.lastActivePageId,
    };
  }

  async collectContext(
    policy: MachineAutonomyPolicy,
    input: { pageLimit?: number; elementLimit?: number } = {}
  ): Promise<BrowserContextState> {
    if (!policy.enabled || !policy.allowBrowserNative) {
      return { mode: "unavailable" };
    }
    const pages = await this.listPages(policy).catch(() => []);
    const activePage = (await this.getActivePage(policy).catch(() => null)) || pages[0] || null;
    let snapshot: BrowserDomSnapshot | null = null;
    if (activePage) {
      snapshot = await this.snapshotDom(policy, { pageId: activePage.id, limit: input.elementLimit ?? 12 }).catch(() => null);
    }
    const pageState = activePage ? this.pageStates.get(activePage.id) : null;
    return {
      mode: this.session?.mode || "unavailable",
      browserName: this.session?.browserName || undefined,
      ...(activePage
        ? {
            activePage: {
              id: activePage.id,
              title: activePage.title,
              url: activePage.url,
              origin: activePage.origin,
              browserName: activePage.browserName,
            },
          }
        : {}),
      openPages: pages.slice(0, input.pageLimit ?? 8).map((page) => ({
        id: page.id,
        title: page.title,
        url: page.url,
        origin: page.origin,
        browserName: page.browserName,
      })),
      recentSnapshots: Array.from(this.snapshots.values())
        .filter((item) => !activePage || item.pageId === activePage.id)
        .slice(-6)
        .reverse()
        .map((item) => ({
          snapshotId: item.id,
          pageId: item.pageId,
          url: item.url,
          title: item.title,
          capturedAt: item.capturedAt,
        })),
      visibleInteractiveElements: snapshot?.interactiveElements.slice(0, input.elementLimit ?? 12).map((item) => ({
        id: item.id,
        selector: item.selector,
        label: item.label,
        role: item.role,
        tagName: item.tagName,
      })),
      recentNetworkActivity: limitArray(pageState?.recentNetwork || [], 10),
      recentConsoleMessages: limitArray(pageState?.recentConsole || [], 8),
      sessionHint: {
        attachedToExistingSession: this.session?.mode === "attached",
        authenticatedLikely: Boolean(activePage?.url && !/about:blank|chrome:\/\//i.test(activePage.url)),
      },
    };
  }

  async listPages(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary[]> {
    const session = await this.ensureSession(policy, false);
    if (!session) return [];
    const targets = await fetchJson<CdpTargetInfo[]>(`${session.endpoint}/json/list`);
    const pages = targets
      .filter((target) => target.type === "page" && target.id)
      .map((target) => ({
        id: String(target.id),
        title: String(target.title || "Untitled page"),
        url: String(target.url || "about:blank"),
        origin: originFromUrl(String(target.url || "")),
        browserName: session.browserName,
        lane: "browser_native" as const,
        active: this.lastActivePageId === String(target.id),
      }));
    if (!this.lastActivePageId && pages.length) {
      this.lastActivePageId = pages[0].id;
    }
    for (const page of pages) {
      this.ensurePageState(page.id);
    }
    return pages;
  }

  async getActivePage(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary | null> {
    const pages = await this.listPages(policy);
    return pages.find((page) => page.id === this.lastActivePageId) || pages[0] || null;
  }

  async openPage(policy: MachineAutonomyPolicy, url: string): Promise<BrowserPageSummary> {
    this.assertUrlAllowed(policy, url);
    const session = await this.ensureSession(policy, true);
    if (!session) throw new Error("Binary could not initialize a browser-native runtime.");
    const browserConnection = await this.ensureBrowserConnection(session);
    const result = await browserConnection.command("Target.createTarget", { url });
    const targetId = String(result.targetId || "");
    if (!targetId) throw new Error("Browser runtime failed to create a target page.");
    await sleep(300);
    const page = (await this.listPages(policy)).find((item) => item.id === targetId);
    if (!page) {
      throw new Error("Browser runtime created a page but could not resolve it in the target list.");
    }
    this.lastActivePageId = page.id;
    this.ensurePageState(page.id).worldModel.recentNavigations.push(url);
    return page;
  }

  async focusPage(policy: MachineAutonomyPolicy, pageId: string): Promise<BrowserPageSummary> {
    const session = await this.ensureSession(policy, false);
    if (!session) throw new Error("Binary could not connect to a browser-native session.");
    const browserConnection = await this.ensureBrowserConnection(session);
    await browserConnection.command("Target.activateTarget", { targetId: pageId });
    this.lastActivePageId = pageId;
    this.ensurePageState(pageId).lastActivatedAt = nowIso();
    const page = (await this.listPages(policy)).find((item) => item.id === pageId);
    if (!page) throw new Error(`Browser page ${pageId} was not found.`);
    return { ...page, active: true };
  }

  async navigate(policy: MachineAutonomyPolicy, input: { pageId: string; url: string }): Promise<BrowserPageSummary> {
    this.assertUrlAllowed(policy, input.url);
    const session = await this.ensurePageSession(policy, input.pageId);
    await this.sendPageCommand("Page.navigate", { url: input.url }, session.sessionId);
    await sleep(350);
    this.lastActivePageId = input.pageId;
    this.ensurePageState(input.pageId).worldModel.recentNavigations.push(input.url);
    const page = (await this.listPages(policy)).find((item) => item.id === input.pageId);
    if (!page) throw new Error(`Browser page ${input.pageId} was not found after navigation.`);
    return page;
  }

  async snapshotDom(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; query?: string; limit?: number }
  ): Promise<BrowserDomSnapshot> {
    const session = await this.ensurePageSession(policy, input.pageId);
    const raw = await this.evaluate<JsonRecord>(
      session.sessionId,
      buildElementLookupScript({ query: input.query, limit: input.limit ?? 20 })
    );
    const url = String(raw.url || "");
    const title = String(raw.title || "");
    const interactiveElements = this.storeElementRefs(
      input.pageId,
      Array.isArray(raw.matches) ? (raw.matches as JsonRecord[]) : []
    );
    const workflowCheckpoint = compactWhitespace(
      [title, url, interactiveElements[0]?.label || "", interactiveElements[1]?.label || ""].filter(Boolean).join(" | ")
    );
    const snapshotId = `browser_snapshot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: SnapshotRecord = {
      id: snapshotId,
      pageId: input.pageId,
      capturedAt: nowIso(),
      url,
      title,
      interactiveElements,
      workflowCheckpoint,
    };
    this.snapshots.set(snapshotId, snapshot);
    this.pruneSnapshots();
    const state = this.ensurePageState(input.pageId);
    state.lastSnapshotId = snapshotId;
    state.worldModel.checkpoints.push(workflowCheckpoint);
    state.worldModel.knownElementRefs = interactiveElements.map((item) => item.id);
    return {
      snapshotId,
      pageId: input.pageId,
      url,
      title,
      interactiveElements,
      workflowCheckpoint,
    };
  }

  async queryElements(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; query?: string; limit?: number }
  ): Promise<{ page: BrowserPageSummary | null; matches: BrowserElementSummary[] }> {
    const snapshot = await this.snapshotDom(policy, input);
    const page = (await this.listPages(policy)).find((item) => item.id === input.pageId) || null;
    return { page, matches: snapshot.interactiveElements };
  }

  async readText(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; elementId?: string; selector?: string }
  ): Promise<JsonRecord> {
    const selector = this.resolveSelector(input.pageId, input.elementId, input.selector);
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildReadTextScript(selector));
  }

  async readFormState(policy: MachineAutonomyPolicy, input: { pageId: string }): Promise<JsonRecord> {
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildFormStateScript());
  }

  async click(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; elementId?: string; selector?: string }
  ): Promise<JsonRecord> {
    const selector = this.resolveSelector(input.pageId, input.elementId, input.selector);
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildClickScript(selector));
  }

  async type(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; text: string; elementId?: string; selector?: string }
  ): Promise<JsonRecord> {
    const selector = this.resolveSelector(input.pageId, input.elementId, input.selector);
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildTypeScript(selector, input.text));
  }

  async pressKeys(policy: MachineAutonomyPolicy, input: { pageId: string; keys: string[] }): Promise<JsonRecord> {
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildKeypressScript(input.keys));
  }

  async scroll(
    policy: MachineAutonomyPolicy,
    input: { pageId: string; deltaY?: number; elementId?: string; selector?: string }
  ): Promise<JsonRecord> {
    const selector =
      input.elementId || input.selector ? this.resolveSelector(input.pageId, input.elementId, input.selector) : undefined;
    const session = await this.ensurePageSession(policy, input.pageId);
    return await this.evaluate<JsonRecord>(session.sessionId, buildScrollScript(input.deltaY || 640, selector));
  }

  async waitFor(
    policy: MachineAutonomyPolicy,
    input: {
      pageId: string;
      durationMs?: number;
      selector?: string;
      text?: string;
      urlIncludes?: string;
      titleIncludes?: string;
    }
  ): Promise<JsonRecord> {
    const session = await this.ensurePageSession(policy, input.pageId);
    const timeoutMs = Math.max(0, Math.min(Number(input.durationMs || 0), 30_000));
    const startedAt = Date.now();
    do {
      const probe = await this.evaluate<JsonRecord>(
        session.sessionId,
        buildWaitConditionScript({
          selector: input.selector,
          text: input.text,
          urlIncludes: input.urlIncludes,
          titleIncludes: input.titleIncludes,
        })
      );
      if (probe.ok === true) {
        return { ...probe, waitedMs: Date.now() - startedAt };
      }
      await sleep(200);
    } while (Date.now() - startedAt < timeoutMs);
    return {
      ok: false,
      reason: "Timed out waiting for browser condition.",
      waitedMs: Date.now() - startedAt,
    };
  }

  async capturePage(policy: MachineAutonomyPolicy, input: { pageId: string }): Promise<JsonRecord> {
    const session = await this.ensurePageSession(policy, input.pageId);
    const result = await this.sendPageCommand("Page.captureScreenshot", { format: "png" }, session.sessionId);
    return {
      snapshotId: `page_capture_${Date.now().toString(36)}`,
      mimeType: "image/png",
      dataBase64: String(result.data || ""),
    };
  }

  async getNetworkActivity(policy: MachineAutonomyPolicy, input: { pageId: string; limit?: number }): Promise<BrowserNetworkEntry[]> {
    await this.ensurePageSession(policy, input.pageId);
    return limitArray(this.ensurePageState(input.pageId).recentNetwork, Math.max(1, Math.min(input.limit || 20, 50)));
  }

  async getConsoleMessages(policy: MachineAutonomyPolicy, input: { pageId: string; limit?: number }): Promise<BrowserConsoleEntry[]> {
    await this.ensurePageSession(policy, input.pageId);
    return limitArray(this.ensurePageState(input.pageId).recentConsole, Math.max(1, Math.min(input.limit || 20, 50)));
  }

  private async ensureSession(policy: MachineAutonomyPolicy, allowManagedLaunch: boolean): Promise<BrowserSession | null> {
    if (!policy.enabled || !policy.allowBrowserNative) return null;
    if (this.session) {
      try {
        await waitForVersion(this.session.endpoint, 1_500);
        return this.session;
      } catch {
        this.browserConnection?.close();
        this.browserConnection = null;
        this.session = null;
      }
    }

    if (policy.browserAttachMode !== "managed_only") {
      const attached = await discoverExistingSession(policy);
      if (attached) {
        this.session = attached;
        return attached;
      }
    }

    if (!allowManagedLaunch) return null;
    this.session = await launchManagedBrowser(policy);
    return this.session;
  }

  private async ensureBrowserConnection(session: BrowserSession): Promise<CdpConnection> {
    if (!this.browserConnection) {
      this.browserConnection = new CdpConnection(session.browserWsUrl);
    }
    await this.browserConnection.ensureOpen();
    if (!(this as unknown as { browserEventsAttached?: boolean }).browserEventsAttached) {
      this.browserConnection.onEvent((method, params, sessionId) => {
        if (!sessionId) return;
        const pageId = Array.from(this.pageSessionIds.entries()).find((entry) => entry[1] === sessionId)?.[0];
        if (!pageId) return;
        const pageState = this.ensurePageState(pageId);
        if (method === "Runtime.consoleAPICalled") {
          const args = Array.isArray(params.args) ? params.args : [];
          const text = args
            .map((item) => {
              const record = item as JsonRecord;
              return compactWhitespace(String(record.value || record.description || ""));
            })
            .filter(Boolean)
            .join(" ");
          pageState.recentConsole = limitArray(
            [...pageState.recentConsole, { at: nowIso(), level: String(params.type || "log"), text }],
            MAX_CONSOLE_EVENTS
          );
        }
        if (method === "Runtime.exceptionThrown") {
          const details = params.exceptionDetails as JsonRecord | undefined;
          pageState.recentConsole = limitArray(
            [
              ...pageState.recentConsole,
              {
                at: nowIso(),
                level: "exception",
                text: compactWhitespace(String(details?.text || (details?.exception as JsonRecord | undefined)?.description || "Unhandled exception")),
              },
            ],
            MAX_CONSOLE_EVENTS
          );
        }
        if (method === "Network.requestWillBeSent") {
          pageState.recentNetwork = limitArray(
            [
              ...pageState.recentNetwork,
              {
                at: nowIso(),
                phase: "request",
                url: String((params.request as JsonRecord | undefined)?.url || ""),
                method: String((params.request as JsonRecord | undefined)?.method || ""),
                resourceType: String(params.type || ""),
              },
            ],
            MAX_NETWORK_EVENTS
          );
        }
        if (method === "Network.responseReceived") {
          pageState.recentNetwork = limitArray(
            [
              ...pageState.recentNetwork,
              {
                at: nowIso(),
                phase: "response",
                url: String((params.response as JsonRecord | undefined)?.url || ""),
                status: Number((params.response as JsonRecord | undefined)?.status || 0) || undefined,
                resourceType: String(params.type || ""),
              },
            ],
            MAX_NETWORK_EVENTS
          );
        }
        if (method === "Network.loadingFailed") {
          pageState.recentNetwork = limitArray(
            [
              ...pageState.recentNetwork,
              {
                at: nowIso(),
                phase: "failed",
                url: String(params.requestId || ""),
                errorText: String(params.errorText || "Network request failed"),
              },
            ],
            MAX_NETWORK_EVENTS
          );
        }
      });
      (this as unknown as { browserEventsAttached?: boolean }).browserEventsAttached = true;
    }
    return this.browserConnection;
  }

  private async ensurePageSession(
    policy: MachineAutonomyPolicy,
    pageId: string
  ): Promise<{ sessionId: string; page: BrowserPageSummary }> {
    const session = await this.ensureSession(policy, true);
    if (!session) throw new Error("Binary could not connect to a browser-native session.");
    const page = (await this.listPages(policy)).find((item) => item.id === pageId);
    if (!page) throw new Error(`Browser page ${pageId} was not found.`);
    if (!this.pageSessionIds.has(pageId)) {
      const browserConnection = await this.ensureBrowserConnection(session);
      const attached = await browserConnection.command("Target.attachToTarget", { targetId: pageId, flatten: true });
      const sessionId = String(attached.sessionId || "");
      if (!sessionId) throw new Error(`Failed to attach to browser page ${pageId}.`);
      this.pageSessionIds.set(pageId, sessionId);
      await this.sendPageCommand("Page.enable", {}, sessionId);
      await this.sendPageCommand("Runtime.enable", {}, sessionId);
      await this.sendPageCommand("Network.enable", {}, sessionId);
      this.ensurePageState(pageId);
    }
    this.lastActivePageId = pageId;
    this.ensurePageState(pageId).lastActivatedAt = nowIso();
    return { sessionId: this.pageSessionIds.get(pageId) as string, page };
  }

  private ensurePageState(pageId: string): BrowserPageState {
    const existing = this.pageStates.get(pageId);
    if (existing) return existing;
    const next: BrowserPageState = {
      pageId,
      targetId: pageId,
      lastActivatedAt: nowIso(),
      recentConsole: [],
      recentNetwork: [],
      worldModel: {
        checkpoints: [],
        knownElementRefs: [],
        recentNavigations: [],
      },
    };
    this.pageStates.set(pageId, next);
    return next;
  }

  private async sendPageCommand(method: string, params: JsonRecord, sessionId: string): Promise<JsonRecord> {
    if (!this.browserConnection) throw new Error("Browser connection has not been initialized.");
    return await this.browserConnection.command(method, params, sessionId);
  }

  private async evaluate<T extends JsonRecord | unknown[]>(sessionId: string, expression: string): Promise<T> {
    const result = await this.sendPageCommand(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId
    );
    return ((result.result as JsonRecord | undefined)?.value ?? null) as T;
  }

  private storeElementRefs(pageId: string, rawMatches: JsonRecord[]): BrowserElementSummary[] {
    return rawMatches
      .filter((item) => String(item.selector || "").trim())
      .map((item, index) => {
        const id = `element_${pageId}_${Date.now().toString(36)}_${index.toString(36)}`;
        const record: ElementRefRecord = {
          id,
          pageId,
          selector: String(item.selector || ""),
          label: compactWhitespace(String(item.label || item.text || item.selector || "element")),
          tagName: String(item.tagName || "") || undefined,
          role: String(item.role || "") || undefined,
          text: compactWhitespace(String(item.text || "")) || undefined,
        };
        this.elementRefs.set(id, record);
        return {
          id,
          selector: record.selector,
          label: record.label,
          text: record.text,
          role: record.role,
          tagName: record.tagName,
          type: String(item.type || "") || undefined,
          href: String(item.href || "") || undefined,
          disabled: item.disabled === true,
          visible: item.visible !== false,
        };
      });
  }

  private resolveSelector(pageId: string, elementId?: string, selector?: string): string {
    const directSelector = String(selector || "").trim();
    if (directSelector) return directSelector;
    const record = elementId ? this.elementRefs.get(elementId) : null;
    if (record && record.pageId === pageId) return record.selector;
    throw new Error("Browser action requires an elementId or selector.");
  }

  private assertUrlAllowed(policy: MachineAutonomyPolicy, url: string): void {
    const domain = safeDomain(url);
    if (!domain) return;
    if (Array.isArray(policy.blockedDomains) && policy.blockedDomains.some((item) => domain === item || domain.endsWith(`.${item}`))) {
      throw new Error(`Browser autonomy blocked navigation to ${domain}.`);
    }
  }

  private pruneSnapshots(): void {
    const snapshots = Array.from(this.snapshots.values()).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
    while (snapshots.length > MAX_SNAPSHOTS) {
      const removed = snapshots.shift();
      if (removed) this.snapshots.delete(removed.id);
    }
  }
}
