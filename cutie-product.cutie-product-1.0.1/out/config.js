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
exports.CUTIE_REASONING_LEVELS = exports.PENDING_PKCE_KEY = exports.REFRESH_TOKEN_SECRET = exports.API_KEY_SECRET = exports.VIEW_ID = exports.EXTENSION_NAMESPACE = void 0;
exports.getBaseApiUrl = getBaseApiUrl;
exports.getBinaryApiBaseUrl = getBinaryApiBaseUrl;
exports.getBinaryStreamGatewayUrl = getBinaryStreamGatewayUrl;
exports.getBinaryIdeChatRuntime = getBinaryIdeChatRuntime;
exports.getOpenCodeServerUrl = getOpenCodeServerUrl;
exports.getOpenCodeAutoStart = getOpenCodeAutoStart;
exports.getOpenCodeModel = getOpenCodeModel;
exports.getOpenCodeConfigPath = getOpenCodeConfigPath;
exports.getQwenModel = getQwenModel;
exports.getQwenOpenAiBaseUrl = getQwenOpenAiBaseUrl;
exports.getQwenExecutablePath = getQwenExecutablePath;
exports.getQwenCliWrapperEnabled = getQwenCliWrapperEnabled;
exports.getQwenCliWrapperPath = getQwenCliWrapperPath;
exports.normalizeWorkspaceRelativePath = normalizeWorkspaceRelativePath;
exports.toAbsoluteWorkspacePath = toAbsoluteWorkspacePath;
exports.getProjectKey = getProjectKey;
exports.getModelHint = getModelHint;
exports.getPromptMarkdownPath = getPromptMarkdownPath;
exports.getModelPickerOptions = getModelPickerOptions;
exports.getReasoningLevel = getReasoningLevel;
exports.getExperimentalDesktopAdaptersEnabled = getExperimentalDesktopAdaptersEnabled;
exports.getWorkspaceFolder = getWorkspaceFolder;
exports.getWorkspaceRootPath = getWorkspaceRootPath;
exports.getWorkspaceHash = getWorkspaceHash;
exports.toWorkspaceRelativePath = toWorkspaceRelativePath;
exports.getExtensionVersion = getExtensionVersion;
exports.getMaxToolStepsForPlayground = getMaxToolStepsForPlayground;
exports.getMaxWorkspaceMutationsForPlayground = getMaxWorkspaceMutationsForPlayground;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const fs_1 = require("fs");
exports.EXTENSION_NAMESPACE = "cutie-product";
exports.VIEW_ID = "cutie-product.chat";
exports.API_KEY_SECRET = "cutie-product.apiKey";
exports.REFRESH_TOKEN_SECRET = "cutie-product.refreshToken";
exports.PENDING_PKCE_KEY = "cutie-product.pendingPkce";
function getBaseApiUrl() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("baseApiUrl", "http://localhost:3000");
    return String(configured || "http://localhost:3000").trim().replace(/\/+$/, "");
}
/** Base URL for portable bundle (binary) API; defaults to `getBaseApiUrl()` when unset. */
function getBinaryApiBaseUrl() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("binary.baseApiUrl", "");
    const trimmed = String(configured || "").trim().replace(/\/+$/, "");
    return trimmed || getBaseApiUrl();
}
function getBinaryStreamGatewayUrl() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("binary.streamGatewayUrl", "");
    return String(configured || "").trim().replace(/\/+$/, "");
}
function getBinaryIdeChatRuntime() {
    const raw = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("binary.runtime", "cutie");
    const v = String(raw || "").trim();
    if (v === "cutie" || v === "playgroundApi" || v === "qwenCode" || v === "openCode") {
        return v;
    }
    return "cutie";
}
function getOpenCodeServerUrl() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("opencode.serverUrl", "http://127.0.0.1:4096");
    return String(configured || "http://127.0.0.1:4096").trim().replace(/\/+$/, "");
}
function getOpenCodeAutoStart() {
    return vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("opencode.autoStart", true) === true;
}
function getOpenCodeModel() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("opencode.model", getModelHint());
    return String(configured || getModelHint()).trim();
}
function getOpenCodeConfigPath() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("opencode.configPath", "opencode.json");
    return String(configured || "opencode.json").trim();
}
function getQwenModel() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("binary.qwen.model", "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest");
    return String(configured || "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest").trim();
}
function getQwenOpenAiBaseUrl() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("binary.qwen.baseUrl", `${getBaseApiUrl()}/api/v1/hf`);
    const value = String(configured || `${getBaseApiUrl()}/api/v1/hf`).trim();
    return value.replace(/\/+$/, "");
}
function getQwenExecutablePath() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("binary.qwen.executable", "");
    const value = String(configured || "").trim();
    if (!value)
        return undefined;
    const lower = value.toLowerCase();
    if (lower.includes(".trae/extensions/") ||
        lower.includes("cutie-product.cutie-product-") ||
        lower.includes("@qwen-code/sdk/dist/cli/cli.js")) {
        return undefined;
    }
    return value;
}
function getQwenCliWrapperEnabled() {
    return vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("binary.qwen.cliWrapper", false) === true;
}
function getQwenCliWrapperPath() {
    const wrapperPath = path.join(__dirname, "..", "scripts", "qwen-cli-wrapper.js");
    return (0, fs_1.existsSync)(wrapperPath) ? path.resolve(wrapperPath) : undefined;
}
function normalizeWorkspaceRelativePath(input) {
    const normalized = String(input || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^@+/, "")
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "");
    if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized))
        return null;
    return normalized;
}
function toAbsoluteWorkspacePath(relativePath) {
    const root = getWorkspaceRootPath();
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    if (!root || !normalized)
        return null;
    return path.join(root, normalized);
}
function getProjectKey() {
    const folder = getWorkspaceFolder();
    if (!folder)
        return null;
    return `${folder.name}:${getWorkspaceHash()}`;
}
const DEFAULT_CUTIE_CHAT_MODEL = "moonshotai/Kimi-K2.5:fastest";
function getModelHint() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("model", DEFAULT_CUTIE_CHAT_MODEL);
    return String(configured || DEFAULT_CUTIE_CHAT_MODEL).trim();
}
function getPromptMarkdownPath() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("promptMarkdownPath", "docs/cutie-agent-operating-prompt.md");
    return String(configured || "").trim();
}
/** Presets for the chat model dropdown; the configured workspace model is always included. Add ids here as you ship more. */
const MODEL_PICKER_PRESETS = [
    DEFAULT_CUTIE_CHAT_MODEL,
    "openai/gpt-oss-120b:groq",
    "Qwen/Qwen2.5-Coder-32B-Instruct:fastest",
    "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest",
];
function getModelPickerOptions() {
    return Array.from(new Set([getModelHint(), ...MODEL_PICKER_PRESETS])).sort((a, b) => a.localeCompare(b));
}
exports.CUTIE_REASONING_LEVELS = ["Low", "Medium", "High", "Extra High"];
function getReasoningLevel() {
    const raw = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("reasoningLevel", "Medium");
    const s = String(raw || "").trim();
    return exports.CUTIE_REASONING_LEVELS.includes(s) ? s : "Medium";
}
function getExperimentalDesktopAdaptersEnabled() {
    return vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("experimentalDesktopAdapters", false) === true;
}
function getWorkspaceFolder() {
    return vscode.workspace.workspaceFolders?.[0] ?? null;
}
function getWorkspaceRootPath() {
    return getWorkspaceFolder()?.uri.fsPath ?? null;
}
function getWorkspaceHash() {
    const root = getWorkspaceRootPath();
    if (!root)
        return "no-workspace";
    return (0, crypto_1.createHash)("sha1").update(root, "utf8").digest("hex");
}
function toWorkspaceRelativePath(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder)
        return null;
    return path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
}
function getExtensionVersion(context) {
    return String(context.extension.packageJSON.version || "0.0.0");
}
/** Sent on playground assist so the server tool loop matches Cutie workspace settings. */
function getMaxToolStepsForPlayground() {
    const cfg = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE);
    return Math.max(8, Math.min(128, cfg.get("maxToolSteps", 18)));
}
function getMaxWorkspaceMutationsForPlayground() {
    const cfg = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE);
    return Math.max(2, Math.min(64, cfg.get("maxWorkspaceMutations", 8)));
}
//# sourceMappingURL=config.js.map