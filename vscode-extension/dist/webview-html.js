"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlaygroundWebviewHtml = buildPlaygroundWebviewHtml;
function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function icon(path, size = 18) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}
function buildPlaygroundWebviewHtml(input) {
    const workspaceName = escapeHtml(input.workspaceName || "Workspace");
    const logoUri = escapeHtml(input.logoUri);
    const scriptUri = escapeHtml(input.scriptUri);
    const chatIcon = icon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
    const tasksIcon = icon("M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01");
    const plusIcon = icon("M12 5v14 M5 12h14");
    const keyIcon = icon("M21 2l-2 2m-7 5a5 5 0 1 0-7 7l2-2h3l2-2v-3z");
    const refreshIcon = icon("M3 12a9 9 0 0 0 15.5 6.36L21 16 M21 21v-5h-5");
    const settingsIcon = icon("M12 3a2.5 2.5 0 0 0-2.45 2l-.13.78a7.96 7.96 0 0 0-1.52.88l-.72-.29a2.5 2.5 0 0 0-3.18 1.42 2.5 2.5 0 0 0 .85 3.02l.65.46a8.77 8.77 0 0 0 0 1.76l-.65.46a2.5 2.5 0 0 0-.85 3.02 2.5 2.5 0 0 0 3.18 1.42l.72-.29c.47.36.98.65 1.52.88l.13.78A2.5 2.5 0 0 0 12 21a2.5 2.5 0 0 0 2.45-2l.13-.78a7.96 7.96 0 0 0 1.52-.88l.72.29a2.5 2.5 0 0 0 3.18-1.42 2.5 2.5 0 0 0-.85-3.02l-.65-.46a8.77 8.77 0 0 0 0-1.76l.65-.46a2.5 2.5 0 0 0 .85-3.02 2.5 2.5 0 0 0-3.18-1.42l-.72.29a7.96 7.96 0 0 0-1.52-.88l-.13-.78A2.5 2.5 0 0 0 12 3z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4");
    const composeIcon = icon("M12 20h9 M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z");
    const signOutIcon = icon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9");
    const signInIcon = icon("M15 3h4a2 2 0 0 1 2 2v4 M10 14 21 3 M21 9V3h-6 M9 21H5a2 2 0 0 1-2-2V9");
    const undoIcon = icon("M9 14 4 9l5-5 M4 9h10a6 6 0 1 1 0 12h-1");
    const sendIcon = icon("M22 2 11 13 M22 2 15 22 11 13 2 9 22 2", 20);
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${input.cspSource} data:; style-src 'unsafe-inline' ${input.cspSource}; script-src 'nonce-${input.nonce}' ${input.cspSource};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playground</title>
    <style>
      :root{color-scheme:light dark;--surface:var(--vscode-sideBar-background,#1e1e1e);--surface-elevated:color-mix(in srgb,var(--surface) 84%,var(--vscode-editor-background,#1e1e1e) 16%);--canvas:var(--vscode-editor-background,#1e1e1e);--widget-surface:var(--vscode-editorWidget-background,var(--surface-elevated));--input-surface:var(--vscode-input-background,var(--widget-surface));--code-surface:var(--vscode-textCodeBlock-background,var(--widget-surface));--panel:color-mix(in srgb,var(--surface-elevated) 94%,transparent);--line:color-mix(in srgb,var(--vscode-panel-border,var(--vscode-contrastBorder,#808080)) 72%,transparent);--line-strong:color-mix(in srgb,var(--vscode-panel-border,var(--vscode-contrastBorder,#808080)) 100%,transparent);--text:var(--vscode-editor-foreground);--muted:color-mix(in srgb,var(--vscode-descriptionForeground,#9f9f9f) 82%,#fff 18%);--accent:color-mix(in srgb,var(--vscode-textLink-foreground,#4da3ff) 84%,#8bc3ff 16%);--success:var(--vscode-gitDecoration-addedResourceForeground,#79d8a2);--warning:var(--vscode-editorWarning-foreground,#d7ba7d);--danger:var(--vscode-gitDecoration-deletedResourceForeground,#ff8b7a);--composer-min-height:96px;--composer-max-height:236px}
      *{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--surface);color:var(--text);font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif}button,textarea{font:inherit}button{color:inherit}
      .workspace-shell{display:grid;grid-template-columns:56px 292px minmax(0,1fr);height:100vh;overflow:hidden}.utility-rail{display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 8px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface-elevated) 90%,transparent)}.rail-brand{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--line-strong);border-radius:12px;background:color-mix(in srgb,var(--canvas) 10%,transparent)}.rail-brand img{width:20px;height:20px}.rail-button{width:40px;height:40px;display:grid;place-items:center;border:1px solid transparent;border-radius:12px;background:transparent;color:var(--muted);cursor:pointer}.rail-button:hover,.rail-button.active{border-color:var(--line);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text)}.rail-spacer{flex:1}
      .task-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface-elevated) 96%,transparent)}.task-panel-head{padding:10px 12px 8px}.task-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.task-brand{display:flex;align-items:center;gap:8px;min-width:0}.task-title{margin:0;font-size:16px;font-weight:620}.task-head-badge,.context-chip,.composer-chip,.timeline-chip,.context-target,.mini-text,.followup-button{border:1px solid var(--line);border-radius:999px}.task-head-badge{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;color:var(--muted);font-size:11px}.task-toolbar,.composer-actions,.composer-meta,.task-brand,.context-strip-head,.context-targets,.timeline,.message-followups,.context-strip-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.icon-button,.mini-icon{display:grid;place-items:center;border:1px solid transparent;background:transparent;color:var(--muted);cursor:pointer}.icon-button{width:26px;height:26px;border-radius:8px}.icon-button:hover,.mini-icon:hover{border-color:var(--line);background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--text)}
      .task-list{flex:1;min-height:0;overflow:auto;padding:0 8px 10px}.task-empty{padding:14px 12px;color:var(--muted);font-size:13px;line-height:1.6}.task-item{margin-bottom:3px}.task-item button{width:100%;border:0;border-radius:14px;background:transparent;padding:10px 12px;text-align:left;cursor:pointer}.task-item button:hover,.task-item.active button{background:color-mix(in srgb,var(--accent) 8%,transparent)}.task-line{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.task-copy{min-width:0}.task-name{display:block;color:var(--text);font-size:14px;font-weight:500;line-height:1.38}.task-meta,.task-time{margin-top:5px;color:var(--muted);font-size:12px}.task-aside{flex:none;display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;white-space:nowrap}.task-mode{color:var(--success)}.task-dot{width:9px;height:9px;border-radius:999px;background:var(--accent)}
      .chat-stage{display:flex;flex-direction:column;min-height:0;overflow:hidden}.chat-canvas{flex:1;min-height:0;overflow:auto;position:relative;padding:0 14px}.message-stack{display:flex;flex-direction:column;gap:10px;min-height:100%;padding:14px 0 10px}.empty-stage{min-height:100%;display:grid;place-items:center;padding:16px}.empty-stage-inner{max-width:460px;width:100%;text-align:center}.empty-stage-logo{width:62px;height:62px;display:grid;place-items:center;margin:0 auto 18px;border:1px solid var(--line);border-radius:24px;background:color-mix(in srgb,var(--widget-surface) 76%,transparent)}.empty-stage-logo img{width:32px;height:32px}.empty-stage-title{margin:0 0 10px;font-size:24px;font-weight:610}.empty-stage-copy{color:var(--muted);font-size:14px;line-height:1.7}
      .context-radar,.context-strip,.composer-card,.message,.mentions{border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel) 94%,transparent)}.context-radar,.context-strip{padding:12px}.context-radar{margin:18px auto 0;max-width:420px;text-align:left}.context-label,.message-meta{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.context-note,.context-strip-note{color:var(--muted);font-size:12px;line-height:1.55}.context-root,.context-strip-root{margin-top:6px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.context-targets{margin-top:10px}.context-target{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;background:color-mix(in srgb,var(--widget-surface) 78%,transparent);font-size:11px;color:var(--muted);max-width:100%}.context-target strong{color:var(--text)}.context-target[data-kind="likely"]{border-color:color-mix(in srgb,var(--accent) 34%,var(--line) 66%);background:color-mix(in srgb,var(--accent) 12%,transparent)}.context-target[data-kind="attached"]{border-color:color-mix(in srgb,var(--success) 34%,var(--line) 66%)}.context-target[data-kind="selection"]{border-color:color-mix(in srgb,var(--warning) 34%,var(--line) 66%)}
      .message{max-width:min(840px,100%);padding:15px 16px}.message.user{margin-left:auto;background:color-mix(in srgb,var(--accent) 12%,var(--canvas) 88%);border-color:color-mix(in srgb,var(--accent) 38%,transparent)}.message.system{background:color-mix(in srgb,var(--warning) 10%,var(--canvas) 90%);border-style:dashed}.message-meta{margin-bottom:9px}.message-body{font-size:14px;line-height:1.72;word-break:break-word}.message-body p{margin:0 0 10px}.message-body p:last-child,.message-body ul:last-child,.message-body ol:last-child,.message-body pre:last-child{margin-bottom:0}.message-body ul,.message-body ol{margin:0 0 12px 20px;padding:0}.message-body li{margin:0 0 6px}.message-body pre{margin:0 0 12px;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--code-surface)}.message-body code{font-family:var(--vscode-editor-font-family,"Cascadia Code","Consolas",monospace)}.code-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.code-block{padding:12px;white-space:pre}
      .followup-button{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 12px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:12px;color:var(--muted);cursor:pointer}.followup-button:hover:not(:disabled){border-color:var(--line-strong);color:var(--text)}.followup-button.emphasized{border-color:color-mix(in srgb,var(--accent) 34%,var(--line) 66%);background:color-mix(in srgb,var(--accent) 12%,transparent)}.followup-button:disabled{cursor:default;opacity:.82}.followup-detail{color:var(--muted);font-size:11px}
      .jump-button{position:absolute;right:18px;bottom:12px;border:1px solid var(--line-strong);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 92%,transparent);padding:8px 14px;cursor:pointer}.composer-zone{flex:none;padding:8px 18px 14px;background:color-mix(in srgb,var(--surface-elevated) 96%,transparent);border-top:1px solid color-mix(in srgb,var(--line) 82%,transparent)}.timeline-wrap,.mentions,.context-strip,.composer-shell{max-width:920px;margin:0 auto 8px}.timeline-wrap{display:none}.timeline-wrap.show,.mentions.show{display:block}.timeline-chip{display:inline-flex;align-items:center;min-height:26px;padding:0 10px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:12px;color:var(--muted)}.timeline-chip.phase,.composer-chip.intent,.context-chip.intent{border-color:color-mix(in srgb,var(--accent) 30%,var(--line) 70%);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text)}.context-chip,.composer-chip,.mini-text{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;background:color-mix(in srgb,var(--widget-surface) 72%,transparent);font-size:11px;color:var(--muted)}.context-chip.confidence-high{border-color:color-mix(in srgb,var(--success) 34%,var(--line) 66%);color:var(--success)}.context-chip.confidence-medium{border-color:color-mix(in srgb,var(--warning) 34%,var(--line) 66%);color:var(--warning)}.context-chip.confidence-low{border-color:color-mix(in srgb,var(--danger) 34%,var(--line) 66%);color:var(--danger)}
      .context-strip{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.context-strip-main{min-width:0}.context-strip-actions{justify-content:flex-end}.composer-card{border-color:var(--line-strong);background:color-mix(in srgb,var(--input-surface) 94%,var(--surface) 6%)}.composer-input{width:100%;min-height:var(--composer-min-height);max-height:var(--composer-max-height);border:0;background:transparent;color:var(--text);resize:none;outline:none;padding:16px 16px 12px;font-size:15px;line-height:1.64}.composer-input::placeholder{color:color-mix(in srgb,var(--muted) 72%,#808080 28%)}.composer-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px 10px;flex-wrap:wrap}.composer-meta{min-width:0;flex:1 1 auto}.mini-icon{width:24px;height:24px;border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 80%,transparent)}.mini-text,.followup-button,.mini-icon,.composer-send{cursor:pointer}.composer-send{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:999px;background:var(--accent);color:var(--vscode-button-foreground,#fff)}.composer-send:disabled,.mini-icon:disabled,.mini-text:disabled{opacity:.6;cursor:default}.mentions{display:none;overflow:hidden;background:var(--widget-surface)}.mention-item button{width:100%;border:0;background:transparent;padding:12px 14px;text-align:left;cursor:pointer}.mention-item button:hover,.mention-item button.active{background:color-mix(in srgb,var(--accent) 8%,transparent)}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.is-hidden{display:none !important}
      @media (max-width:980px){.workspace-shell{grid-template-columns:56px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.task-panel{grid-column:2;border-right:0;border-bottom:1px solid var(--line);max-height:200px}.chat-stage{grid-column:2}.composer-zone{padding:6px 12px 10px}}
      @media (max-width:840px){:root{--composer-min-height:80px;--composer-max-height:180px}.chat-canvas{padding:0 10px}.context-strip{grid-template-columns:1fr}.context-strip-actions{justify-content:flex-start}.composer-input{padding:12px 12px 8px;font-size:14px;line-height:1.54}}
      @media (max-width:720px){.workspace-shell{grid-template-columns:1fr}.utility-rail{flex-direction:row;justify-content:flex-start;border-right:0;border-bottom:1px solid var(--line)}.rail-spacer{display:none}.task-panel,.chat-stage{grid-column:1}.workspace-shell[data-compact-view="chat"] .task-panel{display:none}.workspace-shell[data-compact-view="tasks"] .chat-stage{display:none}}
      @media (max-width:620px){:root{--composer-min-height:68px;--composer-max-height:144px}.composer-zone{padding:4px 8px 8px}.timeline-wrap,.mentions,.context-strip,.composer-shell{max-width:none}.composer-card,.context-strip,.context-radar,.message,.mentions{border-radius:14px}.composer-input{padding:9px 9px 6px;font-size:13px;line-height:1.48}.composer-bottom{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:0 8px 8px}.composer-send{width:32px;height:32px}.composer-send svg{width:16px;height:16px}.timeline-chip,.composer-chip,.context-chip,.context-target,.followup-button{min-height:22px;font-size:11px}}
      @media (max-height:820px){:root{--composer-min-height:72px;--composer-max-height:148px}.message-stack{padding-top:10px;padding-bottom:8px}.composer-zone{padding-bottom:8px}}
    </style>
  </head>
  <body data-logo-uri="${logoUri}" data-workspace-name="${workspaceName}">
    <div class="workspace-shell" id="workspaceShell" data-compact-view="chat">
      <aside class="utility-rail" aria-label="Playground navigation">
        <div class="rail-brand"><img src="${logoUri}" alt="Playground" /></div>
        <button type="button" class="rail-button active" data-action="showChat" data-view-target="chat" aria-controls="chatStage" aria-pressed="true" title="Chat">${chatIcon}</button>
        <button type="button" class="rail-button" data-action="showTasks" data-view-target="tasks" aria-controls="taskPanel" aria-pressed="false" title="Tasks">${tasksIcon}</button>
        <button type="button" class="rail-button" data-action="newChat" title="New chat">${plusIcon}</button>
        <button type="button" class="rail-button" data-action="setApiKey" title="API key">${keyIcon}</button>
        <div class="rail-spacer"></div>
        <button type="button" class="rail-button" data-action="signOut" title="Clear auth">${signOutIcon}</button>
      </aside>

      <aside class="task-panel" id="taskPanel" aria-label="Playground tasks">
        <div class="task-panel-head">
          <div class="task-title-row">
            <div class="task-brand">
              <h1 class="task-title">Playground</h1>
              <span class="task-head-badge">Tasks <span id="historyCount">0</span></span>
            </div>
            <div class="task-toolbar">
              <button type="button" class="icon-button" data-action="loadHistory" title="Refresh">${refreshIcon}</button>
              <button type="button" class="icon-button" data-action="setApiKey" title="Settings">${settingsIcon}</button>
              <button type="button" class="icon-button" data-action="newChat" title="New chat">${composeIcon}</button>
            </div>
          </div>
        </div>
        <div class="task-list" id="history"></div>
        <div class="task-footer is-hidden" id="historyFooter"><button type="button" class="task-footer-button" data-action="loadHistory" id="historyFooterButton">View all</button></div>
      </aside>

      <main class="chat-stage" id="chatStage">
        <section class="chat-canvas" id="messages" aria-live="polite"></section>
        <button type="button" class="jump-button is-hidden" id="jumpToLatest">Jump to latest</button>
        <section class="composer-zone">
          <div class="timeline-wrap" id="timelineWrap"><div class="timeline" id="activity" aria-live="polite"></div></div>
          <div class="mentions" id="mentions"></div>
          <div class="composer-shell">
            <div class="composer-card">
              <textarea id="composer" class="composer-input" placeholder="Ask Playground anything. @ to add files, / for commands" spellcheck="false"></textarea>
              <div class="composer-bottom">
                <div class="composer-meta">
                  <button type="button" class="mini-icon" data-action="newChat" title="New chat">${plusIcon}<span class="sr-only">New chat</span></button>
                  <span class="composer-chip" id="runtimeChip">Qwen</span>
                  <span class="composer-chip intent" id="intentChip">Ask</span>
                  <span class="composer-chip" id="modeChip">Auto</span>
                  <span class="composer-chip" id="statusLabel">Ready</span>
                  <span class="composer-chip" id="busyLabel">Ready</span>
                </div>
                <div class="composer-actions">
                  <button type="button" class="mini-text" data-action="setApiKey" id="authChip" title="API key">Key</button>
                  <button type="button" class="mini-icon" data-action="signIn" id="signIn" title="Browser sign in">${signInIcon}<span class="sr-only">Browser sign in</span></button>
                  <button type="button" class="mini-icon" data-action="signOut" id="signOut" title="Sign out">${signOutIcon}<span class="sr-only">Sign out</span></button>
                  <button type="button" class="mini-icon" data-action="undoLastChanges" id="undoChanges" title="Undo last changes">${undoIcon}<span class="sr-only">Undo last changes</span></button>
                  <button type="button" class="composer-send" id="send" aria-label="Send">${sendIcon}</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
    <script nonce="${input.nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
//# sourceMappingURL=webview-html.js.map