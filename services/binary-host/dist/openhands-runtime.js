import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
function inferRuntimeProfileFromGatewayHealth(payload, desiredProfile) {
    if (payload.doctor?.runtimeProfile)
        return payload.doctor.runtimeProfile;
    if (payload.status === "healthy")
        return desiredProfile === "unavailable" ? "chat-only" : desiredProfile;
    if (payload.status === "degraded")
        return desiredProfile === "full" ? "code-only" : "chat-only";
    return "unavailable";
}
const LOCAL_GATEWAY_URL = "http://127.0.0.1:8010";
const HEALTH_TIMEOUT_MS = 12_000;
const STARTUP_TIMEOUT_MS = 45_000;
const STABILIZATION_WINDOW_MS = 3_000;
const MAX_RETRY_BUDGET = 3;
const COOLDOWN_MS = 90_000;
const HEALTH_RESULT_CACHE_MS = 10_000;
function nowIso() {
    return new Date().toISOString();
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function resolveRepoRoot(start) {
    let cursor = path.resolve(start || process.cwd());
    for (let depth = 0; depth < 8; depth += 1) {
        const gatewayServer = path.join(cursor, "services", "openhands-gateway", "server.py");
        const hostServer = path.join(cursor, "services", "binary-host", "src", "server.ts");
        if (existsSync(gatewayServer) && existsSync(hostServer)) {
            return cursor;
        }
        const parent = path.dirname(cursor);
        if (!parent || parent === cursor)
            break;
        cursor = parent;
    }
    return path.resolve(start || process.cwd());
}
function parseGatewayUrl() {
    return String(process.env.OPENHANDS_GATEWAY_URL || "").trim().replace(/\/+$/, "") || LOCAL_GATEWAY_URL;
}
export function parseLocalGatewayBinding(gatewayUrl) {
    try {
        const parsed = new URL(gatewayUrl);
        return {
            host: parsed.hostname || "127.0.0.1",
            port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
        };
    }
    catch {
        return { host: "127.0.0.1", port: "8010" };
    }
}
function isLocalGatewayUrl(gatewayUrl) {
    try {
        const parsed = new URL(gatewayUrl);
        return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    }
    catch {
        return false;
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function needsManagedOpenHandsInstall(executableExists, sdkImportable) {
    return !executableExists || !sdkImportable;
}
export function inferReadinessFromProfile(actual, desired) {
    const rank = (profile) => {
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
    if (rank(actual) >= rank(desired) && actual !== "unavailable")
        return "ready";
    if (rank(actual) > 0)
        return "limited";
    return "repair_needed";
}
function inferDesiredProfile(task) {
    const normalized = task.toLowerCase();
    if (/\b(browser|website|web app|open url|page|login|click|navigate)\b/.test(normalized))
        return "full";
    if (/\b(run|test|terminal|shell|command|lint|build|start server)\b/.test(normalized))
        return "full";
    if (/\b(edit|write|refactor|fix|file|code)\b/.test(normalized))
        return "code-only";
    return "chat-only";
}
function supportsBinaryBackfilledFullProfile(gatewayUrl, actual, degradedReasons) {
    if (!isLocalGatewayUrl(gatewayUrl) || actual !== "code-only")
        return false;
    if (degradedReasons.length === 0)
        return false;
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
function buildUserMessage(status) {
    if (status.readiness === "ready") {
        if (supportsBinaryBackfilledFullProfile(status.gatewayUrl, status.runtimeProfile, status.degradedReasons)) {
            return "Managed coding runtime is ready with Binary host-backed terminal and browser fallback.";
        }
        if (status.runtimeProfile === "full")
            return "Managed coding runtime is ready.";
        if (status.runtimeProfile === "code-only")
            return "Coding runtime is ready with code editing support.";
        return "Binary runtime is ready.";
    }
    if (status.readiness === "limited") {
        const reason = status.degradedReasons[0] || "limited capabilities";
        return `Binary runtime is available with limited capabilities (${reason.replace(/_/g, " ")}).`;
    }
    return "Binary runtime needs repair before full OpenHands automation can run reliably.";
}
function defaultActions(readiness, gatewayUrl, degradedReasons) {
    const actions = new Set();
    if (readiness !== "ready")
        actions.add("Repair OpenHands runtime");
    if (isLocalGatewayUrl(gatewayUrl))
        actions.add("Use managed runtime");
    if (degradedReasons.some((reason) => reason.includes("model") || reason.includes("provider"))) {
        actions.add("Retry with compatible model");
    }
    return [...actions];
}
async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: "GET",
            signal: controller.signal,
        });
        const text = await response.text().catch(() => "");
        let parsed = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        }
        catch {
            parsed = { status: response.ok ? "healthy" : "unhealthy", details: text };
        }
        if (!response.ok && !parsed.status)
            parsed.status = "unhealthy";
        return parsed;
    }
    finally {
        clearTimeout(timer);
    }
}
export function mapGatewayHealthToOpenHandsRuntimeStatus(input) {
    const payload = input.payload || {};
    const doctor = payload.doctor || {};
    const runtimeProfile = inferRuntimeProfileFromGatewayHealth(payload, input.desiredProfile);
    const supportedTools = Array.isArray(doctor.supportedTools) ? doctor.supportedTools.filter(Boolean) : [];
    const degradedReasons = [
        ...(Array.isArray(doctor.degradedReasons) ? doctor.degradedReasons.filter(Boolean) : []),
        ...(input.fallbackReasons || []),
    ];
    const readiness = input.desiredProfile === "full" && supportsBinaryBackfilledFullProfile(input.gatewayUrl, runtimeProfile, degradedReasons)
        ? "ready"
        : inferReadinessFromProfile(runtimeProfile, input.desiredProfile);
    const partial = {
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
        availableActions: (Array.isArray(doctor.availableActions) ? doctor.availableActions.filter(Boolean) : []).length > 0
            ? doctor.availableActions
            : defaultActions(readiness, input.gatewayUrl, degradedReasons),
        selectedAt: input.persisted?.selectedAt,
        lastHealthyAt: input.persisted?.lastHealthyAt,
        currentModelCandidate: doctor.currentModelCandidate && typeof doctor.currentModelCandidate === "object"
            ? doctor.currentModelCandidate
            : null,
        lastProviderFailureReason: typeof doctor.lastProviderFailureReason === "string" ? doctor.lastProviderFailureReason : null,
        fallbackAvailable: doctor.fallbackAvailable === true,
        lastFallbackRecovered: doctor.lastFallbackRecovered === true,
        lastPersistenceDir: typeof doctor.lastPersistenceDir === "string" ? doctor.lastPersistenceDir : null,
    };
    return {
        ...partial,
        message: buildUserMessage(partial),
    };
}
export function inferOpenHandsRuntimeProfile(task) {
    return inferDesiredProfile(task);
}
export function getPreferredOpenHandsRuntimeKinds(platform, desiredProfile) {
    if (desiredProfile === "full") {
        return ["docker", "local-python"];
    }
    return ["local-python", "docker"];
}
export class OpenHandsRuntimeSupervisor {
    statePath;
    repoRoot;
    gatewayUrl;
    requirementsPath;
    managedRuntimeRoot;
    managedVenvDir;
    state = {};
    lastHealthPayload = null;
    lastHealthAt = 0;
    warmupPromise = null;
    constructor(options) {
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
    async initialize() {
        try {
            const raw = await fs.readFile(this.statePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                this.state = parsed;
            }
        }
        catch {
            this.state = {};
        }
    }
    async getStatus(desiredProfile = "chat-only") {
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
    async ensureRuntime(input) {
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
            const status = runtimeKind === "docker"
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
    async warmup(desiredProfile = "chat-only") {
        if (this.warmupPromise) {
            return await this.warmupPromise;
        }
        this.warmupPromise = (async () => {
            try {
                return await this.ensureRuntime({ desiredProfile });
            }
            catch {
                return await this.getStatus(desiredProfile);
            }
        })();
        try {
            return await this.warmupPromise;
        }
        finally {
            this.warmupPromise = null;
        }
    }
    isCoolingDown() {
        if (!this.state.nextRetryAt)
            return false;
        return Date.parse(this.state.nextRetryAt) > Date.now();
    }
    async inspectGatewayHealth() {
        return await fetchJsonWithTimeout(`${this.gatewayUrl}/health`, HEALTH_TIMEOUT_MS);
    }
    async recordHealthy(status) {
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
    async recordFailure(status) {
        const failureCount = Number(this.state.failureCount || 0) + 1;
        const nextRetryAt = failureCount >= MAX_RETRY_BUDGET ? new Date(Date.now() + COOLDOWN_MS).toISOString() : undefined;
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
    async persist() {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
    }
    async tryStartLocalPythonRuntime(desiredProfile) {
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
                if (status.readiness !== "repair_needed")
                    return status;
            }
            catch {
                continue;
            }
        }
        return await this.getStatus(desiredProfile);
    }
    async tryStartDockerRuntime(desiredProfile) {
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
            if (status.readiness === "ready" || status.runtimeKind === "docker")
                return status;
            return status;
        }
        catch (error) {
            const status = await this.getStatus(desiredProfile);
            const dockerReason = error instanceof Error && error.message.trim() ? compactWhitespace(error.message) : "docker_start_failed";
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
    async waitForHealthyGateway(desiredProfile) {
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
    getPythonCandidates(managedPython) {
        const candidates = [];
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
    getBootstrapPythonCandidates() {
        const configured = compactWhitespace(process.env.OPENHANDS_GATEWAY_PYTHON);
        const candidates = [];
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
    getManagedPythonExecutable() {
        return process.platform === "win32"
            ? path.join(this.managedVenvDir, "Scripts", "python.exe")
            : path.join(this.managedVenvDir, "bin", "python");
    }
    async ensureManagedPythonEnv() {
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
                }
                catch {
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
            }
            catch {
                // Try the next bootstrap interpreter.
            }
        }
        return null;
    }
    async canImportOpenHands(pythonExecutable) {
        try {
            await this.runCommand(pythonExecutable, ["-c", "import openhands, openhands.sdk"], {}, 30_000);
            return true;
        }
        catch {
            return false;
        }
    }
    async stopLocalGatewayProcesses() {
        if (!isLocalGatewayUrl(this.gatewayUrl))
            return;
        try {
            if (process.platform === "win32") {
                await this.runCommand("powershell", [
                    "-NoProfile",
                    "-Command",
                    "$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'services[\\\\/]openhands-gateway[\\\\/](server\\.py|src[\\\\/]server\\.ts)' }; foreach ($proc in $targets) { try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {} }",
                ], {}, 30_000);
            }
            else {
                await this.runCommand("pkill", ["-f", "services/openhands-gateway/server.py"], {}, 30_000);
            }
        }
        catch {
            // Best-effort cleanup only. The next health check will decide whether startup actually recovered.
        }
        await delay(500);
    }
    async checkCommand(command, args) {
        try {
            await this.runCommand(command, args, {}, 10_000);
            return true;
        }
        catch {
            return false;
        }
    }
    async spawnDetached(command, args, extraEnv) {
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
    async runCommand(command, args, extraEnv, timeoutMs = 120_000) {
        await new Promise((resolve, reject) => {
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
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`));
            });
        });
    }
}
