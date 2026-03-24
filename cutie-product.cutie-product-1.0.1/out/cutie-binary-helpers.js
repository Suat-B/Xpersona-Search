"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultBinaryPanelState = createDefaultBinaryPanelState;
exports.isBinaryBuildPending = isBinaryBuildPending;
exports.isBinaryTerminalStatus = isBinaryTerminalStatus;
exports.formatBytes = formatBytes;
exports.formatBinaryBuildMessage = formatBinaryBuildMessage;
exports.delay = delay;
exports.isTransientBinaryPollError = isTransientBinaryPollError;
exports.deriveBinaryPhase = deriveBinaryPhase;
exports.phaseProgressLabel = phaseProgressLabel;
exports.liveProgressForPhase = liveProgressForPhase;
function createDefaultBinaryPanelState() {
    return {
        targetEnvironment: {
            runtime: "node18",
            platform: "portable",
            packageManager: "npm",
        },
        activeBuild: null,
        busy: false,
        phase: "queued",
        progress: 0,
        streamConnected: false,
        lastEventId: null,
        previewFiles: [],
        recentLogs: [],
        reliability: null,
        liveReliability: null,
        artifactState: null,
        sourceGraph: null,
        astState: null,
        execution: null,
        runtimeState: null,
        checkpoints: [],
        snapshots: [],
        pendingRefinement: null,
        canCancel: false,
        lastAction: null,
    };
}
function isBinaryBuildPending(build) {
    return Boolean(build && (build.status === "queued" || build.status === "running"));
}
function isBinaryTerminalStatus(status) {
    return status === "completed" || status === "failed" || status === "canceled";
}
function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0)
        return "0 B";
    if (value < 1024)
        return `${value} B`;
    if (value < 1024 * 1024)
        return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function formatBinaryBuildMessage(build) {
    const lines = [
        build.status === "completed"
            ? "Prompt-to-app build ready."
            : build.status === "canceled"
                ? "Prompt-to-app build canceled."
                : build.status === "failed"
                    ? "Prompt-to-app build failed."
                    : build.status === "running"
                        ? "Prompt-to-app build is still cooking."
                        : "Prompt-to-app build is queued on the server.",
        `Build: ${build.id}`,
        `Intent: ${build.intent}`,
        `Target runtime: ${build.targetEnvironment.runtime}`,
    ];
    if (build.reliability) {
        lines.push(`Reliability: ${build.reliability.status.toUpperCase()} (${build.reliability.score}/100)`);
        lines.push(build.reliability.summary);
    }
    if (build.liveReliability) {
        lines.push(`Live reliability: ${build.liveReliability.score}/100 (${build.liveReliability.trend})`);
        if (build.liveReliability.blockers.length) {
            lines.push(`Blockers: ${build.liveReliability.blockers.map((blocker) => blocker.code).join(", ")}`);
        }
    }
    if (build.artifactState) {
        lines.push(`Build coverage: ${build.artifactState.coverage}% live, ${build.artifactState.runnable ? "runnable" : "not runnable yet"}`);
        lines.push(`Files: ${build.artifactState.sourceFilesReady}/${build.artifactState.sourceFilesTotal} source, ${build.artifactState.outputFilesReady} output`);
        if (build.artifactState.entryPoints.length) {
            lines.push(`Entry points: ${build.artifactState.entryPoints.join(", ")}`);
        }
    }
    if (build.sourceGraph) {
        lines.push(`Code map: ${build.sourceGraph.readyModules}/${build.sourceGraph.totalModules} modules, ${build.sourceGraph.coverage}% covered`);
        if (build.sourceGraph.diagnostics.length) {
            lines.push(`Diagnostics: ${build.sourceGraph.diagnostics.length}`);
        }
    }
    if (build.astState) {
        lines.push(`Live structure: ${build.astState.moduleCount} modules, ${build.astState.coverage}% covered`);
    }
    if (build.execution) {
        lines.push(`Live preview runtime: ${build.execution.mode}${build.execution.availableFunctions.length ? ` (${build.execution.availableFunctions.length} callable functions)` : ""}`);
        if (build.execution.lastRun) {
            lines.push(`Last run: ${build.execution.lastRun.entryPoint} -> ${build.execution.lastRun.status.toUpperCase()}`);
        }
    }
    if (build.runtimeState) {
        lines.push(`Hot runtime: ${build.runtimeState.engine}${build.runtimeState.availableFunctions.length ? ` (${build.runtimeState.availableFunctions.length} callable functions)` : ""}`);
        if (build.runtimeState.patches.length) {
            lines.push(`Live patches: ${build.runtimeState.patches.length}`);
        }
    }
    if (build.checkpoints?.length) {
        lines.push(`Save points: ${build.checkpoints.length}`);
    }
    if (build.snapshots?.length) {
        lines.push(`Timeline saves: ${build.snapshots.length}`);
    }
    if (build.pendingRefinement) {
        lines.push(`Pending refinement: ${build.pendingRefinement.intent}`);
    }
    if (build.parentBuildId) {
        lines.push(`Forked from: ${build.parentBuildId}`);
    }
    if (build.artifact) {
        lines.push(`Download build: ${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`);
    }
    if (build.manifest) {
        lines.push(`Launch file: ${build.manifest.entrypoint}`);
        lines.push(`Run command: ${build.manifest.startCommand}`);
    }
    if (build.publish?.downloadUrl) {
        lines.push(`Download: ${build.publish.downloadUrl}`);
    }
    if (build.errorMessage) {
        lines.push(`Error: ${build.errorMessage}`);
    }
    return lines.join("\n");
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isTransientBinaryPollError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /\bHTTP 5\d\d\b/i.test(message) || /\bECONNRESET\b|\bECONNREFUSED\b|\bETIMEDOUT\b/i.test(message);
}
function deriveBinaryPhase(build) {
    if (!build)
        return undefined;
    if (build.phase)
        return build.phase;
    if (build.status === "completed")
        return "completed";
    if (build.status === "failed")
        return "failed";
    if (build.status === "canceled")
        return "canceled";
    return build.status === "running" ? "planning" : "queued";
}
function phaseProgressLabel(phase) {
    switch (phase) {
        case "planning":
            return "Sketching the build";
        case "materializing":
            return "Writing the app";
        case "installing":
            return "Pulling packages";
        case "compiling":
            return "Bundling the app";
        case "validating":
            return "Running a confidence pass";
        case "packaging":
            return "Wrapping the app";
        case "completed":
            return "Prompt-to-app build ready";
        case "failed":
            return "Prompt-to-app build failed";
        case "canceled":
            return "Prompt-to-app build canceled";
        default:
            return "Queued to build";
    }
}
function liveProgressForPhase(phase) {
    switch (phase) {
        case "accepted":
            return 4;
        case "collecting_context":
            return 14;
        case "connecting_runtime":
            return 24;
        case "awaiting_tool_approval":
            return 32;
        case "streaming_answer":
            return 58;
        case "saving_session":
            return 88;
        case "completed":
        case "failed":
        case "canceled":
            return 100;
        default:
            return 8;
    }
}
//# sourceMappingURL=cutie-binary-helpers.js.map