import { describe, expect, it } from "vitest";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
import { defaultMachineAutonomyPolicy } from "./machine-autonomy.js";

function buildPendingToolCall(name: string, args: Record<string, unknown> = {}) {
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
    const decision = controller.decide(
      buildPendingToolCall("run_command", { command: "npm test", cwd: "c:\\repo" })
    );

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
    const controller = new AutonomyExecutionController(defaultMachineAutonomyPolicy());
    const decision = controller.decide(buildPendingToolCall("browser_snapshot_dom", { pageId: "page_1" }));

    expect(decision.lane).toBe("managed_session_background");
    expect(decision.executionVisibility).toBe("background");
    expect(decision.interactionMode).toBe("managed_browser");
  });
});
