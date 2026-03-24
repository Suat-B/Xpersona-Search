"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftStore = void 0;
exports.buildDraftKey = buildDraftKey;
const DRAFT_STORE_KEY = "xpersona.playground.drafts";
function normalizeDraftText(value) {
    return String(value || "").replace(/\r\n/g, "\n");
}
function readDraftMap(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const entries = Object.entries(raw)
        .map(([key, value]) => [String(key || "").trim(), normalizeDraftText(String(value || ""))])
        .filter(([key, value]) => Boolean(key) && Boolean(value.trim()));
    return Object.fromEntries(entries);
}
function buildDraftKey(runtime, sessionId) {
    const bucket = String(sessionId || "").trim() || "__new__";
    return `${runtime}:${bucket}`;
}
class DraftStore {
    constructor(storage) {
        this.storage = storage;
    }
    async get(runtime, sessionId) {
        const drafts = readDraftMap(this.storage.get(DRAFT_STORE_KEY));
        return drafts[buildDraftKey(runtime, sessionId)] || "";
    }
    async set(runtime, sessionId, text) {
        const drafts = readDraftMap(this.storage.get(DRAFT_STORE_KEY));
        const key = buildDraftKey(runtime, sessionId);
        const normalized = normalizeDraftText(text);
        if (!normalized.trim()) {
            delete drafts[key];
        }
        else {
            drafts[key] = normalized;
        }
        await this.storage.update(DRAFT_STORE_KEY, drafts);
    }
}
exports.DraftStore = DraftStore;
//# sourceMappingURL=draft-store.js.map