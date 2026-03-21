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
exports.CUTIE_DIFF_BEFORE_SCHEME = void 0;
exports.createCutieBeforeUri = createCutieBeforeUri;
exports.rememberMutationBefore = rememberMutationBefore;
exports.takeLastMutationBefore = takeLastMutationBefore;
exports.registerCutieDiffBeforeProvider = registerCutieDiffBeforeProvider;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
exports.CUTIE_DIFF_BEFORE_SCHEME = "cutie-diff-before";
const virtualStash = new Map();
const MAX_VIRTUAL_STASH = 40;
/** Last "before" snapshot per relative path for reopening diff from the chat card. */
const lastBeforeByPath = new Map();
const MAX_PATH_MEMORY = 48;
function trimPathKey(relativePath) {
    return String(relativePath || "")
        .trim()
        .replace(/\\/g, "/");
}
function pruneVirtualStash() {
    while (virtualStash.size > MAX_VIRTUAL_STASH) {
        const first = virtualStash.keys().next().value;
        if (!first)
            break;
        virtualStash.delete(first);
    }
}
function prunePathMemory() {
    while (lastBeforeByPath.size > MAX_PATH_MEMORY) {
        const first = lastBeforeByPath.keys().next().value;
        if (!first)
            break;
        lastBeforeByPath.delete(first);
    }
}
/**
 * Virtual URI whose text is served from memory (classic diff left pane).
 */
function createCutieBeforeUri(previousContent) {
    pruneVirtualStash();
    const id = (0, crypto_1.randomBytes)(14).toString("hex");
    virtualStash.set(id, previousContent);
    return vscode.Uri.from({ scheme: exports.CUTIE_DIFF_BEFORE_SCHEME, path: `/${id}` });
}
function rememberMutationBefore(relativePath, previousContent) {
    const key = trimPathKey(relativePath);
    if (!key)
        return;
    lastBeforeByPath.set(key, previousContent);
    prunePathMemory();
}
function takeLastMutationBefore(relativePath) {
    const key = trimPathKey(relativePath);
    if (!key)
        return undefined;
    return lastBeforeByPath.get(key);
}
function registerCutieDiffBeforeProvider(context) {
    const provider = {
        provideTextDocumentContent(uri) {
            const id = uri.path.replace(/^\//, "");
            return virtualStash.get(id) ?? "";
        },
    };
    const registration = vscode.workspace.registerTextDocumentContentProvider(exports.CUTIE_DIFF_BEFORE_SCHEME, provider);
    context.subscriptions.push(registration);
    return registration;
}
//# sourceMappingURL=cutie-diff.js.map