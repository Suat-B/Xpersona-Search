"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QwenHistoryService = void 0;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const QWEN_HISTORY_KEY_PREFIX = "xpersona.playground.qwen.sessions";
const MAX_SESSIONS = 30;
function normalizeTimestamp(value) {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}
function deriveTitle(text) {
    return (String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Qwen Code chat");
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
class QwenHistoryService {
    constructor(context) {
        this.context = context;
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
    async saveConversation(input) {
        const sessions = this.readSessions();
        const nextSession = {
            id: input.sessionId,
            title: deriveTitle(input.title ||
                input.messages.find((message) => message.role === "user")?.content ||
                input.messages[0]?.content ||
                ""),
            mode: toStoredMode(input.mode),
            updatedAt: new Date().toISOString(),
            messages: cloneMessages(input.messages),
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
            return {
                id: record.id,
                title: deriveTitle(typeof record.title === "string" ? record.title : ""),
                mode: record.mode === "plan" ? "plan" : "auto",
                updatedAt: normalizeTimestamp(typeof record.updatedAt === "string" ? record.updatedAt : undefined),
                messages,
            };
        })
            .filter((session) => Boolean(session));
    }
    getStorageKey() {
        return `${QWEN_HISTORY_KEY_PREFIX}:${(0, config_1.getWorkspaceHash)()}`;
    }
}
exports.QwenHistoryService = QwenHistoryService;
//# sourceMappingURL=qwen-history.js.map