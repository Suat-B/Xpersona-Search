import { describe, expect, it } from "vitest";
import {
  buildSlashCommandHelpMessage,
  buildSlashStatusMessage,
  parseSlashCommand,
} from "../src/slash-commands";

describe("slash commands", () => {
  it("parses the supported command surface", () => {
    expect(parseSlashCommand(" /help ")).toEqual({ kind: "help" });
    expect(parseSlashCommand("/plan")).toEqual({ kind: "plan" });
    expect(parseSlashCommand("/auto")).toEqual({ kind: "auto" });
    expect(parseSlashCommand("/runtime qwen")).toEqual({
      kind: "runtime",
      runtime: "qwenCode",
    });
    expect(parseSlashCommand("/runtime cloud")).toEqual({
      kind: "runtime",
      runtime: "playgroundApi",
    });
    expect(parseSlashCommand("/status")).toEqual({ kind: "status" });
  });

  it("returns null for normal prompts and unknown for unsupported slash text", () => {
    expect(parseSlashCommand("fix route.ts")).toBeNull();
    expect(parseSlashCommand("/runtime other")).toEqual({
      kind: "unknown",
      raw: "/runtime other",
    });
  });

  it("builds help and status messages for chat-safe system output", () => {
    const help = buildSlashCommandHelpMessage();
    const status = buildSlashStatusMessage({
      runtime: "qwenCode",
      mode: "plan",
      authLabel: "Qwen Code via Streaming Binary IDE API key",
      runtimePhase: "awaiting_approval",
      sessionId: "pending:123",
      attachedFiles: ["app/api/v1/playground/models/route.ts"],
      attachedSelectionPath: "app/api/v1/playground/models/route.ts",
    });

    expect(help).toContain("/runtime qwen");
    expect(help).toContain("/status");
    expect(status).toContain("Streaming Binary IDE status:");
    expect(status).toContain("Runtime: Qwen Code");
    expect(status).toContain("Mode: Plan");
    expect(status).toContain("Phase: Awaiting tool approval");
    expect(status).toContain("Attached files: app/api/v1/playground/models/route.ts");
  });
});
