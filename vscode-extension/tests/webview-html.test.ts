import { describe, expect, it } from "vitest";
import { buildPlaygroundWebviewHtml } from "../src/webview-html";

describe("playground webview shell", () => {
  it("renders the task rail, fresh chat stage, and docked composer markers", () => {
    const html = buildPlaygroundWebviewHtml({
      nonce: "nonce",
      cspSource: "vscode-resource:",
      scriptUri: "vscode-resource:/media/webview.js",
      logoUri: "vscode-resource:/media/xpersona.svg",
      workspaceName: "perfect-circle",
    });

    expect(html).toContain('class="utility-rail"');
    expect(html).toContain('id="workspaceShell" data-compact-view="chat"');
    expect(html).toContain('class="task-panel"');
    expect(html).toContain('id="history"');
    expect(html).toContain('data-action="showChat"');
    expect(html).toContain('data-action="showTasks"');
    expect(html).toContain('class="composer-card"');
    expect(html).toContain('id="composer"');
    expect(html).toContain('id="jumpToLatest"');
    expect(html).toContain("perfect-circle");
    expect(html).toContain("var(--vscode-sideBar-background");
    expect(html).not.toContain("--bg: #040404");
    expect(html).not.toContain("radial-gradient(");
  });
});
