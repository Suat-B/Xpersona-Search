#!/usr/bin/env node
import { existsSync, promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createHash, randomBytes } from "node:crypto";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { PlaygroundClient, toHostedAssistMode, type HostedAssistMode } from "./client.js";
import { clearApiKey, clearBrowserAuth, getApiKey, getBrowserAccessToken, getBrowserRefreshToken, getConfigPath, loadConfig, saveConfig } from "./config.js";
import { CliHttpError, type SseEvent } from "./http.js";
import {
  LocalHostClient,
  type LocalHostAgentJob,
  type LocalHostAgentProbeEvent,
  type LocalHostAgentProbeSession,
  type LocalHostAutomationDefinition,
  type LocalHostAutomationEvent,
  type LocalHostAutomationTrigger,
  type LocalHostConnectionDraft,
  type LocalHostConnectionView,
  type LocalHostProviderId,
  type LocalHostProviderProfile,
  type LocalHostRunControlAction,
  type LocalHostRunSummary,
} from "./local-host.js";
import { CliToolExecutor, inferTaskProjectRoot } from "./tool-executor.js";
import { AssistMode, AssistRunEnvelope, BillingCycle, CliConfig, CliTransport, PendingToolCall, PlanTier, ToolCall } from "./types.js";

const execAsync = promisify(exec);

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

const HELP = `Binary IDE CLI - Agentic coding runtime

Usage:
  binary <command> [options]
  binary commands

Core commands:
  binary commands                     Show all commands + aliases
  binary chat                         Interactive chat with streaming
  binary debug-runtime "<task>"      Safe hosted runtime debug in an isolated temp workspace
  binary benchmark                   Run host latency benchmark against current model/orchestration
  binary test openhands-gateway      Run OpenHands gateway pytest suite (no Binary Host required)
  binary inspect <path>               Inspect binary metadata + analysis
  binary hexdump <path>               Preview a binary range as hex + ASCII
  binary hash <path>                  Hash a binary target
  binary login                        One-shot browser sign-in
  binary run "<task>"                One-shot task execution
  binary run "<task>" --detach       Start an unattended Binary Host run
  binary connections list
  binary connections add web
  binary connections add remote --name "<name>" --url <url>
  binary connections test <id>
  binary connections enable <id>
  binary connections disable <id>
  binary connections remove <id>
  binary connections import --file <path>
  binary provider list
  binary provider login <provider>
  binary provider import <provider>
  binary provider test <provider>
  binary provider logout <provider>
  binary automations list
  binary automations create --name "<name>" --prompt "<prompt>" --trigger <manual|schedule_nl|file_event|process_event|notification>
  binary automations show <id>
  binary automations run <id>
  binary automations pause <id>
  binary automations resume <id>
  binary automations tail <id>
  binary jobs list
  binary jobs run "<task>"
  binary jobs show <id>
  binary jobs tail <id>
  binary jobs stream <id>
  binary jobs pause <id>
  binary jobs resume <id>
  binary jobs cancel <id>
  binary jobs remote-health
  binary debug-agent chat [sessionId]
  binary debug-agent show <sessionId>
  binary debug-agent tail <sessionId>
  binary runs list [--limit 20]
  binary runs tail <runId>
  binary runs stream <runId>
  binary runs resume <runId>
  binary runs cancel <runId>
  binary runs export <runId>
  binary sessions list [--limit 20]
  binary sessions show <sessionId>
  binary usage
  binary checkout [--tier builder] [--billing monthly]

Auth/config:
  binary auth set-key [API_KEY]
  binary auth browser
  binary auth clear
  binary auth status
  binary config set-base-url <url>
  binary config set-local-host-url <url>
  binary config set-model <model>
  binary config set-transport <auto|host|direct>
  binary config set-tom <on|off>
  binary config show
  binary mcp ...                     Power-user alias for binary connections ...

Execution/index:
  binary replay <sessionId> [--mode plan]
  binary execute --file actions.json [--session <id>]
  binary index upsert --project <key> [--path .]
  binary index query --project <key> "<question>"

Flags:
  --mode auto|plan|yolo|generate|debug
  --transport auto|host|direct
  --model "Binary IDE"
  --tom
  --no-tom
  --help
`;

const COMMANDS_OVERVIEW = `All Binary IDE CLI commands

Primary:
  binary commands
  binary chat
  binary debug-runtime "<task>"
  binary benchmark
  binary test openhands-gateway [--workspace <dir>] [--python <exe>] [-q]
  binary inspect <path>
  binary hexdump <path> [--offset 0] [--length 256]
  binary hash <path>
  binary login
  binary run "<task>"
  binary run "<task>" --detach
  binary connections list
  binary connections add web
  binary connections add remote --name "<name>" --url <url>
  binary connections test <id>
  binary connections enable <id>
  binary connections disable <id>
  binary connections remove <id>
  binary connections import --file <path>
  binary provider list
  binary provider login <provider>
  binary provider import <provider>
  binary provider test <provider>
  binary provider logout <provider>
  binary automations list
  binary automations create --name "<name>" --prompt "<prompt>" --trigger <manual|schedule_nl|file_event|process_event|notification>
  binary automations show <id>
  binary automations run <id>
  binary automations pause <id>
  binary automations resume <id>
  binary automations tail <id>
  binary debug-agent chat [sessionId]
  binary debug-agent show <sessionId>
  binary debug-agent tail <sessionId>
  binary runs list [--limit 20]
  binary runs tail <runId>
  binary runs stream <runId>
  binary runs resume <runId>
  binary runs cancel <runId>
  binary runs export <runId>
  binary usage
  binary checkout [--tier builder] [--billing monthly]
  binary replay <sessionId> [--mode plan]
  binary execute --file actions.json [--session <id>]

Auth:
  binary auth status
  binary auth browser
  binary auth set-key [API_KEY]
  binary auth clear

Config:
  binary config show
  binary config set-base-url <url>
  binary config set-local-host-url <url>
  binary config set-model <model>
  binary config set-transport <auto|host|direct>
  binary config set-tom <on|off>

Connections:
  binary connections list
  binary connections add web
  binary connections add remote --name <name> --url <url> [--transport http|sse] [--auth none|bearer|api-key|oauth]
  binary connections test <id>
  binary connections enable <id>
  binary connections disable <id>
  binary connections remove <id>
  binary connections import --file <path>
  binary mcp ...     -> same commands as binary connections ...

Providers:
  binary provider list
 binary provider login <provider> [--base-url <url>] [--model <model>] [--default]
 binary provider import <provider> [--base-url <url>] [--model <model>] [--default]
 binary provider open <provider>
 binary provider status <provider>
 binary provider test <provider>
 binary provider refresh <provider>
 binary provider default <provider>
 binary provider logout <provider>

Sessions:
  binary sessions list [--limit 20]
  binary sessions show <sessionId>

Unattended runs:
  binary runs list [--limit 20]
  binary runs show <runId>
  binary runs tail <runId> [--interval 1200]
  binary runs resume <runId> [--note "..."]
  binary runs cancel <runId> [--note "..."]
  binary runs repair <runId> [--note "..."]
  binary runs takeover <runId> [--note "..."]
  binary runs retry-last-turn <runId> [--note "..."]
  binary runs export <runId> [--output run.json]

Index:
  binary index upsert --project <key> [--path .] [--max-files 120] [--chunk-size 3000]
  binary index query --project <key> "<question>" [--limit 8]

Top-level aliases:
  binary whoami          -> binary auth status
  binary logout          -> binary auth clear
  binary set-key ...     -> binary auth set-key ...
  binary set-base-url    -> binary config set-base-url
  binary set-model       -> binary config set-model
  binary sessions-list   -> binary sessions list
  binary sessions-show   -> binary sessions show
  binary runs-list       -> binary runs list
  binary runs-tail       -> binary runs tail
  binary index-upsert    -> binary index upsert
  binary index-query     -> binary index query
`;

const COLOR_ENABLED = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function color(text: string, tone: keyof typeof ANSI): string {
  if (!COLOR_ENABLED) return text;
  return `${ANSI[tone]}${text}${ANSI.reset}`;
}

function dim(text: string): string {
  return color(text, "dim");
}

function bold(text: string): string {
  return color(text, "bold");
}

function badge(label: string, value: string, tone: "cyan" | "green" | "yellow" | "magenta" = "cyan"): string {
  return `${color(label, "gray")} ${color(value, tone)}`;
}

function rule(char = "─", width = 74): string {
  return char.repeat(Math.max(10, width));
}

function clearIfTty(): void {
  if (process.stdout.isTTY) console.clear();
}

function printChatBanner(config: CliConfig, mode: AssistMode, model: string, sessionId?: string): void {
  console.log(color("Binary IDE CLI", "cyan"));
  console.log(dim(rule()));
  console.log(
    [
      badge("Mode:", mode, "yellow"),
      badge("Model:", model, "magenta"),
      badge("API:", config.baseUrl, "green"),
      badge("Session:", sessionId ? sessionId.slice(0, 10) : "new", "cyan"),
    ].join("   ")
  );
  console.log(dim(rule()));
}

function printChatHelp(): void {
  console.log(dim("Commands:"));
  console.log(dim("  /help      Show chat commands"));
  console.log(dim("  /mode <m>  Switch mode (auto|plan|yolo|generate|debug)"));
  console.log(dim("  /new       Start a fresh session"));
  console.log(dim("  /clear     Clear terminal and redraw UI"));
  console.log(dim("  /usage     Show usage limits"));
  console.log(dim("  /checkout  Open monthly builder checkout"));
  console.log(dim("  /exit      Quit chat"));
}

type StreamUiAdapter = {
  onEvent?: (event: SseEvent) => void;
  onLog?: (message: string) => void;
  onStatus?: (status: string) => void;
  onPhase?: (phase: string) => void;
  onDecision?: (mode: string) => void;
  onToolStart?: (pendingToolCall: PendingToolCall) => void;
  onToolResult?: (pendingToolCall: PendingToolCall, summary: string, ok: boolean) => void;
  onToolResultEvent?: (name: string, summary: string, ok: boolean) => void;
  onToken?: (token: string) => void;
  onFinal?: (finalText: string, usedTokenStream: boolean) => void;
};

type ChatInputSource = {
  next(prompt: string): Promise<string | null>;
  close(): void;
};

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (arg.startsWith("--")) {
      const keyValue = arg.slice(2);
      const eqIndex = keyValue.indexOf("=");
      if (eqIndex >= 0) {
        flags[keyValue.slice(0, eqIndex)] = keyValue.slice(eqIndex + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          flags[keyValue] = next;
          i += 1;
        } else {
          flags[keyValue] = true;
        }
      }
      continue;
    }

    const key = arg.slice(1);
    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { positionals, flags };
}

function getFlagString(parsed: ParsedArgs, name: string, short?: string): string | undefined {
  const value = parsed.flags[name] ?? (short ? parsed.flags[short] : undefined);
  return typeof value === "string" ? value : undefined;
}

function isHelp(parsed: ParsedArgs): boolean {
  return Boolean(parsed.flags.help || parsed.flags.h || parsed.positionals[0] === "help");
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

const WEB_STARTER_CONNECTION: LocalHostConnectionDraft = {
  name: "Browse websites",
  transport: "sse",
  url: process.env.BINARY_CONNECTIONS_WEB_STARTER_URL || "http://127.0.0.1:8081/sse",
  authMode: "none",
  enabled: true,
  source: "starter",
};

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.length < 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function redactConfigForDisplay(config: CliConfig): Record<string, unknown> {
  return {
    ...config,
    ...(config.apiKey ? { apiKey: maskSecret(config.apiKey) } : {}),
    ...(config.browserAuth
      ? {
          browserAuth: {
            ...config.browserAuth,
            ...(config.browserAuth.accessToken ? { accessToken: maskSecret(config.browserAuth.accessToken) } : {}),
            ...(config.browserAuth.refreshToken ? { refreshToken: maskSecret(config.browserAuth.refreshToken) } : {}),
          },
        }
      : {}),
  };
}

function printConnectionSummary(connection: LocalHostConnectionView): void {
  const tone =
    connection.status === "connected"
      ? "green"
      : connection.status === "needs_auth"
        ? "yellow"
        : connection.status === "failed_test"
          ? "red"
          : "cyan";
  console.log(
    [
      color(connection.name, "cyan"),
      dim(`(${connection.id})`),
      badge("status:", connection.status.replace(/_/g, " "), tone as "cyan" | "green" | "yellow" | "magenta"),
      badge("transport:", connection.transport.toUpperCase(), "magenta"),
      badge("auth:", connection.authMode, "yellow"),
    ].join(" ")
  );
  console.log(dim(`  ${connection.url}`));
  if (connection.lastValidationError) {
    console.log(dim(`  last test: ${connection.lastValidationError}`));
  }
}

function printProviderSummary(provider: LocalHostProviderProfile): void {
  const tone =
    provider.status === "connected"
      ? "green"
      : provider.status === "needs_auth"
        ? "yellow"
        : provider.status === "failed_test"
          ? "magenta"
          : "cyan";
  const flags = [
    badge("status:", provider.status.replace(/_/g, " "), tone as "cyan" | "green" | "yellow" | "magenta"),
    badge("runtime:", provider.runtimeKind.replace(/_/g, " "), "magenta"),
    badge("connect:", provider.connectionMode.replace(/_/g, " "), provider.supportsBrowserAuth ? "green" : "yellow"),
  ];
  if (provider.isDefault) flags.push(badge("default:", "yes", "green"));
  console.log([color(provider.displayName, "cyan"), dim(`(${provider.id})`), ...flags].join(" "));
  console.log(dim(`  ${provider.configuredBaseUrl || provider.defaultBaseUrl}`));
  console.log(dim(`  model: ${provider.configuredModel || provider.defaultModel}`));
  if (provider.linkedAccountLabel) console.log(dim(`  account: ${provider.linkedAccountLabel}`));
  if (provider.routeLabel) console.log(dim(`  route: ${provider.routeLabel}`));
  if (provider.runtimeReady === false && provider.runtimeReadinessReason) {
    console.log(dim(`  runtime: ${provider.runtimeReadinessReason}`));
  }
  if (provider.availableModels?.length) console.log(dim(`  models: ${provider.availableModels.slice(0, 5).join(", ")}`));
  if (provider.lastError) {
    console.log(dim(`  last test: ${provider.lastError}`));
  }
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && /readline was closed/i.test(error.message);
}

async function readNonTtyInputLines(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const text = Buffer.concat(chunks).toString("utf8").replace(/\r\n/g, "\n");
  return text.split("\n");
}

async function createChatInputSource(): Promise<ChatInputSource> {
  if (!process.stdin.isTTY) {
    const lines = await readNonTtyInputLines();
    let index = 0;
    return {
      async next(prompt: string): Promise<string | null> {
        while (index < lines.length) {
          const line = lines[index] ?? "";
          index += 1;
          process.stdout.write(`${prompt}${line}\n`);
          return line;
        }
        return null;
      },
      close(): void {
        // No-op for buffered stdin.
      },
    };
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    async next(prompt: string): Promise<string | null> {
      try {
        return await rl.question(prompt);
      } catch (error) {
        if (isReadlineClosedError(error)) return null;
        throw error;
      }
    },
    close(): void {
      rl.close();
    },
  };
}

type ResolvedAuth = { type: "apiKey"; apiKey: string } | { type: "bearer"; accessToken: string };

function hasValidAccessToken(config: CliConfig): boolean {
  const token = getBrowserAccessToken(config);
  const expiresAt = config.browserAuth?.accessTokenExpiresAt;
  if (!token || !expiresAt) return false;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return false;
  return expiryMs - Date.now() > 45_000;
}

async function refreshBrowserAccessToken(config: CliConfig): Promise<CliConfig | null> {
  const refreshToken = getBrowserRefreshToken(config);
  if (!refreshToken) return null;
  const response = await fetch(`${config.baseUrl}/api/v1/playground/auth/vscode/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return null;
  const parsed = (await response.json().catch(() => null)) as any;
  const accessToken = typeof parsed?.access_token === "string" ? parsed.access_token : "";
  const expiresIn = Number(parsed?.expires_in ?? 900);
  if (!accessToken) return null;

  const next: CliConfig = {
    ...config,
    browserAuth: {
      ...(config.browserAuth || {}),
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
      refreshToken,
    },
  };
  await saveConfig(next);
  return next;
}

async function resolveAuth(config: CliConfig): Promise<{ auth: ResolvedAuth; config: CliConfig }> {
  const apiKey = getApiKey(config);
  if (apiKey) return { auth: { type: "apiKey", apiKey }, config };

  let effective = config;
  if (!hasValidAccessToken(effective)) {
    const refreshed = await refreshBrowserAccessToken(effective);
    if (refreshed) effective = refreshed;
  }
  const accessToken = getBrowserAccessToken(effective);
  if (accessToken && hasValidAccessToken(effective)) {
    return { auth: { type: "bearer", accessToken }, config: effective };
  }

  throw new Error(
    "No CLI auth found. Run 'binary auth browser' (recommended) or 'binary auth set-key'."
  );
}

function workspaceFingerprint(input = process.cwd()): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function parseMode(value: string | undefined, fallback: AssistMode): AssistMode {
  if (!value) return fallback;
  if (value === "auto" || value === "plan" || value === "yolo" || value === "generate" || value === "debug") {
    return value;
  }
  throw new Error(`Invalid mode '${value}'. Use auto|plan|yolo|generate|debug.`);
}

function getHostedModeNotice(mode: AssistMode): string | null {
  const hostedMode = toHostedAssistMode(mode);
  if (hostedMode === mode) return null;
  return `Hosted runtime currently maps '${mode}' to '${hostedMode}'.`;
}

function parseTransport(value: string | undefined, fallback: CliTransport = "host"): CliTransport {
  if (!value) return fallback;
  if (value === "auto" || value === "host" || value === "direct") return value;
  throw new Error(`Invalid transport '${value}'. Use auto|host|direct.`);
}

function resolveTomOverride(parsed: ParsedArgs): boolean | undefined {
  const enabled = Boolean(parsed.flags.tom);
  const disabled = Boolean(parsed.flags["no-tom"]);
  if (enabled && disabled) {
    throw new Error("Use either --tom or --no-tom, not both.");
  }
  if (enabled) return true;
  if (disabled) return false;
  return undefined;
}

function resolveTomEnabled(config: CliConfig, parsed: ParsedArgs, defaultEnabled: boolean): boolean {
  const override = resolveTomOverride(parsed);
  if (typeof override === "boolean") return override;
  if (typeof config.tomEnabled === "boolean") return config.tomEnabled;
  return defaultEnabled;
}

type TransportResolution = {
  configured: CliTransport;
  selected: Exclude<CliTransport, "auto">;
  reason: string;
  hostClient?: LocalHostClient;
};

async function resolveTransport(
  config: CliConfig,
  parsed?: ParsedArgs,
  options?: { forceDirect?: boolean }
): Promise<TransportResolution> {
  const configured = options?.forceDirect
    ? "direct"
    : parseTransport(getFlagString(parsed ?? { positionals: [], flags: {} }, "transport"), config.transport ?? "host");

  if (configured === "direct") {
    return {
      configured,
      selected: "direct",
      reason: "direct hosted mode selected",
    };
  }

  const hostUrl = config.localHostUrl || "http://127.0.0.1:7777";
  const hostClient = new LocalHostClient(hostUrl);
  const health = await hostClient.checkHealth();
  if (health) {
    return {
      configured,
      selected: "host",
      reason: `Binary Host available at ${hostUrl}`,
      hostClient,
    };
  }

  throw new Error(
    `Binary Host is not reachable at ${hostUrl}. CLI parity requires the local host + OpenHands orchestration path. Start it first or rerun with --transport direct if you explicitly want the legacy direct hosted path.`
  );
}

async function ensureHostTrust(hostClient: LocalHostClient, workspaceRoot: string): Promise<void> {
  await hostClient.trustWorkspace({
    path: workspaceRoot,
    mutate: true,
    commands: "allow",
  });
}

async function maybeOpenBrowser(url: string): Promise<void> {
  try {
    if (process.platform === "win32") {
      await execAsync(`start "" "${url}"`);
      return;
    }
    if (process.platform === "darwin") {
      await execAsync(`open "${url}"`);
      return;
    }
    await execAsync(`xdg-open "${url}"`);
  } catch {
    // Ignore browser-open failures and still show URL.
  }
}

function encodePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

async function browserSignIn(config: CliConfig): Promise<CliConfig> {
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = encodePkceChallenge(verifier);

  let resolveCode: (value: { code: string; state: string }) => void;
  let rejectCode: (error: unknown) => void;
  const codePromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    try {
      const host = req.headers.host || "127.0.0.1";
      const url = new URL(req.url || "/", `http://${host}`);
      if (url.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const code = (url.searchParams.get("code") || "").trim();
      const returnedState = (url.searchParams.get("state") || "").trim();
      if (!code || !returnedState) {
        res.statusCode = 400;
        res.end("Missing auth parameters.");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<html><body><h3>Binary IDE CLI auth complete.</h3><p>You can close this tab.</p></body></html>");
      resolveCode({ code, state: returnedState });
    } catch (error) {
      rejectCode(error);
      res.statusCode = 500;
      res.end("Auth callback failed.");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Unable to bind local callback server.");
  }
  const redirectUri = `http://127.0.0.1:${addr.port}/callback`;
  const authUrl = new URL(`${config.baseUrl}/api/v1/playground/auth/vscode/authorize`);
  authUrl.searchParams.set("client_id", "cli");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("Opening browser for Binary IDE sign-in...");
  console.log(authUrl.toString());
  await maybeOpenBrowser(authUrl.toString());

  const timeout = setTimeout(() => rejectCode(new Error("Timed out waiting for browser sign-in callback.")), 3 * 60 * 1000);
  let callback: { code: string; state: string };
  try {
    callback = await codePromise;
  } finally {
    clearTimeout(timeout);
    server.close();
  }

  if (callback.state !== state) throw new Error("Browser auth state mismatch.");

  const tokenRes = await fetch(`${config.baseUrl}/api/v1/playground/auth/vscode/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: callback.code,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText || "unknown error"}`);
  }
  const tokenPayload = (await tokenRes.json().catch(() => null)) as any;
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : "";
  const refreshToken = typeof tokenPayload?.refresh_token === "string" ? tokenPayload.refresh_token : "";
  const expiresIn = Number(tokenPayload?.expires_in ?? 900);
  if (!accessToken || !refreshToken) throw new Error("Token exchange returned incomplete credentials.");

  let email = "";
  const meRes = await fetch(`${config.baseUrl}/api/v1/playground/auth/vscode/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => null);
  if (meRes?.ok) {
    const me = (await meRes.json().catch(() => null)) as any;
    email = typeof me?.data?.email === "string" ? me.data.email : "";
  }

  const next: CliConfig = {
    ...config,
    browserAuth: {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
      ...(email ? { email } : {}),
    },
  };
  await saveConfig(next);
  return next;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getData(payload: unknown): unknown {
  const obj = asObject(payload);
  if (obj.success === true && "data" in obj) return obj.data;
  return payload;
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const normalized = String(text || "").trim();
  const candidates = [
    normalized,
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(normalized)?.[1] || "",
    extractBalancedJsonObject(normalized) || "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function recoverPendingToolCallFromFinal(
  finalText: string,
  loopState?: AssistRunEnvelope["loopState"],
  adapter?: string
): PendingToolCall | null {
  const parsed = parseJsonCandidate(finalText);
  const toolCallRecord = parsed?.toolCall;
  if (!toolCallRecord || typeof toolCallRecord !== "object") return null;
  const record = toolCallRecord as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  const toolCall: ToolCall = {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `cli_recovered_${Date.now().toString(36)}`,
    name,
    arguments: record.arguments && typeof record.arguments === "object" ? { ...(record.arguments as Record<string, unknown>) } : {},
    ...(record.kind === "observe" || record.kind === "mutate" || record.kind === "command" ? { kind: record.kind } : {}),
    ...(typeof record.summary === "string"
      ? { summary: record.summary }
      : typeof record.description === "string"
        ? { summary: record.description }
        : {}),
  };
  return {
    step: Math.max(1, Number(loopState?.stepCount || 0) + 1),
    adapter: adapter || "text_actions",
    requiresClientExecution: true,
    toolCall,
    createdAt: new Date().toISOString(),
  };
}

function normalizeHostedEnvelope(envelope: AssistRunEnvelope, fallback?: AssistRunEnvelope): AssistRunEnvelope {
  const normalized: AssistRunEnvelope = {
    ...(fallback || {}),
    ...envelope,
    actions: envelope.actions ?? fallback?.actions ?? [],
    missingRequirements: envelope.missingRequirements ?? fallback?.missingRequirements ?? [],
    pendingToolCall: envelope.pendingToolCall ?? null,
    adapter: envelope.adapter ?? fallback?.adapter,
    runId: envelope.runId ?? fallback?.runId,
    sessionId: envelope.sessionId ?? fallback?.sessionId,
    loopState: envelope.loopState ?? fallback?.loopState,
    final: envelope.final ?? fallback?.final ?? "",
  };

  if (!normalized.pendingToolCall && normalized.final) {
    const recovered = recoverPendingToolCallFromFinal(
      normalized.final,
      normalized.loopState,
      normalized.adapter
    );
    if (recovered) {
      normalized.pendingToolCall = recovered;
      normalized.final = "";
    }
  }

  return normalized;
}

async function streamPrompt(
  client: PlaygroundClient,
  input: { task: string; mode: AssistMode; model: string; historySessionId?: string },
  ui?: StreamUiAdapter
): Promise<AssistRunEnvelope> {
  const envelope: AssistRunEnvelope = {
    actions: [],
    final: "",
    missingRequirements: [],
  };
  let printedToken = false;
  let printedFinal = false;
  let partialSnapshot = "";

  await client.assistStream(input, (event) => {
    if (!event || typeof event !== "object") return;
    ui?.onEvent?.(event);
    const ev = typeof event.event === "string" ? event.event : "";
    if (typeof event.sessionId === "string") {
      envelope.sessionId = event.sessionId;
    }
    if (ev === "log") {
      const logSession = typeof event.sessionId === "string" ? event.sessionId : "";
      if (logSession) envelope.sessionId = logSession;
      const logMessage =
        typeof event.message === "string"
          ? event.message
          : JSON.stringify(event.data ?? event);
      if (ui?.onLog) ui.onLog(logMessage);
      else process.stdout.write(`\n[ran] ${logMessage}`);
      return;
    }
    if (ev === "status") {
      const statusText = String(event.data ?? "");
      if (ui?.onStatus) ui.onStatus(statusText);
      else process.stdout.write(`\n[status] ${statusText}`);
      return;
    }
    if (ev === "phase") {
      const data = asObject(event.data);
      const phaseName = typeof data.name === "string" ? data.name : "phase";
      if (ui?.onPhase) ui.onPhase(phaseName);
      else process.stdout.write(`\n[phase] ${phaseName}`);
      return;
    }
    if (ev === "decision") {
      const data = asObject(event.data);
      const mode = typeof data.mode === "string" ? data.mode : "unknown";
      if (ui?.onDecision) ui.onDecision(mode);
      else process.stdout.write(`\n[decision] ${mode}`);
      return;
    }
    if (ev === "run") {
      const data = asObject(event.data);
      if (typeof data.runId === "string") envelope.runId = data.runId;
      if (typeof data.adapter === "string") envelope.adapter = data.adapter;
      if (data.loopState && typeof data.loopState === "object") {
        envelope.loopState = data.loopState as AssistRunEnvelope["loopState"];
      }
      return;
    }
    if (ev === "actions") {
      envelope.actions = asArray(event.data);
      return;
    }
    if (ev === "tool_request") {
      if (event.data && typeof event.data === "object") {
        envelope.pendingToolCall = event.data as PendingToolCall;
      }
      return;
    }
    if (ev === "meta") {
      const data = asObject(event.data);
      Object.assign(envelope, data);
      return;
    }
    if (ev === "token" || ev === "partial") {
      printedToken = true;
      const tokenText = String(event.data ?? "");
      if (ui?.onToken) ui.onToken(tokenText);
      else process.stdout.write(tokenText);
      return;
    }
    if (ev === "final") {
      envelope.final = String(event.data ?? "");
      printedFinal = true;
      return;
    }
  });

  if (!printedFinal) process.stdout.write("\n");
  const normalizedEnvelope = normalizeHostedEnvelope(envelope);
  if (!normalizedEnvelope.pendingToolCall && normalizedEnvelope.final) {
    if (ui?.onFinal) {
      ui.onFinal(normalizedEnvelope.final, printedToken);
    } else {
      if (!printedToken) process.stdout.write(normalizedEnvelope.final);
      process.stdout.write("\n");
    }
  }
  return normalizedEnvelope;
}

async function executeHostedToolLoop(
  client: PlaygroundClient,
  envelope: AssistRunEnvelope,
  workspaceRoot: string,
  task: string,
  ui?: StreamUiAdapter
): Promise<AssistRunEnvelope> {
  const executor = new CliToolExecutor(workspaceRoot, inferTaskProjectRoot(task));
  let current = envelope;

  while (current.pendingToolCall && current.runId) {
    const pending = current.pendingToolCall;
    ui?.onToolStart?.(pending);
    const result = await executor.execute(pending);
    ui?.onToolResult?.(pending, result.summary, result.ok);
    const continued = await client.continueRun(current.runId, result, current.sessionId);
    current = normalizeHostedEnvelope(continued, current);
  }

  return current;
}

async function runHostedPrompt(
  client: PlaygroundClient,
  input: { task: string; mode: AssistMode; model: string; historySessionId?: string; tom?: { enabled?: boolean } },
  workspaceRoot: string,
  ui?: StreamUiAdapter
): Promise<AssistRunEnvelope> {
  const envelope = await streamPrompt(client, input, ui);
  if (!envelope.pendingToolCall || !envelope.runId) {
    return envelope;
  }
  const finalEnvelope = await executeHostedToolLoop(client, envelope, workspaceRoot, input.task, ui);
  if (finalEnvelope.final) {
    if (ui?.onFinal) {
      ui.onFinal(String(finalEnvelope.final), false);
    } else {
      process.stdout.write(`\n${String(finalEnvelope.final)}\n`);
    }
  }
  return finalEnvelope;
}

async function runLocalHostPrompt(
  hostClient: LocalHostClient,
  input: {
    task: string;
    mode: AssistMode;
    model: string;
    historySessionId?: string;
    tom?: { enabled?: boolean };
    executionLane?: LocalHostAgentJob["executionLane"];
    pluginPacks?: Array<"web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice">;
    expectedLongRun?: boolean;
    requireIsolation?: boolean;
    debugTracing?: boolean;
  },
  workspaceRoot: string,
  ui?: StreamUiAdapter
): Promise<AssistRunEnvelope> {
  const envelope: AssistRunEnvelope = {
    actions: [],
    final: "",
    missingRequirements: [],
  };
  let printedToken = false;
  let printedFinal = false;
  let partialSnapshot = "";

  await ensureHostTrust(hostClient, workspaceRoot);
  await hostClient.assistStream(
    {
      task: input.task,
      mode: input.mode,
      model: input.model,
      historySessionId: input.historySessionId,
      tom: input.tom,
      workspaceRoot,
      ...(input.executionLane ? { executionLane: input.executionLane } : {}),
      ...(input.pluginPacks ? { pluginPacks: input.pluginPacks } : {}),
      ...(input.expectedLongRun !== undefined ? { expectedLongRun: input.expectedLongRun } : {}),
      ...(input.requireIsolation !== undefined ? { requireIsolation: input.requireIsolation } : {}),
      ...(input.debugTracing !== undefined ? { debugTracing: input.debugTracing } : {}),
      client: {
        surface: "cli",
        version: "0.1.0",
      },
    },
    (event) => {
      if (!event || typeof event !== "object") return;
      ui?.onEvent?.(event);
      const ev = typeof event.event === "string" ? event.event : "";
      if (typeof event.sessionId === "string") {
        envelope.sessionId = event.sessionId;
      }

      if (ev === "host.status") {
        const data = asObject(event.data);
        const message = typeof data.message === "string" ? data.message : "Binary Host accepted the request.";
        if (ui?.onStatus) ui.onStatus(message);
        else process.stdout.write(`\n[host] ${message}`);
        return;
      }

      if (ev === "tool_result") {
        const data = asObject(event.data);
        const name = typeof data.name === "string" ? data.name : "tool";
        const ok = Boolean(data.ok);
        const summary = typeof data.summary === "string" ? data.summary : `${name} finished`;
        if (ui?.onToolResultEvent) ui.onToolResultEvent(name, summary, ok);
        else process.stdout.write(`\n[tool ${ok ? "ok" : "fail"}] ${summary}`);
        return;
      }

      if (ev === "log") {
        const message =
          typeof event.message === "string"
            ? event.message
            : JSON.stringify(event.data ?? event);
        if (ui?.onLog) ui.onLog(message);
        else process.stdout.write(`\n[ran] ${message}`);
        return;
      }
      if (ev === "status") {
        const statusText = String(event.data ?? "");
        if (ui?.onStatus) ui.onStatus(statusText);
        else process.stdout.write(`\n[status] ${statusText}`);
        return;
      }
      if (ev === "phase") {
        const data = asObject(event.data);
        const phaseName = typeof data.name === "string" ? data.name : "phase";
        if (ui?.onPhase) ui.onPhase(phaseName);
        else process.stdout.write(`\n[phase] ${phaseName}`);
        return;
      }
      if (ev === "decision") {
        const data = asObject(event.data);
        const mode = typeof data.mode === "string" ? data.mode : "unknown";
        if (ui?.onDecision) ui.onDecision(mode);
        else process.stdout.write(`\n[decision] ${mode}`);
        return;
      }
      if (ev === "run") {
        const data = asObject(event.data);
        if (typeof data.runId === "string") envelope.runId = data.runId;
        if (typeof data.adapter === "string") envelope.adapter = data.adapter;
        return;
      }
      if (ev === "actions") {
        envelope.actions = asArray(event.data);
        return;
      }
      if (ev === "tool_request") {
        if (event.data && typeof event.data === "object") {
          envelope.pendingToolCall = event.data as PendingToolCall;
          ui?.onToolStart?.(envelope.pendingToolCall);
        }
        return;
      }
      if (ev === "meta") {
        const data = asObject(event.data);
        Object.assign(envelope, data);
        return;
      }
      if (ev === "token") {
        printedToken = true;
        const tokenText = String(event.data ?? "");
        partialSnapshot += tokenText;
        if (ui?.onToken) ui.onToken(tokenText);
        else process.stdout.write(tokenText);
        return;
      }
      if (ev === "partial") {
        const snapshot = String(event.data ?? "");
        const tokenText = snapshot.startsWith(partialSnapshot) ? snapshot.slice(partialSnapshot.length) : snapshot;
        partialSnapshot = snapshot;
        if (!tokenText) return;
        printedToken = true;
        if (ui?.onToken) ui.onToken(tokenText);
        else process.stdout.write(tokenText);
        return;
      }
      if (ev === "final") {
        envelope.final = String(event.data ?? "");
        printedFinal = true;
      }
    }
  );

  if (!printedFinal) process.stdout.write("\n");
  if (envelope.final) {
    if (ui?.onFinal) {
      ui.onFinal(envelope.final, printedToken);
    } else {
      if (!printedToken) process.stdout.write(envelope.final);
      process.stdout.write("\n");
    }
  }

  return envelope;
}

type DebugRuntimeBundle = {
  version: "binary_ide_runtime_debug_v1";
  createdAt: string;
  command: "debug-runtime";
  task: string;
  mode: AssistMode;
  hostedMode: HostedAssistMode;
  model: string;
  baseUrl: string;
  configPath: string;
  authKind: "apiKey" | "bearer";
  cwdAtInvocation: string;
  isolatedWorkspace: {
    path: string;
    fingerprint: string;
    kind: "temp" | "custom" | "cwd";
  };
  sessionId?: string;
  stream: {
    events: Array<{
      capturedAt: string;
      event: SseEvent;
    }>;
    finalText?: string;
    usedTokenStream: boolean;
  };
  transcript?: unknown;
  warnings: string[];
  error?: {
    name: string;
    message: string;
    status?: number;
    details?: unknown;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugifyForFileName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "runtime";
}

async function createDebugWorkspace(parsed: ParsedArgs): Promise<{
  workspacePath: string;
  workspaceKind: "temp" | "custom" | "cwd";
}> {
  if (parsed.flags["unsafe-cwd"]) {
    return { workspacePath: process.cwd(), workspaceKind: "cwd" };
  }

  const requested = getFlagString(parsed, "workspace");
  if (requested) {
    const resolved = path.resolve(requested);
    await fs.mkdir(resolved, { recursive: true });
    return { workspacePath: resolved, workspaceKind: "custom" };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "binary-ide-debug-"));
  return { workspacePath: tempDir, workspaceKind: "temp" };
}

function toErrorRecord(error: unknown): DebugRuntimeBundle["error"] {
  if (error instanceof CliHttpError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}

async function handleDebugRuntime(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const task = parsed.positionals.slice(1).join(" ").trim();
  if (!task) throw new Error("Usage: binary debug-runtime \"<task>\"");

  const resolved = await resolveAuth(config);
  const mode = parseMode(getFlagString(parsed, "mode", "m"), "debug");
  const hostedMode = toHostedAssistMode(mode);
  const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
  const tomEnabled = resolveTomEnabled(config, parsed, false);
  const workspace = await createDebugWorkspace(parsed);
  const workspacePath = workspace.workspacePath;
  const workspaceKind = workspace.workspaceKind;
  const fingerprint = workspaceFingerprint(workspacePath);
  const startedAt = nowIso();
  const warnings: string[] = [];

  const reportPath = path.resolve(
    getFlagString(parsed, "out") ??
      path.join(workspacePath, `binary-runtime-debug-${slugifyForFileName(task)}.json`)
  );

  const bundle: DebugRuntimeBundle = {
    version: "binary_ide_runtime_debug_v1",
    createdAt: startedAt,
    command: "debug-runtime",
    task,
    mode,
    hostedMode,
    model,
    baseUrl: resolved.config.baseUrl,
    configPath: getConfigPath(),
    authKind: resolved.auth.type,
    cwdAtInvocation: process.cwd(),
    isolatedWorkspace: {
      path: workspacePath,
      fingerprint,
      kind: workspaceKind,
    },
    stream: {
      events: [],
      usedTokenStream: false,
    },
    warnings,
  };

  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });

  if (workspaceKind === "cwd") {
    warnings.push("Unsafe mode enabled: using the current working directory instead of a temp workspace.");
  } else {
    warnings.push("Safe mode: debug ran in an isolated workspace and did not invoke execute/index commands.");
  }
  const hostedModeNotice = getHostedModeNotice(mode);
  if (hostedModeNotice) warnings.push(hostedModeNotice);

  console.log(color("Binary IDE Runtime Debug", "cyan"));
  console.log(dim(rule()));
  console.log(`Task: ${task}`);
  console.log(`Mode: ${mode}`);
  if (hostedMode !== mode) console.log(`Hosted mode: ${hostedMode}`);
  console.log(`Model: ${model}`);
  console.log(`Workspace: ${workspacePath}`);
  console.log(`Workspace fingerprint: ${fingerprint}`);
  console.log(`Report: ${reportPath}`);
  console.log(dim("Safety: this command does not call execute/index and is intended for hosted runtime debugging only."));
  if (hostedModeNotice) console.log(dim(`Mode note: ${hostedModeNotice}`));

  try {
    try {
      bundle.sessionId = (await client.createSession("Binary IDE Runtime Debug", mode)) || undefined;
    } catch (error) {
      warnings.push(`Session bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    let finalText = "";
    let usedTokenStream = false;

    const result = await runHostedPrompt(
      client,
      {
        task,
        mode,
        model,
        historySessionId: bundle.sessionId,
        tom: { enabled: tomEnabled },
      },
      workspacePath,
      {
        onEvent: (event) => {
          bundle.stream.events.push({
            capturedAt: nowIso(),
            event,
          });
        },
        onLog: (message) => {
          process.stdout.write(`\n${dim("log")} ${message}`);
        },
        onStatus: (status) => {
          if (!status.trim()) return;
          process.stdout.write(`\n${dim("status")} ${status}`);
        },
        onPhase: (phase) => {
          process.stdout.write(`\n${dim("phase")} ${phase}`);
        },
        onDecision: (resolvedMode) => {
          process.stdout.write(`\n${dim("decision")} ${resolvedMode}`);
        },
        onToolStart: (pendingToolCall) => {
          process.stdout.write(`\n${dim("tool")} step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
          bundle.stream.events.push({
            capturedAt: nowIso(),
            event: {
              event: "tool_request",
              data: pendingToolCall,
            },
          });
        },
        onToolResult: (pendingToolCall, summary, ok) => {
          process.stdout.write(`\n${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
          bundle.stream.events.push({
            capturedAt: nowIso(),
            event: {
              event: "tool_result",
              data: {
                name: pendingToolCall.toolCall.name,
                ok,
                summary,
              },
            },
          });
        },
        onToken: (() => {
          let opened = false;
          return (token: string) => {
            usedTokenStream = true;
            if (!opened) {
              opened = true;
              process.stdout.write(`\n${color("assistant", "green")} ${color(">", "gray")} `);
            }
            process.stdout.write(token);
          };
        })(),
        onFinal: (text, tokenStreamUsed) => {
          finalText = text;
          usedTokenStream = tokenStreamUsed;
          if (!tokenStreamUsed) {
            process.stdout.write(`\n${color("assistant", "green")} ${color(">", "gray")} ${text}`);
          }
          process.stdout.write("\n");
        },
      }
    );

    if (result.sessionId) {
      bundle.sessionId = result.sessionId;
    }

    bundle.stream.finalText = finalText || String(result.final || "");
    bundle.stream.usedTokenStream = usedTokenStream;

    if (bundle.sessionId) {
      try {
        bundle.transcript = getData(await client.getSessionMessages(bundle.sessionId, true));
      } catch (error) {
        warnings.push(`Transcript fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    bundle.error = toErrorRecord(error);
    throw error;
  } finally {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(bundle, null, 2), "utf8");
    process.stdout.write(`\n${dim("debug bundle")} ${reportPath}\n`);
  }
}

async function handleAuth(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const sub = parsed.positionals[1];
  if (!sub || sub === "status") {
    const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
    const hostHealth = await hostClient.checkHealth();
    const key = getApiKey(config);
    const masked = key ? `${key.slice(0, 6)}...${key.slice(-4)}` : "(not set)";
    const browserEmail = config.browserAuth?.email || "";
    const browserState = config.browserAuth?.refreshToken
      ? `signed in${browserEmail ? ` as ${browserEmail}` : ""}`
      : "(not signed in)";
    if (hostHealth) {
      const hostStatus = await hostClient.authStatus();
      console.log(`Binary Host: ${hostClient.url} (${hostStatus.storageMode})`);
      console.log(`Binary Host API key: ${hostStatus.maskedApiKey || "(not set)"}`);
    } else {
      console.log(`Binary Host: unavailable at ${hostClient.url}`);
    }
    console.log(`Binary IDE API key (direct): ${masked}`);
    console.log(`Browser auth: ${browserState}`);
    console.log(`Config file: ${getConfigPath()}`);
    return;
  }

  if (sub === "set-key") {
    const provided = parsed.positionals[2] || getFlagString(parsed, "key", "k");
    let key = provided;
    if (!key) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      key = (await rl.question("Enter Binary IDE API key: ")).trim();
      rl.close();
    }
    if (!key) throw new Error("API key is empty.");
    const next = { ...config, apiKey: key.trim() };
    await saveConfig(next);
    const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
    const hostHealth = await hostClient.checkHealth();
    if (hostHealth) {
      await hostClient.setApiKey(key.trim());
      console.log(`Saved API key for Binary IDE CLI and Binary Host (${hostClient.url}).`);
      return;
    }
    console.log("Saved API key for Binary IDE CLI.");
    return;
  }

  if (sub === "browser" || sub === "login") {
    const next = await browserSignIn(config);
    console.log(
      `Browser sign-in complete${next.browserAuth?.email ? ` as ${next.browserAuth.email}` : ""}.`
    );
    return;
  }

  if (sub === "clear") {
    const refreshToken = getBrowserRefreshToken(config);
    if (refreshToken) {
      await fetch(`${config.baseUrl}/api/v1/playground/auth/vscode/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => null);
    }
    const noKey = await clearApiKey(config);
    await clearBrowserAuth(noKey);
    const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
    const hostHealth = await hostClient.checkHealth();
    if (hostHealth) {
      await hostClient.clearApiKey().catch(() => null);
    }
    console.log("Cleared stored API key and browser auth.");
    return;
  }

  throw new Error(`Unknown auth subcommand '${sub}'.`);
}

async function handleConfig(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const sub = parsed.positionals[1];
  if (!sub || sub === "show") {
    const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
    const hostHealth = await hostClient.checkHealth();
    const connections = hostHealth ? (await hostClient.listConnections().catch(() => ({ connections: [] }))).connections : [];
    printJson({
      ...redactConfigForDisplay(config),
      resolvedTransport: await resolveTransport(config, parsed).then((value) => value.selected).catch(() => "direct"),
      host: hostHealth
        ? {
            url: hostClient.url,
            version: hostHealth.version,
            secureStorageAvailable: hostHealth.secureStorageAvailable,
            openhandsRuntime: hostHealth.openhandsRuntime
              ? {
                  readiness: hostHealth.openhandsRuntime.readiness,
                  runtimeKind: hostHealth.openhandsRuntime.runtimeKind,
                  runtimeProfile: hostHealth.openhandsRuntime.runtimeProfile,
                  message: hostHealth.openhandsRuntime.message,
                  degradedReasons: hostHealth.openhandsRuntime.degradedReasons,
                  availableActions: hostHealth.openhandsRuntime.availableActions,
                }
              : null,
            connections: {
              total: connections.length,
              enabled: connections.filter((item) => item.enabled).length,
            },
          }
        : {
            url: hostClient.url,
            available: false,
          },
    });
    return;
  }
  if (sub === "set-base-url") {
    const url = parsed.positionals[2];
    if (!url) throw new Error("Usage: binary config set-base-url <url>");
    const next = { ...config, baseUrl: url.replace(/\/+$/, "") };
    await saveConfig(next);
    console.log(`Base URL set to ${next.baseUrl}`);
    return;
  }
  if (sub === "set-local-host-url") {
    const url = parsed.positionals[2];
    if (!url) throw new Error("Usage: binary config set-local-host-url <url>");
    const next = { ...config, localHostUrl: url.replace(/\/+$/, "") };
    await saveConfig(next);
    console.log(`Local host URL set to ${next.localHostUrl}`);
    return;
  }
  if (sub === "set-model") {
    const model = parsed.positionals[2];
    if (!model) throw new Error("Usage: binary config set-model <model>");
    const next = { ...config, model };
    await saveConfig(next);
    console.log(`Default model set to ${model}`);
    return;
  }
  if (sub === "set-transport") {
      const transport = parseTransport(parsed.positionals[2], config.transport ?? "host");
      const next = { ...config, transport };
      await saveConfig(next);
      if (transport === "host") {
        const hostClient = new LocalHostClient(next.localHostUrl || "http://127.0.0.1:7777");
        const hostHealth = await hostClient.checkHealth();
      console.log(
        hostHealth
          ? `Default transport set to host (${hostClient.url}).`
          : `Default transport set to host. Binary Host is not reachable yet at ${hostClient.url}.`
        );
        return;
      }
      if (transport === "auto") {
        console.log("Default transport set to auto (treated as host parity mode).");
        return;
      }
      console.log(`Default transport set to ${transport}.`);
      return;
    }
  if (sub === "set-tom") {
    const raw = String(parsed.positionals[2] || "").trim().toLowerCase();
    if (raw !== "on" && raw !== "off") throw new Error("Usage: binary config set-tom <on|off>");
    const tomEnabled = raw === "on";
    const next = { ...config, tomEnabled };
    await saveConfig(next);
    console.log(`Default TOM set to ${tomEnabled ? "on" : "off"}.`);
    return;
  }
  throw new Error(`Unknown config subcommand '${sub}'.`);
}

async function handleChat(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const transport = await resolveTransport(config, parsed);
  const tomEnabled = resolveTomEnabled(config, parsed, true);
  if (transport.selected === "host" && transport.hostClient) {
    const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
    const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
    const hostedModeNotice = getHostedModeNotice(mode);
    const inputSource = await createChatInputSource();
    let activeMode: AssistMode = mode;
    let activeSessionId: string | undefined;

    clearIfTty();
    printChatBanner(config, activeMode, model, activeSessionId);
    printChatHelp();
    if (hostedModeNotice) console.log(dim(`Mode note: ${hostedModeNotice}`));
    console.log(dim(`transport -> host (${transport.reason})`));

    while (true) {
      const prompt = `${color("you", "cyan")} ${dim("[" + activeMode + "]")} ${color("›", "gray")} `;
      const rawLine = await inputSource.next(prompt);
      if (rawLine == null) break;
      const line = rawLine.trim();
      if (!line) continue;

      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") {
        printChatHelp();
        continue;
      }
      if (line.startsWith("/mode ")) {
        const nextMode = line.slice(6).trim();
        activeMode = parseMode(nextMode, activeMode);
        console.log(dim(`mode -> ${activeMode}`));
        const nextModeNotice = getHostedModeNotice(activeMode);
        if (nextModeNotice) console.log(dim(`mode note -> ${nextModeNotice}`));
        continue;
      }
      if (line === "/clear") {
        clearIfTty();
        printChatBanner(config, activeMode, model, activeSessionId);
        printChatHelp();
        continue;
      }
      if (line === "/new") {
        activeSessionId = undefined;
        console.log(dim("started new Binary Host chat thread"));
        continue;
      }
      if (line === "/usage" || line === "/checkout") {
        throw new Error(`'${line}' still uses direct hosted auth. Rerun chat with --transport direct for that command.`);
      }

      const result = await runLocalHostPrompt(
        transport.hostClient,
        {
          task: line,
          mode: activeMode,
          model,
          historySessionId: activeSessionId,
          tom: { enabled: tomEnabled },
        },
        process.cwd(),
        {
          onLog: (message) => {
            process.stdout.write(`\n${dim("log")} ${message}`);
          },
          onStatus: (status) => {
            if (!status.trim()) return;
            process.stdout.write(`\n${dim("status")} ${status}`);
          },
          onPhase: (phase) => {
            process.stdout.write(`\n${dim("phase")} ${phase}`);
          },
          onDecision: (resolvedMode) => {
            process.stdout.write(`\n${dim("decision")} ${resolvedMode}`);
          },
          onToolStart: (pendingToolCall) => {
            process.stdout.write(`\n${dim("tool")} step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
          },
          onToolResultEvent: (_name, summary, ok) => {
            process.stdout.write(`\n${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
          },
          onToken: (() => {
            let opened = false;
            return (token: string) => {
              if (!opened) {
                opened = true;
                process.stdout.write(`\n${color("assistant", "green")} ${color("›", "gray")} `);
              }
              process.stdout.write(token);
            };
          })(),
          onFinal: (finalText, usedTokenStream) => {
            if (!usedTokenStream) {
              process.stdout.write(`\n${color("assistant", "green")} ${color("›", "gray")} ${finalText}`);
            }
            process.stdout.write("\n");
          },
        }
      );
      if (result.sessionId) activeSessionId = result.sessionId;
    }

    inputSource.close();
    return;
  }

  let activeConfig = config;
  await assertDirectTransportHasNoConnections(config, "chat");
  let resolvedAuth = await resolveAuth(activeConfig);
  activeConfig = resolvedAuth.config;
  const client = new PlaygroundClient({
    baseUrl: activeConfig.baseUrl,
    auth:
      resolvedAuth.auth.type === "apiKey"
        ? { apiKey: resolvedAuth.auth.apiKey }
        : { bearer: resolvedAuth.auth.accessToken },
  });
  const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
  const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
  const hostedModeNotice = getHostedModeNotice(mode);

  let sessionId: string | undefined;
  try {
    sessionId = (await client.createSession("Binary IDE CLI Chat", mode)) || undefined;
  } catch {
    sessionId = undefined;
  }

  const inputSource = await createChatInputSource();
  let activeMode: AssistMode = mode;
  let activeSessionId = sessionId;

  clearIfTty();
  printChatBanner(activeConfig, activeMode, model, activeSessionId);
  printChatHelp();
  if (hostedModeNotice) console.log(dim(`Mode note: ${hostedModeNotice}`));

  while (true) {
    const prompt = `${color("you", "cyan")} ${dim("[" + activeMode + "]")} ${color("›", "gray")} `;
    const rawLine = await inputSource.next(prompt);
    if (rawLine == null) break;
    const line = rawLine.trim();
    if (!line) continue;

    if (line === "/exit" || line === "/quit") break;
    if (line === "/help") {
      printChatHelp();
      continue;
    }
    if (line.startsWith("/mode ")) {
      const nextMode = line.slice(6).trim();
      activeMode = parseMode(nextMode, activeMode);
      console.log(dim(`mode -> ${activeMode}`));
      const nextModeNotice = getHostedModeNotice(activeMode);
      if (nextModeNotice) console.log(dim(`mode note -> ${nextModeNotice}`));
      continue;
    }
    if (line === "/clear") {
      clearIfTty();
      printChatBanner(activeConfig, activeMode, model, activeSessionId);
      printChatHelp();
      continue;
    }
    if (line === "/new") {
      resolvedAuth = await resolveAuth(activeConfig);
      activeConfig = resolvedAuth.config;
      client.setAuth(
        resolvedAuth.auth.type === "apiKey"
          ? { apiKey: resolvedAuth.auth.apiKey }
          : { bearer: resolvedAuth.auth.accessToken }
      );
      try {
        activeSessionId = (await client.createSession("Binary IDE CLI Chat", activeMode)) || undefined;
        console.log(dim(`started new session: ${activeSessionId?.slice(0, 10) || "unknown"}`));
      } catch {
        activeSessionId = undefined;
        console.log(dim("started local-only chat thread"));
      }
      continue;
    }
    if (line === "/usage") {
      resolvedAuth = await resolveAuth(activeConfig);
      activeConfig = resolvedAuth.config;
      client.setAuth(
        resolvedAuth.auth.type === "apiKey"
          ? { apiKey: resolvedAuth.auth.apiKey }
          : { bearer: resolvedAuth.auth.accessToken }
      );
      const usage = await client.usage();
      printJson(getData(usage));
      continue;
    }
    if (line === "/checkout") {
      resolvedAuth = await resolveAuth(activeConfig);
      activeConfig = resolvedAuth.config;
      client.setAuth(
        resolvedAuth.auth.type === "apiKey"
          ? { apiKey: resolvedAuth.auth.apiKey }
          : { bearer: resolvedAuth.auth.accessToken }
      );
      const checkout = asObject(getData(await client.checkout("builder", "monthly")));
      const url = typeof checkout.url === "string" ? checkout.url : "";
      if (url) {
        console.log(`Checkout URL: ${url}`);
        await maybeOpenBrowser(url);
      } else {
        printJson(checkout);
      }
      continue;
    }

    resolvedAuth = await resolveAuth(activeConfig);
    activeConfig = resolvedAuth.config;
    client.setAuth(
      resolvedAuth.auth.type === "apiKey"
        ? { apiKey: resolvedAuth.auth.apiKey }
        : { bearer: resolvedAuth.auth.accessToken }
    );
    const result = await runHostedPrompt(client, {
      task: line,
      mode: activeMode,
      model,
      historySessionId: activeSessionId,
      tom: { enabled: tomEnabled },
    }, process.cwd(), {
      onLog: (message) => {
        process.stdout.write(`\n${dim("log")} ${message}`);
      },
      onStatus: (status) => {
        if (!status.trim()) return;
        process.stdout.write(`\n${dim("status")} ${status}`);
      },
      onPhase: (phase) => {
        process.stdout.write(`\n${dim("phase")} ${phase}`);
      },
      onDecision: (resolvedMode) => {
        process.stdout.write(`\n${dim("decision")} ${resolvedMode}`);
      },
      onToolStart: (pendingToolCall) => {
        process.stdout.write(`\n${dim("tool")} step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
      },
      onToolResult: (_pendingToolCall, summary, ok) => {
        process.stdout.write(`\n${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
      },
      onToken: (() => {
        let opened = false;
        return (token: string) => {
          if (!opened) {
            opened = true;
            process.stdout.write(`\n${color("assistant", "green")} ${color("›", "gray")} `);
          }
          process.stdout.write(token);
        };
      })(),
      onFinal: (finalText, usedTokenStream) => {
        if (!usedTokenStream) {
          process.stdout.write(`\n${color("assistant", "green")} ${color("›", "gray")} ${finalText}`);
        }
        process.stdout.write("\n");
      },
    });
    if (result.sessionId) activeSessionId = result.sessionId;
  }

  inputSource.close();
}

async function handleRun(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const task = parsed.positionals.slice(1).join(" ").trim();
  if (!task) throw new Error("Usage: binary run \"<task>\"");
  const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
  const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
  const tomEnabled = resolveTomEnabled(config, parsed, true);
  const hostedModeNotice = getHostedModeNotice(mode);
  const detach = Boolean(parsed.flags.detach);
  const executionLane = getFlagString(parsed, "lane");
  const pluginPacks = parseCsvFlag(getFlagString(parsed, "plugin-packs"));
  const transport = await resolveTransport(config, parsed);

  if (hostedModeNotice) console.log(dim(`Mode note: ${hostedModeNotice}`));
  console.log(dim(`transport -> ${transport.selected} (${transport.reason})`));
  if (detach) {
    if (transport.selected !== "host" || !transport.hostClient) {
      throw new Error("Detached unattended runs require Binary Host. Start the host or rerun without --detach.");
    }
    await ensureHostTrust(transport.hostClient, process.cwd());
    const summary = await transport.hostClient.startDetachedRun({
      task,
      mode,
      model,
      tom: { enabled: tomEnabled },
      workspaceRoot: process.cwd(),
      detach: true,
      ...(executionLane ? { executionLane: executionLane as LocalHostRunSummary["executionLane"] } : {}),
      ...(pluginPacks
        ? { pluginPacks: pluginPacks as Array<"web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice"> }
        : {}),
      expectedLongRun: parsed.flags["short"] === true ? false : true,
      requireIsolation: parsed.flags["require-isolation"] === true,
      debugTracing: parsed.flags["trace"] === true,
      client: {
        surface: "cli",
        version: "0.1.0",
      },
    });
    console.log(`Detached Binary Host run started: ${summary.id}`);
    console.log(`Trace: ${summary.traceId}`);
    console.log(`Resume token: ${summary.resumeToken}`);
    console.log(dim("Use `binary runs tail <runId>` to follow progress."));
    return;
  }
  if (transport.selected === "host" && transport.hostClient) {
    await runLocalHostPrompt(
      transport.hostClient,
      {
        task,
        mode,
        model,
        tom: { enabled: tomEnabled },
        ...(executionLane ? { executionLane: executionLane as LocalHostRunSummary["executionLane"] } : {}),
        ...(pluginPacks
          ? { pluginPacks: pluginPacks as Array<"web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice"> }
          : {}),
        expectedLongRun: parsed.flags["long"] === true,
        requireIsolation: parsed.flags["require-isolation"] === true,
        debugTracing: parsed.flags["trace"] === true,
      },
      process.cwd(),
      {
        onToolStart: (pendingToolCall) => {
          process.stdout.write(`\n${dim("tool")} step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
        },
        onToolResultEvent: (_name, summary, ok) => {
          process.stdout.write(`\n${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
        },
      }
    );
    return;
  }

  await assertDirectTransportHasNoConnections(config, "run");
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  await runHostedPrompt(client, { task, mode, model, tom: { enabled: tomEnabled } }, process.cwd(), {
    onToolStart: (pendingToolCall) => {
      process.stdout.write(`\n${dim("tool")} step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
    },
    onToolResult: (_pendingToolCall, summary, ok) => {
      process.stdout.write(`\n${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
    },
  });
}

function printRunSummary(summary: LocalHostRunSummary): void {
  console.log(
    `${summary.id}  [${summary.status}]  ${summary.request.mode}  ${summary.request.task.slice(0, 80)}${
      summary.request.task.length > 80 ? "…" : ""
    }`
  );
  console.log(
    dim(
      `updated ${summary.updatedAt}  trust=${summary.workspaceTrustMode}  trace=${summary.traceId}${
        summary.runId ? `  hostedRun=${summary.runId}` : ""
      }${summary.executionLane ? `  lane=${summary.executionLane}` : ""}`
    )
  );
  if (summary.pluginPacks?.length) {
    console.log(dim(`plugin packs: ${summary.pluginPacks.map((pack) => pack.id).join(", ")}`));
  }
  if (summary.takeoverReason) {
    console.log(dim(`takeover: ${summary.takeoverReason}`));
  }
}

function describeAutomationTrigger(trigger: LocalHostAutomationTrigger): string {
  if (trigger.kind === "schedule_nl") {
    return `schedule "${trigger.scheduleText}"`;
  }
  if (trigger.kind === "file_event") {
    return `file event ${trigger.workspaceRoot}`;
  }
  if (trigger.kind === "process_event") {
    return `process "${trigger.query}"`;
  }
  if (trigger.kind === "notification") {
    return `notification ${trigger.topic || trigger.query || "any"}`;
  }
  return "manual";
}

function printAutomationSummary(automation: LocalHostAutomationDefinition): void {
  console.log(`${automation.id}  [${automation.status}]  ${automation.name}`);
  console.log(
    dim(
      `trigger=${describeAutomationTrigger(automation.trigger)}  policy=${automation.policy}${
        automation.nextRunAt ? `  next=${automation.nextRunAt}` : ""
      }${automation.lastRunId ? `  lastRun=${automation.lastRunId}` : ""}`
    )
  );
  if (automation.lastTriggerSummary) {
    console.log(dim(`last trigger: ${automation.lastTriggerSummary}`));
  }
  if (automation.lastDeliveryError) {
    console.log(dim(`delivery: ${automation.lastDeliveryError}`));
  }
}

function printAutomationEvent(event: LocalHostAutomationEvent): void {
  const root = asObject(event.event);
  const name = typeof root.event === "string" ? root.event : "automation.event";
  const data = asObject(root.data);
  const summary = typeof data.summary === "string" ? data.summary : "";
  const runId = typeof data.runId === "string" ? data.runId : "";
  const error = typeof data.error === "string" ? data.error : "";
  const bits = [summary, runId ? `run=${runId}` : "", error].filter(Boolean);
  console.log(`${dim(name)}${bits.length ? ` ${bits.join("  ")}` : ""}`);
}

function printAgentProbeSession(session: LocalHostAgentProbeSession): void {
  console.log(`${session.id}  [${session.status}]  ${session.title}`);
  console.log(
    dim(
      `turns=${session.turnCount}  updated=${session.updatedAt}${
        session.gatewayRunId ? `  gatewayRun=${session.gatewayRunId}` : ""
      }${session.workspaceRoot ? `  workspace=${session.workspaceRoot}` : ""}`
    )
  );
  if (session.currentModelCandidate?.alias || session.currentModelCandidate?.model) {
    console.log(
      dim(
        `model=${session.currentModelCandidate.alias || session.currentModelCandidate.model}${
          session.currentModelCandidate.provider ? `  provider=${session.currentModelCandidate.provider}` : ""
        }`
      )
    );
  }
  if (session.lastFailureReason) {
    console.log(dim(`last failure=${session.lastFailureReason}`));
  }
  if (session.persistenceDir) {
    console.log(dim(`artifacts=${session.persistenceDir}`));
  }
}

function printAgentProbeTurnOutcome(session: LocalHostAgentProbeSession): void {
  const turn = session.turns[session.turns.length - 1];
  if (!turn) {
    console.log(dim("No probe turns yet."));
    return;
  }
  if (turn.status === "failed") {
    console.log(`${color("probe", "red")} ${turn.error || "Agent probe turn failed."}`);
    return;
  }
  if (turn.fallbackAttempt && turn.fallbackAttempt > 0) {
    const candidate = turn.modelCandidate?.alias || turn.modelCandidate?.model || "fallback model";
    console.log(
      dim(
        `fallback recovered on attempt ${turn.fallbackAttempt} via ${candidate}${
          turn.failureReason ? ` after ${turn.failureReason}` : ""
        }`
      )
    );
  }
  if (turn.persistenceDir) {
    console.log(dim(`artifacts -> ${turn.persistenceDir}`));
  }
  if (turn.assistantMessage?.trim()) {
    console.log(`${color("assistant", "green")} ${color(">", "gray")} ${turn.assistantMessage}`);
  } else {
    console.log(dim("Probe turn completed without an assistant message."));
  }
}

function printAgentProbeEvent(event: LocalHostAgentProbeEvent): void {
  const root = asObject(event.event);
  const name = typeof root.event === "string" ? root.event : "agent_probe.event";
  const data = asObject(root.data);
  const fallbackAttempt =
    typeof data.fallbackAttempt === "number" && data.fallbackAttempt > 0
      ? `fallback=${data.fallbackAttempt}`
      : "";
  const failureReason = typeof data.failureReason === "string" ? data.failureReason : "";
  const error = typeof data.error === "string" ? data.error : "";
  const summary =
    typeof data.final === "string"
      ? data.final
      : typeof data.message === "string"
        ? data.message
        : "";
  const parts = [summary, fallbackAttempt, failureReason, error].filter(Boolean);
  console.log(`${dim(name)}${parts.length ? ` ${parts.join("  ")}` : ""}`);
}

function printAgentJobSummary(job: LocalHostAgentJob): void {
  console.log(`${job.id}  [${job.status}]  lane=${job.executionLane}  model=${job.model}`);
  console.log(
    dim(
      `updated=${job.updatedAt}${job.runId ? `  run=${job.runId}` : ""}${
        job.workspaceRoot ? `  workspace=${job.workspaceRoot}` : ""
      }${job.runtimeTarget ? `  runtime=${job.runtimeTarget}` : ""}`
    )
  );
  if (job.pluginPacks.length) {
    console.log(dim(`plugin packs: ${job.pluginPacks.map((pack) => pack.id).join(", ")}`));
  }
  const skillPaths = job.skillSources.filter((source) => source.available).map((source) => source.path || source.label);
  if (skillPaths.length) {
    console.log(dim(`skills: ${skillPaths.join(", ")}`));
  }
  if (job.persistenceDir) {
    console.log(dim(`artifacts=${job.persistenceDir}`));
  }
  if (job.jsonlPath) {
    console.log(dim(`jsonl=${job.jsonlPath}`));
  }
  if (job.error) {
    console.log(dim(`error=${job.error}`));
  }
}

function printAgentJobEvent(event: { seq: number; capturedAt: string; event: Record<string, unknown> }): void {
  const root = asObject(event.event);
  const name = typeof root.event === "string" ? root.event : "agent_job.event";
  const data = asObject(root.data);
  const lane = typeof data.executionLane === "string" ? data.executionLane : "";
  const error = typeof data.error === "string" ? data.error : "";
  const parts = [lane, error].filter(Boolean);
  console.log(`${dim(name)}${parts.length ? ` ${parts.join("  ")}` : ""}`);
}

function parseCsvFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function buildAutomationTriggerFromArgs(parsed: ParsedArgs): LocalHostAutomationTrigger {
  const triggerKind = getFlagString(parsed, "trigger");
  const workspaceRoot = getFlagString(parsed, "workspace");
  if (!triggerKind || triggerKind === "manual") {
    return {
      kind: "manual",
      ...(workspaceRoot ? { workspaceRoot: path.resolve(workspaceRoot) } : {}),
    };
  }
  if (triggerKind === "schedule_nl") {
    const scheduleText = getFlagString(parsed, "schedule") || getFlagString(parsed, "when");
    if (!scheduleText) {
      throw new Error("Schedule automations require --schedule \"every weekday at 9am\".");
    }
    return {
      kind: "schedule_nl",
      scheduleText,
      ...(workspaceRoot ? { workspaceRoot: path.resolve(workspaceRoot) } : {}),
    };
  }
  if (triggerKind === "file_event") {
    const root = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd();
    const includes = parseCsvFlag(getFlagString(parsed, "includes"));
    const excludes = parseCsvFlag(getFlagString(parsed, "excludes"));
    return {
      kind: "file_event",
      workspaceRoot: root,
      ...(includes ? { includes } : {}),
      ...(excludes ? { excludes } : {}),
    };
  }
  if (triggerKind === "process_event") {
    const query = getFlagString(parsed, "query");
    if (!query) {
      throw new Error("Process automations require --query \"chrome\" or similar.");
    }
    return {
      kind: "process_event",
      query,
      ...(workspaceRoot ? { workspaceRoot: path.resolve(workspaceRoot) } : {}),
    };
  }
  if (triggerKind === "notification") {
    const topic = getFlagString(parsed, "topic");
    const query = getFlagString(parsed, "query");
    return {
      kind: "notification",
      ...(workspaceRoot ? { workspaceRoot: path.resolve(workspaceRoot) } : {}),
      ...(topic ? { topic } : {}),
      ...(query ? { query } : {}),
    };
  }
  throw new Error("Unknown --trigger. Use manual|schedule_nl|file_event|process_event|notification.");
}

function createTailEventPrinter(): (event: {
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
}) => void {
  let partialSnapshot = "";
  return (event) => {
    const root = asObject(event.event);
    const name = typeof root.event === "string" ? root.event : "event";
    const data = root.data;
    if (name === "token") {
      const tokenText = String(data ?? "");
      partialSnapshot += tokenText;
      process.stdout.write(tokenText);
      return;
    }
    if (name === "partial") {
      const snapshot = String(data ?? "");
      const tokenText = snapshot.startsWith(partialSnapshot) ? snapshot.slice(partialSnapshot.length) : snapshot;
      partialSnapshot = snapshot;
      if (tokenText) process.stdout.write(tokenText);
      return;
    }
    if (name === "final") {
      process.stdout.write(`\n${color("assistant", "green")} ${color(">", "gray")} ${String(data ?? "")}\n`);
      return;
    }
    if (name === "host.status") {
      const info = asObject(data);
      const message = typeof info.message === "string" ? info.message : "Binary Host status";
      console.log(`${dim("host")} ${message}`);
      return;
    }
    if (name === "host.heartbeat") {
      const info = asObject(data);
      const status = typeof info.status === "string" ? info.status : "running";
      const heartbeatAt = typeof info.heartbeatAt === "string" ? info.heartbeatAt : event.capturedAt;
      console.log(`${dim("heartbeat")} ${status} ${heartbeatAt}`);
      return;
    }
    if (name === "host.budget") {
      const info = asObject(data);
      const budget = asObject(info.budgetState);
      const used = typeof budget.usedSteps === "number" ? budget.usedSteps : "?";
      const remaining = typeof budget.remainingSteps === "number" ? budget.remainingSteps : "?";
      console.log(`${dim("budget")} steps ${used}/${remaining}`);
      return;
    }
    if (name === "host.checkpoint") {
      const info = asObject(data);
      const checkpoint = asObject(info.checkpoint);
      const summary = typeof checkpoint.summary === "string" ? checkpoint.summary : "checkpoint";
      console.log(`${dim("checkpoint")} ${summary}`);
      return;
    }
    if (name === "host.stall" || name === "host.takeover_required") {
      const info = asObject(data);
      const reason = typeof info.reason === "string" ? info.reason : name;
      console.log(`${dim(name)} ${reason}`);
      return;
    }
    if (name === "tool_request") {
      const info = asObject(data);
      const tool = asObject(info.toolCall);
      const toolName = typeof tool.name === "string" ? tool.name : "tool";
      const step = typeof info.step === "number" ? info.step : "?";
      console.log(`${dim("tool")} step ${step}: ${toolName}`);
      return;
    }
    if (name === "tool_result") {
      const info = asObject(data);
      const summary = typeof info.summary === "string" ? info.summary : "tool finished";
      const ok = Boolean(info.ok);
      console.log(`${dim(ok ? "tool ok" : "tool fail")} ${summary}`);
      return;
    }
    if (name === "meta") {
      const info = asObject(data);
      const completion = typeof info.completionStatus === "string" ? info.completionStatus : "";
      if (completion) {
        console.log(`${dim("meta")} completion=${completion}`);
      }
      return;
    }
    console.log(`${dim(name)} ${JSON.stringify(data ?? root)}`);
  };
}

async function requireHostClient(config: CliConfig): Promise<LocalHostClient> {
  const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
  const health = await hostClient.checkHealth();
  if (!health) {
    throw new Error(`Binary Host is not reachable at ${hostClient.url}. Start it first.`);
  }
  return hostClient;
}

async function requireConnectionsHostClient(config: CliConfig): Promise<LocalHostClient> {
  const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
  const health = await hostClient.checkHealth();
  if (!health) {
    throw new Error(`Binary Host is not reachable at ${hostClient.url}. Start Binary Host/Desktop first.`);
  }
  return hostClient;
}

async function getHostConnectionViews(config: CliConfig): Promise<LocalHostConnectionView[]> {
  const hostClient = new LocalHostClient(config.localHostUrl || "http://127.0.0.1:7777");
  const health = await hostClient.checkHealth();
  if (!health) return [];
  return (await hostClient.listConnections()).connections;
}

async function assertDirectTransportHasNoConnections(config: CliConfig, commandName: "chat" | "run"): Promise<void> {
  const connections = await getHostConnectionViews(config);
  const active = connections.filter((connection) => connection.enabled);
  if (!active.length) return;
  throw new Error(
    `Binary has ${active.length} enabled connection(s), and direct transport cannot attach them for \`${commandName}\`. Switch to --transport host or disable the connections first.`
  );
}

function normalizeRunAction(input: string): LocalHostRunControlAction {
  if (input === "pause" || input === "resume" || input === "cancel" || input === "repair" || input === "takeover") {
    return input;
  }
  if (input === "retry-last-turn" || input === "retry_last_turn") {
    return "retry_last_turn";
  }
  throw new Error(`Unknown runs subcommand '${input}'.`);
}

type LatencyBenchmarkSample = {
  index: number;
  runId?: string;
  status: string;
  totalMs: number;
  firstEventMs?: number;
  firstTokenMs?: number;
  runtimeReadyMs?: number;
  firstTurnReadyMs?: number;
  plannerLatencyMs?: number;
  providerLatencyMs?: number;
  executionLane?: string;
  orchestrator?: string;
  finalPreview?: string;
  error?: string;
};

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatMs(value: number | undefined): string {
  return Number.isFinite(value) ? `${Math.round(value as number)}ms` : "n/a";
}

function mean(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

async function runLatencyBenchmarkTurn(input: {
  hostClient: LocalHostClient;
  index: number;
  task: string;
  mode: AssistMode;
  model: string;
  tomEnabled: boolean;
  workspaceRoot?: string;
}): Promise<LatencyBenchmarkSample> {
  const startedAt = Date.now();
  let firstEventMs: number | undefined;
  let firstTokenMs: number | undefined;
  let runId: string | undefined;
  let runtimeReadyMs: number | undefined;
  let firstTurnReadyMs: number | undefined;
  let plannerLatencyMs: number | undefined;
  let providerLatencyMs: number | undefined;
  let executionLane: string | undefined;
  let orchestrator: string | undefined;
  let finalText = "";
  let status = "completed";
  let capturedError: string | undefined;

  try {
    const started = await input.hostClient.startDetachedRun({
      task: input.task,
      mode: input.mode,
      model: input.model,
      tom: { enabled: input.tomEnabled },
      ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
      client: {
        surface: "cli",
        version: "0.1.0",
      },
    });
    runId = started.id;
    status = started.status;
    await input.hostClient.streamRun(started.id, async (event) => {
      if (!firstEventMs) firstEventMs = Date.now() - startedAt;
      const root = asObject(event);
      const name = typeof root.event === "string" ? root.event : "";
      const data = asObject(root.data);
      if (name === "token" || name === "partial") {
        const token = String(root.data ?? "");
        if (token.trim().length > 0 && !firstTokenMs) {
          firstTokenMs = Date.now() - startedAt;
        }
        return;
      }
      if (name === "final") {
        finalText = String(root.data ?? "");
        if (finalText.trim().length > 0 && !firstTokenMs) {
          firstTokenMs = Date.now() - startedAt;
        }
        return;
      }
      if (name === "run") {
        if (typeof data.runId === "string" && data.runId.trim()) runId = data.runId;
        return;
      }
      if (name === "meta") {
        runtimeReadyMs = toFiniteNumber(data.runtimeReadyMs) ?? runtimeReadyMs;
        firstTurnReadyMs = toFiniteNumber(data.firstTurnReadyMs) ?? firstTurnReadyMs;
        plannerLatencyMs = toFiniteNumber(data.plannerLatencyMs) ?? plannerLatencyMs;
        providerLatencyMs = toFiniteNumber(data.providerLatencyMs) ?? providerLatencyMs;
        executionLane = typeof data.executionLane === "string" ? data.executionLane : executionLane;
        orchestrator = typeof data.orchestrator === "string" ? data.orchestrator : orchestrator;
        const startupDurations = asObject(data.startupPhaseDurations);
        runtimeReadyMs = toFiniteNumber(startupDurations.runtimeReadyMs) ?? runtimeReadyMs;
        firstTurnReadyMs = toFiniteNumber(startupDurations.firstTurnReadyMs) ?? firstTurnReadyMs;
      }
    });
    const runRecord = runId ? await input.hostClient.getRun(runId).catch(() => null) : null;
    if (runRecord) {
      status = runRecord.status;
      const runObject = asObject(runRecord as unknown);
      const timingState = asObject(runObject.timingState);
      const startupDurations = asObject(timingState.startupPhaseDurations);
      runtimeReadyMs = toFiniteNumber(startupDurations.runtimeReadyMs) ?? runtimeReadyMs;
      firstTurnReadyMs = toFiniteNumber(startupDurations.firstTurnReadyMs) ?? firstTurnReadyMs;
      const executionState = asObject(runObject.lastExecutionState);
      plannerLatencyMs = toFiniteNumber(executionState.plannerLatencyMs) ?? plannerLatencyMs;
      providerLatencyMs = toFiniteNumber(executionState.providerLatencyMs) ?? providerLatencyMs;
      executionLane =
        (typeof runObject.executionLane === "string" ? runObject.executionLane : undefined) ??
        (typeof executionState.executionLane === "string" ? executionState.executionLane : executionLane);
      orchestrator =
        (typeof executionState.orchestrator === "string" ? executionState.orchestrator : undefined) ?? orchestrator;
      const finalEnvelope = asObject(runObject.finalEnvelope);
      finalText = typeof finalEnvelope.final === "string" ? finalEnvelope.final : finalText;
    }
  } catch (error) {
    capturedError = error instanceof Error ? error.message : String(error);
    status = "failed";
  }

  return {
    index: input.index,
    ...(runId ? { runId } : {}),
    status,
    totalMs: Date.now() - startedAt,
    ...(firstEventMs !== undefined ? { firstEventMs } : {}),
    ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
    ...(runtimeReadyMs !== undefined ? { runtimeReadyMs } : {}),
    ...(firstTurnReadyMs !== undefined ? { firstTurnReadyMs } : {}),
    ...(plannerLatencyMs !== undefined ? { plannerLatencyMs } : {}),
    ...(providerLatencyMs !== undefined ? { providerLatencyMs } : {}),
    ...(executionLane ? { executionLane } : {}),
    ...(orchestrator ? { orchestrator } : {}),
    ...(finalText.trim()
      ? {
          finalPreview:
            finalText.trim().length > 140 ? `${finalText.trim().slice(0, 137)}...` : finalText.trim(),
        }
      : {}),
    ...(capturedError ? { error: capturedError } : {}),
  };
}

async function handleBenchmark(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireHostClient(config);
  const count = Math.min(parsePositiveInteger(getFlagString(parsed, "count", "n"), 3), 20);
  const warmupCount = Math.min(parsePositiveInteger(getFlagString(parsed, "warmup"), 1), 5);
  const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
  const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
  const tomEnabled = resolveTomEnabled(config, parsed, true);
  const workspaceFlag = getFlagString(parsed, "workspace");
  const workspaceRoot = workspaceFlag ? path.resolve(workspaceFlag) : undefined;
  const task = getFlagString(parsed, "task") || parsed.positionals.slice(1).join(" ").trim() || "hello";
  const jsonMode = parsed.flags["json"] === true;

  console.log(color("Binary Host Latency Benchmark", "cyan"));
  console.log(dim(rule()));
  console.log(`Host: ${hostClient.url}`);
  console.log(`Task: ${task}`);
  console.log(`Mode: ${mode}`);
  console.log(`Model: ${model}`);
  console.log(`Runs: ${count} (warmup ${warmupCount})`);
  if (workspaceRoot) console.log(`Workspace: ${workspaceRoot}`);

  for (let i = 1; i <= warmupCount; i += 1) {
    process.stdout.write(`${dim("warmup")} ${i}/${warmupCount}...\n`);
    await runLatencyBenchmarkTurn({
      hostClient,
      index: i,
      task,
      mode,
      model,
      tomEnabled,
      workspaceRoot,
    });
  }

  const samples: LatencyBenchmarkSample[] = [];
  for (let i = 1; i <= count; i += 1) {
    process.stdout.write(`${dim("run")} ${i}/${count}...\n`);
    const sample = await runLatencyBenchmarkTurn({
      hostClient,
      index: i,
      task,
      mode,
      model,
      tomEnabled,
      workspaceRoot,
    });
    samples.push(sample);
    const statusTone = sample.status === "completed" ? "green" : "yellow";
    const statusLine = `${color(sample.status, statusTone as "green" | "yellow")} total=${formatMs(sample.totalMs)} first-token=${formatMs(
      sample.firstTokenMs
    )} runtime-ready=${formatMs(sample.runtimeReadyMs)} planner=${formatMs(sample.plannerLatencyMs)} provider=${formatMs(
      sample.providerLatencyMs
    )}`;
    console.log(`  ${statusLine}`);
    if (sample.error) console.log(`  ${dim(`error: ${sample.error}`)}`);
  }

  const successful = samples.filter((sample) => !sample.error);
  const totals = successful.map((sample) => sample.totalMs);
  const firstTokens = successful
    .map((sample) => sample.firstTokenMs)
    .filter((value): value is number => Number.isFinite(value));
  const runtimeReady = successful
    .map((sample) => sample.runtimeReadyMs)
    .filter((value): value is number => Number.isFinite(value));
  const planner = successful
    .map((sample) => sample.plannerLatencyMs)
    .filter((value): value is number => Number.isFinite(value));
  const provider = successful
    .map((sample) => sample.providerLatencyMs)
    .filter((value): value is number => Number.isFinite(value));

  const summary = {
    task,
    mode,
    model,
    count,
    warmupCount,
    successfulRuns: successful.length,
    failedRuns: samples.length - successful.length,
    metrics: {
      totalMs: {
        mean: mean(totals),
        p50: percentile(totals, 0.5),
        p95: percentile(totals, 0.95),
      },
      firstTokenMs: {
        mean: mean(firstTokens),
        p50: percentile(firstTokens, 0.5),
        p95: percentile(firstTokens, 0.95),
      },
      runtimeReadyMs: {
        mean: mean(runtimeReady),
        p50: percentile(runtimeReady, 0.5),
        p95: percentile(runtimeReady, 0.95),
      },
      plannerLatencyMs: {
        mean: mean(planner),
        p50: percentile(planner, 0.5),
        p95: percentile(planner, 0.95),
      },
      providerLatencyMs: {
        mean: mean(provider),
        p50: percentile(provider, 0.5),
        p95: percentile(provider, 0.95),
      },
    },
    samples,
  };

  if (jsonMode) {
    printJson(summary);
    return;
  }

  console.log(dim(rule()));
  console.log(
    `Total latency: mean ${formatMs(summary.metrics.totalMs.mean)} | p50 ${formatMs(
      summary.metrics.totalMs.p50
    )} | p95 ${formatMs(summary.metrics.totalMs.p95)}`
  );
  console.log(
    `First token:  mean ${formatMs(summary.metrics.firstTokenMs.mean)} | p50 ${formatMs(
      summary.metrics.firstTokenMs.p50
    )} | p95 ${formatMs(summary.metrics.firstTokenMs.p95)}`
  );
  console.log(
    `Runtime ready: mean ${formatMs(summary.metrics.runtimeReadyMs.mean)} | p50 ${formatMs(
      summary.metrics.runtimeReadyMs.p50
    )} | p95 ${formatMs(summary.metrics.runtimeReadyMs.p95)}`
  );
  console.log(
    `Planner:      mean ${formatMs(summary.metrics.plannerLatencyMs.mean)} | p50 ${formatMs(
      summary.metrics.plannerLatencyMs.p50
    )} | p95 ${formatMs(summary.metrics.plannerLatencyMs.p95)}`
  );
  console.log(
    `Provider:     mean ${formatMs(summary.metrics.providerLatencyMs.mean)} | p50 ${formatMs(
      summary.metrics.providerLatencyMs.p50
    )} | p95 ${formatMs(summary.metrics.providerLatencyMs.p95)}`
  );
  console.log(dim(`Tip: use --json to capture full per-run timing and metadata.`));
}

function resolveOpenhandsGatewayTestsLayout(startDir: string): { repoRoot: string; gatewayDir: string } | null {
  let cursor = path.resolve(startDir);
  for (let depth = 0; depth < 24; depth += 1) {
    const gatewayDir = path.join(cursor, "services", "openhands-gateway");
    const marker = path.join(gatewayDir, "agent_turn.py");
    const testsDir = path.join(gatewayDir, "tests");
    if (existsSync(marker) && existsSync(testsDir)) {
      return { repoRoot: cursor, gatewayDir };
    }
    const parent = path.dirname(cursor);
    if (!parent || parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function runPytestInGatewayDir(options: {
  gatewayDir: string;
  pythonExe: string;
  pytestArgs: string[];
}): Promise<number> {
  return new Promise((resolve) => {
    const args = ["-m", "pytest", ...options.pytestArgs];
    const child = spawn(options.pythonExe, args, {
      cwd: options.gatewayDir,
      stdio: "inherit",
      env: {
        ...process.env,
        PYTHONUTF8: process.env.PYTHONUTF8 || "1",
      },
    });
    child.on("error", (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      resolve(127);
    });
    child.on("close", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });
  });
}

async function handleTestSuite(parsed: ParsedArgs): Promise<void> {
  const sub = (parsed.positionals[1] || "").trim().toLowerCase();
  if (!sub || sub === "help") {
    console.log(
      dim(
        "Usage: binary test openhands-gateway [--workspace <dir>] [--python <exe>] [-q] [extra pytest path args...]"
      )
    );
    console.log(dim("Runs pytest from services/openhands-gateway (no Binary Host or API keys required)."));
    return;
  }

  const workspaceFlag = getFlagString(parsed, "workspace");
  const startDir = workspaceFlag ? path.resolve(workspaceFlag) : process.cwd();
  const layout = resolveOpenhandsGatewayTestsLayout(startDir);
  if (!layout) {
    throw new Error(
      "Could not find services/openhands-gateway (agent_turn.py + tests/). Run from inside the Xpersona repo or pass --workspace <repoRoot>."
    );
  }

  if (sub !== "openhands-gateway" && sub !== "gateway") {
    throw new Error(`Unknown test suite '${parsed.positionals[1]}'. Supported: openhands-gateway`);
  }

  const pythonExe = getFlagString(parsed, "python") || process.env.PYTHON || "python";
  const quiet = parsed.flags.quiet === true || parsed.flags.q === true;
  const pytestArgs: string[] = [];
  if (quiet) pytestArgs.push("-q");
  else pytestArgs.push("-v");
  pytestArgs.push("tests");
  const passThrough = parsed.positionals.slice(2).map((p) => p.trim()).filter(Boolean);
  pytestArgs.push(...passThrough);

  console.log(color("OpenHands gateway tests", "cyan"));
  console.log(dim(rule()));
  console.log(dim(`repo: ${layout.repoRoot}`));
  console.log(dim(`cwd:  ${layout.gatewayDir}`));
  console.log(dim(`py:   ${pythonExe}`));

  const code = await runPytestInGatewayDir({
    gatewayDir: layout.gatewayDir,
    pythonExe,
    pytestArgs,
  });
  if (code !== 0) {
    process.exit(code);
  }
}

function parseHeaderFlag(value: string | undefined): Record<string, string> | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const separator = raw.includes(":") ? ":" : raw.includes("=") ? "=" : "";
  if (!separator) {
    throw new Error("Headers must use the format \"Name: Value\".");
  }
  const index = raw.indexOf(separator);
  const key = raw.slice(0, index).trim();
  const headerValue = raw.slice(index + 1).trim();
  if (!key || !headerValue) {
    throw new Error("Headers must use the format \"Name: Value\".");
  }
  return { [key]: headerValue };
}

async function handleConnections(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireConnectionsHostClient(config);
  const sub = parsed.positionals[1] || "list";

  if (sub === "list") {
    const response = await hostClient.listConnections();
    if (!response.connections.length) {
      console.log("No connections yet. Add one with `binary connections add remote ...` or `binary connections add web`.");
      return;
    }
    for (const connection of response.connections) {
      printConnectionSummary(connection);
    }
    return;
  }

  if (sub === "add") {
    const kind = parsed.positionals[2] || "remote";
    if (kind === "web") {
      const saved = await hostClient.saveConnection(WEB_STARTER_CONNECTION);
      console.log("Starter connection added:");
      printConnectionSummary(saved.connection);
      console.log(dim("Tip: if the local fetch proxy is not running yet, update the URL or import an advanced MCP config later."));
      return;
    }
    if (kind !== "remote") {
      throw new Error("Usage: binary connections add web | binary connections add remote --name <name> --url <url>");
    }
    const name = getFlagString(parsed, "name");
    const url = getFlagString(parsed, "url");
    if (!name || !url) {
      throw new Error("Usage: binary connections add remote --name <name> --url <url>");
    }
    const auth = (getFlagString(parsed, "auth") || "none").trim() as LocalHostConnectionDraft["authMode"];
    const transport = (getFlagString(parsed, "transport") || "http").trim() as LocalHostConnectionDraft["transport"];
    const saved = await hostClient.saveConnection({
      name,
      url,
      transport,
      authMode: auth,
      enabled: parsed.flags.disabled ? false : true,
      source: "guided",
      ...(getFlagString(parsed, "header-name") ? { headerName: getFlagString(parsed, "header-name") } : {}),
      ...(getFlagString(parsed, "bearer") ? { bearerToken: getFlagString(parsed, "bearer") } : {}),
      ...(getFlagString(parsed, "api-key") ? { apiKey: getFlagString(parsed, "api-key") } : {}),
      ...(getFlagString(parsed, "public-header")
        ? { publicHeaders: parseHeaderFlag(getFlagString(parsed, "public-header")) }
        : {}),
      ...(getFlagString(parsed, "secret-header")
        ? { secretHeaders: parseHeaderFlag(getFlagString(parsed, "secret-header")) }
        : {}),
      ...(auth === "oauth" ? { oauthSupported: true } : {}),
    });
    console.log("Connection saved:");
    printConnectionSummary(saved.connection);
    return;
  }

  if (sub === "import") {
    const file = getFlagString(parsed, "file");
    if (!file) throw new Error("Usage: binary connections import --file <path>");
    const resolvedPath = path.resolve(file);
    const raw = await fs.readFile(resolvedPath, "utf8");
    const response = await hostClient.importConnections(raw, resolvedPath);
    if (!response.connections.length) {
      console.log("No supported remote connections were imported.");
      return;
    }
    console.log(`Imported ${response.connections.length} connection(s):`);
    for (const connection of response.connections) {
      printConnectionSummary(connection);
    }
    return;
  }

  const connectionId = parsed.positionals[2];
  if (!connectionId) {
    throw new Error(`Usage: binary connections ${sub} <id>`);
  }

  if (sub === "test") {
    const result = await hostClient.testConnection(connectionId);
    printConnectionSummary(result.connection);
    console.log(result.test.message);
    return;
  }
  if (sub === "enable") {
    const result = await hostClient.enableConnection(connectionId);
    printConnectionSummary(result.connection);
    return;
  }
  if (sub === "disable") {
    const result = await hostClient.disableConnection(connectionId);
    printConnectionSummary(result.connection);
    return;
  }
  if (sub === "remove") {
    await hostClient.removeConnection(connectionId);
    console.log(`Removed connection ${connectionId}.`);
    return;
  }

  throw new Error(`Unknown connections subcommand '${sub}'.`);
}

async function handleProviders(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireConnectionsHostClient(config);
  const sub = parsed.positionals[1] || "list";

  if (sub === "list") {
    const [catalogResponse, providersResponse] = await Promise.all([
      hostClient.listProviderCatalog(),
      hostClient.listProviders(),
    ]);
    if (!catalogResponse.providers.length) {
      console.log("No built-in providers are available in this Binary Host build.");
      return;
    }
    for (const provider of providersResponse.providers) {
      printProviderSummary(provider);
    }
    return;
  }

  const providerId = parsed.positionals[2] as LocalHostProviderId | undefined;
  if (!providerId) {
    throw new Error(`Usage: binary provider ${sub} <provider>`);
  }

  if (sub === "open") {
    const response = await hostClient.openProviderBrowser(providerId);
    console.log(`Opened ${providerId} in your browser.`);
    console.log(dim(response.url));
    return;
  }

  if (sub === "login" || sub === "connect") {
    const catalogResponse = await hostClient.listProviderCatalog();
    const catalog = catalogResponse.providers.find((item) => item.id === providerId);
    if (!catalog) throw new Error(`Provider ${providerId} is not available in this Binary Host build.`);
    if (catalog.connectionMode === "portal_session" || catalog.connectionMode === "local_credential_adapter") {
      const result = await hostClient.startProviderBrowserSession({
        providerId,
        ...(getFlagString(parsed, "base-url") ? { baseUrl: getFlagString(parsed, "base-url") } : {}),
        ...(getFlagString(parsed, "model") ? { defaultModel: getFlagString(parsed, "model") } : {}),
        setDefault: parsed.flags.default === true,
      });
      console.log(`Opened ${providerId} browser linking in your browser.`);
      const startedAt = Date.now();
      while (Date.now() - startedAt < 180_000) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const poll = await hostClient.pollProviderBrowserSession(result.session.sessionId);
        if (poll.session.status === "connected" && poll.provider) {
          printProviderSummary(poll.provider);
          console.log("Browser session linked.");
          return;
        }
        if (poll.session.status === "failed" || poll.session.status === "cancelled") {
          throw new Error(poll.session.error || "Provider login did not complete.");
        }
      }
      console.log("Browser linking is still pending. Re-run `binary provider status <provider>` in a moment.");
      return;
    }
    const result = await hostClient.startProviderOAuth({
      providerId,
      ...(getFlagString(parsed, "base-url") ? { baseUrl: getFlagString(parsed, "base-url") } : {}),
      ...(getFlagString(parsed, "model") ? { defaultModel: getFlagString(parsed, "model") } : {}),
      setDefault: parsed.flags.default === true,
    });
    console.log(`Opened ${providerId} account linking in your browser.`);
    if (result.userCode && result.verificationUri) {
      console.log(dim(`Open ${result.verificationUri} and enter code ${result.userCode}.`));
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180_000) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const poll = await hostClient.pollProviderOAuth(result.sessionId);
      if (poll.session.status === "connected" && poll.provider) {
        printProviderSummary(poll.provider);
        console.log("Browser auth completed.");
        return;
      }
      if (poll.session.status === "failed" || poll.session.status === "cancelled") {
        throw new Error(poll.session.error || "Provider login did not complete.");
      }
    }
    console.log("Browser auth is still pending. Re-run `binary provider status <provider>` in a moment.");
    return;
  }

  if (sub === "import") {
    const result = await hostClient.importProviderLocalAuth({
      providerId,
      ...(getFlagString(parsed, "base-url") ? { baseUrl: getFlagString(parsed, "base-url") } : {}),
      ...(getFlagString(parsed, "model") ? { defaultModel: getFlagString(parsed, "model") } : {}),
      setDefault: parsed.flags.default === true,
    });
    printProviderSummary(result.provider);
    console.log(`Imported local ${providerId} credentials.`);
    return;
  }

  if (sub === "status") {
    const response = await hostClient.listProviders();
    const provider = response.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error(`Provider ${providerId} is not available in this Binary Host build.`);
    printProviderSummary(provider);
    return;
  }

  if (sub === "test") {
    const result = await hostClient.testProvider(providerId);
    printProviderSummary(result.provider);
    console.log(result.test.message);
    if (result.test.availableModels?.length) {
      console.log(dim(`validated against ${result.test.availableModels.length} model id(s)`));
    }
    return;
  }

  if (sub === "refresh") {
    const result = await hostClient.refreshProvider(providerId);
    printProviderSummary(result.provider);
    console.log(`Refreshed ${providerId}.`);
    return;
  }

  if (sub === "default") {
    const result = await hostClient.setDefaultProvider(providerId);
    const provider = result.providers.find((item) => item.id === providerId);
    if (provider) printProviderSummary(provider);
    console.log(`Default model provider set to ${providerId}.`);
    return;
  }

  if (sub === "disconnect" || sub === "remove" || sub === "logout") {
    await hostClient.disconnectProvider(providerId);
    console.log(`Disconnected provider ${providerId}.`);
    return;
  }

  throw new Error(`Unknown provider subcommand '${sub}'.`);
}

async function handleJobs(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireHostClient(config);
  const sub = parsed.positionals[1] || "list";

  if (sub === "list") {
    const limitRaw = getFlagString(parsed, "limit", "l");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    const response = await hostClient.listAgentJobs(Number.isFinite(limit) ? limit : 20);
    if (!response.jobs.length) {
      console.log("No Binary agent jobs found.");
      return;
    }
    for (const job of response.jobs) {
      printAgentJobSummary(job);
    }
    return;
  }

  if (sub === "run" || sub === "create") {
    const task = parsed.positionals.slice(2).join(" ").trim() || getFlagString(parsed, "task");
    if (!task) {
      throw new Error("Usage: binary jobs run \"<task>\" [--workspace <path>] [--lane <local_interactive|openhands_headless|openhands_remote>]");
    }
    const workspaceRoot = getFlagString(parsed, "workspace");
    const lane = getFlagString(parsed, "lane");
    const pluginPacks = parseCsvFlag(getFlagString(parsed, "plugin-packs"));
    const job = await hostClient.createAgentJob({
      task,
      mode: ((getFlagString(parsed, "mode") || "auto") as AssistMode) || "auto",
      model: getFlagString(parsed, "model") || config.model || "Binary IDE",
      detach: true,
      ...(workspaceRoot ? { workspaceRoot: path.resolve(workspaceRoot) } : {}),
      ...(lane ? { executionLane: lane as LocalHostAgentJob["executionLane"] } : {}),
      ...(pluginPacks ? { pluginPacks: pluginPacks as Array<"web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice"> } : {}),
      expectedLongRun: parsed.flags["short"] === true ? false : true,
      requireIsolation: parsed.flags["require-isolation"] === true,
      debugTracing: parsed.flags["trace"] === true,
      client: {
        surface: "cli",
      },
    });
    printAgentJobSummary(job);
    return;
  }

  if (sub === "show") {
    const jobId = parsed.positionals[2];
    if (!jobId) throw new Error("Usage: binary jobs show <jobId>");
    printJson(await hostClient.getAgentJob(jobId));
    return;
  }

  if (sub === "tail") {
    const jobId = parsed.positionals[2];
    if (!jobId) throw new Error("Usage: binary jobs tail <jobId>");
    let after = 0;
    while (true) {
      const response = await hostClient.getAgentJobEvents(jobId, after);
      if (!response.job) throw new Error(`Unknown Binary agent job '${jobId}'.`);
      for (const event of response.events) {
        printAgentJobEvent(event as { seq: number; capturedAt: string; event: Record<string, unknown> });
        after = Math.max(after, event.seq);
      }
      if (response.done) {
        console.log(dim(`job finished with status ${response.job.status}`));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  if (sub === "stream") {
    const jobId = parsed.positionals[2];
    if (!jobId) throw new Error("Usage: binary jobs stream <jobId>");
    await hostClient.streamAgentJob(jobId, async (event) => {
      const payload = asObject(event);
      const seq = typeof payload.seq === "number" ? payload.seq : 0;
      const capturedAt = typeof payload.capturedAt === "string" ? payload.capturedAt : new Date().toISOString();
      printAgentJobEvent({
        seq,
        capturedAt,
        event: payload,
      });
    });
    return;
  }

  if (sub === "remote-health") {
    printJson(await hostClient.getRemoteAgentHealth());
    return;
  }

  const jobId = parsed.positionals[2];
  if (!jobId) {
    throw new Error(`Usage: binary jobs ${sub} <jobId>`);
  }
  if (sub !== "pause" && sub !== "resume" && sub !== "cancel") {
    throw new Error(`Unknown jobs subcommand '${sub}'.`);
  }
  printAgentJobSummary(
    await hostClient.controlAgentJob(jobId, sub, getFlagString(parsed, "note"))
  );
}

async function handleRuns(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireHostClient(config);
  const sub = parsed.positionals[1] || "list";

  if (sub === "list") {
    const limitRaw = getFlagString(parsed, "limit", "l");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    const response = await hostClient.listRuns(Number.isFinite(limit) ? limit : 20);
    if (!response.runs.length) {
      console.log("No Binary Host runs found.");
      return;
    }
    for (const run of response.runs) {
      printRunSummary(run);
    }
    return;
  }

  if (sub === "show") {
    const runId = parsed.positionals[2];
    if (!runId) throw new Error("Usage: binary runs show <runId>");
    printJson(await hostClient.getRun(runId));
    return;
  }

  if (sub === "tail") {
    const runId = parsed.positionals[2];
    if (!runId) throw new Error("Usage: binary runs tail <runId>");
    const intervalRaw = getFlagString(parsed, "interval");
    const interval = intervalRaw ? Number.parseInt(intervalRaw, 10) : 1200;
    let after = 0;
    const printTailEvent = createTailEventPrinter();
    while (true) {
      const response = await hostClient.getRunEvents(runId, after);
      for (const event of response.events) {
        printTailEvent(event as unknown as { seq: number; capturedAt: string; event: Record<string, unknown> });
        after = Math.max(after, event.seq);
      }
      if (response.done) {
        console.log(dim(`run finished with status ${response.run.status}`));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(interval) ? interval : 1200));
    }
  }

  if (sub === "stream") {
    const runId = parsed.positionals[2];
    if (!runId) throw new Error("Usage: binary runs stream <runId>");
    const printTailEvent = createTailEventPrinter();
    await hostClient.streamRun(runId, async (event) => {
      const payload = asObject(event);
      const seq = typeof payload.seq === "number" ? payload.seq : 0;
      const capturedAt = typeof payload.capturedAt === "string" ? payload.capturedAt : new Date().toISOString();
      printTailEvent({
        seq,
        capturedAt,
        event: payload,
      });
    });
    return;
  }

  if (sub === "export") {
    const runId = parsed.positionals[2];
    if (!runId) throw new Error("Usage: binary runs export <runId> [--output run.json]");
    const exported = await hostClient.exportRun(runId);
    const outputPath = getFlagString(parsed, "output", "o");
    if (outputPath) {
      const resolved = path.resolve(outputPath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
      console.log(`Exported run to ${resolved}`);
      return;
    }
    printJson(exported);
    return;
  }

  const runId = parsed.positionals[2];
  if (!runId) {
    throw new Error(`Usage: binary runs ${sub} <runId>`);
  }
  const note = getFlagString(parsed, "note");
  const summary = await hostClient.controlRun(runId, normalizeRunAction(sub), note);
  printRunSummary(summary);
}

async function handleAutomations(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireHostClient(config);
  const sub = parsed.positionals[1] || "list";

  if (sub === "list") {
    const response = await hostClient.listAutomations();
    if (!response.automations.length) {
      console.log("No automations found.");
      return;
    }
    for (const automation of response.automations) {
      printAutomationSummary(automation);
    }
    return;
  }

  if (sub === "create") {
    const name = getFlagString(parsed, "name");
    const prompt = getFlagString(parsed, "prompt");
    if (!name || !prompt) {
      throw new Error("Usage: binary automations create --name \"...\" --prompt \"...\" --trigger <kind>");
    }
    const automation = await hostClient.saveAutomation({
      name,
      prompt,
      trigger: buildAutomationTriggerFromArgs(parsed),
      status: getFlagString(parsed, "status") === "paused" ? "paused" : "active",
      policy:
        getFlagString(parsed, "policy") === "observe_only" || getFlagString(parsed, "policy") === "approval_before_mutation"
          ? (getFlagString(parsed, "policy") as LocalHostAutomationDefinition["policy"])
          : "autonomous",
      workspaceRoot: getFlagString(parsed, "workspace") ? path.resolve(getFlagString(parsed, "workspace") as string) : undefined,
      model: getFlagString(parsed, "model"),
    });
    printAutomationSummary(automation);
    return;
  }

  if (sub === "show") {
    const automationId = parsed.positionals[2];
    if (!automationId) throw new Error("Usage: binary automations show <id>");
    printJson(await hostClient.getAutomation(automationId));
    return;
  }

  if (sub === "run") {
    const automationId = parsed.positionals[2];
    if (!automationId) throw new Error("Usage: binary automations run <id>");
    printRunSummary(await hostClient.runAutomation(automationId));
    return;
  }

  if (sub === "pause" || sub === "resume") {
    const automationId = parsed.positionals[2];
    if (!automationId) throw new Error(`Usage: binary automations ${sub} <id>`);
    printAutomationSummary(await hostClient.controlAutomation(automationId, sub));
    return;
  }

  if (sub === "tail") {
    const automationId = parsed.positionals[2];
    if (!automationId) throw new Error("Usage: binary automations tail <id>");
    await hostClient.streamAutomationEvents(automationId, async (event) => {
      const payload = asObject(event);
      const seq = typeof payload.seq === "number" ? payload.seq : 0;
      const capturedAt = typeof payload.capturedAt === "string" ? payload.capturedAt : new Date().toISOString();
      printAutomationEvent({
        seq,
        capturedAt,
        event: payload,
      });
    });
    return;
  }

  throw new Error(`Unknown automations subcommand '${sub}'.`);
}

async function handleDebugAgent(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const hostClient = await requireHostClient(config);
  const sub = parsed.positionals[1] || "chat";

  if (sub === "show") {
    const sessionId = parsed.positionals[2];
    if (!sessionId) throw new Error("Usage: binary debug-agent show <sessionId>");
    const session = await hostClient.getAgentProbeSession(sessionId);
    printAgentProbeSession(session);
    printAgentProbeTurnOutcome(session);
    return;
  }

  if (sub === "tail") {
    const sessionId = parsed.positionals[2];
    if (!sessionId) throw new Error("Usage: binary debug-agent tail <sessionId>");
    let after = 0;
    while (true) {
      const response = await hostClient.getAgentProbeEvents(sessionId, after);
      if (!response.session) {
        throw new Error(`Unknown agent probe session '${sessionId}'.`);
      }
      for (const event of response.events) {
        printAgentProbeEvent(event);
        after = Math.max(after, event.seq);
      }
      if (response.done) {
        console.log(dim(`probe session finished with status ${response.session.status}`));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  if (sub !== "chat") {
    throw new Error(`Unknown debug-agent subcommand '${sub}'.`);
  }

  const model = getFlagString(parsed, "model") ?? config.model ?? "Binary IDE";
  const workspaceFlag = getFlagString(parsed, "workspace");
  const defaultWorkspaceRoot = workspaceFlag ? path.resolve(workspaceFlag) : process.cwd();
  let session =
    parsed.positionals[2]
      ? await hostClient.getAgentProbeSession(parsed.positionals[2])
      : await hostClient.createAgentProbeSession({
          title: getFlagString(parsed, "title") ?? "Agent probe",
          model,
          workspaceRoot: defaultWorkspaceRoot,
        });
  const inputSource = await createChatInputSource();

  clearIfTty();
  console.log(color("Binary Agent Probe", "magenta"));
  console.log(dim(rule()));
  printAgentProbeSession(session);
  console.log(dim("Commands: /help  /new  /pause  /resume  /show  /exit"));

  while (true) {
    const prompt = `${color("probe", "magenta")} ${color(">", "gray")} `;
    const rawLine = await inputSource.next(prompt);
    if (rawLine == null) break;
    const line = rawLine.trim();
    if (!line) continue;

    if (line === "/exit" || line === "/quit") break;
    if (line === "/help") {
      console.log(dim("Commands: /help  /new  /pause  /resume  /show  /exit"));
      continue;
    }
    if (line === "/show") {
      printAgentProbeSession(session);
      continue;
    }
    if (line === "/pause") {
      session = await hostClient.controlAgentProbeSession(session.id, "pause");
      printAgentProbeSession(session);
      continue;
    }
    if (line === "/resume") {
      session = await hostClient.controlAgentProbeSession(session.id, "resume");
      printAgentProbeSession(session);
      continue;
    }
    if (line === "/new") {
      session = await hostClient.createAgentProbeSession({
        title: getFlagString(parsed, "title") ?? "Agent probe",
        model,
        workspaceRoot: defaultWorkspaceRoot,
      });
      printAgentProbeSession(session);
      continue;
    }

    session = await hostClient.submitAgentProbeMessage(session.id, { message: line });
    printAgentProbeTurnOutcome(session);
  }

  inputSource.close();
}

async function handleSessions(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  const sub = parsed.positionals[1];

  if (!sub || sub === "list") {
    const limitRaw = getFlagString(parsed, "limit", "l");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    const response = getData(await client.listSessions(Number.isFinite(limit) ? limit : 20));
    const root = asObject(response);
    const rows = asArray(root.data);
    if (!rows.length) {
      console.log("No sessions found.");
      return;
    }
    for (const row of rows) {
      const item = asObject(row);
      const id = typeof item.id === "string" ? item.id : "(unknown)";
      const mode = typeof item.mode === "string" ? item.mode : "auto";
      const title = typeof item.title === "string" && item.title.trim() ? item.title : "(untitled)";
      const updated = typeof item.updatedAt === "string" ? item.updatedAt : "";
      console.log(`${id}  [${mode}]  ${title}${updated ? `  ${updated}` : ""}`);
    }
    return;
  }

  if (sub === "show") {
    const sessionId = parsed.positionals[2];
    if (!sessionId) throw new Error("Usage: binary sessions show <sessionId>");
    const response = getData(await client.getSessionMessages(sessionId, true));
    const rows = asArray(response).slice().reverse();
    for (const row of rows) {
      const item = asObject(row);
      const role = typeof item.role === "string" ? item.role : "assistant";
      const content = typeof item.content === "string" ? item.content : "";
      const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
      console.log(`\n[${role}] ${createdAt}`);
      console.log(content);
    }
    return;
  }

  throw new Error(`Unknown sessions subcommand '${sub}'.`);
}

async function handleUsage(config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  const response = getData(await client.usage());
  printJson(response);
}

async function handleCheckout(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  const tier = (getFlagString(parsed, "tier") as PlanTier | undefined) ?? "builder";
  const billing = (getFlagString(parsed, "billing") as BillingCycle | undefined) ?? "monthly";
  if (!["starter", "builder", "studio"].includes(tier)) {
    throw new Error("Invalid --tier. Use starter|builder|studio.");
  }
  if (!["monthly", "yearly"].includes(billing)) {
    throw new Error("Invalid --billing. Use monthly|yearly.");
  }

  const response = asObject(getData(await client.checkout(tier, billing)));
  const url = typeof response.url === "string" ? response.url : "";
  if (!url) {
    printJson(response);
    return;
  }
  console.log(`Binary IDE checkout URL (${tier}/${billing}):`);
  console.log(url);
  await maybeOpenBrowser(url);
}

async function handleReplay(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  const sessionId = parsed.positionals[1];
  if (!sessionId) throw new Error("Usage: binary replay <sessionId> [--mode plan]");
  const mode = parseMode(getFlagString(parsed, "mode", "m"), "plan");
  const hostedModeNotice = getHostedModeNotice(mode);
  const fingerprint = getFlagString(parsed, "workspace") ?? workspaceFingerprint();
  if (hostedModeNotice) console.log(dim(`Mode note: ${hostedModeNotice}`));
  const response = getData(await client.replay(sessionId, fingerprint, mode));
  printJson(response);
}

type ExecuteAction =
  | { type: "command"; command: string; cwd?: string; timeoutMs?: number }
  | { type: "edit"; path: string; patch?: string; diff?: string }
  | { type: "rollback"; snapshotId: string };

function parseExecuteActions(value: unknown): ExecuteAction[] {
  const root = asObject(value);
  const maybeActions = Array.isArray(root.actions) ? root.actions : Array.isArray(value) ? value : [];
  const actions: ExecuteAction[] = [];
  for (const raw of maybeActions) {
    const item = asObject(raw);
    const type = item.type;
    if (type === "command" && typeof item.command === "string") {
      actions.push({
        type,
        command: item.command,
        cwd: typeof item.cwd === "string" ? item.cwd : undefined,
        timeoutMs: typeof item.timeoutMs === "number" ? item.timeoutMs : undefined,
      });
      continue;
    }
    if (type === "edit" && typeof item.path === "string") {
      actions.push({
        type,
        path: item.path,
        patch: typeof item.patch === "string" ? item.patch : undefined,
        diff: typeof item.diff === "string" ? item.diff : undefined,
      });
      continue;
    }
    if (type === "rollback" && typeof item.snapshotId === "string") {
      actions.push({ type, snapshotId: item.snapshotId });
    }
  }
  return actions;
}

function makeCliToolCall(name: string, argumentsValue: Record<string, unknown>): PendingToolCall {
  return {
    step: 1,
    adapter: "cli",
    requiresClientExecution: false,
    toolCall: {
      id: `${name}-${randomBytes(4).toString("hex")}`,
      name,
      arguments: argumentsValue,
    },
    createdAt: new Date().toISOString(),
  };
}

function printBinaryHexdump(result: Record<string, unknown>): void {
  const offset = typeof result.offset === "number" ? result.offset : 0;
  const bytesBase64 = typeof result.bytesBase64 === "string" ? result.bytesBase64 : "";
  const bytes = Buffer.from(bytesBase64, "base64");
  const lineWidth = 16;
  for (let index = 0; index < bytes.length; index += lineWidth) {
    const slice = bytes.subarray(index, index + lineWidth);
    const hex = Array.from(slice)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(lineWidth * 3 - 1, " ");
    const ascii = Array.from(slice)
      .map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : "."))
      .join("");
    console.log(`${(offset + index).toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }
}

async function handleBinaryUtility(command: "inspect" | "hexdump" | "hash", parsed: ParsedArgs): Promise<void> {
  const targetPath = parsed.positionals.slice(1).join(" ").trim();
  if (!targetPath) {
    throw new Error(`Usage: binary ${command} <path>`);
  }
  const workspaceRoot = path.resolve(getFlagString(parsed, "workspace") ?? process.cwd());
  const executor = new CliToolExecutor(workspaceRoot);

  if (command === "inspect") {
    const [statResult, analysisResult, chunkResult] = await Promise.all([
      executor.execute(makeCliToolCall("stat_binary", { path: targetPath })),
      executor.execute(makeCliToolCall("analyze_binary", { path: targetPath })),
      executor.execute(makeCliToolCall("read_binary_chunk", { path: targetPath, offset: 0, length: 256 })),
    ]);
    printJson({
      descriptor: statResult.data || null,
      analysis: analysisResult.ok ? analysisResult.data || null : null,
      preview: chunkResult.ok
        ? {
            offset: chunkResult.data?.offset,
            length: chunkResult.data?.length,
            hexPreview: chunkResult.data?.hexPreview,
            asciiPreview: chunkResult.data?.asciiPreview,
            truncated: chunkResult.data?.truncated,
          }
        : null,
    });
    return;
  }

  if (command === "hash") {
    const result = await executor.execute(makeCliToolCall("hash_binary", { path: targetPath }));
    if (!result.ok) throw new Error(result.error || result.summary);
    printJson(result.data || {});
    return;
  }

  const offsetRaw = getFlagString(parsed, "offset");
  const lengthRaw = getFlagString(parsed, "length");
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const length = lengthRaw ? Number.parseInt(lengthRaw, 10) : 256;
  const result = await executor.execute(
    makeCliToolCall("read_binary_chunk", {
      path: targetPath,
      offset: Number.isFinite(offset) ? offset : 0,
      length: Number.isFinite(length) ? length : 256,
    })
  );
  if (!result.ok || !result.data) throw new Error(result.error || result.summary);
  console.log(`${result.data.path}  offset=${result.data.offset}  length=${result.data.length}  sha256=${result.data.sha256}`);
  printBinaryHexdump(result.data);
}

async function handleExecute(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });

  const filePath = getFlagString(parsed, "file", "f");
  if (!filePath) throw new Error("Usage: binary execute --file actions.json [--session <id>]");

  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  const parsedJson = JSON.parse(raw) as unknown;
  const actions = parseExecuteActions(parsedJson);
  if (!actions.length) throw new Error("No valid actions found in input file.");

  const sessionId = getFlagString(parsed, "session");
  const fingerprint = getFlagString(parsed, "workspace") ?? workspaceFingerprint();
  const response = getData(await client.execute(sessionId, fingerprint, actions));
  printJson(response);
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const allow = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".txt",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".sh",
    ".sql",
  ]);
  return allow.has(ext);
}

async function collectFiles(root: string, maxFiles: number): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set([".git", ".next", "node_modules", "dist", "build", "__pycache__", ".cache"]);
  const stack = [root];

  while (stack.length && out.length < maxFiles) {
    const current = stack.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isTextFile(full)) continue;
      out.push(full);
    }
  }

  return out;
}

function chunkText(input: string, chunkSize: number): string[] {
  if (input.length <= chunkSize) return [input];
  const chunks: string[] = [];
  let idx = 0;
  while (idx < input.length) {
    chunks.push(input.slice(idx, idx + chunkSize));
    idx += chunkSize;
  }
  return chunks;
}

async function handleIndex(parsed: ParsedArgs, config: CliConfig): Promise<void> {
  const resolved = await resolveAuth(config);
  const client = new PlaygroundClient({
    baseUrl: resolved.config.baseUrl,
    auth: resolved.auth.type === "apiKey" ? { apiKey: resolved.auth.apiKey } : { bearer: resolved.auth.accessToken },
  });
  const sub = parsed.positionals[1];
  const project = getFlagString(parsed, "project", "p");
  if (!project) throw new Error("Missing --project <key>.");

  if (!sub || sub === "upsert") {
    const sourcePath = path.resolve(getFlagString(parsed, "path") ?? ".");
    const maxFilesRaw = getFlagString(parsed, "max-files");
    const chunkSizeRaw = getFlagString(parsed, "chunk-size");
    const maxFiles = maxFilesRaw ? Number.parseInt(maxFilesRaw, 10) : 120;
    const chunkSize = chunkSizeRaw ? Number.parseInt(chunkSizeRaw, 10) : 3000;
    const files = await collectFiles(sourcePath, Number.isFinite(maxFiles) ? maxFiles : 120);

    if (!files.length) {
      console.log("No files found to index.");
      return;
    }

    const chunks: Array<{
      pathHash: string;
      chunkHash: string;
      pathDisplay: string;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const filePath of files) {
      const raw = await fs.readFile(filePath, "utf8").catch(() => "");
      if (!raw.trim()) continue;
      const relative = path.relative(sourcePath, filePath);
      const fileChunks = chunkText(raw, Number.isFinite(chunkSize) ? chunkSize : 3000);
      for (let i = 0; i < fileChunks.length; i += 1) {
        const chunk = fileChunks[i];
        const pathHash = createHash("sha256").update(relative).digest("hex");
        const chunkHash = createHash("sha256").update(`${relative}:${i}:${chunk}`).digest("hex");
        chunks.push({
          pathHash,
          chunkHash,
          pathDisplay: relative,
          content: chunk,
          metadata: {
            chunkIndex: i,
            totalChunks: fileChunks.length,
            source: "binary-ide-cli",
          },
        });
      }
    }

    if (!chunks.length) {
      console.log("No text content found to index.");
      return;
    }

    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await client.indexUpsert(project, batch);
      console.log(
        `[index] upserted ${Math.min(i + batch.length, chunks.length)}/${chunks.length} chunks`
      );
    }
    return;
  }

  if (sub === "query") {
    const question = parsed.positionals.slice(2).join(" ").trim();
    if (!question) throw new Error("Usage: binary index query --project <key> \"<question>\"");
    const limitRaw = getFlagString(parsed, "limit", "l");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 8;
    const response = getData(await client.indexQuery(project, question, Number.isFinite(limit) ? limit : 8));
    printJson(response);
    return;
  }

  throw new Error(`Unknown index subcommand '${sub}'.`);
}

function printCommands(): void {
  console.log(COMMANDS_OVERVIEW);
}

async function run(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (process.argv.length <= 2 || isHelp(parsed)) {
    console.log(HELP);
    return;
  }

  const command = parsed.positionals[0];
  const config = await loadConfig();

  if (command === "commands" || command === "cmds") {
    printCommands();
    return;
  }
  if (command === "inspect" || command === "hexdump" || command === "hash") {
    await handleBinaryUtility(command, parsed);
    return;
  }
  if (command === "whoami") {
    await handleAuth({ positionals: ["auth", "status"], flags: parsed.flags }, config);
    return;
  }
  if (command === "logout") {
    await handleAuth({ positionals: ["auth", "clear"], flags: parsed.flags }, config);
    return;
  }
  if (command === "set-key") {
    const keyArg = parsed.positionals[1];
    await handleAuth({ positionals: ["auth", "set-key", ...(keyArg ? [keyArg] : [])], flags: parsed.flags }, config);
    return;
  }
  if (command === "set-base-url") {
    const urlArg = parsed.positionals[1];
    await handleConfig({ positionals: ["config", "set-base-url", ...(urlArg ? [urlArg] : [])], flags: parsed.flags }, config);
    return;
  }
  if (command === "set-model") {
    const modelArg = parsed.positionals.slice(1).join(" ").trim();
    await handleConfig(
      { positionals: ["config", "set-model", ...(modelArg ? [modelArg] : [])], flags: parsed.flags },
      config
    );
    return;
  }
  if (command === "sessions-list") {
    await handleSessions({ positionals: ["sessions", "list"], flags: parsed.flags }, config);
    return;
  }
  if (command === "sessions-show") {
    const idArg = parsed.positionals[1];
    await handleSessions({ positionals: ["sessions", "show", ...(idArg ? [idArg] : [])], flags: parsed.flags }, config);
    return;
  }
  if (command === "runs-list") {
    await handleRuns({ positionals: ["runs", "list"], flags: parsed.flags }, config);
    return;
  }
  if (command === "runs-tail") {
    const idArg = parsed.positionals[1];
    await handleRuns({ positionals: ["runs", "tail", ...(idArg ? [idArg] : [])], flags: parsed.flags }, config);
    return;
  }
  if (command === "jobs-list") {
    await handleJobs({ positionals: ["jobs", "list"], flags: parsed.flags }, config);
    return;
  }
  if (command === "index-upsert") {
    await handleIndex({ positionals: ["index", "upsert"], flags: parsed.flags }, config);
    return;
  }
  if (command === "index-query") {
    const questionArg = parsed.positionals.slice(1).join(" ").trim();
    await handleIndex({ positionals: ["index", "query", ...(questionArg ? [questionArg] : [])], flags: parsed.flags }, config);
    return;
  }

  if (command === "auth") {
    await handleAuth(parsed, config);
    return;
  }
  if (command === "config") {
    await handleConfig(parsed, config);
    return;
  }
  if (command === "chat") {
    await handleChat(parsed, config);
    return;
  }
  if (command === "login") {
    await handleAuth({ positionals: ["auth", "browser"], flags: parsed.flags }, config);
    return;
  }
  if (command === "debug-runtime" || command === "debug") {
    await handleDebugRuntime(parsed, config);
    return;
  }
  if (command === "benchmark") {
    await handleBenchmark(parsed, config);
    return;
  }
  if (command === "test") {
    await handleTestSuite(parsed);
    return;
  }
  if (command === "run") {
    await handleRun(parsed, config);
    return;
  }
  if (command === "sessions") {
    await handleSessions(parsed, config);
    return;
  }
  if (command === "runs") {
    await handleRuns(parsed, config);
    return;
  }
  if (command === "jobs") {
    await handleJobs(parsed, config);
    return;
  }
  if (command === "connections") {
    await handleConnections(parsed, config);
    return;
  }
  if (command === "provider" || command === "providers") {
    await handleProviders(parsed, config);
    return;
  }
  if (command === "mcp") {
    await handleConnections({ positionals: ["connections", ...parsed.positionals.slice(1)], flags: parsed.flags }, config);
    return;
  }
  if (command === "automations") {
    await handleAutomations(parsed, config);
    return;
  }
  if (command === "debug-agent") {
    await handleDebugAgent(parsed, config);
    return;
  }
  if (command === "usage") {
    await handleUsage(config);
    return;
  }
  if (command === "checkout") {
    await handleCheckout(parsed, config);
    return;
  }
  if (command === "replay") {
    await handleReplay(parsed, config);
    return;
  }
  if (command === "execute") {
    await handleExecute(parsed, config);
    return;
  }
  if (command === "index") {
    await handleIndex(parsed, config);
    return;
  }

  throw new Error(`Unknown command '${command}'. Run 'binary --help'.`);
}

run().catch((error: unknown) => {
  if (error instanceof CliHttpError) {
    console.error(`Binary IDE request failed (${error.status}): ${error.message}`);
    if (error.details) printJson(error.details);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
