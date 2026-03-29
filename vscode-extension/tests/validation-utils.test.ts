import { describe, expect, it } from "vitest";
import {
  planQuickValidationForFile,
  selectBuiltInValidationRunner,
  substituteValidationCommand,
} from "../src/validation-utils";

describe("validation utils", () => {
  it("substitutes validation command template variables", () => {
    expect(
      substituteValidationCommand("python ${absFile} --cwd ${workspaceFolder} --rel ${file}", {
        file: "src/main.py",
        absFile: "C:/repo/src/main.py",
        workspaceFolder: "C:/repo",
      })
    ).toBe('python "C:/repo/src/main.py" --cwd "C:/repo" --rel "src/main.py"');
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
      hasWorkspaceLintScript: true,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("ready");
    expect(plan.commands).toEqual(['git diff --check -- "src/app.ts"', 'npm run lint -- "src/app.ts"']);
  });

  it("falls back to sanity-only validation when there is no built-in runner", () => {
    const plan = planQuickValidationForFile({
      filePath: "docs/notes.md",
      absFile: "C:/repo/docs/notes.md",
      workspaceFolder: "C:/repo",
      changed: true,
      hasWorkspaceLintScript: false,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("ready");
    expect(plan.reason).toBe("sanity_only_validation:.md");
    expect(plan.runnerLabel).toBe("git diff sanity");
    expect(plan.coverage).toBe("sanity_only");
    expect(plan.commands).toEqual(['git diff --check -- "docs/notes.md"']);
  });

  it("quotes validation paths that include spaces", () => {
    const plan = planQuickValidationForFile({
      filePath: "All Files and Folders/topstepapi-main/Samsara_Trading_Model.py",
      absFile:
        "C:/repo/All Files and Folders/topstepapi-main/Samsara_Trading_Model.py",
      workspaceFolder: "C:/repo/Trading Bot",
      changed: true,
      hasWorkspaceLintScript: false,
      pythonAvailable: true,
    });

    expect(plan.commands).toEqual([
      'git diff --check -- "All Files and Folders/topstepapi-main/Samsara_Trading_Model.py"',
      'python -m py_compile "C:/repo/All Files and Folders/topstepapi-main/Samsara_Trading_Model.py"',
    ]);
  });

  it("skips quick validation for no-op edits", () => {
    const plan = planQuickValidationForFile({
      filePath: "src/app.ts",
      absFile: "C:/repo/src/app.ts",
      workspaceFolder: "C:/repo",
      changed: false,
      hasWorkspaceLintScript: true,
      pythonAvailable: false,
    });

    expect(plan.status).toBe("skipped");
    expect(plan.commands).toEqual([]);
  });
});
