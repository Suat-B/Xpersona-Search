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
exports.normalizeOperatingPromptMarkdown = normalizeOperatingPromptMarkdown;
exports.resolveOperatingPromptMarkdownPath = resolveOperatingPromptMarkdownPath;
exports.resolveBundledOperatingPromptMarkdownPath = resolveBundledOperatingPromptMarkdownPath;
exports.buildComposedCutieSystemPrompt = buildComposedCutieSystemPrompt;
const path = __importStar(require("path"));
const fs_1 = require("fs");
function normalizeOperatingPromptMarkdown(value) {
    return String(value || "")
        .replace(/\r\n?/g, "\n")
        .trim();
}
function resolveOperatingPromptMarkdownPath(configuredPath, workspaceRootPath) {
    const trimmed = String(configuredPath || "").trim();
    if (!trimmed) {
        return {
            configuredPath: "",
            resolvedPath: null,
        };
    }
    if (path.isAbsolute(trimmed)) {
        return {
            configuredPath: trimmed,
            resolvedPath: path.normalize(trimmed),
        };
    }
    if (!workspaceRootPath) {
        return {
            configuredPath: trimmed,
            resolvedPath: null,
            error: "Prompt markdown path is workspace-relative, but no workspace root is open.",
        };
    }
    return {
        configuredPath: trimmed,
        resolvedPath: path.resolve(workspaceRootPath, trimmed),
    };
}
function resolveBundledOperatingPromptMarkdownPath() {
    const candidates = [
        path.resolve(__dirname, "..", "resources", "cutie-agent-operating-prompt.md"),
        path.resolve(__dirname, "..", "..", "docs", "cutie-agent-operating-prompt.md"),
    ];
    return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) || null;
}
function buildComposedCutieSystemPrompt(input) {
    const core = normalizeOperatingPromptMarkdown(input.coreContract);
    const operatingPromptMarkdown = normalizeOperatingPromptMarkdown(input.operatingPromptMarkdown);
    if (!operatingPromptMarkdown) {
        return core;
    }
    const section = [
        "Workspace operating prompt (style layer):",
        "Follow the observable working style below unless it conflicts with the hard runtime/tool/safety contract above.",
        input.promptMarkdownPath ? `Prompt markdown path: ${input.promptMarkdownPath}` : "",
        operatingPromptMarkdown,
    ]
        .filter(Boolean)
        .join("\n\n");
    return [core, section].filter(Boolean).join("\n\n");
}
//# sourceMappingURL=cutie-operating-prompt.js.map