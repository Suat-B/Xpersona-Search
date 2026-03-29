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
function quoteForShellArg(value) {
    const raw = String(value || "");
    if (process.platform === "win32") {
        return `"${raw.replace(/"/g, '""').replace(/%/g, "%%")}"`;
    }
    return `'${raw.replace(/'/g, `'\"'\"'`)}'`;
}
function substituteValidationCommand(template, vars) {
    return String(template || "")
        .replace(/\$\{file\}/g, quoteForShellArg(vars.file))
        .replace(/\$\{absFile\}/g, quoteForShellArg(vars.absFile))
        .replace(/\$\{workspaceFolder\}/g, quoteForShellArg(vars.workspaceFolder));
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