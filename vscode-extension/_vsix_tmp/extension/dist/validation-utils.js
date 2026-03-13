"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeValidationAdapters = normalizeValidationAdapters;
exports.matchesWorkspacePattern = matchesWorkspacePattern;
exports.matchValidationAdapter = matchValidationAdapter;
exports.substituteValidationCommand = substituteValidationCommand;
exports.selectBuiltInValidationRunner = selectBuiltInValidationRunner;
exports.planQuickValidationForFile = planQuickValidationForFile;
const path = __importStar(require("path"));
const DEFAULT_TIMEOUT_MS = 60000;
const JS_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
function normalizeForMatch(input) {
    const slashified = String(input || "").replace(/\\/g, "/").trim();
    return slashified.replace(/^\.\/+/, "").replace(/^\/+/, "");
}
function escapeRegExpChar(char) {
    return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}
function globToRegExp(pattern) {
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
                }
                else {
                    source += ".*";
                    index += 1;
                }
            }
            else {
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
function toPositiveTimeoutMs(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}
function toBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
}
function normalizeValidationAdapters(input) {
    if (!Array.isArray(input))
        return [];
    const adapters = [];
    for (const raw of input) {
        if (!raw || typeof raw !== "object")
            continue;
        const item = raw;
        const name = String(item.name || "").trim();
        const patterns = toStringArray(item.patterns);
        const commands = toStringArray(item.commands);
        if (!name || patterns.length === 0 || commands.length === 0)
            continue;
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
function matchesWorkspacePattern(filePath, pattern) {
    const relPath = normalizeForMatch(filePath);
    if (!relPath)
        return false;
    return globToRegExp(pattern).test(relPath);
}
function matchValidationAdapter(filePath, adapters) {
    const relPath = normalizeForMatch(filePath);
    if (!relPath)
        return null;
    for (const adapter of adapters) {
        if (adapter.patterns.some((pattern) => matchesWorkspacePattern(relPath, pattern))) {
            return adapter;
        }
    }
    return null;
}
function substituteValidationCommand(template, vars) {
    return String(template || "")
        .replace(/\$\{file\}/g, vars.file)
        .replace(/\$\{absFile\}/g, vars.absFile)
        .replace(/\$\{workspaceFolder\}/g, vars.workspaceFolder);
}
function selectBuiltInValidationRunner(input) {
    const ext = path.posix.extname(normalizeForMatch(input.filePath)).toLowerCase();
    if (JS_LIKE_EXTENSIONS.has(ext)) {
        if (!input.hasWorkspaceLintScript)
            return null;
        return {
            label: "workspace lint",
            commands: ["npm run lint -- ${file}"],
            timeoutMs: DEFAULT_TIMEOUT_MS,
            continueOnFailure: false,
        };
    }
    if (ext === ".py") {
        if (!input.pythonAvailable)
            return null;
        return {
            label: "python compile",
            commands: ["python -m py_compile ${absFile}"],
            timeoutMs: DEFAULT_TIMEOUT_MS,
            continueOnFailure: false,
        };
    }
    return null;
}
function describeMissingRunnerTarget(filePath) {
    const relPath = normalizeForMatch(filePath);
    const ext = path.posix.extname(relPath).toLowerCase();
    return ext || relPath || "unknown";
}
function planQuickValidationForFile(input) {
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
    const sanityStep = {
        kind: "sanity",
        label: "git diff sanity",
        command: substituteValidationCommand("git diff --check -- ${file}", vars),
        timeoutMs: DEFAULT_TIMEOUT_MS,
        continueOnFailure: false,
    };
    const adapter = matchValidationAdapter(relPath, input.adapters);
    if (adapter) {
        const runnerSteps = adapter.commands.map((command) => ({
            kind: "adapter",
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
            kind: "builtin",
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
//# sourceMappingURL=validation-utils.js.map