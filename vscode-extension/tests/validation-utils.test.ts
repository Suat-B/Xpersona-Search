import { describe, expect, it } from "vitest";
import {
  matchValidationAdapter,
  normalizeValidationAdapters,
  planQuickValidationForFile,
  selectBuiltInValidationRunner,
  substituteValidationCommand,
} from "../src/validation-utils";

describe("validation utils", () => {
  it("uses the first matching adapter", () => {
    const adapters = normalizeValidationAdapters([
      {
        name: "pine-fast",
        patterns: ["**/*.pine"],
        commands: ["echo pine"],
      },
      {
        name: "all-files",
        patterns: ["**/*"],
        commands: ["echo all"],
      },
    ]);

    expect(matchValidationAdapter("One/strategies/pending/test.pine", adapters)?.name).toBe("pine-fast");
  });

  it("substitutes validation command template variables", () => {
    expect(
      substituteValidationCommand("python ${absFile} --cwd ${workspaceFolder} --rel ${file}", {
        file: "src/main.py",
        absFile: "C:/repo/src/main.py",
        workspaceFolder: "C:/repo",
      })
    ).toBe("python C:/repo/src/main.py --cwd C:/repo --rel src/main.py");
  });

  it("selects the built-in lint runner only when the workspace exposes lint", () => {
    expect(
      selectBuiltInValidationRunner({
        filePath: "src/app.ts",
        hasWorkspaceLintScript: true,
        pythonAvailable: false,
      })?.commands
    ).toEqual(["npm run lint -- ${file}"]);

    expect(
      selectBuiltInValidationRunner({
        filePath: "src/app.ts",
        hasWorkspaceLintScript: false,
        pythonAvailable: false,
      })
    ).toBeNull();
  });

  it("selects the built-in python runner only when python is available", () => {
    expect(
      selectBuiltInValidationRunner({
        filePath: "bot/main.py",
        hasWorkspaceLintScript: false,
        pythonAvailable: true,
      })?.commands
    ).toEqual(["python -m py_compile ${absFile}"]);

    expect(
      selectBuiltInValidationRunner({
        filePath: "bot/main.py",
        hasWorkspaceLintScript: false,
        pythonAvailable: false,
      })
    ).toBeNull();
  });

  it("plans quick validation for a ts file with lint support", () => {
    const plan = planQuickValidationForFile({
      filePath: "src/app.ts",
      absFile: "C:/repo/src/app.ts",
      workspaceFolder: "C:/repo",
      changed: true,
      adapters: [],
      hasWorkspaceLintScript: true,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("ready");
    expect(plan.commands).toEqual(["git diff --check -- src/app.ts", "npm run lint -- src/app.ts"]);
  });

  it("plans quick validation for a pine file with an adapter", () => {
    const adapters = normalizeValidationAdapters([
      {
        name: "pine-check",
        patterns: ["One/strategies/**/*.pine"],
        commands: ["python scripts/check-pine.py ${absFile}"],
        timeoutMs: 90000,
      },
    ]);

    const plan = planQuickValidationForFile({
      filePath: "One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      absFile: "C:/repo/One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      workspaceFolder: "C:/repo",
      changed: true,
      adapters,
      hasWorkspaceLintScript: false,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("ready");
    expect(plan.runnerLabel).toBe("pine-check");
    expect(plan.commands).toEqual([
      "git diff --check -- One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      "python scripts/check-pine.py C:/repo/One/strategies/pending/Emergent_Swarm_Intelligence.pine",
    ]);
  });

  it("marks pine files without an adapter as missing a runner", () => {
    const plan = planQuickValidationForFile({
      filePath: "One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      absFile: "C:/repo/One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      workspaceFolder: "C:/repo",
      changed: true,
      adapters: [],
      hasWorkspaceLintScript: false,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("missing_runner");
    expect(plan.reason).toBe("missing_validation_runner:.pine");
    expect(plan.commands).toEqual(["git diff --check -- One/strategies/pending/Emergent_Swarm_Intelligence.pine"]);
  });

  it("skips quick validation for no-op edits", () => {
    const plan = planQuickValidationForFile({
      filePath: "src/app.ts",
      absFile: "C:/repo/src/app.ts",
      workspaceFolder: "C:/repo",
      changed: false,
      adapters: [],
      hasWorkspaceLintScript: true,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("skipped");
    expect(plan.commands).toEqual([]);
  });
});
