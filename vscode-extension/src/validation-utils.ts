import * as path from "path";

export type ValidationCommand = {
  kind: "sanity" | "builtin";
  command: string;
  timeoutMs: number;
  continueOnFailure: boolean;
  label: string;
};

export type QuickValidationPlan = {
  status: "ready" | "skipped";
  reason?: string;
  commands: string[];
  steps: ValidationCommand[];
  runnerLabel?: string;
  coverage: "full" | "sanity_only";
};

type BuiltInRunner = {
  label: string;
  commands: string[];
  timeoutMs: number;
  continueOnFailure: boolean;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const JS_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function normalizeForMatch(input: string): string {
  const slashified = String(input || "").replace(/\\/g, "/").trim();
  return slashified.replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function quoteForShellArg(value: string): string {
  const raw = String(value || "");
  if (process.platform === "win32") {
    return `"${raw.replace(/"/g, '""').replace(/%/g, "%%")}"`;
  }
  return `'${raw.replace(/'/g, `'\"'\"'`)}'`;
}

export function substituteValidationCommand(
  template: string,
  vars: { file: string; absFile: string; workspaceFolder: string }
): string {
  return String(template || "")
    .replace(/\$\{file\}/g, quoteForShellArg(vars.file))
    .replace(/\$\{absFile\}/g, quoteForShellArg(vars.absFile))
    .replace(/\$\{workspaceFolder\}/g, quoteForShellArg(vars.workspaceFolder));
}

export function selectBuiltInValidationRunner(input: {
  filePath: string;
  hasWorkspaceLintScript: boolean;
  pythonAvailable: boolean;
}): BuiltInRunner | null {
  const ext = path.posix.extname(normalizeForMatch(input.filePath)).toLowerCase();
  if (JS_LIKE_EXTENSIONS.has(ext)) {
    if (!input.hasWorkspaceLintScript) return null;
    return {
      label: "workspace lint",
      commands: ["npm run lint -- ${file}"],
      timeoutMs: DEFAULT_TIMEOUT_MS,
      continueOnFailure: false,
    };
  }
  if (ext === ".py") {
    if (!input.pythonAvailable) return null;
    return {
      label: "python compile",
      commands: ["python -m py_compile ${absFile}"],
      timeoutMs: DEFAULT_TIMEOUT_MS,
      continueOnFailure: false,
    };
  }
  return null;
}

function describeMissingRunnerTarget(filePath: string): string {
  const relPath = normalizeForMatch(filePath);
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext || relPath || "unknown";
}

export function planQuickValidationForFile(input: {
  filePath: string;
  absFile: string;
  workspaceFolder: string;
  changed: boolean;
  hasWorkspaceLintScript: boolean;
  pythonAvailable: boolean;
}): QuickValidationPlan {
  const relPath = normalizeForMatch(input.filePath);
  if (!input.changed || !relPath) {
    return {
      status: "skipped",
      reason: "No file content changed.",
      commands: [],
      steps: [],
      coverage: "full",
    };
  }

  const vars = {
    file: relPath,
    absFile: input.absFile,
    workspaceFolder: input.workspaceFolder,
  };
  const sanityStep: ValidationCommand = {
    kind: "sanity",
    label: "git diff sanity",
    command: substituteValidationCommand("git diff --check -- ${file}", vars),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    continueOnFailure: false,
  };

  const builtIn = selectBuiltInValidationRunner({
    filePath: relPath,
    hasWorkspaceLintScript: input.hasWorkspaceLintScript,
    pythonAvailable: input.pythonAvailable,
  });
  if (builtIn) {
    const runnerSteps = builtIn.commands.map((command) => ({
      kind: "builtin" as const,
      label: builtIn.label,
      command: substituteValidationCommand(command, vars),
      timeoutMs: builtIn.timeoutMs,
      continueOnFailure: builtIn.continueOnFailure,
    }));
    const steps = [sanityStep, ...runnerSteps];
    return {
      status: "ready",
      commands: steps.map((step) => step.command),
      steps,
      runnerLabel: builtIn.label,
      coverage: "full",
    };
  }

  return {
    status: "ready",
    reason: `sanity_only_validation:${describeMissingRunnerTarget(relPath)}`,
    commands: [sanityStep.command],
    steps: [sanityStep],
    runnerLabel: sanityStep.label,
    coverage: "sanity_only",
  };
}
