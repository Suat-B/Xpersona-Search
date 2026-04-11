import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
const CDP_TIMEOUT_MS = 8_000;
const BROWSER_READY_TIMEOUT_MS = 6_000;
const MAX_CONSOLE_EVENTS = 60;
const MAX_NETWORK_EVENTS = 120;
const MAX_SNAPSHOTS = 80;
const MAX_ACTION_LOOP_HISTORY = 120;
const BROWSER_OPEN_LOOP_MAX_ATTEMPTS = 3;
const BROWSER_MISSION_LOOP_MAX_ATTEMPTS = 3;
const BROWSER_MUTATION_LOOP_MAX_ATTEMPTS = 4;
const CANDIDATE_DEBUG_PORTS = [9222, 9223, 9333, 9334, 9444];
const BROWSER_FAMILY_LABELS = {
    chrome: "Google Chrome",
    edge: "Microsoft Edge",
    brave: "Brave",
    arc: "Arc",
    chromium: "Chromium",
};
function nowIso() {
    return new Date().toISOString();
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function limitArray(values, maxItems) {
    return values.slice(Math.max(0, values.length - maxItems));
}
function originFromUrl(url) {
    try {
        return new URL(url).origin;
    }
    catch {
        return "";
    }
}
function normalizeOriginLike(value) {
    const compact = compactWhitespace(value).toLowerCase();
    if (!compact)
        return "";
    if (/^https?:\/\//i.test(compact))
        return originFromUrl(compact) || compact;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i.test(compact))
        return `https://${compact}`;
    return compact;
}
function safeDomain(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}
function compactTerms(value) {
    return compactWhitespace(value)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}
function pageLikelyMatchesQuery(input, query) {
    const normalizedQuery = stripBrowserSiteHintFromQuery(query, input.url || "");
    const terms = compactTerms(normalizedQuery).filter((term) => term.length >= 3);
    if (!terms.length)
        return false;
    const haystack = compactWhitespace(`${input.title || ""} ${input.url || ""}`).toLowerCase();
    if (!haystack)
        return false;
    const matched = terms.filter((term) => haystack.includes(term)).length;
    if (terms.length === 1)
        return matched >= 1;
    return matched >= Math.min(2, terms.length);
}
function parseEnvBool(value, defaultValue) {
    const normalized = compactWhitespace(value || "").toLowerCase();
    if (!normalized)
        return defaultValue;
    if (["1", "true", "yes", "on"].includes(normalized))
        return true;
    if (["0", "false", "no", "off"].includes(normalized))
        return false;
    return defaultValue;
}
export function buildBrowserSiteSearchUrl(baseUrl, query) {
    const compactQuery = compactWhitespace(query);
    if (!compactQuery)
        return null;
    let parsed;
    try {
        parsed = new URL(baseUrl);
    }
    catch {
        return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com")) {
        return `https://www.youtube.com/results?search_query=${encodeURIComponent(compactQuery)}`;
    }
    if (host === "www.google.com" || host === "google.com") {
        return `https://www.google.com/search?q=${encodeURIComponent(compactQuery)}`;
    }
    if (host.includes("amazon.")) {
        return `${parsed.protocol}//${parsed.host}/s?k=${encodeURIComponent(compactQuery)}`;
    }
    if (host === "github.com" || host.endsWith(".github.com")) {
        return `https://github.com/search?q=${encodeURIComponent(compactQuery)}`;
    }
    if (host.endsWith("wikipedia.org")) {
        return `${parsed.protocol}//${parsed.host}/w/index.php?search=${encodeURIComponent(compactQuery)}`;
    }
    return null;
}
export function inferBrowserMissionUrlFromQuery(query) {
    const normalized = compactWhitespace(query).toLowerCase();
    if (!normalized)
        return null;
    if (/\byoutube\b/.test(normalized))
        return "https://www.youtube.com/";
    if (/\bgoogle\b/.test(normalized))
        return "https://www.google.com/";
    if (/\bamazon\b/.test(normalized))
        return "https://www.amazon.com/";
    if (/\bgithub\b/.test(normalized))
        return "https://github.com/";
    if (/\bwikipedia\b/.test(normalized))
        return "https://www.wikipedia.org/";
    return null;
}
export function stripBrowserSiteHintFromQuery(query, baseUrl) {
    const compactQuery = compactWhitespace(query);
    if (!compactQuery)
        return "";
    const domain = safeDomain(baseUrl || "");
    let normalized = compactQuery;
    if (domain.includes("youtube.com"))
        normalized = normalized.replace(/\b(?:on\s+)?youtube\b/gi, "");
    if (domain === "www.google.com" || domain === "google.com")
        normalized = normalized.replace(/\b(?:on\s+)?google\b/gi, "");
    if (domain.includes("amazon."))
        normalized = normalized.replace(/\b(?:on\s+)?amazon\b/gi, "");
    if (domain === "github.com" || domain.endsWith(".github.com"))
        normalized = normalized.replace(/\b(?:on\s+)?github\b/gi, "");
    if (domain.endsWith("wikipedia.org"))
        normalized = normalized.replace(/\b(?:on\s+)?wikipedia\b/gi, "");
    return compactWhitespace(normalized) || compactQuery;
}
function truthyBrowserValue(value) {
    return /^(true|1|yes|on|checked)$/i.test(compactWhitespace(value));
}
function scoreBrowserFormControl(control, field) {
    if (!control.selector || control.disabled)
        return -1000;
    const haystack = compactWhitespace([control.label, control.name, control.type, control.selector].join(" ")).toLowerCase();
    let score = 0;
    const label = compactWhitespace(field.label || "").toLowerCase();
    const name = compactWhitespace(field.name || "").toLowerCase();
    const query = compactWhitespace(field.query || "").toLowerCase();
    const kind = compactWhitespace(field.kind || "").toLowerCase();
    const controlType = compactWhitespace(control.type || "").toLowerCase();
    if (label) {
        if (haystack === label)
            score += 180;
        if (haystack.includes(label))
            score += 110;
        score += compactTerms(label).reduce((total, term) => total + (haystack.includes(term) ? 16 : 0), 0);
    }
    if (name) {
        if (compactWhitespace(control.name).toLowerCase() === name)
            score += 170;
        if (haystack.includes(name))
            score += 95;
    }
    if (query) {
        if (haystack.includes(query))
            score += 90;
        score += compactTerms(query).reduce((total, term) => total + (haystack.includes(term) ? 14 : 0), 0);
    }
    if (kind) {
        if (controlType === kind)
            score += 60;
        if (kind === "text" && ["text", "email", "search", "url", "tel"].includes(controlType))
            score += 35;
    }
    if ((label.includes("password") || name.includes("password") || query.includes("password")) && controlType === "password")
        score += 220;
    if ((label.includes("email") || name.includes("email") || query.includes("email")) && controlType === "email")
        score += 200;
    if ((label.includes("user") || label.includes("login") || name.includes("user") || query.includes("username")) && ["text", "email", "search"].includes(controlType))
        score += 90;
    if ((label.includes("remember") || query.includes("remember")) && controlType === "checkbox")
        score += 120;
    if (controlType === "hidden")
        score -= 120;
    if (controlType === "submit")
        score -= 60;
    return score;
}
function normalizeBrowserList(policy) {
    const preferred = Array.isArray(policy.allowedBrowsers) ? policy.allowedBrowsers : [];
    const mapped = preferred
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => item === "chrome" || item === "edge" || item === "brave" || item === "arc" || item === "chromium");
    return mapped.length ? mapped : ["chrome", "edge", "brave", "arc", "chromium"];
}
function browserExecutableCandidates(family) {
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
        const appName = family === "chrome"
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
async function pathExists(targetPath) {
    return fs
        .stat(targetPath)
        .then(() => true)
        .catch(() => false);
}
async function resolveExecutable(policy) {
    for (const family of normalizeBrowserList(policy)) {
        for (const candidate of browserExecutableCandidates(family)) {
            if (await pathExists(candidate)) {
                return { family, executablePath: candidate };
            }
        }
    }
    return null;
}
async function allocatePort() {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            server.close((error) => {
                if (error)
                    reject(error);
                else
                    resolve(port);
            });
        });
    });
}
async function sleep(durationMs) {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
}
async function fetchJson(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) {
        throw new Error(`CDP request failed (${response.status}) for ${url}`);
    }
    return (await response.json());
}
async function waitForVersion(endpoint, timeoutMs) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            return await fetchJson(`${endpoint}/json/version`);
        }
        catch (error) {
            lastError = error;
            await sleep(250);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for browser debugger at ${endpoint}`);
}
async function discoverExistingSession(policy) {
    const explicitEndpoint = String(process.env.BINARY_BROWSER_CDP_URL || "").trim().replace(/\/+$/, "");
    const allowHeadlessAttach = parseEnvBool(process.env.BINARY_BROWSER_ATTACH_HEADLESS, false);
    const candidates = explicitEndpoint
        ? [explicitEndpoint]
        : CANDIDATE_DEBUG_PORTS.map((port) => `http://127.0.0.1:${port}`);
    const allowedFamilies = normalizeBrowserList(policy);
    for (const endpoint of candidates) {
        try {
            const version = await fetchJson(`${endpoint}/json/version`);
            const browserLabel = String(version.Browser || version.browser || "").trim();
            const browserNameLower = browserLabel.toLowerCase();
            if (!allowHeadlessAttach && browserNameLower.includes("headless")) {
                continue;
            }
            const family = allowedFamilies.find((item) => browserNameLower.includes(item));
            if (!family && allowedFamilies.length)
                continue;
            const browserWsUrl = String(version.webSocketDebuggerUrl || "").trim();
            if (!browserWsUrl)
                continue;
            return {
                browserId: `attached:${endpoint}`,
                browserName: browserLabel || BROWSER_FAMILY_LABELS[family || allowedFamilies[0]],
                mode: "attached",
                endpoint,
                browserWsUrl,
            };
        }
        catch {
            continue;
        }
    }
    return null;
}
async function launchManagedBrowser(policy) {
    const resolved = await resolveExecutable(policy);
    if (!resolved) {
        throw new Error("Binary could not find a supported Chromium-family browser to launch.");
    }
    const managedHeadless = parseEnvBool(process.env.BINARY_BROWSER_MANAGED_HEADLESS, false);
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
    if (managedHeadless) {
        args.splice(args.length - 1, 0, "--headless=new", "--disable-gpu", "--window-size=1366,900");
    }
    const child = spawn(resolved.executablePath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: managedHeadless,
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
async function launchProfileBackedBrowser(policy) {
    const resolved = await resolveExecutable(policy);
    if (!resolved) {
        return null;
    }
    const port = await allocatePort();
    const args = [
        `--remote-debugging-port=${port}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "about:blank",
    ];
    const child = spawn(resolved.executablePath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
    });
    child.unref();
    const endpoint = `http://127.0.0.1:${port}`;
    try {
        const version = await waitForVersion(endpoint, 1_500);
        const browserWsUrl = String(version.webSocketDebuggerUrl || "").trim();
        if (!browserWsUrl) {
            return null;
        }
        return {
            browserId: `profile:${port}`,
            browserName: String(version.Browser || BROWSER_FAMILY_LABELS[resolved.family]).trim(),
            mode: "profile",
            endpoint,
            browserWsUrl,
            port,
            executablePath: resolved.executablePath,
            process: child,
        };
    }
    catch {
        try {
            process.kill(-child.pid);
        }
        catch {
            try {
                child.kill();
            }
            catch { }
        }
        return null;
    }
}
export function rankBrowserResultCandidates(matches, query, pageUrl) {
    const queryTerms = compactTerms(query);
    const domain = safeDomain(pageUrl || "");
    return [...matches]
        .map((item) => {
        const label = compactWhitespace(`${item.label || ""} ${item.text || ""}`).toLowerCase();
        const selector = String(item.selector || "").toLowerCase();
        const href = String(item.href || "").toLowerCase();
        let score = Number(item.score || 0) || 0;
        if (queryTerms.length && queryTerms.every((term) => label.includes(term) || href.includes(term)))
            score += 120;
        else {
            score += queryTerms.reduce((total, term) => {
                if (label.includes(term))
                    return total + 20;
                if (href.includes(term))
                    return total + 10;
                return total;
            }, 0);
        }
        if (item.visible !== false)
            score += 25;
        else
            score -= 90;
        if (String(item.tagName || "").toLowerCase() === "a")
            score += 30;
        if (String(item.role || "").toLowerCase() === "link")
            score += 20;
        if (href)
            score += 10;
        if (selector.includes("searchbox") || selector.includes("search_query") || selector.includes("input"))
            score -= 80;
        if (label === "search" || label.startsWith("search "))
            score -= 80;
        if (selector.includes("suggest") || label.includes("search with your voice"))
            score -= 40;
        if (selector.includes("#logo") || selector.includes("masthead") || selector.includes("guide-button"))
            score -= 220;
        if (href === "/" || href.startsWith("/?"))
            score -= 180;
        if (label === "home" || label === "guide" || label === "menu" || label === "a")
            score -= 120;
        if (domain.includes("youtube.com")) {
            if (href.includes("/watch"))
                score += 120;
            if (selector.includes("video-title"))
                score += 80;
            if (href.includes("/shorts/") && !queryTerms.includes("shorts"))
                score -= 140;
            if (href.includes("/@"))
                score += 15;
            if (label.includes("channel"))
                score -= 10;
            if (selector.includes("channel-thumbnail"))
                score -= 12;
        }
        if (domain.includes("google.com")) {
            if (href.startsWith("http"))
                score += 25;
            if (selector.includes("search"))
                score -= 20;
        }
        return {
            item,
            score,
        };
    })
        .sort((left, right) => right.score - left.score)
        .map((entry) => ({
        ...entry.item,
        score: entry.score,
    }));
}
function buildBrowserMissionQueryAttempts(query, pageUrl) {
    const compactQuery = compactWhitespace(query);
    const domain = safeDomain(pageUrl || "");
    const attempts = [];
    const pushAttempt = (value) => {
        if (typeof value === "undefined") {
            if (!attempts.includes(undefined))
                attempts.push(undefined);
            return;
        }
        const normalized = compactWhitespace(value);
        if (!normalized)
            return;
        if (!attempts.includes(normalized))
            attempts.push(normalized);
    };
    pushAttempt(compactQuery);
    if (domain.includes("youtube.com") && compactQuery && !compactQuery.toLowerCase().includes("video")) {
        pushAttempt(`${compactQuery} video`);
    }
    pushAttempt(undefined);
    return attempts;
}
function selectViableBrowserMissionCandidates(rankedCandidates, pageUrl) {
    const domain = safeDomain(pageUrl || "");
    const viable = rankedCandidates.filter((item) => {
        const score = Number(item.score || 0) || 0;
        const href = String(item.href || "").toLowerCase();
        const selector = String(item.selector || "").toLowerCase();
        const label = compactWhitespace(item.label || "").toLowerCase();
        if (score <= 25)
            return false;
        if (item.visible === false)
            return false;
        if (href === "/" || href.startsWith("/?"))
            return false;
        if (selector.includes("#logo") || selector.includes("masthead") || selector.includes("guide-button"))
            return false;
        if (label === "home" || label === "guide" || label === "menu" || label === "a")
            return false;
        return true;
    });
    if (!viable.length)
        return [];
    if (domain.includes("youtube.com")) {
        const watchLinks = viable.filter((item) => String(item.href || "").toLowerCase().includes("/watch"));
        if (watchLinks.length)
            return watchLinks;
        const channelLinks = viable.filter((item) => {
            const href = String(item.href || "").toLowerCase();
            return href.includes("/@") || href.includes("/channel/");
        });
        if (channelLinks.length)
            return channelLinks;
        const nonShorts = viable.filter((item) => !String(item.href || "").toLowerCase().includes("/shorts/"));
        if (nonShorts.length)
            return nonShorts;
    }
    return viable;
}
class CdpConnection {
    url;
    socket = null;
    pending = new Map();
    nextId = 1;
    readyPromise = null;
    eventListeners = new Set();
    constructor(url) {
        this.url = url;
    }
    async ensureOpen() {
        if (this.socket && this.socket.readyState === 1)
            return;
        if (this.readyPromise)
            return await this.readyPromise;
        const WebSocketCtor = globalThis.WebSocket;
        if (!WebSocketCtor) {
            throw new Error("WebSocket support is unavailable in this Node runtime.");
        }
        this.readyPromise = new Promise((resolve, reject) => {
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
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                }
                catch {
                    return;
                }
                if (typeof parsed.id === "number") {
                    const pending = this.pending.get(parsed.id);
                    if (!pending)
                        return;
                    this.pending.delete(parsed.id);
                    if (parsed.error)
                        pending.reject(new Error(String(parsed.error.message || "CDP command failed")));
                    else
                        pending.resolve(parsed.result || {});
                    return;
                }
                if (typeof parsed.method === "string") {
                    for (const listener of this.eventListeners) {
                        listener(parsed.method, parsed.params || {}, typeof parsed.sessionId === "string" ? parsed.sessionId : undefined);
                    }
                }
            };
        });
        await this.readyPromise;
    }
    async command(method, params, sessionId) {
        await this.ensureOpen();
        if (!this.socket)
            throw new Error(`CDP socket unavailable for ${this.url}`);
        const id = this.nextId++;
        const payload = { id, method, ...(params ? { params } : {}), ...(sessionId ? { sessionId } : {}) };
        return await new Promise((resolve, reject) => {
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
    onEvent(listener) {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }
    close() {
        this.socket?.close();
        this.socket = null;
        this.readyPromise = null;
    }
}
function buildElementLookupScript(input) {
    return `(() => {
    const query = ${JSON.stringify(String(input.query || "").trim().toLowerCase())};
    const queryTerms = query ? query.split(/\\s+/).filter(Boolean) : [];
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
    function scoreOf(el, label, selector, role) {
      const haystack = (label + " " + selector + " " + role + " " + (el.getAttribute("href") || "")).toLowerCase();
      let score = 0;
      if (!query) {
        score += 1;
      } else {
        if (label.toLowerCase() === query) score += 120;
        if (haystack.includes(query)) score += 60;
        for (const term of queryTerms) {
          if (label.toLowerCase().includes(term)) score += 18;
          else if (haystack.includes(term)) score += 8;
        }
      }
      const href = String(el.getAttribute("href") || "").toLowerCase();
      if (href && queryTerms.some((term) => href.includes(term))) score += 12;
      if (el.tagName.toLowerCase() === "input" || el.tagName.toLowerCase() === "textarea") score += 10;
      if (el.tagName.toLowerCase() === "a") score += 8;
      if (role === "button" || role === "link") score += 6;
      const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (rect.width > 0 && rect.height > 0) score += 5;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") score -= 30;
      return { score, rect };
    }
    const matches = [];
    for (const el of elements) {
      const label = textOf(el);
      const selector = cssPath(el);
      const role = roleOf(el);
      const haystack = (label + " " + selector + " " + role + " " + (el.getAttribute("href") || "")).toLowerCase();
      const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
      if (query && !haystack.includes(query) && matchedTerms.length === 0) continue;
      const { score, rect } = scoreOf(el, label, selector, role);
      matches.push({
        selector,
        label: label || el.tagName.toLowerCase(),
        text: label || "",
        role,
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        href: el.getAttribute("href") || "",
        disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
        visible: rect.width > 0 && rect.height > 0,
        score,
      });
    }
    matches.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
    return { url: location.href, title: document.title || "", matches: matches.slice(0, limit) };
  })()`;
}
function buildFormStateScript() {
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
function buildReadTextScript(selector) {
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
function buildClickScript(selector) {
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
function buildTypeScript(selector, text) {
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
function buildSetControlValueScript(selector, value, checked) {
    return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: "Element not found", url: location.href, title: document.title || "" };
    element.scrollIntoView({ block: "center", inline: "center" });
    if (typeof element.focus === "function") element.focus();
    const desiredValue = ${JSON.stringify(value)};
    const desiredChecked = ${typeof checked === "boolean" ? JSON.stringify(checked) : "undefined"};
    if (element instanceof HTMLInputElement) {
      const type = String(element.type || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        const nextChecked = typeof desiredChecked === "boolean" ? desiredChecked : /^(true|1|yes|on|checked)$/i.test(String(desiredValue || ""));
        if (element.checked !== nextChecked) {
          if (typeof element.click === "function") element.click();
          element.checked = nextChecked;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, kind: type, checked: Boolean(element.checked), url: location.href, title: document.title || "" };
      }
      element.value = String(desiredValue ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, kind: type, value: String(element.value ?? ""), url: location.href, title: document.title || "" };
    }
    if (element instanceof HTMLTextAreaElement) {
      element.value = String(desiredValue ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, kind: "textarea", value: String(element.value ?? ""), url: location.href, title: document.title || "" };
    }
    if (element instanceof HTMLSelectElement) {
      const normalized = String(desiredValue ?? "").trim().toLowerCase();
      const option = Array.from(element.options).find((item) => {
        const valueText = String(item.value || "").trim().toLowerCase();
        const labelText = String(item.label || item.textContent || "").trim().toLowerCase();
        return valueText === normalized || labelText === normalized;
      });
      element.value = option ? option.value : String(desiredValue ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const selected = element.selectedOptions && element.selectedOptions[0]
        ? String(element.selectedOptions[0].label || element.selectedOptions[0].textContent || "").trim()
        : "";
      return { ok: true, kind: "select", value: String(element.value ?? ""), selectedText: selected, url: location.href, title: document.title || "" };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.innerText = String(desiredValue ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, kind: "contenteditable", value: String(element.innerText || ""), url: location.href, title: document.title || "" };
    }
    return { ok: false, reason: "Target element is not a supported form control", url: location.href, title: document.title || "" };
  })()`;
}
function buildKeypressScript(keys) {
    return `(() => {
    const target = document.activeElement || document.body;
    for (const key of ${JSON.stringify(keys)}) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      if (key === "Enter") {
        const form = typeof target.closest === "function" ? target.closest("form") : null;
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else if (form && typeof form.submit === "function") {
          form.submit();
        } else if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          target.dispatchEvent(new Event("change", { bubbles: true }));
          target.dispatchEvent(new Event("search", { bubbles: true }));
        } else if (target instanceof HTMLElement && typeof target.click === "function") {
          target.click();
        }
      }
    }
    return { ok: true, keys: ${JSON.stringify(keys)}, url: location.href, title: document.title || "" };
  })()`;
}
function buildScrollScript(deltaY, selector) {
    return `(() => {
    const target = ${JSON.stringify(selector || "")} ? document.querySelector(${JSON.stringify(selector || "")}) : null;
    if (target && typeof target.scrollBy === "function") target.scrollBy({ top: ${Math.trunc(deltaY)}, left: 0, behavior: "instant" });
    else window.scrollBy({ top: ${Math.trunc(deltaY)}, left: 0, behavior: "instant" });
    return { ok: true, scrollY: window.scrollY, url: location.href, title: document.title || "" };
  })()`;
}
function buildWaitConditionScript(input) {
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
    session = null;
    browserConnection = null;
    pageStates = new Map();
    pageSessionIds = new Map();
    elementRefs = new Map();
    snapshots = new Map();
    pageLeases = new Map();
    actionLoops = new Map();
    lastActivePageId = null;
    sessionModeOverride = null;
    loopActionKey(kind, key) {
        return `${kind}:${compactWhitespace(key).toLowerCase().slice(0, 220)}`;
    }
    beginLoopAction(kind, key, input) {
        const now = Date.now();
        const normalizedKey = this.loopActionKey(kind, key);
        const existing = this.actionLoops.get(normalizedKey);
        if (existing?.suppressedUntil && now < existing.suppressedUntil) {
            const remaining = Math.max(1, Math.ceil((existing.suppressedUntil - now) / 1000));
            return {
                allowed: false,
                attempt: existing.attempts,
                recoverySuggested: false,
                reason: `Binary suppressed repeated ${kind.replace(/_/g, " ")} attempts for ${remaining}s to prevent browser loops.`,
            };
        }
        const next = existing
            ? {
                ...existing,
                attempts: existing.attempts + 1,
                lastAttemptAt: now,
            }
            : {
                attempts: 1,
                firstAttemptAt: now,
                lastAttemptAt: now,
                recoveryUsed: false,
            };
        const elapsed = now - next.firstAttemptAt;
        if (next.attempts > input.maxAttempts && elapsed < input.cooldownMs) {
            next.suppressedUntil = now + input.suppressionMs;
            this.actionLoops.set(normalizedKey, next);
            return {
                allowed: false,
                attempt: next.attempts,
                recoverySuggested: false,
                reason: `Binary blocked repeated ${kind.replace(/_/g, " ")} attempts without progress. ` +
                    "Refresh the page state or use browser_recover_workflow before retrying.",
            };
        }
        const recoverySuggested = !next.recoveryUsed && next.attempts >= Math.max(2, input.maxAttempts - 1);
        if (recoverySuggested) {
            next.recoveryUsed = true;
        }
        this.actionLoops.set(normalizedKey, next);
        this.pruneLoopState();
        return {
            allowed: true,
            attempt: next.attempts,
            recoverySuggested,
        };
    }
    markLoopActionSuccess(kind, key) {
        const normalizedKey = this.loopActionKey(kind, key);
        this.actionLoops.delete(normalizedKey);
    }
    pruneLoopState() {
        if (this.actionLoops.size <= MAX_ACTION_LOOP_HISTORY)
            return;
        const ordered = [...this.actionLoops.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt);
        while (ordered.length > MAX_ACTION_LOOP_HISTORY) {
            const removed = ordered.shift();
            if (removed)
                this.actionLoops.delete(removed[0]);
        }
    }
    async getStatus(policy) {
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
    currentSessionKind() {
        if (!this.session)
            return "none";
        return this.session.mode === "managed" ? "managed" : "existing";
    }
    async runWithSessionPreference(mode, action) {
        const previous = this.sessionModeOverride;
        this.sessionModeOverride = mode;
        if (mode === "managed_only" && this.session && this.session.mode !== "managed") {
            this.resetPageTracking();
            this.browserConnection?.close();
            this.browserConnection = null;
            this.session = null;
        }
        if (mode === "reuse_first" && this.session && this.session.mode === "managed") {
            this.resetPageTracking();
            this.browserConnection?.close();
            this.browserConnection = null;
            this.session = null;
        }
        try {
            return await action();
        }
        finally {
            this.sessionModeOverride = previous;
        }
    }
    async collectContext(policy, input = {}) {
        if (!policy.enabled || !policy.allowBrowserNative) {
            return { mode: "unavailable" };
        }
        const pages = await this.listPages(policy).catch(() => []);
        const activePage = (await this.getActivePage(policy).catch(() => null)) || pages[0] || null;
        let snapshot = null;
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
                attachedToExistingSession: this.session?.mode === "attached" || this.session?.mode === "profile",
                authenticatedLikely: Boolean(activePage?.url && !/about:blank|chrome:\/\//i.test(activePage.url)),
            },
            ...(this.getActiveMissionLease()
                ? {
                    activeMissionLease: {
                        leaseId: this.getActiveMissionLease().leaseId,
                        missionKind: this.getActiveMissionLease().missionKind,
                        pageId: this.getActiveMissionLease().pageId,
                        state: this.getActiveMissionLease().state,
                        conflictDetected: this.getActiveMissionLease().conflictDetected,
                        ...(this.getActiveMissionLease().conflictReason
                            ? { conflictReason: this.getActiveMissionLease().conflictReason }
                            : {}),
                        sessionMode: this.getActiveMissionLease().sessionMode,
                        startedAt: this.getActiveMissionLease().startedAt,
                        updatedAt: this.getActiveMissionLease().updatedAt,
                    },
                }
                : {}),
        };
    }
    async listPages(policy) {
        const session = await this.ensureSession(policy, false);
        if (!session)
            return [];
        const targets = await fetchJson(`${session.endpoint}/json/list`);
        const pages = targets
            .filter((target) => target.type === "page" && target.id)
            .map((target) => ({
            id: String(target.id),
            title: String(target.title || "Untitled page"),
            url: String(target.url || "about:blank"),
            origin: originFromUrl(String(target.url || "")),
            browserName: session.browserName,
            lane: "browser_native",
            active: this.lastActivePageId === String(target.id),
        }));
        if (!this.lastActivePageId && pages.length) {
            this.lastActivePageId = pages[0].id;
        }
        const pageIds = new Set(pages.map((page) => page.id));
        for (const [leasePageId, lease] of this.pageLeases.entries()) {
            if ((lease.state === "active" || lease.state === "conflicted") && !pageIds.has(leasePageId)) {
                this.markMissionLeaseConflict(leasePageId, "The leased browser page is no longer present. Another tab change, navigation, or window close likely interrupted the workflow.");
            }
        }
        for (const page of pages) {
            this.ensurePageState(page.id);
        }
        return pages;
    }
    async getActivePage(policy) {
        const pages = await this.listPages(policy);
        return pages.find((page) => page.id === this.lastActivePageId) || pages[0] || null;
    }
    async getPageById(policy, pageId) {
        const pages = await this.listPages(policy);
        return pages.find((page) => page.id === pageId) || null;
    }
    async getPageSummary(policy, pageId) {
        return await this.getPageById(policy, pageId);
    }
    getMissionLease(pageId) {
        const lease = this.pageLeases.get(pageId);
        return lease ? { ...lease } : null;
    }
    async assertPageTarget(policy, input) {
        const page = await this.getPageById(policy, input.pageId);
        if (!page) {
            throw new Error(`Browser target guard could not find page ${input.pageId}.`);
        }
        const expectedOrigin = normalizeOriginLike(String(input.targetOrigin || ""));
        if (expectedOrigin) {
            const actualOrigin = normalizeOriginLike(page.origin || page.url || "");
            if (actualOrigin && expectedOrigin !== actualOrigin) {
                throw new Error(`Browser wrong-target guard blocked mutation. Expected origin ${expectedOrigin}, resolved ${actualOrigin}.`);
            }
        }
        const expectedLeaseId = compactWhitespace(input.pageLeaseId || "");
        if (expectedLeaseId) {
            const lease = this.pageLeases.get(input.pageId);
            if (!lease || lease.leaseId !== expectedLeaseId) {
                throw new Error(`Browser wrong-target guard blocked mutation. Expected lease ${expectedLeaseId} but the page lease no longer matches.`);
            }
        }
        return page;
    }
    async resolveMissionResultPage(policy, pageId, fallback) {
        const resolved = (await this.getPageById(policy, pageId)) || fallback;
        this.touchMissionLease(pageId, resolved || undefined);
        if (!resolved) {
            this.markMissionLeaseConflict(pageId, "The mission page disappeared before the browser workflow could finish.");
            return fallback;
        }
        const lease = this.pageLeases.get(pageId);
        if (lease &&
            lease.expectedOrigin &&
            resolved.origin &&
            lease.expectedOrigin !== resolved.origin &&
            lease.sessionMode !== "managed") {
            this.markMissionLeaseConflict(pageId, `The mission page drifted from ${lease.expectedOrigin} to ${resolved.origin} while automation was running.`, resolved);
        }
        return resolved;
    }
    getActiveMissionLease() {
        const active = [...this.pageLeases.values()].filter((lease) => lease.state === "active" || lease.state === "conflicted");
        if (!active.length)
            return null;
        return active.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null;
    }
    createMissionLease(page, missionKind) {
        const timestamp = nowIso();
        const lease = {
            leaseId: `browser_lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            missionKind,
            pageId: page.id,
            sessionMode: this.session?.mode || "attached",
            startedAt: timestamp,
            updatedAt: timestamp,
            state: "active",
            expectedUrl: page.url,
            expectedOrigin: page.origin,
            lastObservedUrl: page.url,
            lastObservedTitle: page.title,
            conflictDetected: false,
        };
        this.pageLeases.set(page.id, lease);
        return lease;
    }
    touchMissionLease(pageId, page) {
        const lease = this.pageLeases.get(pageId);
        if (!lease)
            return undefined;
        lease.updatedAt = nowIso();
        if (page) {
            lease.lastObservedUrl = page.url;
            lease.lastObservedTitle = page.title;
        }
        return lease;
    }
    markMissionLeaseConflict(pageId, reason, page) {
        const lease = this.pageLeases.get(pageId);
        if (!lease)
            return undefined;
        lease.updatedAt = nowIso();
        lease.conflictDetected = true;
        lease.conflictReason = compactWhitespace(reason);
        lease.state = "conflicted";
        if (page) {
            lease.lastObservedUrl = page.url;
            lease.lastObservedTitle = page.title;
        }
        return lease;
    }
    finalizeMissionLease(pageId, state, page) {
        const lease = this.pageLeases.get(pageId);
        if (!lease)
            return undefined;
        lease.updatedAt = nowIso();
        lease.state = lease.conflictDetected && state !== "released" ? "conflicted" : state;
        if (page) {
            lease.lastObservedUrl = page.url;
            lease.lastObservedTitle = page.title;
        }
        return { ...lease };
    }
    async runMissionWithLease(missionKind, page, action) {
        this.createMissionLease(page, missionKind);
        try {
            const result = await action();
            const resultWithFinalPage = result;
            const lease = this.finalizeMissionLease(page.id, "completed", resultWithFinalPage.finalPage || page);
            return {
                ...result,
                ...(lease ? { missionLease: lease } : {}),
            };
        }
        catch (error) {
            this.markMissionLeaseConflict(page.id, error instanceof Error && error.message ? error.message : "The browser mission failed unexpectedly.", page);
            const lease = this.finalizeMissionLease(page.id, "conflicted", page);
            throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
                browserMissionLease: lease,
            });
        }
    }
    shouldAutoFocusBrowser(policy, forceForeground = false) {
        if (policy.focusPolicy === "never_steal")
            return false;
        if (forceForeground)
            return true;
        return parseEnvBool(process.env.BINARY_BROWSER_AUTO_FOCUS, true);
    }
    async activateTargetIfAllowed(policy, pageId, options) {
        if (!this.shouldAutoFocusBrowser(policy, options?.forceForeground === true))
            return;
        const session = await this.ensureSession(policy, false);
        if (!session)
            return;
        const browserConnection = await this.ensureBrowserConnection(session);
        await browserConnection.command("Target.activateTarget", { targetId: pageId }).catch(() => null);
        if (options?.forceForeground === true) {
            const windowId = await browserConnection
                .command("Browser.getWindowForTarget", { targetId: pageId })
                .then((response) => Number(response.windowId || 0))
                .catch(() => 0);
            if (Number.isFinite(windowId) && windowId > 0) {
                await browserConnection
                    .command("Browser.setWindowBounds", {
                    windowId,
                    bounds: { windowState: "normal" },
                })
                    .catch(() => null);
            }
        }
        this.lastActivePageId = pageId;
        this.ensurePageState(pageId).lastActivatedAt = nowIso();
    }
    async openPage(policy, url, options) {
        this.assertUrlAllowed(policy, url);
        const loopGuard = this.beginLoopAction("open_page", originFromUrl(url) || url, {
            maxAttempts: BROWSER_OPEN_LOOP_MAX_ATTEMPTS,
            cooldownMs: 15_000,
            suppressionMs: 10_000,
        });
        if (!loopGuard.allowed) {
            throw new Error(loopGuard.reason || "Binary blocked repeated browser page open attempts.");
        }
        const session = await this.ensureSession(policy, true);
        if (!session)
            throw new Error("Binary could not initialize a browser-native runtime.");
        const browserConnection = await this.ensureBrowserConnection(session);
        const result = await browserConnection.command("Target.createTarget", { url });
        const targetId = String(result.targetId || "");
        if (!targetId)
            throw new Error("Browser runtime failed to create a target page.");
        await this.activateTargetIfAllowed(policy, targetId, options);
        await sleep(300);
        const page = (await this.listPages(policy)).find((item) => item.id === targetId);
        if (!page) {
            throw new Error("Browser runtime created a page but could not resolve it in the target list.");
        }
        this.lastActivePageId = page.id;
        this.ensurePageState(page.id).worldModel.recentNavigations.push(url);
        this.markLoopActionSuccess("open_page", originFromUrl(url) || url);
        return page;
    }
    async focusPage(policy, pageId) {
        const session = await this.ensureSession(policy, false);
        if (!session)
            throw new Error("Binary could not connect to a browser-native session.");
        const browserConnection = await this.ensureBrowserConnection(session);
        await browserConnection.command("Target.activateTarget", { targetId: pageId });
        this.lastActivePageId = pageId;
        this.ensurePageState(pageId).lastActivatedAt = nowIso();
        const page = (await this.listPages(policy)).find((item) => item.id === pageId);
        if (!page)
            throw new Error(`Browser page ${pageId} was not found.`);
        return { ...page, active: true };
    }
    async navigate(policy, input, options) {
        this.assertUrlAllowed(policy, input.url);
        const session = await this.ensurePageSession(policy, input.pageId);
        await this.sendPageCommand("Page.navigate", { url: input.url }, session.sessionId);
        await this.activateTargetIfAllowed(policy, input.pageId, options);
        await sleep(350);
        this.lastActivePageId = input.pageId;
        this.ensurePageState(input.pageId).worldModel.recentNavigations.push(input.url);
        const page = (await this.listPages(policy)).find((item) => item.id === input.pageId);
        if (!page)
            throw new Error(`Browser page ${input.pageId} was not found after navigation.`);
        return page;
    }
    async snapshotDom(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        const raw = await this.evaluate(session.sessionId, buildElementLookupScript({ query: input.query, limit: input.limit ?? 20 }));
        const url = String(raw.url || "");
        const title = String(raw.title || "");
        const interactiveElements = this.storeElementRefs(input.pageId, Array.isArray(raw.matches) ? raw.matches : []);
        const workflowCheckpoint = compactWhitespace([title, url, interactiveElements[0]?.label || "", interactiveElements[1]?.label || ""].filter(Boolean).join(" | "));
        const snapshotId = `browser_snapshot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const snapshot = {
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
    async queryElements(policy, input) {
        const snapshot = await this.snapshotDom(policy, input);
        const page = (await this.listPages(policy)).find((item) => item.id === input.pageId) || null;
        return { page, matches: snapshot.interactiveElements };
    }
    async readText(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        return await this.evaluateWithSelectorFallback(session.sessionId, input.pageId, {
            elementId: input.elementId,
            selector: input.selector,
            purpose: "read",
            expression: (selector) => buildReadTextScript(selector),
        });
    }
    async readFormState(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        return await this.evaluate(session.sessionId, buildFormStateScript());
    }
    async click(policy, input) {
        const loopGuard = this.beginLoopAction("click", `${input.pageId}|${input.elementId || input.selector || "auto"}`, {
            maxAttempts: BROWSER_MUTATION_LOOP_MAX_ATTEMPTS,
            cooldownMs: 10_000,
            suppressionMs: 8_000,
        });
        if (!loopGuard.allowed) {
            throw new Error(loopGuard.reason || "Binary blocked repeated browser click attempts.");
        }
        const session = await this.ensurePageSession(policy, input.pageId);
        const result = await this.evaluateWithSelectorFallback(session.sessionId, input.pageId, {
            elementId: input.elementId,
            selector: input.selector,
            purpose: "click",
            expression: (selector) => buildClickScript(selector),
        });
        if (result.ok === true) {
            this.markLoopActionSuccess("click", `${input.pageId}|${input.elementId || input.selector || "auto"}`);
        }
        return result;
    }
    async type(policy, input) {
        const loopGuard = this.beginLoopAction("type", `${input.pageId}|${input.elementId || input.selector || "auto"}`, {
            maxAttempts: BROWSER_MUTATION_LOOP_MAX_ATTEMPTS,
            cooldownMs: 10_000,
            suppressionMs: 8_000,
        });
        if (!loopGuard.allowed) {
            throw new Error(loopGuard.reason || "Binary blocked repeated browser type attempts.");
        }
        const session = await this.ensurePageSession(policy, input.pageId);
        const result = await this.evaluateWithSelectorFallback(session.sessionId, input.pageId, {
            elementId: input.elementId,
            selector: input.selector,
            purpose: "type",
            expression: (selector) => buildTypeScript(selector, input.text),
        });
        if (result.ok === true) {
            this.markLoopActionSuccess("type", `${input.pageId}|${input.elementId || input.selector || "auto"}`);
        }
        return result;
    }
    async pressKeys(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        return await this.evaluate(session.sessionId, buildKeypressScript(input.keys));
    }
    async resolveMissionPage(policy, input, options) {
        const url = String(input.url || "").trim();
        const pageId = String(input.pageId || "").trim();
        if (pageId) {
            const pages = await this.listPages(policy);
            const existing = pages.find((page) => page.id === pageId);
            if (!existing) {
                throw new Error(`Browser page ${pageId} was not found.`);
            }
            if (url && existing.url !== url) {
                return await this.navigate(policy, { pageId: existing.id, url }, options);
            }
            await this.activateTargetIfAllowed(policy, existing.id, options);
            return existing;
        }
        if (url) {
            const requestedOrigin = originFromUrl(url);
            const pages = await this.listPages(policy);
            const sameOrigin = pages.find((page) => page.active && requestedOrigin && page.origin === requestedOrigin) ||
                pages.find((page) => requestedOrigin && page.origin === requestedOrigin);
            if (sameOrigin) {
                if (sameOrigin.url === url) {
                    await this.activateTargetIfAllowed(policy, sameOrigin.id, options);
                    this.lastActivePageId = sameOrigin.id;
                    return sameOrigin;
                }
                return await this.navigate(policy, { pageId: sameOrigin.id, url }, options);
            }
            return await this.openPage(policy, url, options);
        }
        const active = await this.getActivePage(policy);
        if (!active) {
            throw new Error("Binary could not resolve a browser page for this mission.");
        }
        return active;
    }
    normalizeFormControls(raw) {
        return (Array.isArray(raw.controls) ? raw.controls : [])
            .map((item) => ({
            selector: String(item.selector || "").trim(),
            label: compactWhitespace(String(item.label || "")),
            name: compactWhitespace(String(item.name || "")),
            type: compactWhitespace(String(item.type || "")),
            value: String(item.value || ""),
            checked: item.checked === true,
            disabled: item.disabled === true,
        }))
            .filter((item) => Boolean(item.selector));
    }
    matchMissionFields(controls, fields) {
        const usedSelectors = new Set();
        const matched = [];
        const missing = [];
        for (const field of fields) {
            const ranked = controls
                .map((control) => ({ control, score: scoreBrowserFormControl(control, field) }))
                .filter((entry) => entry.score > 40 && !usedSelectors.has(entry.control.selector))
                .sort((left, right) => right.score - left.score);
            const best = ranked[0];
            if (!best) {
                missing.push(compactWhitespace(field.label || field.name || field.query || field.kind || "field"));
                continue;
            }
            usedSelectors.add(best.control.selector);
            matched.push({ field, control: best.control });
        }
        return { matched, missing };
    }
    async setMissionControlValue(policy, pageId, control, field) {
        const session = await this.ensurePageSession(policy, pageId);
        return await this.evaluate(session.sessionId, buildSetControlValueScript(control.selector, String(field.value ?? ""), typeof field.checked === "boolean" ? field.checked : undefined));
    }
    async clickBestQueryElement(policy, page, query, limit = 18) {
        const snapshot = await this.queryElements(policy, {
            pageId: page.id,
            query: compactWhitespace(query) || undefined,
            limit,
        });
        const ranked = rankBrowserResultCandidates(snapshot.matches, query, page.url);
        const viable = selectViableBrowserMissionCandidates(ranked, page.url);
        const best = viable[0] || ranked[0] || null;
        if (!best)
            return null;
        await this.click(policy, {
            pageId: page.id,
            elementId: best.id,
            selector: best.selector,
        });
        return best;
    }
    async waitForMissionOutcome(policy, pageId, input) {
        const text = compactWhitespace(input.waitForText || "");
        const urlIncludes = String(input.waitForUrlIncludes || "").trim();
        const titleIncludes = compactWhitespace(input.waitForTitleIncludes || "");
        if (!text && !urlIncludes && !titleIncludes) {
            return false;
        }
        const result = await this.waitFor(policy, {
            pageId,
            durationMs: Math.max(800, Math.min(Number(input.durationMs || 3_500), 10_000)),
            ...(text ? { text } : {}),
            ...(urlIncludes ? { urlIncludes } : {}),
            ...(titleIncludes ? { titleIncludes } : {}),
        }).catch(() => ({ ok: false }));
        return result.ok === true;
    }
    async waitForMissionResults(policy, pageId, query, pageUrl) {
        const domain = safeDomain(pageUrl || "");
        const queryTerms = compactTerms(query);
        const primaryHint = compactWhitespace(queryTerms.slice(0, 2).join(" ")) || compactWhitespace(query);
        if (domain.includes("youtube.com")) {
            await this.waitFor(policy, {
                pageId,
                durationMs: 2_500,
                urlIncludes: "/results",
            }).catch(() => null);
            await this.waitFor(policy, {
                pageId,
                durationMs: 2_500,
                text: primaryHint || "video",
            }).catch(() => null);
            return;
        }
        if (primaryHint) {
            await this.waitFor(policy, {
                pageId,
                durationMs: 1_800,
                titleIncludes: primaryHint,
            }).catch(() => null);
        }
    }
    async collectMissionCandidates(policy, page, query, limit) {
        const attempts = buildBrowserMissionQueryAttempts(query, page.url);
        const cappedLimit = Math.max(12, Math.min(limit, 40));
        let bestObserved = [];
        for (const delayMs of [0, 500, 1_000, 1_500]) {
            if (delayMs) {
                await sleep(delayMs);
            }
            for (const attempt of attempts) {
                const resultSnapshot = await this.queryElements(policy, {
                    pageId: page.id,
                    ...(typeof attempt === "string" ? { query: attempt } : {}),
                    limit: cappedLimit,
                });
                const ranked = rankBrowserResultCandidates(resultSnapshot.matches, query, page.url);
                if (ranked.length > bestObserved.length) {
                    bestObserved = ranked;
                }
                const viable = selectViableBrowserMissionCandidates(ranked, page.url);
                if (viable.length) {
                    return viable.slice(0, 10);
                }
            }
        }
        if (safeDomain(page.url).includes("youtube.com")) {
            await this.scroll(policy, { pageId: page.id, deltaY: 720 }).catch(() => null);
            await sleep(500);
            const resultSnapshot = await this.queryElements(policy, {
                pageId: page.id,
                limit: cappedLimit,
            });
            const ranked = rankBrowserResultCandidates(resultSnapshot.matches, query, page.url);
            if (ranked.length > bestObserved.length) {
                bestObserved = ranked;
            }
            const viable = selectViableBrowserMissionCandidates(ranked, page.url);
            if (viable.length) {
                return viable.slice(0, 10);
            }
        }
        return bestObserved.slice(0, 10);
    }
    async searchAndOpenBestResult(policy, input) {
        const query = compactWhitespace(input.query);
        if (!query) {
            throw new Error("browser_search_and_open_best_result requires a query.");
        }
        const searchLoop = this.beginLoopAction("search_mission", `${query}|${compactWhitespace(input.url || input.pageId || "active")}`, {
            maxAttempts: BROWSER_MISSION_LOOP_MAX_ATTEMPTS,
            cooldownMs: 18_000,
            suppressionMs: 12_000,
        });
        if (!searchLoop.allowed) {
            throw new Error(searchLoop.reason || "Binary blocked repeated browser search mission attempts.");
        }
        const requestedUrl = compactWhitespace(input.url || "");
        if (requestedUrl && safeDomain(requestedUrl).includes("youtube.com")) {
            const activePage = await this.getActivePage(policy).catch(() => null);
            const activeDomain = safeDomain(activePage?.url || "");
            if (activePage &&
                activeDomain.includes("youtube.com") &&
                /\/watch\b/i.test(String(activePage.url || "")) &&
                pageLikelyMatchesQuery(activePage, query)) {
                await this.activateTargetIfAllowed(policy, activePage.id, { forceForeground: input.forceForeground === true });
                this.markLoopActionSuccess("search_mission", `${query}|${compactWhitespace(input.url || input.pageId || "active")}`);
                return await this.runMissionWithLease("browser_search_and_open_best_result", activePage, async () => ({
                    searchPage: activePage,
                    finalPage: activePage,
                    clickedResult: null,
                    candidates: [],
                }));
            }
        }
        let searchPage = null;
        const directSearchUrl = typeof input.url === "string" && input.url.trim() ? buildBrowserSiteSearchUrl(input.url, query) : null;
        if (directSearchUrl) {
            searchPage = await this.resolveMissionPage(policy, { url: directSearchUrl }, { forceForeground: input.forceForeground === true });
            await this.waitForMissionResults(policy, searchPage.id, query, directSearchUrl);
        }
        else if (typeof input.url === "string" && input.url.trim()) {
            searchPage = await this.resolveMissionPage(policy, { url: input.url.trim() }, { forceForeground: input.forceForeground === true });
            const inputSnapshot = await this.queryElements(policy, {
                pageId: searchPage.id,
                query: "search",
                limit: Math.max(8, Math.min(Number(input.limit || 12), 24)),
            });
            const rankedInputs = rankBrowserResultCandidates(inputSnapshot.matches, "search", searchPage.url);
            const searchInput = rankedInputs.find((item) => ["input", "textarea"].includes(String(item.tagName || "").toLowerCase()) ||
                ["combobox", "searchbox", "textbox"].includes(String(item.role || "").toLowerCase()));
            if (!searchInput) {
                throw new Error(`Binary could not find a searchable input on ${searchPage.title || searchPage.url}.`);
            }
            await this.type(policy, { pageId: searchPage.id, elementId: searchInput.id, text: query });
            await this.pressKeys(policy, { pageId: searchPage.id, keys: ["Enter"] });
            await this.waitForMissionResults(policy, searchPage.id, query, searchPage.url);
        }
        else if (typeof input.pageId === "string" && input.pageId.trim()) {
            searchPage = (await this.listPages(policy)).find((page) => page.id === input.pageId) || null;
            if (!searchPage) {
                throw new Error(`Browser page ${input.pageId} was not found.`);
            }
            const pageSearchUrl = buildBrowserSiteSearchUrl(searchPage.url, query);
            if (pageSearchUrl) {
                searchPage = await this.navigate(policy, { pageId: searchPage.id, url: pageSearchUrl }, { forceForeground: input.forceForeground === true });
                await this.waitForMissionResults(policy, searchPage.id, query, pageSearchUrl);
            }
            else {
                const inputSnapshot = await this.queryElements(policy, {
                    pageId: searchPage.id,
                    query: "search",
                    limit: Math.max(8, Math.min(Number(input.limit || 12), 24)),
                });
                const rankedInputs = rankBrowserResultCandidates(inputSnapshot.matches, "search", searchPage.url);
                const searchInput = rankedInputs.find((item) => ["input", "textarea"].includes(String(item.tagName || "").toLowerCase()) ||
                    ["combobox", "searchbox", "textbox"].includes(String(item.role || "").toLowerCase()));
                if (!searchInput) {
                    throw new Error(`Binary could not find a searchable input on ${searchPage.title || searchPage.url}.`);
                }
                await this.type(policy, { pageId: searchPage.id, elementId: searchInput.id, text: query });
                await this.pressKeys(policy, { pageId: searchPage.id, keys: ["Enter"] });
                await this.waitForMissionResults(policy, searchPage.id, query, searchPage.url);
            }
        }
        else {
            throw new Error("browser_search_and_open_best_result requires either url or pageId.");
        }
        const currentPage = searchPage ? (await this.resolveMissionResultPage(policy, searchPage.id, searchPage)) : null;
        if (!currentPage) {
            throw new Error("Binary could not resolve the browser page after searching.");
        }
        return await this.runMissionWithLease("browser_search_and_open_best_result", currentPage, async () => {
            if (searchLoop.recoverySuggested) {
                await this.snapshotDom(policy, {
                    pageId: currentPage.id,
                    limit: Math.max(8, Math.min(Number(input.limit || 12), 24)),
                }).catch(() => null);
            }
            const desiredResultQuery = compactWhitespace(input.resultQuery || query);
            const rankedCandidates = await this.collectMissionCandidates(policy, currentPage, desiredResultQuery, Math.max(12, Math.min(Number(input.limit || 12) * 3, 40)));
            const bestResult = rankedCandidates[0] || null;
            if (!bestResult) {
                return {
                    searchPage: currentPage,
                    finalPage: currentPage,
                    clickedResult: null,
                    candidates: rankedCandidates,
                    ...(directSearchUrl ? { directSearchUrl } : {}),
                };
            }
            await this.click(policy, {
                pageId: currentPage.id,
                elementId: bestResult.id,
                selector: bestResult.selector,
            });
            await sleep(1_100);
            this.markLoopActionSuccess("search_mission", `${query}|${compactWhitespace(input.url || input.pageId || "active")}`);
            const finalPage = await this.resolveMissionResultPage(policy, currentPage.id, currentPage);
            return {
                searchPage: currentPage,
                finalPage,
                clickedResult: bestResult,
                candidates: rankedCandidates.slice(0, 10),
                ...(directSearchUrl ? { directSearchUrl } : {}),
            };
        });
    }
    async loginAndContinue(policy, input) {
        const page = await this.resolveMissionPage(policy, input);
        return await this.runMissionWithLease("browser_login_and_continue", page, async () => {
            const actions = [];
            const matchedFields = [];
            const missingFields = [];
            const alreadyAuthenticated = await this.waitForMissionOutcome(policy, page.id, {
                waitForText: input.waitForText || input.continueQuery,
                waitForUrlIncludes: input.waitForUrlIncludes,
                durationMs: 250,
            });
            if (alreadyAuthenticated) {
                return {
                    startPage: page,
                    finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                    authenticated: true,
                    submitted: false,
                    actions: ["already_authenticated"],
                    matchedFields,
                    missingFields,
                };
            }
            const fields = [];
            if (typeof input.username === "string" && input.username.length) {
                fields.push({
                    label: "Email or username",
                    name: "email",
                    query: "email username login user",
                    value: input.username,
                    kind: "text",
                });
            }
            if (typeof input.password === "string" && input.password.length) {
                fields.push({
                    label: "Password",
                    name: "password",
                    query: "password",
                    value: input.password,
                    kind: "password",
                });
            }
            if (fields.length) {
                const formState = await this.readFormState(policy, { pageId: page.id });
                const controls = this.normalizeFormControls(formState);
                const assignment = this.matchMissionFields(controls, fields);
                missingFields.push(...assignment.missing);
                for (const entry of assignment.matched) {
                    await this.setMissionControlValue(policy, page.id, entry.control, entry.field);
                    actions.push(`filled:${entry.field.label || entry.field.name || entry.field.query || "field"}`);
                    matchedFields.push({
                        fieldLabel: compactWhitespace(entry.field.label || entry.field.name || entry.field.query || "field"),
                        selector: entry.control.selector,
                        type: entry.control.type,
                        name: entry.control.name,
                        label: entry.control.label,
                    });
                }
            }
            let submitted = false;
            const submitQuery = compactWhitespace(input.submitQuery || "sign in login continue submit");
            const submitTarget = await this.clickBestQueryElement(policy, page, submitQuery).catch(() => null);
            if (submitTarget) {
                actions.push(`clicked:${submitQuery}`);
                submitted = true;
            }
            else if (fields.length) {
                await this.pressKeys(policy, { pageId: page.id, keys: ["Enter"] }).catch(() => null);
                actions.push("pressed_enter");
                submitted = true;
            }
            if (submitted && input.continueQuery) {
                const currentPage = (await this.resolveMissionResultPage(policy, page.id, page)) || page;
                const continueTarget = await this.clickBestQueryElement(policy, currentPage, input.continueQuery).catch(() => null);
                if (continueTarget) {
                    actions.push(`clicked:${input.continueQuery}`);
                }
            }
            const authenticated = await this.waitForMissionOutcome(policy, page.id, {
                waitForText: input.waitForText || input.continueQuery,
                waitForUrlIncludes: input.waitForUrlIncludes,
                durationMs: 5_000,
            });
            return {
                startPage: page,
                finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                authenticated,
                submitted,
                actions,
                matchedFields,
                missingFields,
            };
        });
    }
    async completeForm(policy, input) {
        const page = await this.resolveMissionPage(policy, input);
        return await this.runMissionWithLease("browser_complete_form", page, async () => {
            const formState = await this.readFormState(policy, { pageId: page.id });
            const controls = this.normalizeFormControls(formState);
            const assignment = this.matchMissionFields(controls, Array.isArray(input.fields) ? input.fields : []);
            const actions = [];
            const matchedFields = [];
            for (const entry of assignment.matched) {
                await this.setMissionControlValue(policy, page.id, entry.control, entry.field);
                actions.push(`filled:${entry.field.label || entry.field.name || entry.field.query || "field"}`);
                matchedFields.push({
                    fieldLabel: compactWhitespace(entry.field.label || entry.field.name || entry.field.query || "field"),
                    selector: entry.control.selector,
                    type: entry.control.type,
                    name: entry.control.name,
                    label: entry.control.label,
                });
            }
            let submitted = false;
            if (input.submit) {
                const submitTarget = await this.clickBestQueryElement(policy, page, compactWhitespace(input.submitQuery || "submit continue next save")).catch(() => null);
                if (submitTarget) {
                    actions.push(`clicked:${compactWhitespace(input.submitQuery || "submit")}`);
                    submitted = true;
                }
                else {
                    await this.pressKeys(policy, { pageId: page.id, keys: ["Enter"] }).catch(() => null);
                    actions.push("pressed_enter");
                    submitted = true;
                }
                await this.waitForMissionOutcome(policy, page.id, {
                    waitForText: input.waitForText,
                    waitForUrlIncludes: input.waitForUrlIncludes,
                    durationMs: 4_500,
                }).catch(() => false);
            }
            return {
                page,
                finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                submitted,
                actions,
                matchedFields,
                missingFields: assignment.missing,
            };
        });
    }
    async extractAndDecide(policy, input) {
        const page = await this.resolveMissionPage(policy, input);
        return await this.runMissionWithLease("browser_extract_and_decide", page, async () => {
            await this.waitForMissionOutcome(policy, page.id, {
                waitForText: input.query,
                durationMs: 1_000,
            }).catch(() => false);
            const candidates = await this.collectMissionCandidates(policy, page, compactWhitespace(input.query), Math.max(12, Math.min(Number(input.limit || 12) * 2, 36)));
            const options = Array.isArray(input.options) ? input.options.map((item) => compactWhitespace(String(item || ""))).filter(Boolean) : [];
            let selectedOption;
            let bestCandidate = candidates[0] || null;
            if (bestCandidate && options.length) {
                const ranked = candidates
                    .map((candidate) => {
                    const haystack = compactWhitespace(`${candidate.label || ""} ${candidate.text || ""} ${candidate.href || ""}`).toLowerCase();
                    let bestOption = "";
                    let bonus = 0;
                    for (const option of options) {
                        const normalized = option.toLowerCase();
                        let score = 0;
                        if (haystack.includes(normalized))
                            score += 140;
                        score += compactTerms(normalized).reduce((total, term) => total + (haystack.includes(term) ? 14 : 0), 0);
                        if (score > bonus) {
                            bonus = score;
                            bestOption = option;
                        }
                    }
                    return { candidate, score: Number(candidate.score || 0) + bonus, option: bestOption || undefined };
                })
                    .sort((left, right) => right.score - left.score);
                bestCandidate = ranked[0]?.candidate || bestCandidate;
                selectedOption = ranked[0]?.option;
            }
            let clicked = false;
            if (bestCandidate && (input.action || "none") === "click_best") {
                await this.click(policy, {
                    pageId: page.id,
                    elementId: bestCandidate.id,
                    selector: bestCandidate.selector,
                });
                clicked = true;
                await sleep(900);
            }
            return {
                page,
                finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                bestCandidate,
                candidates,
                clicked,
                ...(selectedOption ? { selectedOption } : {}),
            };
        });
    }
    async recoverWorkflow(policy, input) {
        const page = await this.resolveMissionPage(policy, input);
        return await this.runMissionWithLease("browser_recover_workflow", page, async () => {
            const alreadyHealthy = await this.waitForMissionOutcome(policy, page.id, {
                waitForText: input.waitForText || input.goal,
                waitForUrlIncludes: input.waitForUrlIncludes,
                durationMs: 300,
            });
            if (alreadyHealthy) {
                return {
                    page,
                    finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                    recovered: true,
                    actionTaken: "already_healthy",
                    matchedElement: null,
                    candidates: [],
                };
            }
            const queries = [
                compactWhitespace(input.preferredActionQuery || ""),
                "continue",
                "next",
                "accept",
                "allow",
                "ok",
                "close",
                "dismiss",
                "not now",
                "skip",
                compactWhitespace(input.goal || ""),
            ].filter((value, index, values) => value && values.indexOf(value) === index);
            let matchedElement = null;
            let actionTaken;
            let candidates = [];
            for (const query of queries) {
                const snapshot = await this.queryElements(policy, {
                    pageId: page.id,
                    query,
                    limit: Math.max(12, Math.min(Number(input.limit || 12) * 2, 24)),
                }).catch(() => ({ page, matches: [] }));
                const ranked = rankBrowserResultCandidates(snapshot.matches, query, page.url);
                if (ranked.length > candidates.length) {
                    candidates = ranked.slice(0, 10);
                }
                const best = ranked[0] || null;
                if (!best)
                    continue;
                await this.click(policy, {
                    pageId: page.id,
                    elementId: best.id,
                    selector: best.selector,
                }).catch(() => null);
                actionTaken = `clicked:${query}`;
                matchedElement = best;
                await sleep(900);
                const recovered = await this.waitForMissionOutcome(policy, page.id, {
                    waitForText: input.waitForText || input.goal,
                    waitForUrlIncludes: input.waitForUrlIncludes,
                    durationMs: 3_000,
                });
                if (recovered) {
                    return {
                        page,
                        finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                        recovered: true,
                        actionTaken,
                        matchedElement,
                        candidates,
                    };
                }
            }
            return {
                page,
                finalPage: (await this.resolveMissionResultPage(policy, page.id, page)) || page,
                recovered: false,
                actionTaken,
                matchedElement,
                candidates,
            };
        });
    }
    async scroll(policy, input) {
        const selector = input.elementId || input.selector ? this.resolveSelector(input.pageId, input.elementId, input.selector, "scroll") : undefined;
        const session = await this.ensurePageSession(policy, input.pageId);
        return await this.evaluate(session.sessionId, buildScrollScript(input.deltaY || 640, selector));
    }
    async waitFor(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        const timeoutMs = Math.max(0, Math.min(Number(input.durationMs || 0), 30_000));
        const startedAt = Date.now();
        do {
            const probe = await this.evaluate(session.sessionId, buildWaitConditionScript({
                selector: input.selector,
                text: input.text,
                urlIncludes: input.urlIncludes,
                titleIncludes: input.titleIncludes,
            }));
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
    async capturePage(policy, input) {
        const session = await this.ensurePageSession(policy, input.pageId);
        const result = await this.sendPageCommand("Page.captureScreenshot", { format: "png" }, session.sessionId);
        return {
            snapshotId: `page_capture_${Date.now().toString(36)}`,
            mimeType: "image/png",
            dataBase64: String(result.data || ""),
        };
    }
    async getNetworkActivity(policy, input) {
        await this.ensurePageSession(policy, input.pageId);
        return limitArray(this.ensurePageState(input.pageId).recentNetwork, Math.max(1, Math.min(input.limit || 20, 50)));
    }
    async getConsoleMessages(policy, input) {
        await this.ensurePageSession(policy, input.pageId);
        return limitArray(this.ensurePageState(input.pageId).recentConsole, Math.max(1, Math.min(input.limit || 20, 50)));
    }
    async ensureSession(policy, allowManagedLaunch) {
        if (!policy.enabled || !policy.allowBrowserNative)
            return null;
        const allowAttachExisting = parseEnvBool(process.env.BINARY_BROWSER_ATTACH_EXISTING, true) &&
            this.sessionModeOverride !== "managed_only" &&
            policy.browserAttachMode !== "managed_only";
        const allowProfileFallback = parseEnvBool(process.env.BINARY_BROWSER_ALLOW_PROFILE_FALLBACK, true);
        if (this.session) {
            if (this.sessionModeOverride === "managed_only" && this.session.mode !== "managed") {
                this.resetPageTracking();
                this.browserConnection?.close();
                this.browserConnection = null;
                this.session = null;
            }
            else if (this.sessionModeOverride === "reuse_first" && this.session.mode === "managed") {
                this.resetPageTracking();
                this.browserConnection?.close();
                this.browserConnection = null;
                this.session = null;
            }
        }
        if (this.session) {
            try {
                await waitForVersion(this.session.endpoint, 1_000);
                return this.session;
            }
            catch {
                this.browserConnection?.close();
                this.browserConnection = null;
                this.session = null;
            }
        }
        if (allowAttachExisting) {
            const attached = await discoverExistingSession(policy);
            if (attached) {
                this.session = attached;
                return attached;
            }
            if (allowManagedLaunch && allowProfileFallback) {
                const profileSession = await launchProfileBackedBrowser(policy);
                if (profileSession) {
                    this.session = profileSession;
                    return profileSession;
                }
            }
        }
        if (!allowManagedLaunch)
            return null;
        this.session = await launchManagedBrowser(policy);
        return this.session;
    }
    async ensureBrowserConnection(session) {
        if (!this.browserConnection) {
            this.browserConnection = new CdpConnection(session.browserWsUrl);
        }
        await this.browserConnection.ensureOpen();
        if (!this.browserEventsAttached) {
            this.browserConnection.onEvent((method, params, sessionId) => {
                if (!sessionId)
                    return;
                const pageId = Array.from(this.pageSessionIds.entries()).find((entry) => entry[1] === sessionId)?.[0];
                if (!pageId)
                    return;
                const pageState = this.ensurePageState(pageId);
                const lease = this.pageLeases.get(pageId);
                if (method === "Runtime.consoleAPICalled") {
                    const args = Array.isArray(params.args) ? params.args : [];
                    const text = args
                        .map((item) => {
                        const record = item;
                        return compactWhitespace(String(record.value || record.description || ""));
                    })
                        .filter(Boolean)
                        .join(" ");
                    pageState.recentConsole = limitArray([...pageState.recentConsole, { at: nowIso(), level: String(params.type || "log"), text }], MAX_CONSOLE_EVENTS);
                }
                if (method === "Runtime.exceptionThrown") {
                    const details = params.exceptionDetails;
                    pageState.recentConsole = limitArray([
                        ...pageState.recentConsole,
                        {
                            at: nowIso(),
                            level: "exception",
                            text: compactWhitespace(String(details?.text || details?.exception?.description || "Unhandled exception")),
                        },
                    ], MAX_CONSOLE_EVENTS);
                }
                if (method === "Network.requestWillBeSent") {
                    pageState.recentNetwork = limitArray([
                        ...pageState.recentNetwork,
                        {
                            at: nowIso(),
                            phase: "request",
                            url: String(params.request?.url || ""),
                            method: String(params.request?.method || ""),
                            resourceType: String(params.type || ""),
                        },
                    ], MAX_NETWORK_EVENTS);
                }
                if (method === "Network.responseReceived") {
                    pageState.recentNetwork = limitArray([
                        ...pageState.recentNetwork,
                        {
                            at: nowIso(),
                            phase: "response",
                            url: String(params.response?.url || ""),
                            status: Number(params.response?.status || 0) || undefined,
                            resourceType: String(params.type || ""),
                        },
                    ], MAX_NETWORK_EVENTS);
                }
                if (method === "Network.loadingFailed") {
                    pageState.recentNetwork = limitArray([
                        ...pageState.recentNetwork,
                        {
                            at: nowIso(),
                            phase: "failed",
                            url: String(params.requestId || ""),
                            errorText: String(params.errorText || "Network request failed"),
                        },
                    ], MAX_NETWORK_EVENTS);
                }
                if (method === "Page.frameNavigated") {
                    const frame = params.frame;
                    const nextUrl = compactWhitespace(String(frame?.url || ""));
                    const nextOrigin = originFromUrl(nextUrl);
                    if (lease) {
                        lease.updatedAt = nowIso();
                        if (nextUrl)
                            lease.lastObservedUrl = nextUrl;
                        if (lease.sessionMode !== "managed" && lease.expectedOrigin && nextOrigin && lease.expectedOrigin !== nextOrigin) {
                            this.markMissionLeaseConflict(pageId, `The leased page navigated away from ${lease.expectedOrigin} to ${nextOrigin} during automation.`);
                        }
                    }
                }
            });
            this.browserEventsAttached = true;
        }
        return this.browserConnection;
    }
    async ensurePageSession(policy, pageId) {
        const session = await this.ensureSession(policy, true);
        if (!session)
            throw new Error("Binary could not connect to a browser-native session.");
        const page = (await this.listPages(policy)).find((item) => item.id === pageId);
        if (!page)
            throw new Error(`Browser page ${pageId} was not found.`);
        if (!this.pageSessionIds.has(pageId)) {
            const browserConnection = await this.ensureBrowserConnection(session);
            const attached = await browserConnection.command("Target.attachToTarget", { targetId: pageId, flatten: true });
            const sessionId = String(attached.sessionId || "");
            if (!sessionId)
                throw new Error(`Failed to attach to browser page ${pageId}.`);
            this.pageSessionIds.set(pageId, sessionId);
            await this.sendPageCommand("Page.enable", {}, sessionId);
            await this.sendPageCommand("Runtime.enable", {}, sessionId);
            await this.sendPageCommand("Network.enable", {}, sessionId);
            this.ensurePageState(pageId);
        }
        this.lastActivePageId = pageId;
        this.ensurePageState(pageId).lastActivatedAt = nowIso();
        return { sessionId: this.pageSessionIds.get(pageId), page };
    }
    resetPageTracking() {
        this.pageStates.clear();
        this.pageSessionIds.clear();
        this.elementRefs.clear();
        this.snapshots.clear();
        this.pageLeases.clear();
        this.actionLoops.clear();
        this.lastActivePageId = null;
    }
    ensurePageState(pageId) {
        const existing = this.pageStates.get(pageId);
        if (existing)
            return existing;
        const next = {
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
    async sendPageCommand(method, params, sessionId) {
        if (!this.browserConnection)
            throw new Error("Browser connection has not been initialized.");
        return await this.browserConnection.command(method, params, sessionId);
    }
    async evaluate(sessionId, expression) {
        const result = await this.sendPageCommand("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }, sessionId);
        return (result.result?.value ?? null);
    }
    storeElementRefs(pageId, rawMatches) {
        return rawMatches
            .filter((item) => String(item.selector || "").trim())
            .map((item, index) => {
            const id = `element_${pageId}_${Date.now().toString(36)}_${index.toString(36)}`;
            const record = {
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
                score: Number(item.score || 0) || undefined,
            };
        });
    }
    resolveSelector(pageId, elementId, selector, purpose = "click") {
        const selectors = this.resolveSelectorCandidates(pageId, elementId, selector, purpose);
        if (selectors.length)
            return selectors[0];
        throw new Error("Browser action requires an elementId or selector.");
    }
    resolveSelectorCandidates(pageId, elementId, selector, purpose = "click") {
        const candidates = [];
        const directSelector = String(selector || "").trim();
        if (directSelector)
            candidates.push(directSelector);
        const record = elementId ? this.elementRefs.get(elementId) : null;
        if (record && record.pageId === pageId && String(record.selector || "").trim()) {
            candidates.push(record.selector);
        }
        const inferredSelector = this.inferSelectorFromRecentSnapshot(pageId, purpose);
        if (inferredSelector)
            candidates.push(inferredSelector);
        return Array.from(new Set(candidates.filter((item) => String(item || "").trim())));
    }
    async evaluateWithSelectorFallback(sessionId, pageId, input) {
        const selectors = this.resolveSelectorCandidates(pageId, input.elementId, input.selector, input.purpose);
        if (!selectors.length) {
            throw new Error("Browser action requires an elementId or selector.");
        }
        let lastResult = null;
        for (const selector of selectors) {
            const result = await this.evaluate(sessionId, input.expression(selector));
            lastResult = result;
            if (result.ok !== false || String(result.reason || "").toLowerCase() !== "element not found") {
                return result;
            }
        }
        return lastResult || { ok: false, reason: "Element not found" };
    }
    inferSelectorFromRecentSnapshot(pageId, purpose) {
        const pageState = this.pageStates.get(pageId);
        const snapshotId = pageState?.lastSnapshotId;
        if (!snapshotId)
            return null;
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot)
            return null;
        const visible = snapshot.interactiveElements.filter((item) => item.visible !== false && item.disabled !== true);
        const scored = (visible.length ? visible : snapshot.interactiveElements).filter((item) => String(item.selector || "").trim());
        const candidates = purpose === "type"
            ? scored.filter((item) => ["input", "textarea", "select"].includes(String(item.tagName || "").toLowerCase()) ||
                ["textbox", "combobox", "searchbox"].includes(String(item.role || "").toLowerCase()))
            : purpose === "click"
                ? scored.filter((item) => ["a", "button", "summary"].includes(String(item.tagName || "").toLowerCase()) ||
                    ["link", "button"].includes(String(item.role || "").toLowerCase()))
                : scored;
        return candidates[0]?.selector || scored[0]?.selector || null;
    }
    assertUrlAllowed(policy, url) {
        const domain = safeDomain(url);
        if (!domain)
            return;
        if (Array.isArray(policy.blockedDomains) && policy.blockedDomains.some((item) => domain === item || domain.endsWith(`.${item}`))) {
            throw new Error(`Browser autonomy blocked navigation to ${domain}.`);
        }
    }
    pruneSnapshots() {
        const snapshots = Array.from(this.snapshots.values()).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
        while (snapshots.length > MAX_SNAPSHOTS) {
            const removed = snapshots.shift();
            if (removed)
                this.snapshots.delete(removed.id);
        }
    }
}
