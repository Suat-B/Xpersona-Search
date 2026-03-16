import { describe, expect, it } from "vitest";
import { buildPlaygroundWebviewHtml } from "../src/webview-html";

describe("playground webview shell", () => {
  it("renders the minimal composer-first shell with composer-integrated Binary controls", () => {
    const html = buildPlaygroundWebviewHtml({
      nonce: "nonce",
      cspSource: "vscode-resource:",
      scriptUri: "vscode-resource:/media/webview.js",
      logoUri: "vscode-resource:/media/xpersona.svg",
      workspaceName: "perfect-circle",
    });

    expect(html).toContain('class="utility-rail"');
    expect(html).toContain('id="workspaceShell" data-history-open="false" data-binary-details="false"');
    expect(html).toContain('id="historyDrawer"');
    expect(html).toContain('id="historyScrim"');
    expect(html).toContain('id="history"');
    expect(html).toContain('data-action="showTasks"');
    expect(html).toContain('id="binaryPanelToggle"');
    expect(html).toContain('id="binaryPanelBody"');
    expect(html).toContain('data-action="toggleBinaryPanel"');
    expect(html).toContain('id="binaryPanelSummary"');
    expect(html).toContain('id="binaryPanel"');
    expect(html).toContain('id="binaryTargetRuntime"');
    expect(html).toContain('id="binaryDetailsPanel"');
    expect(html).toContain('id="binaryBuildVisual"');
    expect(html).toContain('id="binaryBuildTitle"');
    expect(html).toContain('id="binaryBuildCaption"');
    expect(html).toContain('data-action="toggleBinaryDetails"');
    expect(html).toContain('id="binaryManifestPreview"');
    expect(html).toContain('id="binaryWarnings"');
    expect(html).toContain('data-action="generateBinary"');
    expect(html).toContain('data-action="validateBinary"');
    expect(html).toContain('data-action="deployBinary"');
    expect(html).toContain('class="composer-card"');
    expect(html).toContain('id="composer"');
    expect(html).toContain('id="jumpToLatest"');
    expect(html).toContain("Use @ to pull files into the bundle plan.");
    expect(html).toContain("portable starter bundle");
    expect(html).toContain("Binary Assembly");
    expect(html).toContain("101010");
    expect(html).not.toContain('id="contextStrip"');
    expect(html).not.toContain('data-action="attachActiveFile"');
    expect(html).not.toContain('class="task-panel"');
    expect(html).not.toContain('class="binary-strip"');
    expect(html).not.toContain('id="timelineWrap"');
    expect(html).toContain("Binary IDE");
    expect(html).toContain("perfect-circle");
    expect(html).toContain("var(--vscode-sideBar-background");
    expect(html).not.toContain("--bg: #040404");
    expect(html).not.toContain("radial-gradient(");
  });
});
