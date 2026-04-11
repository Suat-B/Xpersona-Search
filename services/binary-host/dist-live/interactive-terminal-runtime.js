import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
const DEFAULT_WAIT_FOR_MS = 180;
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_CHARS = 16_000;
const MAX_BUFFER_CHARS = 160_000;
function nowIso() {
    return new Date().toISOString();
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
async function resolveCwd(cwd) {
    const resolved = path.resolve(cwd || process.cwd());
    const stats = await fs.stat(resolved).catch(() => null);
    if (!stats?.isDirectory()) {
        throw new Error(`Interactive terminal requires an existing directory. Received: ${resolved}`);
    }
    return resolved;
}
function buildDefaultShellSpec(shell) {
    const requested = String(shell || "").trim().toLowerCase();
    if (process.platform === "win32") {
        if (!requested || requested === "default") {
            return { command: "cmd.exe", args: ["/Q", "/K"], shellLabel: "cmd" };
        }
        if (requested === "cmd" || requested === "cmd.exe") {
            return { command: "cmd.exe", args: ["/Q", "/K"], shellLabel: "cmd" };
        }
        if (requested === "pwsh" || requested === "pwsh.exe") {
            return {
                command: "pwsh.exe",
                args: ["-NoLogo", "-NoProfile", "-NoExit", "-Command", "-"],
                shellLabel: "pwsh",
            };
        }
        return {
            command: "powershell.exe",
            args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "-"],
            shellLabel: "powershell",
        };
    }
    if (requested === "sh") {
        return { command: "sh", args: ["-i"], shellLabel: "sh" };
    }
    return { command: "bash", args: ["--noprofile", "--norc", "-i"], shellLabel: "bash" };
}
export class InteractiveTerminalRuntime {
    sessions = new Map();
    async startSession(input) {
        const cwd = await resolveCwd(input.cwd);
        const spec = buildDefaultShellSpec(input.shell);
        const child = spawn(spec.command, spec.args, {
            cwd,
            env: {
                ...process.env,
                TERM: process.env.TERM || "xterm-256color",
            },
            stdio: "pipe",
            windowsHide: true,
        });
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        const session = {
            id: `term_${randomUUID()}`,
            cwd,
            shell: spec.shellLabel,
            child,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            lastActivityAt: nowIso(),
            status: "running",
            exitCode: null,
            cursorBase: 0,
            buffer: "",
            lastReadCursor: 0,
            ...(input.name ? { name: input.name.trim() } : {}),
        };
        child.stdout.on("data", (chunk) => {
            this.appendChunk(session, chunk);
        });
        child.stderr.on("data", (chunk) => {
            this.appendChunk(session, chunk);
        });
        child.on("exit", (code) => {
            session.status = "exited";
            session.exitCode = typeof code === "number" ? code : null;
            session.updatedAt = nowIso();
            session.lastActivityAt = session.updatedAt;
        });
        child.on("error", (error) => {
            this.appendChunk(session, `\n[terminal error] ${error.message}\n`);
            session.status = "failed";
            session.updatedAt = nowIso();
            session.lastActivityAt = session.updatedAt;
        });
        this.sessions.set(session.id, session);
        const readResult = await this.readOutput({
            sessionId: session.id,
            waitForMs: input.waitForMs,
            timeoutMs: input.timeoutMs,
            markRead: true,
        });
        return {
            session: readResult.session,
            output: readResult.output,
            truncated: readResult.truncated,
        };
    }
    listSessions() {
        return [...this.sessions.values()].map((session) => this.toView(session));
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? this.toView(session) : null;
    }
    async sendInput(input) {
        const session = this.requireSession(input.sessionId);
        if (session.status !== "running") {
            throw new Error(`Interactive terminal session ${session.id} is no longer running.`);
        }
        const payload = `${input.input}${input.appendNewline === false ? "" : os.EOL}`;
        const startCursor = this.currentCursor(session);
        session.child.stdin.write(payload, "utf8");
        session.updatedAt = nowIso();
        const readResult = await this.readOutput({
            sessionId: session.id,
            afterCursor: startCursor,
            waitForMs: input.waitForMs,
            timeoutMs: input.timeoutMs,
            maxChars: input.maxChars,
            markRead: true,
        });
        return readResult;
    }
    async readOutput(input) {
        const session = this.requireSession(input.sessionId);
        const waitForMs = clamp(Number(input.waitForMs ?? DEFAULT_WAIT_FOR_MS), 50, 3_000);
        const timeoutMs = clamp(Number(input.timeoutMs ?? DEFAULT_TIMEOUT_MS), waitForMs, 20_000);
        const maxChars = clamp(Number(input.maxChars ?? DEFAULT_MAX_CHARS), 256, 64_000);
        const afterCursor = typeof input.afterCursor === "number" && Number.isFinite(input.afterCursor)
            ? Math.max(0, Math.floor(input.afterCursor))
            : session.lastReadCursor;
        await this.waitForQuiet(session, afterCursor, waitForMs, timeoutMs);
        const { output, cursor, truncated } = this.sliceBuffer(session, afterCursor, maxChars);
        if (input.markRead !== false) {
            session.lastReadCursor = cursor;
            session.updatedAt = nowIso();
        }
        return {
            session: this.toView(session),
            output,
            truncated,
        };
    }
    async terminateSession(sessionId) {
        const session = this.requireSession(sessionId);
        if (session.status === "running") {
            session.child.kill();
            await this.waitForQuiet(session, this.currentCursor(session), 60, 1_000).catch(() => undefined);
        }
        return this.toView(session);
    }
    appendChunk(session, chunk) {
        const normalized = String(chunk || "").replace(/\r\n/g, "\n");
        session.buffer += normalized;
        if (session.buffer.length > MAX_BUFFER_CHARS) {
            const trimAmount = session.buffer.length - MAX_BUFFER_CHARS;
            session.buffer = session.buffer.slice(trimAmount);
            session.cursorBase += trimAmount;
            if (session.lastReadCursor < session.cursorBase) {
                session.lastReadCursor = session.cursorBase;
            }
        }
        session.updatedAt = nowIso();
        session.lastActivityAt = session.updatedAt;
    }
    currentCursor(session) {
        return session.cursorBase + session.buffer.length;
    }
    sliceBuffer(session, afterCursor, maxChars) {
        const start = Math.max(0, afterCursor - session.cursorBase);
        const text = session.buffer.slice(start);
        if (text.length <= maxChars) {
            return {
                output: text,
                cursor: this.currentCursor(session),
                truncated: false,
            };
        }
        return {
            output: text.slice(text.length - maxChars),
            cursor: this.currentCursor(session),
            truncated: true,
        };
    }
    async waitForQuiet(session, afterCursor, waitForMs, timeoutMs) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const currentCursor = this.currentCursor(session);
            const idleMs = Date.now() - Date.parse(session.lastActivityAt);
            if (currentCursor > afterCursor) {
                if (idleMs >= waitForMs)
                    return;
            }
            else if (Date.now() - startedAt >= waitForMs) {
                return;
            }
            if (session.status !== "running" && idleMs >= 40)
                return;
            await delay(40);
        }
    }
    requireSession(sessionId) {
        const session = this.sessions.get(String(sessionId || "").trim());
        if (!session) {
            throw new Error(`Interactive terminal session not found: ${sessionId}`);
        }
        return session;
    }
    toView(session) {
        return {
            sessionId: session.id,
            cwd: session.cwd,
            shell: session.shell,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastActivityAt: session.lastActivityAt,
            status: session.status,
            exitCode: session.exitCode,
            cursor: this.currentCursor(session),
            ...(session.name ? { name: session.name } : {}),
        };
    }
}
