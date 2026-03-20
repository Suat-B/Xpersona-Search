"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostedSessionHistoryService = void 0;
const crypto_1 = require("crypto");
const http_1 = require("./http");
class HostedSessionHistoryService {
    constructor(getBaseApiUrl, fallbackMode) {
        this.getBaseApiUrl = getBaseApiUrl;
        this.fallbackMode = fallbackMode;
    }
    async list(auth, limit = 30) {
        const response = await (0, http_1.requestJson)("GET", `${this.getBaseApiUrl()}/api/v1/playground/sessions?limit=${Math.max(1, Math.min(limit, 100))}`, auth);
        return (response?.data || [])
            .filter((item) => Boolean(item?.id))
            .map((item) => ({
            id: String(item.id),
            title: String(item.title || "Untitled chat"),
            mode: (item.mode || this.fallbackMode),
            updatedAt: item.updatedAt || item.updated_at || null,
        }));
    }
    async loadMessages(auth, sessionId) {
        const rows = await (0, http_1.requestJson)("GET", `${this.getBaseApiUrl()}/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=false`, auth);
        return (rows || [])
            .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
            .reverse()
            .map((row) => ({
            id: String(row.id || (0, crypto_1.randomUUID)()),
            role: row.role,
            content: String(row.content || ""),
        }));
    }
}
exports.HostedSessionHistoryService = HostedSessionHistoryService;
