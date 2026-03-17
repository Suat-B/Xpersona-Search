import { describe, expect, it } from "vitest";
import {
  zBinaryBuildRequest,
  zBinaryBuildEvent,
  zBinaryBuildRecord,
  zBinaryControlRequest,
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
        transport: "sse",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/bin_123/events",
        controlPath: "/api/v1/binary/builds/bin_123/control",
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
      artifact: {
        fileName: "bin_123.zip",
        relativePath: "artifacts/binary-builds/bin_123/bin_123.zip",
        sizeBytes: 1024,
        sha256: "deadbeef",
      },
      publish: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.artifactKind).toBe("package_bundle");
    expect(parsed.workflow).toBe("binary_generate");
  });

  it("accepts streaming events and cancel requests", () => {
    expect(zBinaryControlRequest.parse({ action: "cancel" }).action).toBe("cancel");

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
  });
});
