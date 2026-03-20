"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieHistoryService = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
class CutieHistoryService extends vscode_core_1.HostedSessionHistoryService {
    constructor() {
        super(config_1.getBaseApiUrl, "auto");
    }
}
exports.CutieHistoryService = CutieHistoryService;
//# sourceMappingURL=history.js.map