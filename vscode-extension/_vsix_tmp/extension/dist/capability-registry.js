"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaygroundCapabilityRegistry = void 0;
exports.capabilityRecordToMarkdown = capabilityRecordToMarkdown;
class PlaygroundCapabilityRegistry {
    constructor(operations) {
        this.operations = operations;
    }
    collectContext(query) {
        return this.operations.collectContext(query);
    }
    queryIndex(query, limit) {
        return this.operations.queryIndex(query, limit);
    }
    applyPatch(path, patch) {
        return this.operations.applyPatch(path, patch);
    }
    writeFile(path, content, overwrite) {
        return this.operations.writeFile(path, content, overwrite);
    }
    runValidation(path) {
        return this.operations.runValidation(path);
    }
    createCheckpoint(input) {
        return this.operations.createCheckpoint(input);
    }
    undoCheckpoint(checkpointId) {
        return this.operations.undoCheckpoint(checkpointId);
    }
    openReview(input) {
        return this.operations.openReview(input);
    }
    resumeRun(runId) {
        return this.operations.resumeRun(runId);
    }
}
exports.PlaygroundCapabilityRegistry = PlaygroundCapabilityRegistry;
function capabilityRecordToMarkdown(title, payload) {
    const body = typeof payload === "string"
        ? payload
        : JSON.stringify(payload, null, 2);
    return `### ${title}\n\n\`\`\`json\n${body}\n\`\`\``;
}
//# sourceMappingURL=capability-registry.js.map