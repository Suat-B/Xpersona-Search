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
    const plusIcon = icon("M12 5v14 M5 12h14");
    const keyIcon = icon("M21 2l-2 2m-7 5a5 5 0 1 0-7 7l2-2h3l2-2v-3z");
    const refreshIcon = icon("M3 12a9 9 0 0 0 15.5 6.36L21 16 M21 21v-5h-5");
    const settingsIcon = icon("M12 3a2.5 2.5 0 0 0-2.45 2l-.13.78a7.96 7.96 0 0 0-1.52.88l-.72-.29a2.5 2.5 0 0 0-3.18 1.42 2.5 2.5 0 0 0 .85 3.02l.65.46a8.77 8.77 0 0 0 0 1.76l-.65.46a2.5 2.5 0 0 0-.85 3.02 2.5 2.5 0 0 0 3.18 1.42l.72-.29c.47.36.98.65 1.52.88l.13.78A2.5 2.5 0 0 0 12 21a2.5 2.5 0 0 0 2.45-2l.13-.78a7.96 7.96 0 0 0 1.52-.88l.72.29a2.5 2.5 0 0 0 3.18-1.42 2.5 2.5 0 0 0-.85-3.02l-.65-.46a8.77 8.77 0 0 0 0-1.76l.65-.46a2.5 2.5 0 0 0 .85-3.02 2.5 2.5 0 0 0-3.18-1.42l-.72.29a7.96 7.96 0 0 0-1.52-.88l-.13-.78A2.5 2.5 0 0 0 12 3z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4");
    const signOutIcon = icon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9");
    const signInIcon = icon("M15 3h4a2 2 0 0 1 2 2v4 M10 14 21 3 M21 9V3h-6 M9 21H5a2 2 0 0 1-2-2V9");
    const undoIcon = icon("M9 14 4 9l5-5 M4 9h10a6 6 0 1 1 0 12h-1");
    const sendIcon = icon("M5 12h12 M13 6l6 6-6 6", 20);
    const closeIcon = icon("M18 6 6 18 M6 6l12 12");
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${input.cspSource} data:; style-src 'unsafe-inline' ${input.cspSource}; script-src 'nonce-${input.nonce}' ${input.cspSource};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Streaming Binary IDE</title>
    <style>
      :root{color-scheme:light dark;--surface:var(--vscode-sideBar-background,#111);--surface-elevated:color-mix(in srgb,var(--surface) 82%,var(--vscode-editor-background,#0c0c0c) 18%);--canvas:var(--vscode-editor-background,#0b0b0b);--panel:color-mix(in srgb,var(--surface-elevated) 92%,transparent);--widget-surface:var(--vscode-editorWidget-background,var(--surface-elevated));--input-surface:var(--vscode-input-background,var(--widget-surface));--code-surface:var(--vscode-textCodeBlock-background,var(--widget-surface));--line:color-mix(in srgb,var(--vscode-panel-border,var(--vscode-contrastBorder,#4f4f4f)) 72%,transparent);--line-strong:color-mix(in srgb,var(--vscode-panel-border,var(--vscode-contrastBorder,#4f4f4f)) 100%,transparent);--text:var(--vscode-editor-foreground,#f3f3f3);--muted:color-mix(in srgb,var(--vscode-descriptionForeground,#a5a5a5) 80%,#fff 20%);--accent:var(--vscode-button-background,var(--vscode-textLink-foreground,#5aa9ff));--accent-hover:var(--vscode-button-hoverBackground,color-mix(in srgb,var(--accent) 84%,#fff 16%));--accent-foreground:var(--vscode-button-foreground,#fff);--accent-soft:color-mix(in srgb,var(--accent) 16%,transparent);--accent-soft-strong:color-mix(in srgb,var(--accent) 24%,var(--widget-surface) 76%);--accent-line:color-mix(in srgb,var(--accent) 42%,var(--line) 58%);--accent-focus:color-mix(in srgb,var(--vscode-focusBorder,var(--accent)) 72%,transparent);--success:var(--vscode-gitDecoration-addedResourceForeground,#79d8a2);--warning:var(--vscode-editorWarning-foreground,#d7ba7d);--danger:var(--vscode-gitDecoration-deletedResourceForeground,#ff8b7a);--shadow:0 20px 44px rgba(0,0,0,.34);--composer-min-height:82px;--composer-max-height:168px}
      *{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--surface);color:var(--text);font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif}button,textarea,select{font:inherit}button{color:inherit}
      .workspace-shell{display:grid;grid-template-columns:56px minmax(0,1fr);height:100vh;overflow:hidden;background:var(--surface)}.workspace-main{position:relative;min-width:0;min-height:0;overflow:hidden;background:var(--canvas)}.utility-rail{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 8px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface-elevated) 92%,transparent)}.rail-button,.icon-button,.mini-button,.composer-send,.binary-button,.jump-button,.binary-panel-toggle{transition:background-color .16s ease,border-color .16s ease,color .16s ease,opacity .16s ease}.rail-button{width:40px;min-height:40px;display:grid;place-items:center;gap:1px;padding:5px 0;border:1px solid transparent;border-radius:12px;background:transparent;color:var(--muted);cursor:pointer}.rail-button:hover,.rail-button.active{border-color:var(--accent-line);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text)}.rail-button-stack{padding-top:6px;padding-bottom:4px}.rail-button-icon{display:grid;place-items:center}.rail-button-text{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:9px;font-weight:600;line-height:1.1;text-transform:uppercase;letter-spacing:.08em}.rail-spacer{flex:1}
      .drawer-scrim{position:absolute;inset:0;z-index:14;border:0;background:rgba(0,0,0,.34);cursor:pointer}.history-drawer{position:absolute;top:0;left:0;bottom:0;z-index:15;width:min(340px,calc(100vw - 84px));display:flex;flex-direction:column;gap:0;min-height:0;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface-elevated) 96%,transparent);box-shadow:var(--shadow);transform:translateX(-104%);opacity:0;pointer-events:none;transition:transform .2s ease,opacity .2s ease}.workspace-shell[data-history-open="true"] .history-drawer{transform:translateX(0);opacity:1;pointer-events:auto}.workspace-shell[data-history-open="true"] .drawer-scrim{display:block}.history-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;border-bottom:1px solid var(--line)}.history-drawer-label,.message-meta,.binary-subhead,.binary-strip-label{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.history-drawer-title{margin:6px 0 0;font-size:17px;font-weight:620}.history-drawer-copy{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.history-drawer-actions{display:flex;align-items:center;gap:8px}.drawer-count{display:inline-flex;align-items:center;justify-content:center;min-width:30px;min-height:24px;padding:0 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px}.icon-button,.mini-button,.binary-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:30px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);cursor:pointer}.icon-button,.mini-button{min-width:32px;padding:0}.icon-button:hover,.mini-button:hover,.binary-button:hover:not(:disabled),.jump-button:hover,.composer-send:hover:not(:disabled){border-color:var(--line-strong);background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--text)}.icon-button:disabled,.mini-button:disabled,.binary-button:disabled,.composer-send:disabled{opacity:.55;cursor:default}
      .task-list{flex:1;min-height:0;overflow:auto;padding:10px 10px 14px}.task-empty{padding:14px 12px;color:var(--muted);font-size:13px;line-height:1.6}.task-item{margin-bottom:4px}.task-item button{width:100%;border:0;border-radius:14px;background:transparent;padding:10px 12px;text-align:left;cursor:pointer}.task-item button:hover,.task-item.active button{background:color-mix(in srgb,var(--accent) 8%,transparent)}.task-line{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.task-copy{min-width:0}.task-name{display:block;color:var(--text);font-size:14px;font-weight:520;line-height:1.4}.task-meta,.task-time{margin-top:5px;color:var(--muted);font-size:12px}.task-aside{flex:none;display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;white-space:nowrap}.task-mode{color:var(--success)}.task-dot{width:8px;height:8px;border-radius:999px;background:var(--accent)}
      .chat-stage{display:flex;flex-direction:column;min-height:0;height:100%;overflow:hidden}.chat-canvas{flex:1;min-height:0;overflow:auto;position:relative;padding:0 20px}.chat-binary-spotlight-host{position:sticky;top:0;z-index:6;padding:16px 0 8px;background:linear-gradient(180deg,color-mix(in srgb,var(--canvas) 96%,transparent) 0%,color-mix(in srgb,var(--canvas) 88%,transparent) 72%,transparent 100%)}.chat-binary-spotlight-shell,.message-stack{max-width:740px;margin:0 auto 0 calc(min(9vw,76px));transition:max-width .16s ease}.chat-binary-spotlight{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(220px,.82fr);gap:16px;align-items:stretch;padding:16px 18px 17px;border:1px solid color-mix(in srgb,var(--accent) 26%,var(--line) 74%);border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),color-mix(in srgb,var(--widget-surface) 94%,transparent));box-shadow:0 18px 34px rgba(0,0,0,.22)}.chat-binary-spotlight.live{border-color:color-mix(in srgb,var(--accent) 42%,var(--line) 58%);box-shadow:0 22px 38px rgba(0,0,0,.28)}.chat-binary-copy{display:flex;flex-direction:column;gap:12px;min-width:0}.chat-binary-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.chat-binary-kicker{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.chat-binary-kicker-dot{width:8px;height:8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 78%,#fff 22%);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 14%,transparent)}.chat-binary-pill{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:11px;font-weight:600;color:var(--muted)}.chat-binary-pill.live{border-color:color-mix(in srgb,var(--accent) 42%,var(--line) 58%);color:var(--text);background:color-mix(in srgb,var(--accent) 16%,transparent)}.chat-binary-pill.saved{border-color:color-mix(in srgb,var(--line) 88%,transparent)}.chat-binary-title{margin:0;font-size:18px;line-height:1.2;font-weight:650;color:var(--text)}.chat-binary-caption{margin:0;color:var(--muted);font-size:13px;line-height:1.62}.chat-binary-metrics{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.chat-binary-metric{display:flex;align-items:center;gap:7px;min-height:28px;padding:0 10px;border:1px solid color-mix(in srgb,var(--line) 84%,transparent);border-radius:999px;background:color-mix(in srgb,var(--canvas) 18%,transparent);font-size:11px;color:var(--muted)}.chat-binary-metric strong{font-size:12px;font-weight:650;color:var(--text)}.chat-binary-notes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.chat-binary-note{min-height:0;padding:11px 12px;border:1px solid color-mix(in srgb,var(--line) 78%,transparent);border-radius:16px;background:color-mix(in srgb,var(--canvas) 16%,transparent)}.chat-binary-note-label{display:block;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.chat-binary-note-value{display:block;margin-top:6px;color:var(--text);font-size:12px;font-weight:600;line-height:1.45;word-break:break-word}.chat-binary-note-copy{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.58;word-break:break-word}.message-stack{display:flex;flex-direction:column;gap:14px;min-height:100%;padding:22px 0 24px}.empty-stage{min-height:100%;display:flex;align-items:flex-end;justify-content:flex-start;padding:18px 0 98px}.empty-stage-inner{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px;line-height:1.6}.empty-stage-logo{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--widget-surface) 78%,transparent)}.empty-stage-logo img{width:18px;height:18px}
      .message{max-width:100%;padding:2px 0 14px;border-bottom:1px solid color-mix(in srgb,var(--line) 44%,transparent)}.message:last-child{border-bottom:0;padding-bottom:0}.message.user{display:inline-block;align-self:flex-end;max-width:min(72%,420px);margin-left:auto;padding:10px 14px 11px;border:1px solid var(--accent-line);border-radius:22px 22px 8px 22px;background:var(--accent-soft-strong);color:var(--accent-foreground);box-shadow:0 10px 24px rgba(0,0,0,.14)}.message.user:last-child{padding-bottom:11px}.message.user .message-meta{display:none}.message.user .message-body{line-height:1.58}.message.user .message-body code{color:inherit}.message.system{border-bottom-style:dashed}.message.live-binary{padding:0 0 16px}.live-message-shell{display:flex;flex-direction:column;gap:14px;padding:16px 18px 17px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line) 72%);border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),color-mix(in srgb,var(--widget-surface) 92%,transparent));box-shadow:0 16px 30px rgba(0,0,0,.18)}.message.live-binary.active .live-message-shell{border-color:color-mix(in srgb,var(--accent) 42%,var(--line) 58%)}.message.live-binary.settled .live-message-shell{background:color-mix(in srgb,var(--widget-surface) 84%,transparent)}.live-message-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.live-message-kicker{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.live-message-dot{width:8px;height:8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 78%,#fff 22%);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 14%,transparent)}.live-message-pill{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:11px;font-weight:600;color:var(--muted)}.live-message-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,240px);gap:16px;align-items:stretch}.live-message-copy{display:flex;flex-direction:column;gap:10px;min-width:0}.live-message-title{margin:0;font-size:17px;line-height:1.2;font-weight:650;color:var(--text)}.live-message-caption{margin:0;color:var(--muted);font-size:13px;line-height:1.6}.live-message-metrics{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.live-message-metric{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border:1px solid color-mix(in srgb,var(--line) 82%,transparent);border-radius:999px;background:color-mix(in srgb,var(--canvas) 18%,transparent);font-size:11px;color:var(--muted)}.live-message-metric strong{font-size:12px;color:var(--text)}.live-message-notes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.live-message-note{min-height:0;padding:11px 12px;border:1px solid color-mix(in srgb,var(--line) 78%,transparent);border-radius:16px;background:color-mix(in srgb,var(--canvas) 16%,transparent)}.live-message-note-label{display:block;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.live-message-note-value{display:block;margin-top:6px;color:var(--text);font-size:12px;font-weight:600;line-height:1.5}.live-message-stream{position:relative;display:flex;flex-direction:column;justify-content:center;gap:6px;min-height:118px;padding:12px 0 8px 14px;border-left:1px solid color-mix(in srgb,var(--accent) 16%,var(--line) 84%);overflow:hidden}.message.live-binary .message-body{margin-top:14px}.message-body{font-size:14px;line-height:1.72;word-break:break-word}.message-body p{margin:0 0 10px}.message-body p:last-child,.message-body ul:last-child,.message-body ol:last-child,.message-body pre:last-child{margin-bottom:0}.message-body ul,.message-body ol{margin:0 0 12px 20px;padding:0}.message-body li{margin:0 0 6px}.message-body pre{margin:0 0 12px;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--code-surface)}.message-body code{font-family:var(--vscode-editor-font-family,"Cascadia Code","Consolas",monospace)}.code-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.code-block{display:block;padding:12px;white-space:pre}.message-followups{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.followup-button{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:12px;color:var(--muted);cursor:pointer}.followup-button:hover:not(:disabled){border-color:var(--accent-line);background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--text)}.followup-button.emphasized{border-color:var(--accent-line);background:color-mix(in srgb,var(--accent) 14%,transparent)}.followup-button:disabled{cursor:default;opacity:.82}.followup-detail{color:var(--muted);font-size:11px}
      .jump-button{position:absolute;right:20px;bottom:18px;z-index:5;padding:8px 14px;border:1px solid var(--line-strong);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 92%,transparent);cursor:pointer}
      .composer-dock{flex:none;max-height:min(68vh,640px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding:10px 20px 16px;border-top:1px solid color-mix(in srgb,var(--line) 74%,transparent);background:color-mix(in srgb,var(--surface-elevated) 96%,transparent)}.composer-shell{width:min(92%,980px);margin:0 auto;min-height:0}.composer-chip{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--widget-surface) 82%,transparent);font-size:11px;color:var(--muted)}
      .mentions{display:none;position:absolute;left:0;right:0;bottom:calc(100% + 8px);z-index:8;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:18px;background:var(--widget-surface);box-shadow:var(--shadow)}.mentions.show{display:block}.mention-item button{width:100%;border:0;background:transparent;padding:12px 14px;text-align:left;cursor:pointer;color:var(--text)}.mention-item button:hover,.mention-item button.active{background:color-mix(in srgb,var(--accent) 8%,transparent)}.composer-confirm{display:none;position:absolute;left:0;right:0;bottom:calc(100% + 8px);z-index:9;padding:12px 14px;border:1px solid color-mix(in srgb,var(--accent) 34%,var(--line) 66%);border-radius:18px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,var(--widget-surface) 88%),color-mix(in srgb,var(--widget-surface) 96%,transparent));box-shadow:var(--shadow)}.composer-confirm.show{display:flex;align-items:center;justify-content:space-between;gap:12px}.composer-confirm-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.composer-confirm-title{font-size:13px;font-weight:650;color:var(--text)}.composer-confirm-hint{font-size:11px;line-height:1.45;color:var(--muted)}.composer-confirm-button{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;border:1px solid color-mix(in srgb,var(--accent) 42%,var(--line) 58%);border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--text);cursor:pointer;white-space:nowrap}.composer-confirm-button:hover{background:color-mix(in srgb,var(--accent) 20%,transparent);border-color:color-mix(in srgb,var(--accent) 58%,var(--line) 42%)}
      .composer-shell{position:relative;display:flex;flex-direction:column;gap:0}.composer-card,.binary-details-card{border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel) 96%,transparent)}.composer-card{display:flex;flex-direction:column;min-height:0;max-height:100%;border-color:var(--line-strong);background:color-mix(in srgb,var(--input-surface) 94%,var(--surface) 6%);box-shadow:0 0 0 1px transparent}.composer-card:focus-within{border-color:var(--accent-line);box-shadow:0 0 0 1px var(--accent-focus)}.composer-input{width:100%;min-height:var(--composer-min-height);max-height:var(--composer-max-height);border:0;background:transparent;color:var(--text);resize:none;outline:none;padding:14px 18px 10px;font-size:15px;line-height:1.62}.composer-input::placeholder{color:color-mix(in srgb,var(--muted) 72%,#808080 28%)}
      .composer-bottom,.composer-actions,.composer-binary-row,.composer-binary-main,.composer-binary-actions,.binary-panel-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.composer-bottom{padding:0 12px 10px}.composer-actions{width:100%;justify-content:space-between}.composer-context{color:var(--muted);font-size:12px;white-space:nowrap}.composer-send{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--accent-line);border-radius:999px;background:var(--accent);color:var(--accent-foreground);cursor:pointer}.composer-send:hover:not(:disabled){background:var(--accent-hover);border-color:color-mix(in srgb,var(--accent-hover) 68%,var(--line) 32%)}
      .binary-panel-toggle{width:calc(100% - 20px);display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 10px 8px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--line) 76%,transparent);border-radius:12px;background:transparent;cursor:pointer}.binary-panel-toggle:hover{border-color:var(--accent-line);background:color-mix(in srgb,var(--accent) 5%,transparent)}.binary-panel-summary{min-width:0;flex:1 1 auto;gap:6px;flex-wrap:nowrap}.binary-panel-kicker{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.86}.binary-panel-value{font-size:11px;color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.binary-panel-meta{display:none}.binary-panel-chevron{color:var(--muted);font-size:14px;line-height:1}.binary-panel-body{display:flex;flex-direction:column;gap:0;min-height:0;max-height:min(54vh,520px);overflow-y:auto;overflow-x:hidden;padding-bottom:8px}.binary-panel-body.is-hidden{display:none !important}
      .composer-binary-row{justify-content:space-between;padding:8px 10px;border-top:1px solid color-mix(in srgb,var(--line) 68%,transparent)}.composer-binary-main{min-width:0;flex:1 1 auto;gap:6px}.composer-binary-actions{flex:0 0 auto;justify-content:flex-end;gap:6px}.composer-binary-actions .binary-button{min-height:26px;padding:0 10px;font-size:11px}.binary-status{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border:1px solid var(--line);border-radius:999px;font-size:10px;color:var(--muted)}.binary-status.pass{border-color:color-mix(in srgb,var(--success) 34%,var(--line) 66%);color:var(--success)}.binary-status.warn{border-color:color-mix(in srgb,var(--warning) 34%,var(--line) 66%);color:var(--warning)}.binary-status.fail{border-color:color-mix(in srgb,var(--danger) 34%,var(--line) 66%);color:var(--danger)}.binary-runtime,.binary-summary,.binary-metric{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 8px;border:1px solid color-mix(in srgb,var(--line) 84%,transparent);border-radius:999px;background:transparent;color:var(--muted);font-size:10px}.binary-runtime strong,.binary-summary strong,.binary-metric strong{font-size:11px;font-weight:600;color:var(--text)}.binary-runtime{padding-right:4px}.binary-select{min-height:20px;border:0;background:transparent;color:var(--text);outline:none;font-size:11px}.binary-button.primary,.composer-generate{border-color:var(--accent-line);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--text)}.binary-button.primary:hover:not(:disabled),.composer-generate:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 18%,transparent)}.binary-link{text-decoration:none;color:var(--text)}.binary-build-visual{display:none;grid-template-columns:minmax(0,1fr) minmax(190px,320px);align-items:stretch;gap:16px;margin:0 10px 10px;padding:14px 14px 16px;min-height:174px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line) 78%);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 8%,transparent),color-mix(in srgb,var(--widget-surface) 80%,transparent));overflow:hidden}.binary-build-visual.show{display:grid}.binary-build-copy{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:132px}.binary-build-label{display:block;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.binary-build-title{margin-top:6px;font-size:14px;font-weight:620;color:var(--text)}.binary-build-caption{margin-top:5px;color:var(--muted);font-size:12px;line-height:1.55}.binary-build-progress{margin-top:14px}.binary-build-progress-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.14em}.binary-progress-bar{margin-top:8px;height:9px;border-radius:999px;background:color-mix(in srgb,var(--line) 74%,transparent);overflow:hidden}.binary-progress-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 76%,#fff 24%),color-mix(in srgb,var(--success) 72%,#fff 28%));transition:width .18s ease}.binary-build-stream{position:relative;width:100%;max-width:100%;min-height:108px;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:12px 0 8px 14px;border-left:1px solid color-mix(in srgb,var(--accent) 16%,var(--line) 84%);overflow:hidden}.binary-build-stream-label{display:block;margin-bottom:2px;color:color-mix(in srgb,var(--accent) 82%,var(--text) 18%);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.94}.binary-build-stream::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.04) 22%,rgba(0,0,0,.22) 50%,rgba(0,0,0,.04) 78%,transparent 100%);transform:translateX(-100%);animation:binarySweep 2.4s linear infinite}.binary-build-line{display:block;font-family:var(--vscode-editor-font-family,"Cascadia Code","Consolas",monospace);font-size:12px;letter-spacing:.28em;line-height:1.15;white-space:nowrap;color:color-mix(in srgb,var(--accent) 62%,var(--text) 38%);opacity:.5;animation:binaryPulse 1.45s ease-in-out infinite}.binary-build-line:nth-child(3){animation-delay:.18s}.binary-build-line:nth-child(4){animation-delay:.36s}.binary-build-line:nth-child(5){animation-delay:.54s}.binary-build-line:nth-child(6){animation-delay:.72s}.binary-build-line:nth-child(even){transform:translateX(-8px)}.binary-build-line:nth-child(odd){transform:translateX(10px)}@keyframes binaryPulse{0%,100%{opacity:.28}50%{opacity:.95}}@keyframes binarySweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}.binary-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 10px 10px}.binary-details.is-hidden{display:none !important}.binary-details-card{min-height:0;padding:10px;background:color-mix(in srgb,var(--widget-surface) 70%,transparent)}.binary-surface{margin:6px 0 0;min-height:84px;max-height:min(28vh,240px);overflow:auto;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--input-surface) 94%,var(--surface) 6%);padding:8px 10px;font-size:11px;line-height:1.56;white-space:pre-wrap;color:var(--text)}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.is-hidden{display:none !important}
      @media (max-width:980px){.chat-canvas{padding:0 16px}.chat-binary-spotlight-shell,.message-stack{margin-left:24px}.composer-dock{padding:10px 16px 14px}.composer-shell{width:min(100%,980px)}}
      @media (max-width:820px){:root{--composer-min-height:76px;--composer-max-height:154px}.history-drawer{width:min(360px,calc(100vw - 72px))}.chat-binary-spotlight-shell,.message-stack{max-width:100%;margin-left:0}.chat-binary-spotlight{grid-template-columns:1fr;padding:15px 15px 16px}.chat-binary-title{font-size:17px}.chat-binary-notes,.live-message-notes{grid-template-columns:1fr}.message-stack{padding-top:20px}.live-message-main{grid-template-columns:1fr}.live-message-stream{min-height:92px;padding:12px 0 0;border-left:0;border-top:1px solid color-mix(in srgb,var(--accent) 16%,var(--line) 84%)}.binary-build-visual{grid-template-columns:1fr;min-height:0;padding:12px 12px 14px}.binary-build-stream{width:100%;min-height:92px;padding:12px 0 0;border-left:0;border-top:1px solid color-mix(in srgb,var(--accent) 16%,var(--line) 84%)}.binary-details{grid-template-columns:1fr}.composer-actions,.composer-binary-actions,.binary-panel-summary{width:100%;justify-content:space-between}.composer-context{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.composer-binary-main{width:100%}}
      @media (max-width:720px){.workspace-shell{grid-template-columns:1fr;grid-template-rows:56px minmax(0,1fr)}.utility-rail{flex-direction:row;justify-content:flex-start;border-right:0;border-bottom:1px solid var(--line);padding:8px 10px}.rail-button{flex:none}.rail-spacer{display:none}.workspace-main{grid-row:2}.history-drawer{width:100%;max-width:none}.chat-canvas{padding:0 12px}.chat-binary-spotlight-host{padding-top:12px}.composer-dock{max-height:min(74vh,680px);padding:8px 12px 12px}.composer-card,.binary-details-card,.mentions{border-radius:16px}}
      @media (max-width:620px){:root{--composer-min-height:70px;--composer-max-height:140px}.message{padding-bottom:10px}.message.user{max-width:min(86%,320px);padding:10px 12px 11px;border-radius:20px 20px 8px 20px}.chat-binary-spotlight{gap:12px;padding:13px 13px 14px;border-radius:18px}.chat-binary-head,.chat-binary-metrics,.live-message-head,.live-message-metrics{gap:6px}.chat-binary-title,.live-message-title{font-size:15px}.chat-binary-caption,.chat-binary-note-copy,.live-message-caption{font-size:11px}.chat-binary-note,.live-message-note{padding:10px 11px;border-radius:14px}.chat-binary-metric,.live-message-metric{width:100%;justify-content:space-between}.binary-runtime,.binary-summary,.binary-metric,.composer-meta,.composer-actions,.composer-binary-main,.composer-binary-actions{width:100%}.binary-runtime,.binary-summary,.binary-metric{justify-content:space-between}.composer-input{padding:12px 14px 9px;font-size:14px;line-height:1.56}.composer-bottom,.composer-binary-row{padding-left:10px;padding-right:10px;padding-bottom:10px}.composer-chip{min-height:22px;padding:0 8px}.composer-send{width:34px;height:34px}.composer-send svg{width:16px;height:16px}.jump-button{right:12px;bottom:12px}.binary-panel-toggle{width:calc(100% - 16px);margin:0 8px 8px;padding:7px 9px}.binary-panel-kicker{display:none}.binary-panel-value{font-size:11px}.binary-build-visual{margin:0 8px 8px;padding:11px 10px 12px}.binary-build-title{font-size:13px}.binary-build-caption{font-size:11px}.binary-build-stream,.live-message-stream{min-height:80px;padding-top:10px}.binary-build-line{font-size:11px;letter-spacing:.22em}.binary-details{padding:0 8px 8px}}
      @media (max-height:820px){:root{--composer-min-height:72px;--composer-max-height:132px}.chat-binary-spotlight-host{padding-top:12px}.message-stack{padding-top:16px;padding-bottom:16px}.empty-stage{padding-bottom:74px}.composer-dock{max-height:min(78vh,620px)}.binary-panel-body{max-height:min(58vh,460px)}.binary-surface{max-height:min(24vh,180px)}}
    </style>
  </head>
      <body data-logo-uri="${logoUri}" data-workspace-name="${workspaceName}">
    <div class="workspace-shell" id="workspaceShell" data-history-open="false" data-binary-details="false">
      <aside class="utility-rail" aria-label="Streaming Binary IDE navigation">
        <button type="button" class="rail-button" id="historyToggle" data-action="showTasks" aria-controls="historyDrawer" aria-expanded="false" title="Chats">${chatIcon}</button>
        <button type="button" class="rail-button" data-action="newChat" title="New chat">${plusIcon}</button>
        <button type="button" class="rail-button" data-action="configureBinary" title="Configure Streaming Binary IDE">${settingsIcon}</button>
        <button type="button" class="rail-button rail-button-stack" data-action="setApiKey" title="Streaming Binary IDE auth and API key">
          <span class="rail-button-icon">${keyIcon}</span>
          <span class="rail-button-text" id="authChip">Key</span>
        </button>
        <div class="rail-spacer"></div>
        <button type="button" class="rail-button" data-action="signIn" id="signIn" title="Browser sign in">${signInIcon}<span class="sr-only">Browser sign in</span></button>
        <button type="button" class="rail-button" data-action="signOut" id="signOut" title="Sign out">${signOutIcon}<span class="sr-only">Sign out</span></button>
        <button type="button" class="rail-button" data-action="undoLastChanges" id="undoChanges" title="Undo last changes">${undoIcon}<span class="sr-only">Undo last changes</span></button>
      </aside>

      <div class="workspace-main">
        <button type="button" class="drawer-scrim is-hidden" id="historyScrim" data-action="closeHistory" aria-label="Close chats"></button>

        <aside class="history-drawer" id="historyDrawer" aria-label="Streaming Binary IDE chats" aria-hidden="true">
          <div class="history-drawer-head">
            <div>
              <div class="history-drawer-label">Chats</div>
              <h1 class="history-drawer-title">Streaming Binary IDE</h1>
              <p class="history-drawer-copy">Recent conversations and portable starter bundle threads for ${workspaceName}.</p>
            </div>
            <div class="history-drawer-actions">
              <span class="drawer-count" id="historyCount">0</span>
              <button type="button" class="icon-button" data-action="loadHistory" title="Refresh chats">${refreshIcon}</button>
              <button type="button" class="icon-button" data-action="closeHistory" title="Close chats">${closeIcon}</button>
            </div>
          </div>
          <div class="task-list" id="history"></div>
          <div class="task-footer is-hidden" id="historyFooter"><button type="button" class="binary-button" data-action="loadHistory" id="historyFooterButton">View all</button></div>
        </aside>

        <main class="chat-stage" id="chatStage">
          <section class="chat-canvas" id="messages" aria-live="polite">
            <div class="chat-binary-spotlight-host is-hidden" id="chatBinarySpotlight"></div>
            <section id="messageList"></section>
          </section>
          <button type="button" class="jump-button is-hidden" id="jumpToLatest">Jump to latest</button>

          <section class="composer-dock">
            <div class="composer-shell">
              <div class="mentions" id="mentions"></div>
              <div class="composer-confirm" id="composerConfirm" aria-live="polite">
                <div class="composer-confirm-copy">
                  <span class="composer-confirm-title">Create a plan?</span>
                  <span class="composer-confirm-hint">Press Enter to switch into plan mode, or keep typing to cancel.</span>
                </div>
                <button type="button" class="composer-confirm-button" id="composerConfirmButton">Plan mode</button>
              </div>
              <div class="composer-card">
                <textarea id="composer" class="composer-input" placeholder="Describe the portable starter bundle you want. @ to add files, / for commands" spellcheck="false"></textarea>

                <div class="composer-bottom">
                  <div class="composer-actions">
                    <span class="composer-context">Use @ to pull files into the bundle plan.</span>
                    <button type="button" class="binary-button composer-generate" data-action="generateBinary" id="generateBinaryButton">Generate Bundle</button>
                    <button type="button" class="composer-send" id="send" aria-label="Send">${sendIcon}</button>
                  </div>
                </div>

                <button type="button" class="binary-panel-toggle" id="binaryPanelToggle" data-action="toggleBinaryPanel" aria-expanded="false">
                  <div class="binary-panel-summary">
                    <span class="binary-panel-kicker">Bundle Panel</span>
                    <span class="binary-panel-value" id="binaryPanelSummary">Node 18 • No bundle yet</span>
                    <span class="binary-panel-meta" id="binaryPanelMeta">Runtime, reliability, publish, and download controls.</span>
                  </div>
                  <span class="binary-panel-chevron" id="binaryPanelChevron">+</span>
                </button>

                <div class="binary-panel-body is-hidden" id="binaryPanelBody">
                  <div class="composer-binary-row" id="binaryPanel">
                    <div class="composer-binary-main">
                      <label class="binary-runtime">
                        <span class="binary-strip-label">Runtime</span>
                        <select id="binaryTargetRuntime" class="binary-select">
                          <option value="node18">Node 18</option>
                          <option value="node20">Node 20</option>
                        </select>
                      </label>
                      <span class="binary-status" id="binaryStatusBadge">No bundle yet</span>
                      <div class="binary-metric">
                        <span class="binary-strip-label">Reliability</span>
                        <strong id="binaryReliabilityScore">--</strong>
                      </div>
                      <div class="binary-summary">
                        <span class="binary-strip-label">Bundle</span>
                        <strong id="binaryArtifactLabel">No bundle yet</strong>
                      </div>
                      <div class="binary-summary">
                        <span class="binary-strip-label">Publish</span>
                        <strong id="binaryPublishLabel">Private</strong>
                      </div>
                      <div class="binary-summary">
                        <span class="binary-strip-label">Phase</span>
                        <strong id="binaryPhaseLabel">Queued</strong>
                      </div>
                    </div>
                    <div class="composer-binary-actions">
                      <button type="button" class="binary-button" data-action="cancelBinary" id="cancelBinaryButton">Cancel</button>
                      <button type="button" class="binary-button" data-action="validateBinary" id="validateBinaryButton">Validate</button>
                      <button type="button" class="binary-button" data-action="deployBinary" id="deployBinaryButton">Publish</button>
                      <a class="binary-button binary-link is-hidden" id="binaryDownloadLink" target="_blank" rel="noopener noreferrer">Download</a>
                      <button type="button" class="binary-button" data-action="toggleBinaryDetails" id="binaryDetailsButton" aria-expanded="false">Details</button>
                    </div>
                  </div>

                  <div class="binary-build-visual" id="binaryBuildVisual">
                    <div class="binary-build-copy">
                      <span class="binary-build-label">Binary Assembly</span>
                      <div class="binary-build-title" id="binaryBuildTitle">Compiling portable package bundle</div>
                      <div class="binary-build-caption" id="binaryBuildCaption">Encoding workspace intent into a runnable starter bundle.</div>
                      <div class="binary-build-progress">
                        <div class="binary-build-progress-head">
                          <span id="binaryProgressLabel">Queued</span>
                          <strong id="binaryProgressValue">0%</strong>
                        </div>
                        <div class="binary-progress-bar" aria-hidden="true">
                          <div class="binary-progress-fill" id="binaryProgressFill"></div>
                        </div>
                      </div>
                    </div>
                    <div class="binary-build-stream" aria-hidden="true">
                      <span class="binary-build-stream-label">Live Stream</span>
                      <span class="binary-build-line">101010 001101 101010 110010 010101</span>
                      <span class="binary-build-line">010101 110010 001101 101010 011001</span>
                      <span class="binary-build-line">111000 101010 010101 001111 101000</span>
                      <span class="binary-build-line">001101 010101 111000 101010 010011</span>
                      <span class="binary-build-line">110010 001101 010101 111000 101101</span>
                    </div>
                  </div>

                  <div class="binary-details is-hidden" id="binaryDetailsPanel">
                    <div class="binary-details-card">
                      <span class="binary-subhead">Manifest</span>
                      <div class="binary-surface" id="binaryManifestPreview">Generate a portable starter bundle to inspect its manifest.</div>
                    </div>
                    <div class="binary-details-card">
                      <span class="binary-subhead">Warnings</span>
                      <div class="binary-surface" id="binaryWarnings">No Streaming Binary IDE warnings yet.</div>
                    </div>
                    <div class="binary-details-card">
                      <span class="binary-subhead">Live Files</span>
                      <div class="binary-surface" id="binaryPreviewFiles">Generated file previews will appear here as the build progresses.</div>
                    </div>
                    <div class="binary-details-card">
                      <span class="binary-subhead">Live Logs</span>
                      <div class="binary-surface" id="binaryLogPreview">Streaming build logs will appear here.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
    <script nonce="${input.nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
//# sourceMappingURL=webview-html.js.map