import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const APP_CACHE_TTL_MS = 60_000;

export type MachineAutonomyPolicy = {
  enabled: boolean;
  alwaysOn: boolean;
  allowAppLaunch: boolean;
  allowShellCommands: boolean;
  allowUrlOpen: boolean;
  allowFileOpen: boolean;
  allowDesktopObservation: boolean;
  allowBrowserNative: boolean;
  allowEventAgents: boolean;
  allowWholeMachineAccess: boolean;
  allowElevation: boolean;
  focusPolicy: "never_steal" | "avoid_if_possible" | "allowed";
  sessionPolicy: "attach_carefully" | "managed_only" | "live_session";
  allowVisibleFallback: boolean;
  autonomyPosture: "near_total" | "guarded";
  suppressForegroundWhileTyping: boolean;
  focusLeaseTtlMs: number;
  preferTerminalForCoding: boolean;
  browserAttachMode: "existing_or_managed" | "managed_only";
  allowedBrowsers: string[];
  blockedDomains: string[];
  elevatedTrustDomains: string[];
  updatedAt: string;
};

export type ParsedMachineAutonomyTask =
  | {
      kind: "launch_app";
      query: string;
      originalTask: string;
    }
  | null;

export type DiscoveredApp = {
  id: string;
  name: string;
  aliases: string[];
  platform: NodeJS.Platform;
  source: "windows_start_apps" | "windows_shortcut" | "windows_steam" | "windows_quick_alias" | "mac_applications";
  installLocation?: string;
  appId?: string;
  launch:
    | { kind: "shell"; target: string }
    | { kind: "path"; target: string }
    | { kind: "bundle"; target: string };
};

export type AppLaunchResult = {
  app: DiscoveredApp;
  summary: string;
  command: string;
  createdAt: string;
};

type CachedApps = {
  apps: DiscoveredApp[];
  indexedAt: string;
  expiresAt: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function defaultMachineAutonomyPolicy(): MachineAutonomyPolicy {
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
    allowElevation: false,
    focusPolicy: "avoid_if_possible",
    sessionPolicy: "attach_carefully",
    allowVisibleFallback: true,
    autonomyPosture: "guarded",
    suppressForegroundWhileTyping: true,
    focusLeaseTtlMs: 4_000,
    preferTerminalForCoding: true,
    browserAttachMode: "managed_only",
    allowedBrowsers: ["chrome", "edge", "brave", "arc", "chromium"],
    blockedDomains: [],
    elevatedTrustDomains: [],
    updatedAt: nowIso(),
  };
}

function normalizeSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeSearchText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value.trim());
  }
  return out;
}

function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

function basenameWithoutExtension(targetPath: string): string {
  return path.basename(targetPath, path.extname(targetPath));
}

function scoreCandidate(app: DiscoveredApp, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const normalizedName = normalizeSearchText(app.name);
  const normalizedAliases = app.aliases.map(normalizeSearchText).filter(Boolean);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;
  if (normalizedName === normalizedQuery) score += 120;
  if (normalizedAliases.includes(normalizedQuery)) score += 110;
  if (normalizedName.startsWith(normalizedQuery)) score += 85;
  if (normalizedAliases.some((alias) => alias.startsWith(normalizedQuery))) score += 80;
  if (normalizedName.includes(normalizedQuery)) score += 70;
  if (normalizedAliases.some((alias) => alias.includes(normalizedQuery))) score += 65;
  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 8;
    if (normalizedAliases.some((alias) => alias.includes(token))) score += 6;
  }
  if (app.source === "windows_steam") score += 4;
  return score;
}

const DEFAULT_MIN_APP_MATCH_SCORE = 32;

export function findBestAppMatch(
  apps: DiscoveredApp[],
  query: string,
  options?: { minScore?: number }
): DiscoveredApp | null {
  const minScore = Math.max(0, options?.minScore ?? DEFAULT_MIN_APP_MATCH_SCORE);
  let best: { app: DiscoveredApp; score: number } | null = null;
  for (const app of apps) {
    const score = scoreCandidate(app, query);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && app.name.localeCompare(best.app.name) < 0)) {
      best = { app, score };
    }
  }
  if (!best || best.score < minScore) return null;
  return best.app;
}

export function parseMachineAutonomyTask(task: string): ParsedMachineAutonomyTask {
  const trimmed = String(task || "").trim();
  if (!trimmed) return null;
  const openMatch = trimmed.match(/^(?:please\s+)?(?:open|launch|start|run)\s+(.+?)$/i);
  if (!openMatch?.[1]) return null;
  const query = openMatch[1].trim().replace(/[.?!]+$/g, "");
  if (!query) return null;
  return {
    kind: "launch_app",
    query,
    originalTask: trimmed,
  };
}

function decodeSteamPath(raw: string): string {
  return raw.replace(/\\\\/g, "\\");
}

export function parseSteamAppManifest(raw: string): { appId: string; name: string } | null {
  const appId = raw.match(/"appid"\s+"([^"]+)"/i)?.[1]?.trim();
  const name = raw.match(/"name"\s+"([^"]+)"/i)?.[1]?.trim();
  if (!appId || !name) return null;
  return { appId, name };
}

async function readWindowsStartApps(): Promise<DiscoveredApp[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "$apps = Get-StartApps | Sort-Object Name; $apps | Select-Object Name,AppID | ConvertTo-Json -Compress"',
      {
        windowsHide: true,
        maxBuffer: 2_000_000,
      }
    );
    const parsed = JSON.parse(String(stdout || "[]")) as Array<{ Name?: string; AppID?: string }> | { Name?: string; AppID?: string };
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return items
      .filter((item) => item?.Name && item?.AppID)
      .map((item) => ({
        id: `start:${item.AppID}`,
        name: String(item.Name),
        aliases: uniqueAliases([String(item.Name)]),
        platform: process.platform,
        source: "windows_start_apps" as const,
        appId: String(item.AppID),
        launch: {
          kind: "shell" as const,
          target: `shell:AppsFolder\\${String(item.AppID)}`,
        },
      }));
  } catch {
    return [];
  }
}

async function collectShortcutApps(root: string): Promise<DiscoveredApp[]> {
  const apps: DiscoveredApp[] = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".lnk") continue;
      const label = basenameWithoutExtension(entry.name);
      apps.push({
        id: `shortcut:${fullPath}`,
        name: label,
        aliases: uniqueAliases([label]),
        platform: process.platform,
        source: "windows_shortcut",
        installLocation: fullPath,
        launch: {
          kind: "path",
          target: fullPath,
        },
      });
    }
  }

  return apps;
}

async function readWindowsShortcutApps(): Promise<DiscoveredApp[]> {
  if (process.platform !== "win32") return [];
  const roots = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(os.homedir(), "Desktop"),
    path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop"),
  ];
  const out: DiscoveredApp[] = [];
  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    out.push(...(await collectShortcutApps(root)));
  }
  return out;
}

async function readWindowsSteamApps(): Promise<DiscoveredApp[]> {
  if (process.platform !== "win32") return [];
  const possibleSteamRoots = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam"),
  ];
  const libraryPaths = new Set<string>();

  for (const root of possibleSteamRoots) {
    if (!(await pathExists(root))) continue;
    libraryPaths.add(root);
    const libraryFile = path.join(root, "steamapps", "libraryfolders.vdf");
    const raw = await fs.readFile(libraryFile, "utf8").catch(() => "");
    for (const match of raw.matchAll(/"path"\s+"([^"]+)"/gi)) {
      if (match[1]) libraryPaths.add(decodeSteamPath(match[1]));
    }
  }

  const apps: DiscoveredApp[] = [];
  for (const library of libraryPaths) {
    const steamAppsDir = path.join(library, "steamapps");
    const files = await fs.readdir(steamAppsDir).catch(() => []);
    for (const file of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
      const raw = await fs.readFile(path.join(steamAppsDir, file), "utf8").catch(() => "");
      const manifest = parseSteamAppManifest(raw);
      if (!manifest) continue;
      const installDir = path.join(steamAppsDir, "common", manifest.name);
      apps.push({
        id: `steam:${manifest.appId}`,
        name: manifest.name,
        aliases: uniqueAliases([manifest.name, `${manifest.name} steam`, path.basename(installDir)]),
        platform: process.platform,
        source: "windows_steam",
        installLocation: installDir,
        appId: manifest.appId,
        launch: {
          kind: "shell",
          target: `steam://rungameid/${manifest.appId}`,
        },
      });
    }
  }

  return apps;
}

async function readMacApplications(): Promise<DiscoveredApp[]> {
  if (process.platform !== "darwin") return [];
  const roots = ["/Applications", path.join(os.homedir(), "Applications")];
  const apps: DiscoveredApp[] = [];

  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
      const fullPath = path.join(root, entry.name);
      const label = basenameWithoutExtension(entry.name);
      apps.push({
        id: `mac:${fullPath}`,
        name: label,
        aliases: uniqueAliases([label]),
        platform: process.platform,
        source: "mac_applications",
        installLocation: fullPath,
        launch: {
          kind: "bundle",
          target: fullPath,
        },
      });
    }
  }

  return apps;
}

function dedupeApps(apps: DiscoveredApp[]): DiscoveredApp[] {
  const seen = new Set<string>();
  const out: DiscoveredApp[] = [];
  for (const app of apps) {
    const key = normalizeSearchText(`${app.source}:${app.name}:${app.launch.target}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(app);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function escapePowerShellSingleQuoted(value: string): string {
  return String(value || "").replace(/'/g, "''");
}

async function runWindowsLaunchCommand(command: string, timeoutMs = 7_000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await execAsync(command, {
      windowsHide: true,
      shell: process.env.ComSpec || "cmd.exe",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out while launching app target after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildWindowsStartProcessCommand(target: string): string {
  const psTarget = escapePowerShellSingleQuoted(target);
  return `powershell -NoProfile -Command "Start-Process -FilePath '${psTarget}'"`;
}

async function launchShellTarget(target: string): Promise<string> {
  if (process.platform === "win32") {
    const command = buildWindowsStartProcessCommand(target);
    await runWindowsLaunchCommand(command);
    return command;
  }

  const command = `open ${JSON.stringify(target)}`;
  await execAsync(command, {
    shell: "/bin/sh",
  });
  return command;
}

async function launchPathTarget(target: string): Promise<string> {
  if (process.platform === "win32") {
    const command = buildWindowsStartProcessCommand(target);
    await runWindowsLaunchCommand(command);
    return command;
  }

  const command = `open ${JSON.stringify(target)}`;
  await execAsync(command, {
    shell: "/bin/sh",
  });
  return command;
}

async function launchBundleTarget(target: string): Promise<string> {
  const command = `open -a ${JSON.stringify(target)}`;
  await execAsync(command, {
    shell: "/bin/sh",
  });
  return command;
}

const WINDOWS_QUICK_APP_ALIASES: Array<{ name: string; aliases: string[]; shellTarget: string; id: string }> = [
  {
    id: "calculator",
    name: "Calculator",
    aliases: ["calculator", "calc", "windows calculator"],
    shellTarget: "calc.exe",
  },
  {
    id: "notepad",
    name: "Notepad",
    aliases: ["notepad", "note pad", "editor"],
    shellTarget: "notepad.exe",
  },
  {
    id: "file-explorer",
    name: "File Explorer",
    aliases: ["file explorer", "explorer", "windows explorer"],
    shellTarget: "explorer.exe",
  },
];

async function tryLaunchQuickAlias(query: string): Promise<AppLaunchResult | null> {
  if (process.platform !== "win32") return null;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  const match = WINDOWS_QUICK_APP_ALIASES.find((entry) =>
    entry.aliases.some((alias) => normalizeSearchText(alias) === normalizedQuery)
  );
  if (!match) return null;
  const command = await launchShellTarget(match.shellTarget);
  return {
    app: {
      id: `quick:${match.id}`,
      name: match.name,
      aliases: uniqueAliases([match.name, ...match.aliases]),
      platform: process.platform,
      source: "windows_quick_alias",
      launch: {
        kind: "shell",
        target: match.shellTarget,
      },
    },
    summary: `Launched ${match.name} from quick alias routing.`,
    command,
    createdAt: nowIso(),
  };
}

export class MachineAutonomyController {
  private cache: CachedApps | null = null;

  async listApps(options?: { forceRefresh?: boolean }): Promise<{ apps: DiscoveredApp[]; indexedAt: string }> {
    const forceRefresh = options?.forceRefresh === true;
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return { apps: this.cache.apps, indexedAt: this.cache.indexedAt };
    }

    const apps = dedupeApps([
      ...(await readWindowsStartApps()),
      ...(await readWindowsShortcutApps()),
      ...(await readWindowsSteamApps()),
      ...(await readMacApplications()),
    ]);
    const indexedAt = nowIso();
    this.cache = {
      apps,
      indexedAt,
      expiresAt: Date.now() + APP_CACHE_TTL_MS,
    };
    return { apps, indexedAt };
  }

  async launchApp(query: string): Promise<AppLaunchResult> {
    const quickAliasResult = await tryLaunchQuickAlias(query);
    if (quickAliasResult) return quickAliasResult;

    const { apps } = await this.listApps();
    const app = findBestAppMatch(apps, query);
    if (!app) {
      throw new Error(`No installed app matched "${query}".`);
    }

    let command = "";
    if (app.launch.kind === "shell") command = await launchShellTarget(app.launch.target);
    else if (app.launch.kind === "path") command = await launchPathTarget(app.launch.target);
    else command = await launchBundleTarget(app.launch.target);

    return {
      app,
      summary: `Launched ${app.name} from ${app.source}.`,
      command,
      createdAt: nowIso(),
    };
  }
}
