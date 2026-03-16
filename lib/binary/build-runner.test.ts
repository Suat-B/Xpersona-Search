import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { runPackageBundleBuild, type BinaryBuildExecutor } from "@/lib/binary/build-runner";
import { getBinaryArtifactPath, getBinaryBuildRootDir } from "@/lib/binary/store";

const CREATED_BUILD_IDS: string[] = [];

async function cleanupBuild(buildId: string): Promise<void> {
  await fs.rm(getBinaryBuildRootDir(buildId), { recursive: true, force: true }).catch(() => null);
}

afterEach(async () => {
  await Promise.all(CREATED_BUILD_IDS.splice(0).map((buildId) => cleanupBuild(buildId)));
});

describe("binary build runner", () => {
  it("creates a completed package bundle with manifest and artifact metadata", async () => {
    const buildId = "bin_test_success";
    CREATED_BUILD_IDS.push(buildId);
    const executor: BinaryBuildExecutor = async ({ args, cwd }) => {
      if (args[0] === "install") {
        await fs.writeFile(
          `${cwd}/package-lock.json`,
          JSON.stringify({ name: "binary-test", lockfileVersion: 3 }, null, 2),
          "utf8"
        );
        return { exitCode: 0, stdout: "installed", stderr: "" };
      }

      await fs.mkdir(`${cwd}/dist`, { recursive: true });
      await fs.writeFile(`${cwd}/dist/index.js`, 'console.log("ready");\n', "utf8");
      return { exitCode: 0, stdout: "built", stderr: "" };
    };

    const result = await runPackageBundleBuild({
      buildId,
      request: {
        intent: "Generate a payment webhook package bundle with health checks and build metadata",
        workspaceFingerprint: "workspace-123",
        targetEnvironment: {
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
        },
      },
      executor,
    });

    expect(result.status).toBe("completed");
    expect(result.artifact?.fileName).toBe(`${buildId}.zip`);
    expect(result.manifest.entrypoint).toBe("dist/index.js");
    expect(result.reliability.status).toBe("pass");
    await expect(fs.access(getBinaryArtifactPath(buildId))).resolves.toBeUndefined();
  });

  it("marks the build as failed when the build command fails", async () => {
    const buildId = "bin_test_failure";
    CREATED_BUILD_IDS.push(buildId);
    const executor: BinaryBuildExecutor = async ({ args, cwd }) => {
      if (args[0] === "install") {
        await fs.writeFile(
          `${cwd}/package-lock.json`,
          JSON.stringify({ name: "binary-test", lockfileVersion: 3 }, null, 2),
          "utf8"
        );
        return { exitCode: 0, stdout: "installed", stderr: "" };
      }

      return { exitCode: 1, stdout: "", stderr: "TypeScript compile failed" };
    };

    const result = await runPackageBundleBuild({
      buildId,
      request: {
        intent: "Generate an internal worker package bundle with retries and metrics",
        workspaceFingerprint: "workspace-456",
        targetEnvironment: {
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
        },
      },
      executor,
    });

    expect(result.status).toBe("failed");
    expect(result.artifact).toBeNull();
    expect(result.errorMessage).toContain("npm run build failed");
    expect(result.reliability.status).toBe("fail");
    expect(result.reliability.issues.some((issue) => issue.code === "build_failed")).toBe(true);
  });
});
