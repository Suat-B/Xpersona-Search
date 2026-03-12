"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionHistoryService = void 0;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const api_client_1 = require("./api-client");
class SessionHistoryService {
    async list(auth) {
        const response = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/sessions?limit=30`, auth);
        return (response?.data || [])
            .filter((item) => Boolean(item?.id))
            .map((item) => ({
            id: String(item.id),
            title: String(item.title || "Untitled chat"),
            mode: (item.mode || "auto"),
            updatedAt: item.updatedAt || item.updated_at || null,
        }));
    }
    async loadMessages(auth, sessionId) {
        const rows = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=false`, auth);
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
exports.SessionHistoryService = SessionHistoryService;
//# sourceMappingURL=history.js.map