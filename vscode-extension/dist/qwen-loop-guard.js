"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsGenericProjectClarification = containsGenericProjectClarification;
exports.buildProjectLoopRecoveryMessage = buildProjectLoopRecoveryMessage;
const assistant_ux_1 = require("./assistant-ux");
function normalizeLoopText(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function formatTargets(targets) {
    return Array.from(new Set((targets || [])
        .map((target) => String(target || "").trim())
        .filter(Boolean))).slice(0, 2);
}
function containsGenericProjectClarification(text) {
    const normalized = normalizeLoopText(text);
    if (!normalized)
        return false;
    return (normalized.includes("could you clarify what you'd like me to help with regarding the") ||
        normalized.includes("if you're looking for help with the") ||
        normalized.includes("within the project scope") ||
        (normalized.includes("need assistance with any code changes") &&
            normalized.includes("project")) ||
        (normalized.includes("what you'd like me to help with") &&
            normalized.includes("project")));
}
function buildProjectLoopRecoveryMessage(input) {
    const intent = (0, assistant_ux_1.classifyIntent)(input.task);
    const targets = formatTargets(input.workspaceTargets);
    if (intent === "change" && targets.length) {
        return `I can work directly in ${targets[0]}. If that's the right place for this change, I can patch it there instead of bouncing back to project-level clarification.`;
    }
    if (intent === "explain" && targets.length) {
        return `I can stay focused on ${targets[0]} and expand on it directly instead of stepping back to a generic project question.`;
    }
    if (intent === "find" && targets.length) {
        return `I can search from ${targets[0]} and the surrounding workspace context instead of asking a broad project-scope question.`;
    }
    if (targets.length === 1) {
        return `I can stay grounded in ${targets[0]} instead of falling back to a generic project-scope clarification.`;
    }
    if (targets.length > 1) {
        return `I can stay grounded in ${targets.join(" and ")} instead of falling back to a generic project-scope clarification.`;
    }
    const workspaceRoot = String(input.workspaceRoot || "").trim();
    return workspaceRoot
        ? `I can stay grounded in the workspace at ${workspaceRoot} instead of falling back to a generic project-scope clarification.`
        : "I can stay grounded in the current workspace instead of falling back to a generic project-scope clarification.";
}
//# sourceMappingURL=qwen-loop-guard.js.map