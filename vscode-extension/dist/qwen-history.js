"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QwenHistoryService = void 0;
exports.createPendingQwenSessionId = createPendingQwenSessionId;
exports.isPendingQwenSessionId = isPendingQwenSessionId;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const QWEN_HISTORY_KEY_PREFIX = "xpersona.playground.qwen.sessions";
const MAX_SESSIONS = 30;
function normalizeTimestamp(value) {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}
function basename(pathValue) {
    const normalized = String(pathValue || "").replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalized;
}
function normalizeTask(text) {
    return String(text || "")
        .replace(/@[A-Za-z0-9_./-]+/g, "")
        .replace(/[<3]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function deriveTitle(input) {
    const task = normalizeTask(input.text);
    const primaryTarget = basename((input.targets || []).find((target) => String(target || "").trim()) || "");
    let prefix = "";
    if (input.intent === "change") {
        prefix = primaryTarget ? `Change ${primaryTarget}` : "Change request";
    }
    else if (input.intent === "find") {
        prefix = primaryTarget ? `Find in ${primaryTarget}` : "Find request";
    }
    else if (input.intent === "explain") {
        prefix = primaryTarget ? `Explain ${primaryTarget}` : "Explain request";
    }
    if (prefix && task) {
        return `${prefix}: ${task}`.slice(0, 96);
    }
    if (prefix)
        return prefix.slice(0, 96);
    if (task)
        return task.slice(0, 96);
    return primaryTarget ? `Chat about ${primaryTarget}` : "Binary IDE chat";
}
function cloneMessages(messages) {
    return messages.map((message) => ({
        id: String(message.id || (0, crypto_1.randomUUID)()),
        role: message.role,
        content: String(message.content || ""),
    }));
}
function toStoredMode(mode) {
    return mode === "plan" ? "plan" : "auto";
}
function createPendingQwenSessionId() {
    return `pending:${(0, crypto_1.randomUUID)()}`;
}
function isPendingQwenSessionId(sessionId) {
    return String(sessionId || "").trim().toLowerCase().startsWith("pending:");
}
class QwenHistoryService {
    constructor(context) {
        this.context = context;
    }
    async getWorkspaceHints() {
        const sessions = this.readSessions()
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .slice(0, 8);
        const targetSet = new Set();
        const recentTargets = [];
        const recentIntents = [];
        for (const session of sessions) {
            if (session.lastIntent) {
                recentIntents.push(session.lastIntent);
            }
            for (const target of session.lastTargets || []) {
                const normalized = String(target || "").trim();
                const key = normalized.toLowerCase();
                if (!normalized || targetSet.has(key))
                    continue;
                targetSet.add(key);
                recentTargets.push(normalized);
                if (recentTargets.length >= 8)
                    break;
            }
            if (recentTargets.length >= 8)
                break;
        }
        return {
            recentTargets,
            recentIntents,
        };
    }
    async list() {
        const sessions = this.readSessions();
        return sessions
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .map((session) => ({
            id: session.id,
            title: session.title,
            mode: session.mode,
            updatedAt: session.updatedAt,
        }));
    }
    async loadMessages(sessionId) {
        const session = this.readSessions().find((item) => item.id === sessionId);
        return cloneMessages(session?.messages || []);
    }
    async hasSession(sessionId) {
        return this.readSessions().some((item) => item.id === sessionId);
    }
    async replaceSessionId(previousSessionId, nextSessionId) {
        const previousId = String(previousSessionId || "").trim();
        const nextId = String(nextSessionId || "").trim();
        if (!previousId || !nextId || previousId === nextId)
            return;
        const sessions = this.readSessions();
        const previous = sessions.find((item) => item.id === previousId);
        if (!previous)
            return;
        const merged = {
            ...previous,
            id: nextId,
            updatedAt: new Date().toISOString(),
        };
        const updated = sessions.filter((item) => item.id !== previousId && item.id !== nextId);
        updated.unshift(merged);
        await this.context.globalState.update(this.getStorageKey(), updated.slice(0, MAX_SESSIONS));
    }
    async saveConversation(input) {
        const sessions = this.readSessions();
        const nextSession = {
            id: input.sessionId,
            title: deriveTitle({
                text: input.title ||
                    input.messages.find((message) => message.role === "user")?.content ||
                    input.messages[0]?.content ||
                    "",
                intent: input.intent,
                targets: input.targets,
            }),
            mode: toStoredMode(input.mode),
            updatedAt: new Date().toISOString(),
            messages: cloneMessages(input.messages),
            ...(input.targets?.length ? { lastTargets: input.targets.slice(0, 6) } : {}),
            ...(input.intent ? { lastIntent: input.intent } : {}),
        };
        const updated = sessions.filter((item) => item.id !== input.sessionId);
        updated.unshift(nextSession);
        await this.context.globalState.update(this.getStorageKey(), updated.slice(0, MAX_SESSIONS));
    }
    readSessions() {
        const raw = this.context.globalState.get(this.getStorageKey()) || [];
        return raw
            .map((value) => {
            const record = value && typeof value === "object" ? value : null;
            if (!record || typeof record.id !== "string")
                return null;
            const messages = Array.isArray(record.messages)
                ? record.messages
                    .map((message) => {
                    const row = message && typeof message === "object" ? message : null;
                    if (!row || typeof row.content !== "string")
                        return null;
                    const role = row.role === "assistant" || row.role === "system" || row.role === "user"
                        ? row.role
                        : "assistant";
                    return {
                        id: typeof row.id === "string" ? row.id : (0, crypto_1.randomUUID)(),
                        role,
                        content: row.content,
                    };
                })
                    .filter((message) => Boolean(message))
                : [];
            const session = {
                id: record.id,
                title: typeof record.title === "string" && record.title.trim()
                    ? record.title.slice(0, 96)
                    : deriveTitle({
                        text: messages.find((message) => message.role === "user")?.content ||
                            messages[0]?.content ||
                            "",
                        intent: record.lastIntent === "ask" ||
                            record.lastIntent === "explain" ||
                            record.lastIntent === "find" ||
                            record.lastIntent === "change"
                            ? record.lastIntent
                            : undefined,
                        targets: Array.isArray(record.lastTargets)
                            ? record.lastTargets.map((target) => String(target || "")).filter(Boolean).slice(0, 8)
                            : undefined,
                    }),
                mode: record.mode === "plan" ? "plan" : "auto",
                updatedAt: normalizeTimestamp(typeof record.updatedAt === "string" ? record.updatedAt : undefined),
                messages,
                lastTargets: Array.isArray(record.lastTargets)
                    ? record.lastTargets
                        .map((target) => String(target || "").trim())
                        .filter(Boolean)
                        .slice(0, 8)
                    : undefined,
                lastIntent: record.lastIntent === "ask" ||
                    record.lastIntent === "explain" ||
                    record.lastIntent === "find" ||
                    record.lastIntent === "change"
                    ? record.lastIntent
                    : undefined,
            };
            return session;
        })
            .filter((session) => session !== null);
    }
    getStorageKey() {
        return `${QWEN_HISTORY_KEY_PREFIX}:${(0, config_1.getWorkspaceHash)()}`;
    }
}
exports.QwenHistoryService = QwenHistoryService;
//# sourceMappingURL=qwen-history.js.map