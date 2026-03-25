import type { BinaryBuildEvent, BinaryBuildRecord } from "./binary-types";
import type {
  CutieBinaryControlActionEntry,
  CutieBinaryControlActionName,
  CutieBinaryControlActionResult,
  CutieBinaryDebugSnapshot,
  CutieBinaryEventTimelineEntry,
} from "./cutie-debug-report";

const MAX_CONTROL_ACTIONS = 50;
const MAX_EVENT_TIMELINE = 200;

function cloneSnapshot(snapshot: CutieBinaryDebugSnapshot): CutieBinaryDebugSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as CutieBinaryDebugSnapshot;
}

function trimList<T>(items: T[], max: number): T[] {
  return items.length <= max ? items : items.slice(items.length - max);
}

function latestLogFromBuild(build: BinaryBuildRecord | null | undefined): string | null {
  if (!build) return null;
  const previewLogs = build.preview?.recentLogs || [];
  if (previewLogs.length) return previewLogs[previewLogs.length - 1] || null;
  return build.logs.length ? build.logs[build.logs.length - 1] || null : null;
}

export function summarizeBinaryBuildEvent(event: BinaryBuildEvent): CutieBinaryEventTimelineEntry {
  switch (event.type) {
    case "build.created":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || null,
        progress: event.data.build.progress ?? null,
        summary: `Build ${event.data.build.id} created.`,
        latestLog: latestLogFromBuild(event.data.build),
      };
    case "phase.changed":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.phase,
        progress: event.data.progress ?? null,
        summary: event.data.message || `Phase changed to ${event.data.phase}.`,
        latestLog: event.data.message || null,
      };
    case "generation.delta":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `Generated ${event.data.delta.path}.`,
        latestFile: event.data.delta.path,
      };
    case "file.updated":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `Updated preview file ${event.data.path}.`,
        latestFile: event.data.path,
      };
    case "log.chunk":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: null,
        progress: null,
        summary: `Received ${event.data.stream} log chunk.`,
        latestLog: String(event.data.chunk || "").trim() || null,
      };
    case "token.delta":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: null,
        progress: null,
        summary: "Received streaming token delta.",
        latestLog: event.data.text || null,
      };
    case "checkpoint.saved":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.checkpoint.phase,
        progress: null,
        summary: `Saved checkpoint ${event.data.checkpoint.id}.`,
        latestFile: event.data.checkpoint.preview?.files?.[0]?.path || null,
        latestLog: event.data.checkpoint.preview?.recentLogs?.slice(-1)[0] || null,
      };
    case "snapshot.saved":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.snapshot.phase,
        progress: null,
        summary: `Saved snapshot ${event.data.snapshot.id}.`,
        latestFile: event.data.snapshot.checkpointId,
      };
    case "artifact.ready":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "packaging",
        progress: null,
        summary: `Artifact ${event.data.artifact.fileName} is ready.`,
        latestFile: event.data.artifact.relativePath,
      };
    case "build.completed":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || "completed",
        progress: event.data.build.progress ?? 100,
        summary: `Build ${event.data.build.id} completed.`,
        latestLog: latestLogFromBuild(event.data.build),
      };
    case "build.failed":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || "failed",
        progress: event.data.build.progress ?? null,
        summary: event.data.errorMessage || `Build ${event.data.build.id} failed.`,
        latestLog: latestLogFromBuild(event.data.build),
      };
    case "build.canceled":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || "canceled",
        progress: event.data.build.progress ?? null,
        summary: event.data.reason || `Build ${event.data.build.id} was canceled.`,
        latestLog: latestLogFromBuild(event.data.build),
      };
    case "execution.updated":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "validating",
        progress: null,
        summary: `Execution status: ${event.data.execution.lastRun?.status || "updated"}.`,
        latestLog: event.data.execution.lastRun?.logs?.slice(-1)[0] || null,
      };
    case "runtime.state":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "validating",
        progress: null,
        summary: `Runtime engine: ${event.data.runtime.engine}.`,
      };
    case "patch.applied":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "validating",
        progress: null,
        summary: event.data.patch.description,
        latestFile: event.data.patch.modulePath,
      };
    case "reliability.delta":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "validating",
        progress: null,
        summary: `Reliability ${event.data.report.status} (${event.data.kind}).`,
      };
    case "reliability.stream":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "validating",
        progress: null,
        summary: `Live reliability score ${event.data.reliability.score}.`,
      };
    case "graph.updated":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `Source graph updated (${event.data.sourceGraph.readyModules}/${event.data.sourceGraph.totalModules} modules ready).`,
        latestFile: event.data.sourceGraph.modules[0]?.path || null,
      };
    case "ast.delta":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `AST delta updated (${event.data.delta.modulesTouched.length} modules touched).`,
        latestFile: event.data.delta.modulesTouched[0] || null,
      };
    case "ast.state":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `AST state coverage ${event.data.astState.coverage}.`,
        latestFile: event.data.astState.modules[0]?.path || null,
      };
    case "artifact.delta":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "materializing",
        progress: null,
        summary: `Artifact coverage ${event.data.artifactState.coverage}.`,
        latestFile: event.data.artifactState.latestFile || null,
      };
    case "interrupt.accepted":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: null,
        progress: null,
        summary: event.data.message || `Interrupt accepted: ${event.data.action}.`,
      };
    case "branch.created":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || null,
        progress: event.data.build.progress ?? null,
        summary: `Branch build ${event.data.build.id} created from ${event.data.sourceBuildId}.`,
      };
    case "rewind.completed":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.build.phase || null,
        progress: event.data.build.progress ?? null,
        summary: `Rewind completed to checkpoint ${event.data.checkpointId}.`,
      };
    case "plan.updated":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: "planning",
        progress: null,
        summary: `Plan updated for ${event.data.plan.displayName || event.data.plan.name}.`,
      };
    case "heartbeat":
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.data.phase || null,
        progress: event.data.progress ?? null,
        summary: "Heartbeat received.",
      };
    default:
      const fallbackEvent = event as BinaryBuildEvent;
      return {
        id: fallbackEvent.id,
        timestamp: fallbackEvent.timestamp,
        type: fallbackEvent.type,
        phase: null,
        progress: null,
        summary: `Event ${fallbackEvent.type} received.`,
      };
  }
}

export class CutieBinaryDebugTracker {
  private snapshot: CutieBinaryDebugSnapshot = {
    streamLifecycle: {
      lastCreateAttempt: null,
      lastResumeAttempt: null,
      chosenTransport: null,
      cursorUsed: null,
      cursorPersisted: null,
      connectedAt: null,
      disconnectedAt: null,
      lastFallbackToPollingReason: null,
      lastStreamError: null,
    },
    controlActions: [],
    eventTimeline: [],
    eventTypeCounts: {},
    duplicateEventCount: 0,
    resumeCount: 0,
    pollFallbackCount: 0,
  };

  getSnapshot(): CutieBinaryDebugSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  noteStreamAttempt(input: { kind: "create" | "resume"; buildId?: string | null; cursorUsed?: string | null }): void {
    const attempt = {
      kind: input.kind,
      startedAt: new Date().toISOString(),
      buildId: input.buildId || null,
      cursorUsed: input.cursorUsed || null,
    };
    this.snapshot.streamLifecycle.cursorUsed = input.cursorUsed || null;
    if (input.kind === "create") {
      this.snapshot.streamLifecycle.lastCreateAttempt = attempt;
      return;
    }
    this.snapshot.streamLifecycle.lastResumeAttempt = attempt;
    this.snapshot.resumeCount += 1;
  }

  noteChosenTransport(transport: "sse" | "websocket" | null | undefined): void {
    this.snapshot.streamLifecycle.chosenTransport = transport || null;
  }

  noteStreamConnected(): void {
    if (!this.snapshot.streamLifecycle.connectedAt) {
      this.snapshot.streamLifecycle.connectedAt = new Date().toISOString();
    }
    this.snapshot.streamLifecycle.disconnectedAt = null;
  }

  noteStreamDisconnected(): void {
    this.snapshot.streamLifecycle.disconnectedAt = new Date().toISOString();
  }

  noteStreamError(message: string): void {
    this.snapshot.streamLifecycle.lastStreamError = message;
  }

  noteFallbackToPolling(reason: string): void {
    this.snapshot.pollFallbackCount += 1;
    this.snapshot.streamLifecycle.lastFallbackToPollingReason = reason;
  }

  noteCursorPersisted(cursor: string | null): void {
    this.snapshot.streamLifecycle.cursorPersisted = cursor || null;
  }

  noteDuplicateEvent(): void {
    this.snapshot.duplicateEventCount += 1;
  }

  noteControlAction(
    action: CutieBinaryControlActionName,
    result: CutieBinaryControlActionResult,
    input?: { buildId?: string | null; message?: string | null }
  ): void {
    const entry: CutieBinaryControlActionEntry = {
      action,
      timestamp: new Date().toISOString(),
      result,
      buildId: input?.buildId || null,
      message: input?.message || null,
    };
    this.snapshot.controlActions = trimList([...this.snapshot.controlActions, entry], MAX_CONTROL_ACTIONS);
  }

  noteBuildRecord(build: BinaryBuildRecord | null | undefined): void {
    if (!build?.stream) return;
    this.noteChosenTransport(build.stream.transport);
    this.noteCursorPersisted(build.stream.lastEventId || this.snapshot.streamLifecycle.cursorPersisted || null);
  }

  noteEvent(event: BinaryBuildEvent): void {
    this.snapshot.eventTypeCounts[event.type] = (this.snapshot.eventTypeCounts[event.type] || 0) + 1;
    this.snapshot.eventTimeline = trimList(
      [...this.snapshot.eventTimeline, summarizeBinaryBuildEvent(event)],
      MAX_EVENT_TIMELINE
    );
  }
}
