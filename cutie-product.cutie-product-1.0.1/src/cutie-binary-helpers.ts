import type { BinaryBuildPhase, BinaryBuildRecord, BinaryPanelState } from "./binary-types";

export function createDefaultBinaryPanelState(): BinaryPanelState {
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
    artifactState: null,
    sourceGraph: null,
    execution: null,
    checkpoints: [],
    pendingRefinement: null,
    canCancel: false,
    lastAction: null,
  };
}

export function isBinaryBuildPending(build: BinaryBuildRecord | null | undefined): boolean {
  return Boolean(build && (build.status === "queued" || build.status === "running"));
}

export function isBinaryTerminalStatus(status: BinaryBuildRecord["status"] | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBinaryBuildMessage(build: BinaryBuildRecord): string {
  const lines = [
    build.status === "completed"
      ? "Portable starter bundle ready."
      : build.status === "canceled"
        ? "Portable starter bundle canceled."
        : build.status === "failed"
          ? "Portable starter bundle failed."
          : build.status === "running"
            ? "Portable starter bundle is still building."
            : "Portable starter bundle is queued on the server.",
    `Build: ${build.id}`,
    `Intent: ${build.intent}`,
    `Target runtime: ${build.targetEnvironment.runtime}`,
  ];

  if (build.reliability) {
    lines.push(`Reliability: ${build.reliability.status.toUpperCase()} (${build.reliability.score}/100)`);
    lines.push(build.reliability.summary);
  }
  if (build.artifactState) {
    lines.push(
      `Formation: ${build.artifactState.coverage}% formed, ${build.artifactState.runnable ? "runnable" : "not runnable yet"}`
    );
    lines.push(
      `Files: ${build.artifactState.sourceFilesReady}/${build.artifactState.sourceFilesTotal} source, ${build.artifactState.outputFilesReady} output`
    );
    if (build.artifactState.entryPoints.length) {
      lines.push(`Entry points: ${build.artifactState.entryPoints.join(", ")}`);
    }
  }
  if (build.sourceGraph) {
    lines.push(
      `Source graph: ${build.sourceGraph.readyModules}/${build.sourceGraph.totalModules} modules, ${build.sourceGraph.coverage}% covered`
    );
    if (build.sourceGraph.diagnostics.length) {
      lines.push(`Diagnostics: ${build.sourceGraph.diagnostics.length}`);
    }
  }
  if (build.execution) {
    lines.push(
      `Partial runtime: ${build.execution.mode}${build.execution.availableFunctions.length ? ` (${build.execution.availableFunctions.length} callable functions)` : ""}`
    );
    if (build.execution.lastRun) {
      lines.push(`Last run: ${build.execution.lastRun.entryPoint} -> ${build.execution.lastRun.status.toUpperCase()}`);
    }
  }
  if (build.checkpoints?.length) {
    lines.push(`Checkpoints: ${build.checkpoints.length}`);
  }
  if (build.pendingRefinement) {
    lines.push(`Pending refinement: ${build.pendingRefinement.intent}`);
  }
  if (build.parentBuildId) {
    lines.push(`Parent build: ${build.parentBuildId}`);
  }
  if (build.artifact) {
    lines.push(`Artifact: ${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`);
  }
  if (build.manifest) {
    lines.push(`Entrypoint: ${build.manifest.entrypoint}`);
    lines.push(`Start: ${build.manifest.startCommand}`);
  }
  if (build.publish?.downloadUrl) {
    lines.push(`Download: ${build.publish.downloadUrl}`);
  }
  if (build.errorMessage) {
    lines.push(`Error: ${build.errorMessage}`);
  }
  return lines.join("\n");
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientBinaryPollError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /\bHTTP 5\d\d\b/i.test(message) || /\bECONNRESET\b|\bECONNREFUSED\b|\bETIMEDOUT\b/i.test(message);
}

export function deriveBinaryPhase(build: BinaryBuildRecord | null): BinaryBuildPhase | undefined {
  if (!build) return undefined;
  if (build.phase) return build.phase;
  if (build.status === "completed") return "completed";
  if (build.status === "failed") return "failed";
  if (build.status === "canceled") return "canceled";
  return build.status === "running" ? "planning" : "queued";
}

export function phaseProgressLabel(phase: BinaryBuildPhase | undefined): string {
  switch (phase) {
    case "planning":
      return "Designing bundle plan";
    case "materializing":
      return "Writing source files";
    case "installing":
      return "Installing dependencies";
    case "compiling":
      return "Compiling generated source";
    case "validating":
      return "Scoring reliability";
    case "packaging":
      return "Sealing portable bundle";
    case "completed":
      return "Portable starter bundle ready";
    case "failed":
      return "Portable starter bundle failed";
    case "canceled":
      return "Portable starter bundle canceled";
    default:
      return "Queued for build";
  }
}

export function liveProgressForPhase(phase: string): number {
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
