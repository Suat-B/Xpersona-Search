import { describe, expect, it } from "vitest";
import * as runtime from "./openhands-runtime.js";
describe("openhands runtime supervisor helpers", () => {
    it("prefers full runtime for browser and terminal tasks", () => {
        expect(runtime.inferOpenHandsRuntimeProfile("Open the website and verify the login flow")).toBe("full");
        expect(runtime.inferOpenHandsRuntimeProfile("Run the test suite and fix the failure")).toBe("full");
        expect(runtime.inferOpenHandsRuntimeProfile("Refactor the file and clean up the code")).toBe("code-only");
        expect(runtime.inferOpenHandsRuntimeProfile("Explain what this repo does")).toBe("chat-only");
    });
    it("maps degraded health into a limited runtime with recovery actions", () => {
        const status = runtime.mapGatewayHealthToOpenHandsRuntimeStatus({
            gatewayUrl: "http://127.0.0.1:8010",
            desiredProfile: "full",
            payload: {
                status: "degraded",
                version: "1.13.1",
                doctor: {
                    runtimeKind: "local-python",
                    runtimeProfile: "code-only",
                    pythonVersion: "3.10.11",
                    packageFamily: "openhands-sdk",
                    packageVersion: "1.11.5",
                    supportedTools: ["Tool", "FileEditorTool"],
                    degradedReasons: ["python_too_old", "missing_full_openhands_package", "windows_unsupported_browser"],
                },
            },
        });
        expect(status.readiness).toBe("limited");
        expect(status.runtimeProfile).toBe("code-only");
        expect(status.message).toContain("limited capabilities");
        expect(status.availableActions).toContain("Repair OpenHands runtime");
        expect(status.availableActions).toContain("Use managed runtime");
    });
    it("accepts lightweight healthy gateway payloads without doctor metadata", () => {
        const status = runtime.mapGatewayHealthToOpenHandsRuntimeStatus({
            gatewayUrl: "http://127.0.0.1:8010",
            desiredProfile: "full",
            payload: {
                status: "healthy",
                version: "1.14.0",
                runtime: "openhands_sdk",
            },
        });
        expect(status.readiness).toBe("ready");
        expect(status.runtimeProfile).toBe("full");
        expect(status.message).toContain("ready");
    });
    it("prefers docker before local python on windows and for full runs", () => {
        expect(runtime.getPreferredOpenHandsRuntimeKinds("win32", "chat-only")).toEqual(["docker", "local-python"]);
        expect(runtime.getPreferredOpenHandsRuntimeKinds("linux", "full")).toEqual(["docker", "local-python"]);
        expect(runtime.getPreferredOpenHandsRuntimeKinds("linux", "code-only")).toEqual(["local-python", "docker"]);
    });
    it("grades readiness by capability profile", () => {
        expect(runtime.inferReadinessFromProfile("full", "full")).toBe("ready");
        expect(runtime.inferReadinessFromProfile("code-only", "full")).toBe("limited");
        expect(runtime.inferReadinessFromProfile("unavailable", "chat-only")).toBe("repair_needed");
    });
    it("repairs managed runtime when the venv exists but openhands is missing", () => {
        expect(runtime.needsManagedOpenHandsInstall(false, false)).toBe(true);
        expect(runtime.needsManagedOpenHandsInstall(true, false)).toBe(true);
        expect(runtime.needsManagedOpenHandsInstall(true, true)).toBe(false);
    });
    it("derives the local gateway host and port from the configured URL", () => {
        expect(runtime.parseLocalGatewayBinding("http://127.0.0.1:8011")).toEqual({
            host: "127.0.0.1",
            port: "8011",
        });
        expect(runtime.parseLocalGatewayBinding("https://localhost")).toEqual({
            host: "localhost",
            port: "443",
        });
    });
});
