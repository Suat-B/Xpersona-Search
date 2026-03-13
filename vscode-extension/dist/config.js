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
exports.PENDING_PKCE_KEY = exports.INDEX_STATE_KEY = exports.MODE_KEY = exports.REFRESH_TOKEN_SECRET = exports.API_KEY_LEGACY_SECRET = exports.API_KEY_SECRET = exports.WEBVIEW_VIEW_ID = exports.EXTENSION_NAMESPACE = void 0;
exports.getBaseApiUrl = getBaseApiUrl;
exports.getRuntimeBackend = getRuntimeBackend;
exports.getQwenModel = getQwenModel;
exports.getQwenOpenAiBaseUrl = getQwenOpenAiBaseUrl;
exports.getQwenExecutablePath = getQwenExecutablePath;
exports.getWorkspaceFolder = getWorkspaceFolder;
exports.getWorkspaceRootPath = getWorkspaceRootPath;
exports.getWorkspaceHash = getWorkspaceHash;
exports.getProjectKey = getProjectKey;
exports.normalizeWorkspaceRelativePath = normalizeWorkspaceRelativePath;
exports.toWorkspaceRelativePath = toWorkspaceRelativePath;
exports.toAbsoluteWorkspacePath = toAbsoluteWorkspacePath;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
exports.EXTENSION_NAMESPACE = "xpersona.playground";
exports.WEBVIEW_VIEW_ID = "xpersona.playgroundView";
exports.API_KEY_SECRET = "xpersona.apiKey";
exports.API_KEY_LEGACY_SECRET = "xpersona.playground.apiKey";
exports.REFRESH_TOKEN_SECRET = "xpersona.playground.vscodeRefreshToken";
exports.MODE_KEY = "xpersona.playground.mode";
exports.INDEX_STATE_KEY = "xpersona.playground.indexState";
exports.PENDING_PKCE_KEY = "xpersona.playground.pendingPkce";
function getBaseApiUrl() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("baseApiUrl");
    const value = String(configured || "http://localhost:3000").trim();
    return value.replace(/\/+$/, "");
}
function getRuntimeBackend() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("runtime");
    return configured === "playgroundApi" ? "playgroundApi" : "qwenCode";
}
function getQwenModel() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("qwen.model");
    return String(configured || "Qwen/Qwen3-4B-Thinking-2507:nscale").trim();
}
function getQwenOpenAiBaseUrl() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("qwen.baseUrl");
    const value = String(configured || `${getBaseApiUrl()}/api/v1/hf`).trim();
    return value.replace(/\/+$/, "");
}
function getQwenExecutablePath() {
    const configured = vscode.workspace.getConfiguration(exports.EXTENSION_NAMESPACE).get("qwen.executable");
    const value = String(configured || "").trim();
    return value || undefined;
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
function getProjectKey() {
    const folder = getWorkspaceFolder();
    if (!folder)
        return null;
    return `${folder.name}:${getWorkspaceHash()}`;
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
function toWorkspaceRelativePath(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder)
        return null;
    return normalizeWorkspaceRelativePath(path.relative(folder.uri.fsPath, uri.fsPath));
}
function toAbsoluteWorkspacePath(relativePath) {
    const root = getWorkspaceRootPath();
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    if (!root || !normalized)
        return null;
    return path.join(root, normalized);
}
//# sourceMappingURL=config.js.map