"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionHistoryService = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const pg_config_1 = require("./pg-config");
class SessionHistoryService {
    constructor() {
        this.hosted = new vscode_core_1.HostedSessionHistoryService(pg_config_1.getBaseApiUrl, "auto");
    }
    async list(auth) {
        return this.hosted.list(auth);
    }
    async loadMessages(auth, sessionId) {
        return this.hosted.loadMessages(auth, sessionId);
    }
}
exports.SessionHistoryService = SessionHistoryService;
//# sourceMappingURL=history.js.map