import { afterEach, describe, expect, it } from "vitest";
import { InteractiveTerminalRuntime } from "./interactive-terminal-runtime.js";
const runtime = new InteractiveTerminalRuntime();
async function closeAllSessions() {
    const sessions = runtime.listSessions();
    for (const session of sessions) {
        await runtime.terminateSession(session.sessionId).catch(() => undefined);
    }
}
describe("InteractiveTerminalRuntime", () => {
    afterEach(async () => {
        await closeAllSessions();
    });
    it("starts, lists, and terminates sessions", async () => {
        const started = await runtime.startSession({ cwd: process.cwd(), name: "test-shell" });
        expect(started.session.status).toBe("running");
        const sessions = runtime.listSessions();
        expect(sessions.some((session) => session.sessionId === started.session.sessionId)).toBe(true);
        const terminated = await runtime.terminateSession(started.session.sessionId);
        expect(["running", "exited", "failed"]).toContain(terminated.status);
    });
    it("supports round-trip interactive input", async () => {
        const started = await runtime.startSession({ cwd: process.cwd() });
        const command = process.platform === "win32"
            ? "echo binary-stream-test"
            : 'printf "binary-stream-test\\n"';
        const result = await runtime.sendInput({
            sessionId: started.session.sessionId,
            input: command,
            waitForMs: 220,
            timeoutMs: 4_000,
        });
        expect(result.output.toLowerCase()).toContain("binary-stream-test");
        const idleRead = await runtime.readOutput({
            sessionId: started.session.sessionId,
            waitForMs: 80,
            timeoutMs: 400,
        });
        expect(typeof idleRead.output).toBe("string");
    });
});
