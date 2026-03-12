import * as path from "path";

export type ValidationStatus = "passed" | "failed" | "missing_runner" | "skipped";

export type ValidationAdapter = {
  name: string;
  patterns: string[];
  commands: string[];
  timeoutMs: number;
  continueOnFailure: boolean;
};

export type ValidationCommand = {
  kind: "sanity" | "adapter" | "builtin";
  command: string;
  timeoutMs: number;
  continueOnFailure: boolean;
  label: string;
};

export type QuickValidationPlan = {
  status: "ready" | "missing_runner" | "skipped";
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

function escapeRegExpChar(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeForMatch(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*") {
      const next = normalized[index + 1];
      const afterNext = normalized[index + 2];
      if (next === "*") {
        if (afterNext === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegExpChar(char);
  }
  source += "$";
  return new RegExp(source);
}

function toPositiveTimeoutMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function normalizeValidationAdapters(input: unknown): ValidationAdapter[] {
  if (!Array.isArray(input)) return [];
  const adapters: ValidationAdapter[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = String(item.name || "").trim();
    const patterns = toStringArray(item.patterns);
    const commands = toStringArray(item.commands);
    if (!name || patterns.length === 0 || commands.length === 0) continue;
    adapters.push({
      name,
      patterns,
      commands,
      timeoutMs: toPositiveTimeoutMs(item.timeoutMs),
      continueOnFailure: toBoolean(item.continueOnFailure, false),
    });
  }
  return adapters;
}

export function matchesWorkspacePattern(filePath: string, pattern: string): boolean {
  const relPath = normalizeForMatch(filePath);
  if (!relPath) return false;
  return globToRegExp(pattern).test(relPath);
}

export function matchValidationAdapter(filePath: string, adapters: ValidationAdapter[]): ValidationAdapter | null {
  const relPath = normalizeForMatch(filePath);
  if (!relPath) return null;
  for (const adapter of adapters) {
    if (adapter.patterns.some((pattern) => matchesWorkspacePattern(relPath, pattern))) {
      return adapter;
    }
  }
  return null;
}

export function substituteValidationCommand(
  template: string,
  vars: { file: string; absFile: string; workspaceFolder: string }
): string {
  return String(template || "")
    .replace(/\$\{file\}/g, vars.file)
    .replace(/\$\{absFile\}/g, vars.absFile)
    .replace(/\$\{workspaceFolder\}/g, vars.workspaceFolder);
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
  adapters: ValidationAdapter[];
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
  const adapter = matchValidationAdapter(relPath, input.adapters);
  if (adapter) {
    const runnerSteps = adapter.commands.map((command) => ({
      kind: "adapter" as const,
      label: adapter.name,
      command: substituteValidationCommand(command, vars),
      timeoutMs: adapter.timeoutMs,
      continueOnFailure: adapter.continueOnFailure,
    }));
    const steps = [sanityStep, ...runnerSteps];
    return {
      status: "ready",
      commands: steps.map((step) => step.command),
      steps,
      runnerLabel: adapter.name,
      coverage: "full",
    };
  }

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
