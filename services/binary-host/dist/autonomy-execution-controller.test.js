import { describe, expect, it } from "vitest";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
import { defaultMachineAutonomyPolicy } from "./machine-autonomy.js";
function buildPendingToolCall(name, args = {}) {
    return {
        step: 1,
        adapter: "test",
        requiresClientExecution: true,
        createdAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
        toolCall: {
            id: `${name}_1`,
            name,
            arguments: args,
        },
    };
}
describe("AutonomyExecutionController", () => {
    it("prefers the terminal background lane for run_command", () => {
        const controller = new AutonomyExecutionController(defaultMachineAutonomyPolicy());
        const decision = controller.decide(buildPendingToolCall("run_command", { command: "npm test", cwd: "c:\\repo" }));
        expect(decision.lane).toBe("terminal_background");
        expect(decision.executionVisibility).toBe("background");
        expect(decision.interactionMode).toBe("terminal");
    });
    it("suppresses visible desktop actions while a focus lease is active", () => {
        const controller = new AutonomyExecutionController(defaultMachineAutonomyPolicy());
        controller.updateFocusLease({
            surface: "desktop",
            source: "typing",
            leaseMs: 5000,
            active: true,
        });
        const decision = controller.decide(buildPendingToolCall("desktop_open_app", { app: "Dota 2" }));
        expect(decision.focusSuppressed).toBe(true);
        expect(decision.focusLeaseActive).toBe(true);
        expect(decision.executionVisibility).toBe("low_focus");
    });
    it("uses managed browser background sessions for inspection by default", () => {
        const policy = defaultMachineAutonomyPolicy();
        policy.sessionPolicy = "managed_only";
        const controller = new AutonomyExecutionController(policy);
        const decision = controller.decide(buildPendingToolCall("browser_snapshot_dom", { pageId: "page_1" }));
        expect(decision.lane).toBe("managed_session_background");
        expect(decision.executionVisibility).toBe("background");
        expect(decision.interactionMode).toBe("managed_browser");
    });
    it("uses managed-only browser preference when attach mode is managed_only", () => {
        const policy = defaultMachineAutonomyPolicy();
        policy.sessionPolicy = "attach_carefully";
        policy.browserAttachMode = "managed_only";
        const controller = new AutonomyExecutionController(policy);
        controller.updateFocusLease({
            surface: "desktop",
            source: "typing",
            leaseMs: 5000,
            active: true,
        });
        const decision = controller.decide(buildPendingToolCall("browser_search_and_open_best_result", { url: "https://www.youtube.com/", query: "outdoor boys" }));
        expect(decision.focusLeaseActive).toBe(true);
        expect(decision.managedSessionPreferred).toBe(true);
        expect(decision.browserSessionPreference).toBe("managed_only");
        expect(decision.interactionMode).toBe("managed_browser");
        expect(decision.executionVisibility).toBe("background");
    });
    it("uses reuse-first preference only when attach mode allows existing sessions", () => {
        const policy = defaultMachineAutonomyPolicy();
        policy.sessionPolicy = "attach_carefully";
        policy.browserAttachMode = "existing_or_managed";
        const controller = new AutonomyExecutionController(policy);
        const decision = controller.decide(buildPendingToolCall("browser_search_and_open_best_result", { url: "https://www.youtube.com/", query: "outdoor boys" }));
        expect(decision.managedSessionPreferred).toBe(false);
        expect(decision.browserSessionPreference).toBe("reuse_first");
        expect(decision.interactionMode).toBe("attached_browser");
        expect(decision.executionVisibility).toBe("low_focus");
    });
});
