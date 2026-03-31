import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliConfig } from "./types.js";

const CONFIG_DIR_NAME = ".binary-ide";
const LEGACY_CONFIG_DIR_NAME = ".playgroundai";
const CONFIG_FILE_NAME = "config.json";

const DEFAULT_CONFIG: CliConfig = {
  baseUrl: process.env.BINARY_IDE_BASE_URL ?? "http://localhost:3000",
  localHostUrl: process.env.BINARY_IDE_LOCAL_HOST_URL ?? "http://127.0.0.1:7777",
  mode: "auto",
  model: "Binary IDE",
  reasoning: "medium",
  includeIdeContext: true,
  transport: (process.env.BINARY_IDE_TRANSPORT as CliConfig["transport"]) ?? "auto",
};

function normalizeTransport(value: unknown): CliConfig["transport"] {
  return value === "host" || value === "direct" || value === "auto" ? value : DEFAULT_CONFIG.transport;
}

export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

export function getLegacyConfigDir(): string {
  return path.join(os.homedir(), LEGACY_CONFIG_DIR_NAME);
}

export function getLegacyConfigPath(): string {
  return path.join(getLegacyConfigDir(), CONFIG_FILE_NAME);
}

function normalizeConfig(config: Partial<CliConfig>): CliConfig {
  const resolvedModel =
    typeof config.model === "string" && config.model.trim() && config.model.trim() !== "Playground AI"
      ? config.model.trim()
      : DEFAULT_CONFIG.model;

  return {
    ...DEFAULT_CONFIG,
    ...config,
    model: resolvedModel,
    baseUrl: String(process.env.BINARY_IDE_BASE_URL || config.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ""),
    localHostUrl: String(
      process.env.BINARY_IDE_LOCAL_HOST_URL || config.localHostUrl || DEFAULT_CONFIG.localHostUrl
    ).replace(/\/+$/, ""),
    transport: normalizeTransport(process.env.BINARY_IDE_TRANSPORT || config.transport),
  };
}

async function readConfigFile(configPath: string): Promise<Partial<CliConfig> | null> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as Partial<CliConfig>;
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<CliConfig> {
  const nextConfig = await readConfigFile(getConfigPath());
  if (nextConfig) {
    return normalizeConfig(nextConfig);
  }

  const legacyConfig = await readConfigFile(getLegacyConfigPath());
  if (legacyConfig) {
    const imported = normalizeConfig(legacyConfig);
    try {
      await saveConfig(imported);
    } catch {
      // Keep first-run migration silent even if the new path cannot be written yet.
    }
    return imported;
  }

  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: CliConfig): Promise<void> {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const next = normalizeConfig(config);
  await fs.writeFile(getConfigPath(), JSON.stringify(next, null, 2), "utf8");
}

export function getApiKey(config: CliConfig): string | null {
  return (
    process.env.BINARY_IDE_API_KEY ||
    process.env.XPERSONA_API_KEY ||
    config.apiKey ||
    null
  );
}

export function getBrowserAccessToken(config: CliConfig): string | null {
  const token = config.browserAuth?.accessToken;
  return token && token.trim() ? token.trim() : null;
}

export function getBrowserRefreshToken(config: CliConfig): string | null {
  const token = config.browserAuth?.refreshToken;
  return token && token.trim() ? token.trim() : null;
}

export async function clearApiKey(config: CliConfig): Promise<CliConfig> {
  const next = { ...config };
  delete next.apiKey;
  await saveConfig(next);
  return next;
}

export async function clearBrowserAuth(config: CliConfig): Promise<CliConfig> {
  const next = { ...config };
  delete next.browserAuth;
  await saveConfig(next);
  return next;
}
