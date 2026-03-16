"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExplicitRuntimeTask = isExplicitRuntimeTask;
exports.isWorkspaceQwenTopic = isWorkspaceQwenTopic;
exports.containsRuntimeNoiseForContext = containsRuntimeNoiseForContext;
function normalizeRuntimeText(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\\/g, "/")
        .toLowerCase();
}
function trimTrailingSlashes(value) {
    return value.replace(/\/+$/g, "");
}
function looksLikePath(value) {
    return /[\\/]/.test(value) || /^[a-z]:/i.test(value);
}
function isPathInsideWorkspace(pathValue, workspaceRoot) {
    const normalizedPath = trimTrailingSlashes(normalizeRuntimeText(pathValue));
    const normalizedWorkspaceRoot = trimTrailingSlashes(normalizeRuntimeText(workspaceRoot));
    if (!normalizedPath || !normalizedWorkspaceRoot)
        return false;
    return (normalizedPath === normalizedWorkspaceRoot ||
        normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`));
}
function hasQuestionIntent(text) {
    return (/\b(why|what|where|how|explain|debug|investigate|inspect|trace|check|used for|is this)\b/.test(text) ||
        text.includes("?"));
}
function hasDirectRuntimeMarker(text) {
    return (text.includes("@qwen-code") ||
        text.includes("cli.js") ||
        text.includes("sdk/dist/cli") ||
        text.includes(".trae") ||
        text.includes("trae/extensions") ||
        text.includes("playgroundai.xpersona-playground") ||
        text.includes("node_modules") ||
        text.includes("base url") ||
        text.includes("api key") ||
        text.includes("auth") ||
        text.includes("endpoint") ||
        text.includes("executable") ||
        text.includes("installation") ||
        text.includes("install path") ||
        text.includes("sdk location") ||
        text.includes("extension runtime") ||
        text.includes("extension directory"));
}
function containsStrongRuntimeNarrativeNoise(text) {
    const normalized = normalizeRuntimeText(text);
    if (!normalized)
        return false;
    const tokens = [
        "qwen code sdk",
        "qwen sdk",
        "qwen code sdk extension",
        "sdk extension",
        "sdk cli executable",
        "cli executable",
        ".trae",
        "trae/extensions",
        "extension directory",
        "extension runtime",
        "sdk installation",
        "qwen installation",
        "installation path",
        "local installation",
        "confirm the installation",
        "sdk's location",
        "sdk location",
        "check where this file is located",
        "troubleshoot an issue related to the sdk",
    ];
    const tokenHits = tokens.reduce((count, token) => (normalized.includes(token) ? count + 1 : count), 0);
    if (tokenHits >= 2)
        return true;
    if (normalized.includes(".trae") && normalized.includes("qwen"))
        return true;
    if (normalized.includes("extension directory") && normalized.includes("qwen"))
        return true;
    if (normalized.includes("windows file path") && normalized.includes("qwen"))
        return true;
    if (normalized.includes("this appears to be the location of") &&
        /\b(qwen|sdk|cli)\b/.test(normalized)) {
        return true;
    }
    if (/\bthe user (might|may|could|seems to|appears to)\b/.test(normalized) &&
        /\b(path|sdk|cli|installation|environment)\b/.test(normalized)) {
        return true;
    }
    if (normalized.includes("since they included this path"))
        return true;
    if (normalized.includes("shared a file path related to") &&
        /\b(qwen|sdk|extension)\b/.test(normalized)) {
        return true;
    }
    if ((normalized.includes("shared a path to") || normalized.includes("provided a path to")) &&
        /\b(qwen|sdk|cli|installation|extension)\b/.test(normalized)) {
        return true;
    }
    if (normalized.includes("i notice you've shared") &&
        /\b(path|qwen|sdk|installation|extension)\b/.test(normalized)) {
        return true;
    }
    if (/\b(qwen|sdk)\b/.test(normalized) && /\binstallation\b/.test(normalized))
        return true;
    if (normalized.includes("check if the sdk is properly installed"))
        return true;
    if (normalized.includes("checking the sdk's location") || normalized.includes("checking the sdk location")) {
        return true;
    }
    return false;
}
function containsSoftRuntimeNarrativeNoise(text) {
    const normalized = normalizeRuntimeText(text);
    if (!normalized)
        return false;
    return (normalized.includes("qwen code runtime") ||
        normalized.includes("qwen runtime") ||
        normalized.includes("qwen code ready") ||
        (normalized.includes("qwen code") &&
            /\b(runtime|model|environment|setup|configuration)\b/.test(normalized)));
}
function isExplicitRuntimeTask(task) {
    const normalized = normalizeRuntimeText(task);
    if (!normalized)
        return false;
    if (hasDirectRuntimeMarker(normalized) && hasQuestionIntent(normalized))
        return true;
    if ((normalized.includes("qwen code") || normalized.includes("qwen sdk") || normalized.includes("@qwen-code")) &&
        hasQuestionIntent(normalized)) {
        return true;
    }
    return false;
}
function isWorkspaceQwenTopic(input) {
    const normalizedTask = normalizeRuntimeText(input.task);
    const targetHasQwen = (input.workspaceTargets || []).some((target) => /qwen/i.test(String(target || "")));
    if (targetHasQwen)
        return true;
    if (!/\bqwen\b/.test(normalizedTask))
        return false;
    return !hasDirectRuntimeMarker(normalizedTask);
}
function containsRuntimeNoiseForContext(input) {
    const normalized = normalizeRuntimeText(input.text);
    if (!normalized)
        return false;
    const executablePathRaw = String(input.executablePath || "").trim();
    const executablePath = normalizeRuntimeText(executablePathRaw);
    if (executablePath &&
        looksLikePath(executablePathRaw) &&
        normalized.includes(executablePath) &&
        !isPathInsideWorkspace(executablePathRaw, input.workspaceRoot)) {
        return true;
    }
    if (normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
        normalized.includes("/.trae/extensions/playgroundai.xpersona-playground") ||
        normalized.includes("playgroundai.xpersona-playground-") ||
        normalized.includes("/node_modules/@qwen-code/sdk/dist/cli/cli.js")) {
        return true;
    }
    if (containsStrongRuntimeNarrativeNoise(input.text)) {
        return true;
    }
    if (containsSoftRuntimeNarrativeNoise(input.text)) {
        return !isWorkspaceQwenTopic({
            task: input.task,
            workspaceTargets: input.workspaceTargets,
        });
    }
    return false;
}
//# sourceMappingURL=qwen-runtime-noise.js.map