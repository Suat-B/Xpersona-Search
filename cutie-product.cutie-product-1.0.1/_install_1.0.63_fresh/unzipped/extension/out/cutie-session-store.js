"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieSessionStore = void 0;
const cutie_policy_1 = require("./cutie-policy");
const SESSION_STORE_KEY = "cutie-product.sessionStore.v1";
const MAX_SESSIONS_PER_WORKSPACE = 20;
function emptyStore() {
    return {
        version: 1,
        sessionsByWorkspace: {},
    };
}
function cloneSession(session) {
    return JSON.parse(JSON.stringify(session));
}
function deriveTitle(prompt) {
    return (String(prompt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Cutie Session");
}
class CutieSessionStore {
    constructor(context) {
        this.context = context;
    }
    getStore() {
        return this.context.globalState.get(SESSION_STORE_KEY) || emptyStore();
    }
    async saveStore(store) {
        await this.context.globalState.update(SESSION_STORE_KEY, store);
    }
    listSessions(workspaceHash) {
        const sessions = this.getStore().sessionsByWorkspace[workspaceHash] || [];
        return sessions
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((session) => ({
            id: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
            lastStatus: session.runs[session.runs.length - 1]?.status || "idle",
        }));
    }
    getSession(workspaceHash, sessionId) {
        const sessions = this.getStore().sessionsByWorkspace[workspaceHash] || [];
        const session = sessions.find((item) => item.id === sessionId);
        return session ? cloneSession(session) : null;
    }
    async createSession(workspaceHash, initialPrompt) {
        const timestamp = (0, cutie_policy_1.nowIso)();
        const session = {
            id: (0, cutie_policy_1.randomId)("cutie_session"),
            workspaceHash,
            title: deriveTitle(initialPrompt || ""),
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [],
            runs: [],
            snapshots: [],
        };
        await this.saveSession(session);
        return session;
    }
    async saveSession(session) {
        const store = this.getStore();
        const existing = store.sessionsByWorkspace[session.workspaceHash] || [];
        const next = [cloneSession(session), ...existing.filter((item) => item.id !== session.id)]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, MAX_SESSIONS_PER_WORKSPACE);
        store.sessionsByWorkspace[session.workspaceHash] = next;
        await this.saveStore(store);
    }
    async appendMessage(session, message) {
        const next = {
            ...session,
            messages: [
                ...session.messages,
                {
                    id: (0, cutie_policy_1.randomId)("cutie_msg"),
                    createdAt: (0, cutie_policy_1.nowIso)(),
                    ...message,
                },
            ],
            updatedAt: (0, cutie_policy_1.nowIso)(),
        };
        if (message.role === "user" && session.messages.length === 0) {
            next.title = deriveTitle(message.content);
        }
        await this.saveSession(next);
        return next;
    }
    async replaceMessages(session, messages) {
        const next = {
            ...session,
            messages,
            updatedAt: (0, cutie_policy_1.nowIso)(),
        };
        await this.saveSession(next);
        return next;
    }
    async appendRun(session, run) {
        const next = {
            ...session,
            runs: [...session.runs, run],
            updatedAt: (0, cutie_policy_1.nowIso)(),
        };
        await this.saveSession(next);
        return next;
    }
    async updateRun(session, run) {
        const next = {
            ...session,
            runs: [...session.runs.filter((item) => item.id !== run.id), run].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
            updatedAt: (0, cutie_policy_1.nowIso)(),
        };
        await this.saveSession(next);
        return next;
    }
    async attachSnapshot(session, snapshot) {
        const next = {
            ...session,
            snapshots: [snapshot, ...session.snapshots.filter((item) => item.snapshotId !== snapshot.snapshotId)].slice(0, 12),
            updatedAt: (0, cutie_policy_1.nowIso)(),
        };
        await this.saveSession(next);
        return next;
    }
    getLatestRun(session) {
        return session.runs[session.runs.length - 1] || null;
    }
}
exports.CutieSessionStore = CutieSessionStore;
//# sourceMappingURL=cutie-session-store.js.map