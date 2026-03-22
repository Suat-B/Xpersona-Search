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
exports.PENDING_PKCE_KEY = exports.REFRESH_TOKEN_SECRET = exports.API_KEY_SECRET = exports.VIEW_ID = exports.EXTENSION_NAMESPACE = void 0;
exports.getBaseApiUrl = getBaseApiUrl;
exports.getBinaryApiBaseUrl = getBinaryApiBaseUrl;
exports.getModelHint = getModelHint;
exports.getExperimentalDesktopAdaptersEnabled = getExperimentalDesktopAdaptersEnabled;
exports.getWorkspaceFolder = getWorkspaceFolder;
exports.getWorkspaceRootPath = getWorkspaceRootPath;
exports.getWorkspaceHash = getWorkspaceHash;
exports.toWorkspaceRelativePath = toWorkspaceRelativePath;
exports.getExtensionVersion = getExtensionVersion;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
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
function getModelHint() {
    const configured = vscode.workspace
        .getConfiguration(exports.EXTENSION_NAMESPACE)
        .get("model", "MiniMaxAI/MiniMax-M2.5:fastest");
    return String(configured || "MiniMaxAI/MiniMax-M2.5:fastest").trim();
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
//# sourceMappingURL=config.js.map