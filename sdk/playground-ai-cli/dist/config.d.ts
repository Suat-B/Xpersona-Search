import { CliConfig } from "./types.js";
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function loadConfig(): Promise<CliConfig>;
export declare function saveConfig(config: CliConfig): Promise<void>;
export declare function getApiKey(config: CliConfig): string | null;
export declare function clearApiKey(config: CliConfig): Promise<CliConfig>;
