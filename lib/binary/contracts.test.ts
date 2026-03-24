import { describe, expect, it } from "vitest";
import {
  zBinaryBuildRequest,
  zBinaryBuildEvent,
  zBinaryBuildRecord,
  zBinaryControlRequest,
  zBinaryExecuteRequest,
  zBinaryPublishRequest,
  zBinaryValidateRequest,
} from "@/lib/binary/contracts";

describe("binary contracts", () => {
  it("accepts a portable package-bundle build request", () => {
    const parsed = zBinaryBuildRequest.parse({
      intent: "Generate a payment webhook package bundle with health checks",
      workspaceFingerprint: "workspace-123",
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
      context: {
        activeFile: {
          path: "app/api/payments/route.ts",
        },
      },
      retrievalHints: {
        mentionedPaths: ["app/api/payments/route.ts"],
      },
    });

    expect(parsed.targetEnvironment.runtime).toBe("node18");
    expect(parsed.targetEnvironment.platform).toBe("portable");
    expect(parsed.targetEnvironment.packageManager).toBe("npm");
  });

  it("accepts validate and publish payloads", () => {
    expect(
      zBinaryValidateRequest.parse({
        targetEnvironment: {
          runtime: "node20",
          platform: "portable",
          packageManager: "npm",
        },
      }).targetEnvironment?.runtime
    ).toBe("node20");

    expect(zBinaryPublishRequest.parse({ expiresInSeconds: 3600 }).expiresInSeconds).toBe(3600);
  });

  it("accepts a completed binary build record", () => {
    const parsed = zBinaryBuildRecord.parse({
      id: "bin_123",
      userId: "user_123",
      historySessionId: null,
      runId: "run_123",
      workflow: "binary_generate",
      artifactKind: "package_bundle",
      status: "completed",
      intent: "Generate a package bundle",
      workspaceFingerprint: "workspace-123",
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
      logs: ["queued", "completed"],
      phase: "completed",
      progress: 100,
      stream: {
        enabled: true,
        transport: "websocket",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/bin_123/events",
        controlPath: "/api/v1/binary/builds/bin_123/control",
        wsPath: "ws://localhost:4010/ws/stream_bin_123",
        resumeToken: "resume_bin_123_abc123",
        streamSessionId: "stream_bin_123",
        lastEventId: "evt_123",
      },
      preview: {
        plan: {
          name: "binary-package",
          displayName: "Binary Package",
          description: "A portable package bundle",
          entrypoint: "dist/index.js",
          buildCommand: "npm run build",
          startCommand: "npm start",
          sourceFiles: ["package.json", "src/index.ts"],
          warnings: [],
        },
        files: [
          {
            path: "src/index.ts",
            language: "typescript",
            preview: 'console.log("ready");',
            hash: "deadbeef",
            completed: true,
            updatedAt: new Date().toISOString(),
          },
        ],
        recentLogs: ["build completed"],
      },
      cancelable: false,
      manifest: {
        buildId: "bin_123",
        artifactKind: "package_bundle",
        name: "binary-package",
        displayName: "Binary Package",
        description: "A portable package bundle",
        intent: "Generate a package bundle",
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
        entrypoint: "dist/index.js",
        installCommand: "npm install",
        buildCommand: "npm run build",
        startCommand: "npm start",
        sourceFiles: ["package.json", "src/index.ts"],
        outputFiles: ["dist/index.js"],
        warnings: [],
        createdAt: new Date().toISOString(),
      },
      reliability: {
        status: "pass",
        score: 100,
        summary: "All checks passed.",
        targetEnvironment: {
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
        },
        issues: [],
        warnings: [],
        generatedAt: new Date().toISOString(),
      },
      liveReliability: {
        score: 100,
        trend: "steady",
        warnings: [],
        blockers: [],
        resolvedBlockers: [],
        updatedAt: new Date().toISOString(),
      },
      artifactState: {
        coverage: 100,
        runnable: true,
        sourceFilesTotal: 2,
        sourceFilesReady: 2,
        outputFilesReady: 1,
        entryPoints: ["dist/index.js"],
        latestFile: "bin_123.zip",
        updatedAt: new Date().toISOString(),
      },
      astState: {
        coverage: 100,
        moduleCount: 2,
        modules: [
          {
            path: "src/index.ts",
            language: "typescript",
            exportedSymbols: ["health"],
            callableFunctions: ["health"],
            completed: true,
            nodeCount: 12,
          },
        ],
        nodes: [],
        updatedAt: new Date().toISOString(),
      },
      runtimeState: {
        runnable: true,
        engine: "native",
        availableFunctions: [
          {
            name: "health",
            sourcePath: "src/index.ts",
            mode: "native",
            callable: true,
            signature: "health()",
          },
        ],
        patches: [],
        updatedAt: new Date().toISOString(),
      },
      artifact: {
        fileName: "bin_123.zip",
        relativePath: "artifacts/binary-builds/bin_123/bin_123.zip",
        sizeBytes: 1024,
        sha256: "deadbeef",
      },
      snapshots: [
        {
          id: "chk_completed_abc123",
          checkpointId: "chk_completed_abc123",
          phase: "completed",
          label: "Completed",
          parentSnapshotId: null,
          source: "compat",
          savedAt: new Date().toISOString(),
        },
      ],
      publish: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.artifactKind).toBe("package_bundle");
    expect(parsed.workflow).toBe("binary_generate");
  });

  it("accepts streaming events and control requests", () => {
    expect(zBinaryControlRequest.parse({ action: "cancel" }).action).toBe("cancel");
    expect(zBinaryControlRequest.parse({ action: "refine", intent: "Add a new API route" }).action).toBe("refine");
    expect(
      zBinaryControlRequest.parse({ action: "branch", checkpointId: "chk_123", intent: "Try a webhook variant" }).action
    ).toBe("branch");
    expect(zBinaryControlRequest.parse({ action: "rewind", checkpointId: "chk_123" }).action).toBe("rewind");
    expect(zBinaryExecuteRequest.parse({ entryPoint: "health" }).entryPoint).toBe("health");

    const parsed = zBinaryBuildEvent.parse({
      id: "evt_123",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "reliability.delta",
      data: {
        kind: "prebuild",
        report: {
          status: "warn",
          score: 84,
          summary: "Pre-build reliability snapshot found 1 advisory issue.",
          targetEnvironment: {
            runtime: "node18",
            platform: "portable",
            packageManager: "npm",
          },
          issues: [
            {
              code: "missing_lockfile",
              severity: "warning",
              message: "Missing lockfile.",
            },
          ],
          warnings: ["Missing package-lock.json"],
          generatedAt: new Date().toISOString(),
        },
      },
    });

    expect(parsed.type).toBe("reliability.delta");
    if (parsed.type !== "reliability.delta") {
      throw new Error("Expected a reliability delta event.");
    }
    expect(parsed.data.kind).toBe("prebuild");

    const artifactEvent = zBinaryBuildEvent.parse({
      id: "evt_124",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "artifact.delta",
      data: {
        artifactState: {
          coverage: 64,
          runnable: false,
          sourceFilesTotal: 2,
          sourceFilesReady: 2,
          outputFilesReady: 0,
          entryPoints: [],
          latestFile: "src/index.ts",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(artifactEvent.type).toBe("artifact.delta");

    const graphEvent = zBinaryBuildEvent.parse({
      id: "evt_125",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "graph.updated",
      data: {
        sourceGraph: {
          coverage: 67,
          readyModules: 2,
          totalModules: 3,
          modules: [
            {
              path: "src/index.ts",
              language: "typescript",
              imports: ["./lib/health"],
              exports: ["health"],
              functions: [
                {
                  name: "health",
                  sourcePath: "src/index.ts",
                  exported: true,
                  async: false,
                  callable: true,
                  signature: "health()",
                },
              ],
              completed: true,
              diagnosticCount: 0,
            },
          ],
          dependencies: [
            {
              from: "src/index.ts",
              to: "src/lib/health.ts",
              kind: "import",
              resolved: true,
            },
          ],
          diagnostics: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(graphEvent.type).toBe("graph.updated");

    const executionEvent = zBinaryBuildEvent.parse({
      id: "evt_126",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "execution.updated",
      data: {
        execution: {
          runnable: true,
          mode: "native",
          availableFunctions: [
            {
              name: "health",
              sourcePath: "src/index.ts",
              mode: "native",
              callable: true,
              signature: "health()",
            },
          ],
          lastRun: null,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(executionEvent.type).toBe("execution.updated");

    const tokenEvent = zBinaryBuildEvent.parse({
      id: "evt_127",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "token.delta",
      data: {
        path: "src/index.ts",
        language: "typescript",
        text: "export const",
        cursor: 17,
        updatedAt: new Date().toISOString(),
      },
    });

    expect(tokenEvent.type).toBe("token.delta");

    const liveReliabilityEvent = zBinaryBuildEvent.parse({
      id: "evt_128",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "reliability.stream",
      data: {
        reliability: {
          score: 82,
          trend: "rising",
          warnings: ["Missing lockfile"],
          blockers: [
            {
              id: "missing_output",
              code: "missing_output",
              message: "No packaged output yet.",
              severity: "warning",
            },
          ],
          resolvedBlockers: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(liveReliabilityEvent.type).toBe("reliability.stream");

    const astStateEvent = zBinaryBuildEvent.parse({
      id: "evt_129",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "ast.state",
      data: {
        astState: {
          coverage: 75,
          moduleCount: 4,
          modules: [
            {
              path: "src/index.ts",
              language: "typescript",
              exportedSymbols: ["health"],
              callableFunctions: ["health"],
              completed: true,
              nodeCount: 18,
            },
          ],
          nodes: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(astStateEvent.type).toBe("ast.state");

    const runtimeStateEvent = zBinaryBuildEvent.parse({
      id: "evt_130",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "runtime.state",
      data: {
        runtime: {
          runnable: true,
          engine: "quickjs",
          availableFunctions: [
            {
              name: "health",
              sourcePath: "src/index.ts",
              mode: "native",
              callable: true,
              signature: "health()",
            },
          ],
          patches: [
            {
              id: "patch_123",
              modulePath: "src/index.ts",
              symbolNames: ["health"],
              appliedAt: new Date().toISOString(),
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(runtimeStateEvent.type).toBe("runtime.state");

    const snapshotEvent = zBinaryBuildEvent.parse({
      id: "evt_131",
      buildId: "bin_123",
      timestamp: new Date().toISOString(),
      type: "snapshot.saved",
      data: {
        snapshot: {
          id: "snap_123",
          checkpointId: "chk_123",
          phase: "materializing",
          label: "AST milestone",
          parentSnapshotId: null,
          source: "compat",
          savedAt: new Date().toISOString(),
        },
      },
    });

    expect(snapshotEvent.type).toBe("snapshot.saved");
  });
});
