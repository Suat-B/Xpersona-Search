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
    expect(html).not.toContain('class="rail-brand"');
    expect(html).toContain('id="historyDrawer"');
    expect(html).toContain('id="historyScrim"');
    expect(html).toContain('id="history"');
    expect(html).toContain('id="chatBinarySpotlight"');
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
    expect(html).toContain('id="binaryPhaseLabel"');
    expect(html).toContain('id="binaryProgressLabel"');
    expect(html).toContain('id="binaryProgressValue"');
    expect(html).toContain('id="binaryProgressFill"');
    expect(html).toContain('data-action="toggleBinaryDetails"');
    expect(html).toContain('id="binaryManifestPreview"');
    expect(html).toContain('id="binaryWarnings"');
    expect(html).toContain('id="binaryPreviewFiles"');
    expect(html).toContain('id="binaryLogPreview"');
    expect(html).toContain('data-action="generateBinary"');
    expect(html).toContain('data-action="cancelBinary"');
    expect(html).toContain('data-action="validateBinary"');
    expect(html).toContain('data-action="deployBinary"');
    expect(html).toContain('class="composer-card"');
    expect(html).toContain('id="composer"');
    expect(html).toContain('id="composerConfirm"');
    expect(html).toContain("Create a plan?");
    expect(html).toContain('id="jumpToLatest"');
    expect(html).toContain("Use @ to pull files into the bundle plan.");
    expect(html).toContain("portable starter bundle");
    expect(html).toContain("Binary Assembly");
    expect(html).toContain("Live Stream");
    expect(html).toContain("101010");
    expect(html).not.toContain('id="contextStrip"');
    expect(html).not.toContain('data-action="attachActiveFile"');
    expect(html).not.toContain('class="task-panel"');
    expect(html).not.toContain('class="binary-strip"');
    expect(html).not.toContain('id="timelineWrap"');
    expect(html).toContain("Streaming Binary IDE");
    expect(html).toContain("perfect-circle");
    expect(html).toContain("var(--vscode-sideBar-background");
    expect(html).toContain("var(--vscode-button-background");
    expect(html).toContain("var(--vscode-button-hoverBackground");
    expect(html).toContain(".composer-dock{flex:none;max-height:min(68vh,640px);overflow-y:auto");
    expect(html).toContain(".chat-binary-spotlight-host{position:sticky;top:0;z-index:6");
    expect(html).toContain(".chat-binary-spotlight{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(220px,.82fr);gap:16px");
    expect(html).toContain(".chat-binary-kicker{display:inline-flex;align-items:center;gap:8px");
    expect(html).toContain(".chat-binary-note{min-height:0;padding:11px 12px");
    expect(html).toContain(".message.live-binary{padding:0 0 16px}");
    expect(html).toContain(".live-message-shell{display:flex;flex-direction:column;gap:14px;padding:16px 18px 17px");
    expect(html).toContain(".live-message-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,240px);gap:16px");
    expect(html).toContain(".binary-panel-body{display:flex;flex-direction:column;gap:0;min-height:0;max-height:min(54vh,520px);overflow-y:auto");
    expect(html).toContain(".binary-build-visual{display:none;grid-template-columns:minmax(0,1fr) minmax(190px,320px);align-items:stretch;gap:16px");
    expect(html).toContain(".binary-build-stream{position:relative;width:100%;max-width:100%;min-height:108px");
    expect(html).not.toContain('id="runtimeChip"');
    expect(html).not.toContain('id="modeChip"');
    expect(html).not.toContain('id="statusLabel"');
    expect(html).not.toContain('id="busyLabel"');
    expect(html).not.toContain("--bg: #040404");
    expect(html).not.toContain("radial-gradient(");
  });
});
