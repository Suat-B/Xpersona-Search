import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliConfig } from "./types.js";

const CONFIG_DIR_NAME = ".playgroundai";
const CONFIG_FILE_NAME = "config.json";

const DEFAULT_CONFIG: CliConfig = {
  baseUrl: process.env.PLAYGROUND_AI_BASE_URL ?? "http://localhost:3000",
  mode: "auto",
  model: "Playground AI",
  reasoning: "medium",
  includeIdeContext: true,
};

export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

export async function loadConfig(): Promise<CliConfig> {
  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      baseUrl: (parsed.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ""),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const next = {
    ...DEFAULT_CONFIG,
    ...config,
    baseUrl: (config.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ""),
  };
  await fs.writeFile(getConfigPath(), JSON.stringify(next, null, 2), "utf8");
}

export function getApiKey(config: CliConfig): string | null {
  return (
    process.env.PLAYGROUND_AI_API_KEY ||
    process.env.XPERSONA_API_KEY ||
    config.apiKey ||
    null
  );
}

export async function clearApiKey(config: CliConfig): Promise<CliConfig> {
  const next = { ...config };
  delete next.apiKey;
  await saveConfig(next);
  return next;
}
