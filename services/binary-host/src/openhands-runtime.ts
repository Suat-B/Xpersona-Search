import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

export type OpenHandsRuntimeKind = "docker" | "local-python" | "remote" | "reduced-local" | "unknown";
export type OpenHandsRuntimeProfile = "full" | "code-only" | "chat-only" | "unavailable";
export type OpenHandsRuntimeReadiness = "ready" | "limited" | "repair_needed";

type GatewayHealthDoctor = {
  ok?: boolean;
  runtimeKind?: OpenHandsRuntimeKind;
  runtimeProfile?: OpenHandsRuntimeProfile;
  pythonVersion?: string | null;
  packageFamily?: "openhands" | "openhands-sdk" | "unknown";
  packageVersion?: string | null;
  supportedTools?: string[];
  degradedReasons?: string[];
  availableActions?: string[];
  currentModelCandidate?: Record<string, unknown> | null;
  lastProviderFailureReason?: string | null;
  fallbackAvailable?: boolean;
  lastFallbackRecovered?: boolean;
  lastPersistenceDir?: string | null;
};

type GatewayHealthPayload = {
  status?: "healthy" | "degraded" | "unhealthy";
  title?: string;
  runtime?: string;
  version?: string | null;
  gatewayUrl?: string;
  doctor?: GatewayHealthDoctor;
  message?: string;
  details?: string;
};

function inferRuntimeProfileFromGatewayHealth(
  payload: GatewayHealthPayload,
  desiredProfile: OpenHandsRuntimeProfile
): OpenHandsRuntimeProfile {
  if (payload.doctor?.runtimeProfile) return payload.doctor.runtimeProfile;
  if (payload.status === "healthy") return desiredProfile === "unavailable" ? "chat-only" : desiredProfile;
  if (payload.status === "degraded") return desiredProfile === "full" ? "code-only" : "chat-only";
  return "unavailable";
}

type PersistedRuntimeState = {
  selectedRuntimeKind?: OpenHandsRuntimeKind;
  selectedRuntimeProfile?: OpenHandsRuntimeProfile;
  selectedAt?: string;
  lastHealthyAt?: string;
  gatewayUrl?: string;
  failureCount?: number;
  nextRetryAt?: string;
  lastMessage?: string;
  lastDegradedReasons?: string[];
};

export type OpenHandsRuntimeStatus = {
  readiness: OpenHandsRuntimeReadiness;
  runtimeKind: OpenHandsRuntimeKind;
  runtimeProfile: OpenHandsRuntimeProfile;
  gatewayUrl: string;
  version?: string | null;
  pythonVersion?: string | null;
  packageFamily?: "openhands" | "openhands-sdk" | "unknown";
  packageVersion?: string | null;
  supportedTools: string[];
  degradedReasons: string[];
  availableActions: string[];
  message: string;
  selectedAt?: string;
  lastHealthyAt?: string;
  currentModelCandidate?: Record<string, unknown> | null;
  lastProviderFailureReason?: string | null;
  fallbackAvailable?: boolean;
  lastFallbackRecovered?: boolean;
  lastPersistenceDir?: string | null;
};

type EnsureRuntimeInput = {
  desiredProfile: OpenHandsRuntimeProfile;
};

type SupervisorOptions = {
  statePath: string;
  repoRoot: string;
  gatewayUrl?: string;
};

const LOCAL_GATEWAY_URL = "http://127.0.0.1:8010";
const HEALTH_TIMEOUT_MS = 12_000;
const STARTUP_TIMEOUT_MS = 45_000;
const STABILIZATION_WINDOW_MS = 3_000;
const MAX_RETRY_BUDGET = 3;
const COOLDOWN_MS = 90_000;
const HEALTH_RESULT_CACHE_MS = 10_000;

function nowIso(): string {
  return new Date().toISOString();
}

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveRepoRoot(start: string): string {
  let cursor = path.resolve(start || process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    const gatewayServer = path.join(cursor, "services", "openhands-gateway", "server.py");
    const hostServer = path.join(cursor, "services", "binary-host", "src", "server.ts");
    if (existsSync(gatewayServer) && existsSync(hostServer)) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (!parent || parent === cursor) break;
    cursor = parent;
  }
  return path.resolve(start || process.cwd());
}

function parseGatewayUrl(): string {
  return String(process.env.OPENHANDS_GATEWAY_URL || "").trim().replace(/\/+$/, "") || LOCAL_GATEWAY_URL;
}

export function parseLocalGatewayBinding(gatewayUrl: string): { host: string; port: string } {
  try {
    const parsed = new URL(gatewayUrl);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    };
  } catch {
    return { host: "127.0.0.1", port: "8010" };
  }
}

function isLocalGatewayUrl(gatewayUrl: string): boolean {
  try {
    const parsed = new URL(gatewayUrl);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function needsManagedOpenHandsInstall(executableExists: boolean, sdkImportable: boolean): boolean {
  return !executableExists || !sdkImportable;
}

export function inferReadinessFromProfile(
  actual: OpenHandsRuntimeProfile,
  desired: OpenHandsRuntimeProfile
): OpenHandsRuntimeReadiness {
  const rank = (profile: OpenHandsRuntimeProfile): number => {
    switch (profile) {
      case "full":
        return 3;
      case "code-only":
        return 2;
      case "chat-only":
        return 1;
      default:
        return 0;
    }
  };
  if (rank(actual) >= rank(desired) && actual !== "unavailable") return "ready";
  if (rank(actual) > 0) return "limited";
  return "repair_needed";
}

function inferDesiredProfile(task: string): OpenHandsRuntimeProfile {
  const normalized = task.toLowerCase();
  if (/\b(browser|website|web app|open url|page|login|click|navigate)\b/.test(normalized)) return "full";
  if (/\b(run|test|terminal|shell|command|lint|build|start server)\b/.test(normalized)) return "full";
  if (/\b(edit|write|refactor|fix|file|code)\b/.test(normalized)) return "code-only";
  return "chat-only";
}

function supportsBinaryBackfilledFullProfile(
  gatewayUrl: string,
  actual: OpenHandsRuntimeProfile,
  degradedReasons: string[]
): boolean {
  if (!isLocalGatewayUrl(gatewayUrl) || actual !== "code-only") return false;
  if (degradedReasons.length === 0) return false;
  const reasons = new Set(degradedReasons);
  // Only backfill if ALL reasons are Windows-specific terminal/browser issues
  const windowsSpecific = ["windows_unsupported_terminal", "windows_unsupported_browser"];
  for (const reason of degradedReasons) {
    if (!windowsSpecific.includes(reason)) {
      return false;
    }
  }
  return degradedReasons.length > 0;
}

function buildUserMessage(status: Omit<OpenHandsRuntimeStatus, "message">): string {
  if (status.readiness === "ready") {
    if (supportsBinaryBackfilledFullProfile(status.gatewayUrl, status.runtimeProfile, status.degradedReasons)) {
      return "Managed coding runtime is ready with Binary host-backed terminal and browser fallback.";
    }
    if (status.runtimeProfile === "full") return "Managed coding runtime is ready.";
    if (status.runtimeProfile === "code-only") return "Coding runtime is ready with code editing support.";
    return "Binary runtime is ready.";
  }
  if (status.readiness === "limited") {
    const reason = status.degradedReasons[0] || "limited capabilities";
    return `Binary runtime is available with limited capabilities (${reason.replace(/_/g, " ")}).`;
  }
  return "Binary runtime needs repair before full OpenHands automation can run reliably.";
}

function defaultActions(readiness: OpenHandsRuntimeReadiness, gatewayUrl: string, degradedReasons: string[]): string[] {
  const actions = new Set<string>();
  if (readiness !== "ready") actions.add("Repair OpenHands runtime");
  if (isLocalGatewayUrl(gatewayUrl)) actions.add("Use managed runtime");
  if (degradedReasons.some((reason) => reason.includes("model") || reason.includes("provider"))) {
    actions.add("Retry with compatible model");
  }
  return [...actions];
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<GatewayHealthPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    let parsed: GatewayHealthPayload = {};
    try {
      parsed = text ? (JSON.parse(text) as GatewayHealthPayload) : {};
    } catch {
      parsed = { status: response.ok ? "healthy" : "unhealthy", details: text };
    }
    if (!response.ok && !parsed.status) parsed.status = "unhealthy";
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export function mapGatewayHealthToOpenHandsRuntimeStatus(input: {
  gatewayUrl: string;
  payload?: GatewayHealthPayload | null;
  persisted?: PersistedRuntimeState;
  desiredProfile: OpenHandsRuntimeProfile;
  fallbackReasons?: string[];
}): OpenHandsRuntimeStatus {
  const payload = input.payload || {};
  const doctor = payload.doctor || {};
  const runtimeProfile = inferRuntimeProfileFromGatewayHealth(payload, input.desiredProfile);
  const supportedTools = Array.isArray(doctor.supportedTools) ? doctor.supportedTools.filter(Boolean) : [];
  const degradedReasons = [
    ...(Array.isArray(doctor.degradedReasons) ? doctor.degradedReasons.filter(Boolean) : []),
    ...(input.fallbackReasons || []),
  ];
  const readiness =
    input.desiredProfile === "full" && supportsBinaryBackfilledFullProfile(input.gatewayUrl, runtimeProfile, degradedReasons)
      ? "ready"
      : inferReadinessFromProfile(runtimeProfile, input.desiredProfile);
  const partial: Omit<OpenHandsRuntimeStatus, "message"> = {
    readiness,
    runtimeKind: doctor.runtimeKind || input.persisted?.selectedRuntimeKind || "unknown",
    runtimeProfile,
    gatewayUrl: input.gatewayUrl,
    version: payload.version || null,
    pythonVersion: doctor.pythonVersion || null,
    packageFamily: doctor.packageFamily || "unknown",
    packageVersion: doctor.packageVersion || null,
    supportedTools,
    degradedReasons,
    availableActions:
      (Array.isArray(doctor.availableActions) ? doctor.availableActions.filter(Boolean) : []).length > 0
        ? (doctor.availableActions as string[])
        : defaultActions(readiness, input.gatewayUrl, degradedReasons),
    selectedAt: input.persisted?.selectedAt,
    lastHealthyAt: input.persisted?.lastHealthyAt,
    currentModelCandidate:
      doctor.currentModelCandidate && typeof doctor.currentModelCandidate === "object"
        ? (doctor.currentModelCandidate as Record<string, unknown>)
        : null,
    lastProviderFailureReason:
      typeof doctor.lastProviderFailureReason === "string" ? doctor.lastProviderFailureReason : null,
    fallbackAvailable: doctor.fallbackAvailable === true,
    lastFallbackRecovered: doctor.lastFallbackRecovered === true,
    lastPersistenceDir: typeof doctor.lastPersistenceDir === "string" ? doctor.lastPersistenceDir : null,
  };
  return {
    ...partial,
    message: buildUserMessage(partial),
  };
}

export function inferOpenHandsRuntimeProfile(task: string): OpenHandsRuntimeProfile {
  return inferDesiredProfile(task);
}

export function getPreferredOpenHandsRuntimeKinds(
  platform: NodeJS.Platform,
  desiredProfile: OpenHandsRuntimeProfile
): OpenHandsRuntimeKind[] {
  if (desiredProfile === "full") {
    return ["docker", "local-python"];
  }
  return ["local-python", "docker"];
}

export class OpenHandsRuntimeSupervisor {
  private readonly statePath: string;
  private readonly repoRoot: string;
  private readonly gatewayUrl: string;
  private readonly requirementsPath: string;
  private readonly managedRuntimeRoot: string;
  private readonly managedVenvDir: string;
  private state: PersistedRuntimeState = {};
  private lastHealthPayload: GatewayHealthPayload | null = null;
  private lastHealthAt = 0;
  private warmupPromise: Promise<OpenHandsRuntimeStatus> | null = null;

  constructor(options: SupervisorOptions) {
    this.statePath = options.statePath;
    this.repoRoot = resolveRepoRoot(options.repoRoot);
    this.gatewayUrl = (options.gatewayUrl || parseGatewayUrl()).replace(/\/+$/, "");
    this.requirementsPath = path.join(this.repoRoot, "services", "openhands-gateway", "requirements.txt");
    this.managedRuntimeRoot =
      compactWhitespace(process.env.OPENHANDS_GATEWAY_RUNTIME_HOME) ||
      path.join(os.homedir(), ".binary-ide", "openhands-runtime");
    this.managedVenvDir =
      compactWhitespace(process.env.OPENHANDS_GATEWAY_VENV_DIR) || path.join(this.managedRuntimeRoot, "venv");
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedRuntimeState;
      if (parsed && typeof parsed === "object") {
        this.state = parsed;
      }
    } catch {
      this.state = {};
    }
  }

  async getStatus(desiredProfile: OpenHandsRuntimeProfile = "chat-only"): Promise<OpenHandsRuntimeStatus> {
    const now = Date.now();
    const canUseCachedHealth = this.lastHealthPayload && now - this.lastHealthAt <= HEALTH_RESULT_CACHE_MS;
    const payload = canUseCachedHealth
      ? this.lastHealthPayload
      : await this.inspectGatewayHealth()
          .then((value) => {
            this.lastHealthPayload = value;
            this.lastHealthAt = Date.now();
            return value;
          })
          .catch(() => null);
    return mapGatewayHealthToOpenHandsRuntimeStatus({
      gatewayUrl: this.gatewayUrl,
      payload,
      persisted: this.state,
      desiredProfile,
      fallbackReasons: !payload ? ["gateway_unreachable"] : [],
    });
  }

  async ensureRuntime(input: EnsureRuntimeInput): Promise<OpenHandsRuntimeStatus> {
    const current = await this.getStatus(input.desiredProfile);
    // "limited" can still be fully operable for Windows code-only flows (for example, no native browser tool),
    // and repeatedly restarting the gateway on every run introduces large latency spikes.
    if (current.readiness === "ready" || current.readiness === "limited") {
      await this.recordHealthy(current);
      return current;
    }

    if (this.isCoolingDown()) {
      return {
        ...current,
        availableActions: defaultActions(current.readiness, this.gatewayUrl, current.degradedReasons),
      };
    }

    if (!isLocalGatewayUrl(this.gatewayUrl)) {
      await this.recordFailure(current);
      return current;
    }

    for (const runtimeKind of getPreferredOpenHandsRuntimeKinds(process.platform, input.desiredProfile)) {
      const status =
        runtimeKind === "docker"
          ? await this.tryStartDockerRuntime(input.desiredProfile)
          : await this.tryStartLocalPythonRuntime(input.desiredProfile);
      if (status.readiness === "ready") {
        await this.recordHealthy(status);
        return status;
      }
    }

    const finalStatus = await this.getStatus(input.desiredProfile);
    await this.recordFailure(finalStatus);
    return finalStatus;
  }

  async warmup(desiredProfile: OpenHandsRuntimeProfile = "chat-only"): Promise<OpenHandsRuntimeStatus> {
    if (this.warmupPromise) {
      return await this.warmupPromise;
    }
    this.warmupPromise = (async () => {
      try {
        return await this.ensureRuntime({ desiredProfile });
      } catch {
        return await this.getStatus(desiredProfile);
      }
    })();
    try {
      return await this.warmupPromise;
    } finally {
      this.warmupPromise = null;
    }
  }

  private isCoolingDown(): boolean {
    if (!this.state.nextRetryAt) return false;
    return Date.parse(this.state.nextRetryAt) > Date.now();
  }

  private async inspectGatewayHealth(): Promise<GatewayHealthPayload> {
    return await fetchJsonWithTimeout(`${this.gatewayUrl}/health`, HEALTH_TIMEOUT_MS);
  }

  private async recordHealthy(status: OpenHandsRuntimeStatus): Promise<void> {
    this.state = {
      ...this.state,
      selectedRuntimeKind: status.runtimeKind,
      selectedRuntimeProfile: status.runtimeProfile,
      selectedAt: nowIso(),
      lastHealthyAt: nowIso(),
      gatewayUrl: status.gatewayUrl,
      failureCount: 0,
      nextRetryAt: undefined,
      lastMessage: status.message,
      lastDegradedReasons: status.degradedReasons,
    };
    await this.persist();
  }

  private async recordFailure(status: OpenHandsRuntimeStatus): Promise<void> {
    const failureCount = Number(this.state.failureCount || 0) + 1;
    const nextRetryAt =
      failureCount >= MAX_RETRY_BUDGET ? new Date(Date.now() + COOLDOWN_MS).toISOString() : undefined;
    this.state = {
      ...this.state,
      gatewayUrl: status.gatewayUrl,
      failureCount,
      nextRetryAt,
      lastMessage: status.message,
      lastDegradedReasons: status.degradedReasons,
    };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  private async tryStartLocalPythonRuntime(desiredProfile: OpenHandsRuntimeProfile): Promise<OpenHandsRuntimeStatus> {
    const managedPython = await this.ensureManagedPythonEnv().catch(() => null);
    const candidates = this.getPythonCandidates(managedPython);
    for (const candidate of candidates) {
      try {
        await this.stopLocalGatewayProcesses();
        await this.spawnDetached(candidate.command, candidate.args, {
          OPENHANDS_GATEWAY_RUNTIME_KIND: "local-python",
          OPENHANDS_SUPPRESS_BANNER: "1",
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        });
        const status = await this.waitForHealthyGateway(desiredProfile);
        if (status.readiness !== "repair_needed") return status;
      } catch {
        continue;
      }
    }
    return await this.getStatus(desiredProfile);
  }

  private async tryStartDockerRuntime(desiredProfile: OpenHandsRuntimeProfile): Promise<OpenHandsRuntimeStatus> {
    const dockerAvailable = await this.checkCommand("docker", ["compose", "version"]);
    if (!dockerAvailable) {
      const status = await this.getStatus(desiredProfile);
      return {
        ...status,
        degradedReasons: [...status.degradedReasons, "docker_unavailable"],
        availableActions: defaultActions(status.readiness, status.gatewayUrl, [...status.degradedReasons, "docker_unavailable"]),
        message: buildUserMessage({
          ...status,
          degradedReasons: [...status.degradedReasons, "docker_unavailable"],
        }),
      };
    }

    try {
      await this.stopLocalGatewayProcesses();
      await this.runCommand("docker", ["compose", "up", "-d", "openhands-gateway"], {
        OPENHANDS_GATEWAY_RUNTIME_KIND: "docker",
        OPENHANDS_SUPPRESS_BANNER: "1",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      });
      const status = await this.waitForHealthyGateway(desiredProfile);
      if (status.readiness === "ready" || status.runtimeKind === "docker") return status;
      return status;
    } catch (error) {
      const status = await this.getStatus(desiredProfile);
      const dockerReason =
        error instanceof Error && error.message.trim() ? compactWhitespace(error.message) : "docker_start_failed";
      const degradedReasons = [...status.degradedReasons, "docker_start_failed", dockerReason];
      return {
        ...status,
        degradedReasons,
        availableActions: defaultActions(status.readiness, status.gatewayUrl, degradedReasons),
        message: buildUserMessage({
          ...status,
          degradedReasons,
        }),
      };
    }
  }

  private async waitForHealthyGateway(desiredProfile: OpenHandsRuntimeProfile): Promise<OpenHandsRuntimeStatus> {
    const startedAt = Date.now();
    let delayMs = 1_000;
    while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
      const payload = await this.inspectGatewayHealth().catch(() => null);
      if (payload) {
        const status = mapGatewayHealthToOpenHandsRuntimeStatus({
          gatewayUrl: this.gatewayUrl,
          payload,
          persisted: this.state,
          desiredProfile,
        });
        if (status.readiness !== "repair_needed") {
          await delay(STABILIZATION_WINDOW_MS);
          return status;
        }
      }
      const jitter = Math.floor(Math.random() * 250);
      await delay(delayMs + jitter);
      delayMs = Math.min(delayMs * 2, 5_000);
    }
    return await this.getStatus(desiredProfile);
  }

  private getPythonCandidates(managedPython?: string | null): Array<{ command: string; args: string[] }> {
    const candidates: Array<{ command: string; args: string[] }> = [];
    if (managedPython) {
      candidates.push({ command: managedPython, args: [] });
    }
    const configured = compactWhitespace(process.env.OPENHANDS_GATEWAY_PYTHON);
    if (configured) {
      candidates.push({ command: configured, args: [] });
    }
    if (process.platform === "win32") {
      candidates.push({ command: "py", args: ["-3.12"] });
    }
    candidates.push({ command: "python3.12", args: [] });
    candidates.push({ command: "python", args: [] });
    return candidates;
  }

  private getBootstrapPythonCandidates(): Array<{ command: string; args: string[] }> {
    const configured = compactWhitespace(process.env.OPENHANDS_GATEWAY_PYTHON);
    const candidates: Array<{ command: string; args: string[] }> = [];
    if (configured) {
      candidates.push({ command: configured, args: [] });
    }
    if (process.platform === "win32") {
      candidates.push({ command: "py", args: ["-3.12"] });
    }
    candidates.push({ command: "python3.12", args: [] });
    candidates.push({ command: "python", args: [] });
    return candidates;
  }

  private getManagedPythonExecutable(): string {
    return process.platform === "win32"
      ? path.join(this.managedVenvDir, "Scripts", "python.exe")
      : path.join(this.managedVenvDir, "bin", "python");
  }

  private async ensureManagedPythonEnv(): Promise<string | null> {
    const managedPython = this.getManagedPythonExecutable();
    const executableExists = existsSync(managedPython);
    const sdkImportable = executableExists ? await this.canImportOpenHands(managedPython) : false;
    if (!needsManagedOpenHandsInstall(executableExists, sdkImportable)) {
      return managedPython;
    }

    await fs.mkdir(this.managedRuntimeRoot, { recursive: true });
    if (!executableExists) {
      for (const candidate of this.getBootstrapPythonCandidates()) {
        try {
          await this.runCommand(candidate.command, [...candidate.args, "-m", "venv", this.managedVenvDir], {}, 300_000);
          break;
        } catch {
          // Try the next bootstrap interpreter.
        }
      }
    }

    for (const candidate of this.getBootstrapPythonCandidates()) {
      try {
        await this.runCommand(managedPython, ["-m", "pip", "install", "--upgrade", "pip"], {}, 300_000);
        await this.runCommand(managedPython, ["-m", "pip", "install", "-r", this.requirementsPath], {}, 900_000);
        if (await this.canImportOpenHands(managedPython)) {
          return managedPython;
        }
      } catch {
        // Try the next bootstrap interpreter.
      }
    }
    return null;
  }

  private async canImportOpenHands(pythonExecutable: string): Promise<boolean> {
    try {
      await this.runCommand(pythonExecutable, ["-c", "import openhands, openhands.sdk"], {}, 30_000);
      return true;
    } catch {
      return false;
    }
  }

  private async stopLocalGatewayProcesses(): Promise<void> {
    if (!isLocalGatewayUrl(this.gatewayUrl)) return;
    try {
      if (process.platform === "win32") {
        await this.runCommand(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'services[\\\\/]openhands-gateway[\\\\/](server\\.py|src[\\\\/]server\\.ts)' }; foreach ($proc in $targets) { try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {} }",
          ],
          {},
          30_000
        );
      } else {
        await this.runCommand("pkill", ["-f", "services/openhands-gateway/server.py"], {}, 30_000);
      }
    } catch {
      // Best-effort cleanup only. The next health check will decide whether startup actually recovered.
    }
    await delay(500);
  }

  private async checkCommand(command: string, args: string[]): Promise<boolean> {
    try {
      await this.runCommand(command, args, {}, 10_000);
      return true;
    } catch {
      return false;
    }
  }

  private async spawnDetached(command: string, args: string[], extraEnv: Record<string, string>): Promise<void> {
    const childArgs = [...args, path.join("services", "openhands-gateway", "server.py")];
    const binding = parseLocalGatewayBinding(this.gatewayUrl);
    const child = spawn(command, childArgs, {
      cwd: this.repoRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        OPENHANDS_GATEWAY_PORT: binding.port,
        OPENHANDS_GATEWAY_HOST: binding.host,
        OPENHANDS_GATEWAY_URL: this.gatewayUrl,
        ...extraEnv,
      },
    });
    // Detached candidate launch failures should never crash Binary Host.
    child.on("error", () => {
      // No-op: readiness checks handle failed candidates.
    });
    child.unref();
  }

  private async runCommand(
    command: string,
    args: string[],
    extraEnv: Record<string, string>,
    timeoutMs = 120_000
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.repoRoot,
        env: {
          ...process.env,
          ...extraEnv,
        },
        stdio: "ignore",
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`));
      });
    });
  }
}
