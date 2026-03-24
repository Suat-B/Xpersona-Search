import * as vscode from "vscode";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function icon(path: string, size = 14): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}

export function buildWebviewHtml(webview: vscode.Webview): string {
  const nonce = String(Date.now());
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  const chatIcon = icon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", 14);
  const plusIcon = icon("M12 5v14 M5 12h14", 14);
  const artifactsIcon = icon("M3 7l9-4 9 4-9 4-9-4 M3 7v10l9 4 9-4V7 M12 11v10", 14);
  const refreshIcon = icon("M3 12a9 9 0 0 0 15.5 6.36L21 16 M21 21v-5h-5", 14);
  const closeIcon = icon("M18 6 6 18 M6 6l12 12", 14);
  const keyIcon = icon("M21 2l-2 2m-7 5a5 5 0 1 0-7 7l2-2h3l2-2v-3z", 14);
  const settingsIcon = icon(
    "M12 3a2.5 2.5 0 0 0-2.45 2l-.13.78a7.96 7.96 0 0 0-1.52.88l-.72-.29a2.5 2.5 0 0 0-3.18 1.42 2.5 2.5 0 0 0 .85 3.02l.65.46a8.77 8.77 0 0 0 0 1.76l-.65.46a2.5 2.5 0 0 0-.85 3.02 2.5 2.5 0 0 0 3.18 1.42l.72-.29c.47.36.98.65 1.52.88l.13.78A2.5 2.5 0 0 0 12 21a2.5 2.5 0 0 0 2.45-2l.13-.78a7.96 7.96 0 0 0 1.52-.88l.72.29a2.5 2.5 0 0 0 3.18-1.42 2.5 2.5 0 0 0-.85-3.02l-.65-.46a8.77 8.77 0 0 0 0-1.76l.65-.46a2.5 2.5 0 0 0 .85-3.02 2.5 2.5 0 0 0-3.18-1.42l-.72.29a7.96 7.96 0 0 0-1.52-.88l-.13-.78A2.5 2.5 0 0 0 12 3z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4",
    14
  );
  const submitIcon = icon("M12 17V8M8.5 12.5l3.5-3.5 3.5 3.5", 22);
  const composerStopIcon = icon("M8 8h8v8H8z", 22);
  const encodedComposerSubmitIcon = JSON.stringify(submitIcon);
  const encodedComposerStopIcon = JSON.stringify(composerStopIcon);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cutie</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme, dark);
      --surface: var(--vscode-sideBar-background, #111418);
      --surface-elevated: color-mix(in srgb, var(--surface) 82%, var(--vscode-editor-background, #0d1014) 18%);
      --canvas: var(--vscode-editor-background, #0d1014);
      --panel: var(--vscode-sideBar-background, #171b22);
      --panel-soft: var(--vscode-input-background, #1b2029);
      --panel-elevated: var(--vscode-editorWidget-background, var(--panel-soft));
      --line: color-mix(in srgb, var(--vscode-panel-border, var(--vscode-widget-border, #2a313d)) 76%, transparent);
      --line-strong: color-mix(in srgb, var(--vscode-panel-border, var(--vscode-widget-border, #2a313d)) 100%, transparent);
      --text: var(--vscode-foreground, #eef2f7);
      --muted: color-mix(in srgb, var(--vscode-descriptionForeground, #98a0ae) 84%, #fff 16%);
      --accent: var(--vscode-button-background, var(--vscode-focusBorder, #4f8cff));
      --accent-hover: var(--vscode-button-hoverBackground, color-mix(in srgb, var(--accent) 84%, #fff 16%));
      --accent-foreground: var(--vscode-button-foreground, #ffffff);
      --accent-line: color-mix(in srgb, var(--accent) 42%, var(--line) 58%);
      --focus: var(--vscode-focusBorder, var(--accent));
      --success: var(--vscode-gitDecoration-addedResourceForeground, #79d8a2);
      --danger: var(--vscode-errorForeground, #ff8f9d);
      --user: color-mix(in srgb, var(--accent) 18%, var(--canvas) 82%);
      --assistant: color-mix(in srgb, var(--panel-elevated) 86%, var(--canvas) 14%);
      --widget-surface: var(--panel-elevated);
      --shadow: 0 20px 44px rgba(0, 0, 0, 0.34);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      min-height: 100%;
      overflow: hidden;
      background: var(--surface);
      color: var(--text);
      font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      font-size: var(--vscode-font-size, 13px);
    }
    body {
      height: 100dvh;
    }
    button, textarea {
      font: inherit;
      color: inherit;
    }
    .workspace-shell {
      display: grid;
      grid-template-rows: 44px minmax(0, 1fr);
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
      background: var(--surface);
    }
    .utility-rail {
      position: relative;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
    }
    .workspace-header-title {
      min-width: 0;
      max-width: none;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 13px;
      font-weight: 620;
      letter-spacing: 0.01em;
    }
    .workspace-header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      flex: 0 1 auto;
      min-width: 0;
      margin-left: auto;
    }
    .rail-button,
    .auth-status-button,
    .composer-send,
    .icon-button,
    .session,
    .menu-button {
      transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
    }
    .rail-button {
      width: 26px;
      min-height: 26px;
      display: grid;
      place-items: center;
      gap: 0;
      padding: 2px 0;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .rail-button:hover,
    .rail-button:focus-visible,
    .rail-button.active {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--text);
      outline: none;
    }
    .rail-button.is-hidden {
      display: none;
    }
    .auth-status-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      padding: 0 9px;
      border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--widget-surface) 82%, transparent);
      color: var(--muted);
      cursor: pointer;
    }
    .auth-status-button svg {
      flex: none;
    }
    .auth-status-button:hover,
    .auth-status-button:focus-visible {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--text);
      outline: none;
    }
    .auth-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--muted);
      opacity: 0.7;
      box-shadow: 0 0 0 0 transparent;
      transition: background-color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
    }
    .auth-status-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
    }
    .auth-status-button.is-ready {
      border-color: color-mix(in srgb, var(--success) 42%, var(--line) 58%);
      background: color-mix(in srgb, var(--success) 14%, transparent);
      color: var(--success);
    }
    .auth-status-button.is-ready .auth-status-dot {
      background: var(--success);
      opacity: 1;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 20%, transparent);
    }
    .settings-menu-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .settings-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 30;
      min-width: 192px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: color-mix(in srgb, var(--widget-surface) 96%, transparent);
      box-shadow: var(--shadow);
    }
    .settings-menu.is-hidden {
      display: none;
    }
    .settings-menu button {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font-size: 12px;
      cursor: pointer;
    }
    .settings-menu button:hover,
    .settings-menu button:focus-visible {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border-color: color-mix(in srgb, var(--accent) 24%, var(--line) 76%);
      outline: none;
    }
    .settings-menu button:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .settings-menu button.is-hidden {
      display: none;
    }
    .menu-button {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font-size: 12px;
      cursor: pointer;
    }
    .menu-button:hover,
    .menu-button:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 24%, var(--line) 76%);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      outline: none;
    }
    .menu-button.danger {
      color: var(--danger);
    }
    .drawer-scrim {
      display: none;
      position: absolute;
      inset: 0;
      z-index: 14;
      border: 0;
      background: rgba(0, 0, 0, 0.34);
      cursor: pointer;
    }
    .workspace-shell[data-history-open="true"] .drawer-scrim,
    .workspace-shell[data-artifacts-open="true"] .drawer-scrim {
      display: block;
    }
    .history-drawer {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 15;
      width: min(340px, calc(100vw - 84px));
      display: flex;
      flex-direction: column;
      gap: 0;
      min-height: 0;
      border-right: 1px solid var(--line);
      background: var(--widget-surface);
      box-shadow: var(--shadow);
      transform: translateX(-104%);
      opacity: 0;
      pointer-events: none;
    }
    .workspace-shell[data-history-open="true"] .history-drawer {
      transform: translateX(0);
      opacity: 1;
      pointer-events: auto;
    }
    .artifacts-drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 15;
      width: min(360px, calc(100vw - 84px));
      display: flex;
      flex-direction: column;
      gap: 0;
      min-height: 0;
      border-left: 1px solid var(--line);
      background: var(--widget-surface);
      box-shadow: var(--shadow);
      transform: translateX(104%);
      opacity: 0;
      pointer-events: none;
    }
    .workspace-shell[data-artifacts-open="true"] .artifacts-drawer {
      transform: translateX(0);
      opacity: 1;
      pointer-events: auto;
    }
    .history-drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--line);
    }
    .history-drawer-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .history-drawer-title {
      margin: 6px 0 0;
      font-size: 17px;
      font-weight: 620;
    }
    .history-drawer-copy {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .history-drawer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .drawer-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      min-height: 24px;
      padding: 0 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 11px;
    }
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-width: 32px;
      min-height: 30px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--widget-surface) 82%, transparent);
      cursor: pointer;
      color: inherit;
    }
    .icon-button:hover,
    .icon-button:focus-visible {
      border-color: var(--line-strong);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      color: var(--text);
      outline: none;
    }
    .task-list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 10px 14px;
    }
    .task-empty {
      padding: 14px 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .task-item {
      margin-bottom: 4px;
    }
    .task-footer {
      padding: 10px 12px 14px;
      border-top: 1px solid var(--line);
    }
    .task-footer.is-hidden {
      display: none;
    }
    .binary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--widget-surface) 82%, transparent);
      cursor: pointer;
      color: inherit;
      font-size: 12px;
    }
    .binary-button:hover:not(:disabled) {
      border-color: var(--line-strong);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      color: var(--text);
    }
    .workspace-main {
      position: relative;
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 228px minmax(0, 1fr);
      overflow: hidden;
      background: var(--canvas);
    }
    .sidebar {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 94%, var(--surface) 6%);
    }
    .brand {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--line);
    }
    .brand-kicker {
      display: block;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .brand strong {
      display: block;
      margin-top: 4px;
      font-size: 14px;
      font-weight: 600;
    }
    .brand span,
    .status-line {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .desktop-panel {
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
    }
    .sidebar-note {
      padding: 8px 12px 10px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
    }
    .task-list .session {
      width: 100%;
      margin-bottom: 0;
      text-align: left;
      border: 0;
      border-radius: 14px;
      background: var(--widget-surface);
      color: var(--text);
      padding: 10px 12px;
      cursor: pointer;
    }
    .session {
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text);
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
    }
    .session:hover,
    .session:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 18%, var(--line) 82%);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .task-list .session:hover,
    .task-list .session:focus-visible {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .session.active {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .task-list .session.active {
      border: 0;
      box-shadow: none;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .session-title {
      display: block;
      font-size: 12px;
      font-weight: 550;
      line-height: 1.35;
      word-break: break-word;
    }
    .session small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      line-height: 1.45;
    }
    .main {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .chat {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 10px 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scrollbar-gutter: stable;
    }
    .empty {
      margin: auto auto 0;
      width: min(560px, 100%);
      padding: 24px;
      border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line) 82%);
      border-radius: 22px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 8%, transparent),
        color-mix(in srgb, var(--panel-elevated) 88%, transparent)
      );
      color: var(--muted);
      line-height: 1.65;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .empty.empty-minimal {
      padding: 16px 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      font-size: 13px;
      color: var(--muted);
      text-align: center;
      line-height: 1.55;
    }
    .bubble {
      max-width: min(760px, 92%);
      padding: 8px 11px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--assistant);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .bubble.user {
      align-self: flex-end;
      background: var(--user);
      border-color: var(--accent-line);
      border-radius: 20px 20px 10px 20px;
    }
    .bubble.assistant {
      align-self: stretch;
      min-width: 0;
      max-width: 100%;
      padding: 2px 0 10px;
      margin: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      color: var(--text);
    }
    .bubble.system {
      align-self: stretch;
      max-width: 100%;
      padding: 4px 0 4px 10px;
      margin: 0;
      border: 0;
      border-left: 2px solid color-mix(in srgb, var(--line) 70%, var(--muted) 30%);
      border-radius: 0;
      background: transparent;
      color: var(--muted);
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.5;
      text-align: left;
      min-width: 0;
      opacity: 0.92;
    }
    .bubble.ran-line {
      align-self: stretch;
      max-width: 100%;
      padding: 1px 0 2px;
      margin: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      min-width: 0;
      opacity: 1;
      cursor: pointer;
    }
    .bubble.ran-line .activity-row {
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      gap: 0;
      align-items: flex-start;
    }
    .bubble.ran-line .activity-badge {
      display: none;
    }
    .bubble.ran-line .activity-body {
      gap: 2px;
    }
    .bubble.ran-line .activity-title,
    .bubble.ran-line .activity-meta {
      text-align: left;
    }
    .bubble.ran-line .activity-title {
      color: var(--muted);
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: normal;
      opacity: 0.96;
    }
    .bubble.ran-line:hover .activity-title,
    .bubble.ran-line:focus-visible .activity-title {
      color: var(--text);
    }
    .bubble.ran-line .activity-meta {
      display: none;
    }
    .bubble.ran-line .activity-row.is-expanded .activity-title {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .ran-inline-details {
      display: none;
      margin-top: 6px;
      padding: 10px 12px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--canvas) 34%, var(--panel-elevated) 66%);
      color: var(--text);
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-x: auto;
    }
    .bubble.ran-line .activity-row.is-expanded .ran-inline-details {
      display: block;
    }
    .activity-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel-elevated) 90%, var(--canvas) 10%);
    }
    .activity-row.is-prominent {
      align-items: center;
      gap: 8px;
      width: fit-content;
      max-width: min(100%, 540px);
      min-height: 30px;
      padding: 0 12px;
      border-color: var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--widget-surface) 82%, transparent);
      box-shadow: none;
    }
    .activity-row.is-prominent .activity-badge {
      min-width: 0;
      padding: 0;
      background: transparent;
      color: var(--text);
      font-size: 10px;
      line-height: 1.1;
    }
    .activity-row.is-prominent .activity-body {
      flex: 0 1 auto;
      min-width: 0;
      gap: 0;
    }
    .activity-row.is-prominent .activity-title {
      font-size: 11px;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .activity-row.is-prominent .activity-meta {
      display: none;
    }
    .activity-badge {
      flex: 0 0 auto;
      min-width: 4.4rem;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1.2;
      text-transform: uppercase;
      text-align: center;
      background: color-mix(in srgb, var(--line) 75%, transparent);
      color: var(--muted);
    }
    .activity-badge.status-completed {
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      color: color-mix(in srgb, var(--text) 86%, var(--accent) 14%);
    }
    .activity-badge.status-blocked {
      background: color-mix(in srgb, var(--danger) 18%, transparent);
      color: var(--danger);
    }
    .activity-badge.status-failed {
      background: color-mix(in srgb, var(--danger) 24%, transparent);
      color: color-mix(in srgb, var(--danger) 82%, #fff 18%);
    }
    .activity-body {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .activity-title {
      color: var(--text);
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }
    .activity-meta {
      color: var(--muted);
      font-size: 10px;
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      line-height: 1.45;
      word-break: break-word;
      opacity: 0.94;
    }
    .run-activity-card {
      align-self: stretch;
      max-width: 100%;
      margin: 8px 0 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line) 78%);
      border-radius: 14px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 10%, transparent),
        color-mix(in srgb, var(--panel-elevated) 95%, var(--canvas) 5%)
      );
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
      overflow: hidden;
    }
    .run-activity-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
    }
    .run-activity-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .run-activity-pulse {
      flex: 0 0 auto;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 38%, transparent);
      animation: cutiePulse 1.8s ease-out infinite;
    }
    .run-activity-title {
      min-width: 0;
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .run-activity-chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      flex: 0 1 auto;
    }
    .run-activity-chip {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
      background: color-mix(in srgb, var(--canvas) 26%, transparent);
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      line-height: 1.2;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .run-activity-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px 12px;
    }
    .run-activity-status {
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
      word-break: break-word;
    }
    .run-activity-summary {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.55;
      word-break: break-word;
    }
    .run-activity-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .run-activity-empty {
      padding: 10px 11px;
      border: 1px dashed color-mix(in srgb, var(--line) 74%, transparent);
      border-radius: 10px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--canvas) 20%, transparent);
    }
    @keyframes cutiePulse {
      0% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent);
      }
      70% {
        box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent);
      }
      100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent);
      }
    }
    .bubble.cutie-diff {
      align-self: stretch;
      max-width: 100%;
      min-width: 0;
      padding: 0;
      margin: 10px 0 8px;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line) 78%);
      border-radius: 12px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 10%, transparent),
        color-mix(in srgb, var(--panel-elevated) 95%, var(--canvas) 5%)
      );
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
      overflow: hidden;
    }
    .cutie-diff-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      padding: 10px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
      background: transparent;
    }
    .cutie-diff-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1 1 180px;
      min-width: 0;
    }
    .cutie-diff-kicker {
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .cutie-diff-title {
      min-width: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--text);
      word-break: break-word;
      line-height: 1.35;
      letter-spacing: 0.01em;
    }
    .cutie-diff-meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 6px;
      flex: 0 1 auto;
    }
    .cutie-diff-badge {
      flex: 0 0 auto;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
      background: color-mix(in srgb, var(--canvas) 26%, transparent);
      color: var(--text);
    }
    .cutie-diff-stats {
      display: flex;
      align-items: center;
      gap: 5px;
      flex: 0 0 auto;
    }
    .cutie-diff-stat {
      font-size: 10px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      padding: 2px 7px;
      border-radius: 999px;
      line-height: 1.35;
    }
    .cutie-diff-stat.add {
      background: color-mix(in srgb, var(--success) 22%, transparent);
      color: var(--success);
    }
    .cutie-diff-stat.del {
      background: color-mix(in srgb, var(--danger) 18%, transparent);
      color: var(--danger);
    }
    .cutie-diff-open {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 11px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--line) 70%, var(--accent) 30%);
      background: color-mix(in srgb, var(--canvas) 16%, transparent);
      color: color-mix(in srgb, var(--text) 92%, var(--accent) 8%);
      cursor: pointer;
    }
    .cutie-diff-open:hover,
    .cutie-diff-open:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 35%, var(--line) 65%);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .cutie-diff-body {
      max-height: 360px;
      overflow: auto;
      scrollbar-gutter: stable;
      border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
      background: color-mix(in srgb, var(--canvas) 30%, transparent);
    }
    .cutie-diff-patch {
      margin: 0;
      padding: 8px 0 10px;
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.5;
    }
    .cutie-diff-patch .diff-line {
      padding: 1px 10px 1px 8px;
      white-space: pre-wrap;
      word-break: break-word;
      border-left: 2px solid transparent;
    }
    .cutie-diff-patch .diff-line.ctx {
      color: color-mix(in srgb, var(--muted) 90%, var(--text) 10%);
    }
    .cutie-diff-patch .diff-line.add {
      background: color-mix(in srgb, var(--success) 12%, transparent);
      color: var(--text);
      border-left-color: color-mix(in srgb, var(--success) 55%, transparent);
    }
    .cutie-diff-patch .diff-line.del {
      background: color-mix(in srgb, var(--danger) 10%, transparent);
      color: var(--text);
      border-left-color: color-mix(in srgb, var(--danger) 50%, transparent);
    }
    .cutie-diff-patch .diff-line.hunk {
      color: color-mix(in srgb, var(--muted) 75%, var(--accent) 25%);
      font-weight: 700;
      font-size: 10px;
      margin-top: 4px;
      padding-top: 4px;
      border-left: 0;
    }
    .cutie-files-summary {
      align-self: stretch;
      max-width: 100%;
      min-width: 0;
      margin: 10px 0 4px;
      border: 1px solid color-mix(in srgb, var(--line) 90%, var(--muted) 10%);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel-elevated) 92%, var(--canvas) 8%);
      overflow: hidden;
    }
    .cutie-files-summary.in-drawer {
      margin: 2px 0 10px;
    }
    .cutie-files-summary-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 12px;
      padding: 10px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
      background: color-mix(in srgb, var(--line) 8%, transparent);
    }
    .cutie-files-summary-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: 0.02em;
    }
    .cutie-files-summary-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .cutie-files-summary-btn {
      font-size: 11px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--line) 75%, var(--accent) 25%);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .cutie-files-summary-btn:hover,
    .cutie-files-summary-btn:focus-visible {
      border-color: var(--accent-line);
      color: var(--text);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      outline: none;
    }
    .cutie-files-summary-btn-primary {
      color: color-mix(in srgb, var(--text) 90%, var(--accent) 10%);
    }
    .cutie-files-summary-list {
      max-height: 220px;
      overflow: auto;
      scrollbar-gutter: stable;
    }
    .cutie-files-summary-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
      cursor: pointer;
      text-align: left;
      width: 100%;
      border-left: 0;
      border-right: 0;
      border-top: 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }
    .cutie-files-summary-row:last-child {
      border-bottom: 0;
    }
    .cutie-files-summary-row:hover,
    .cutie-files-summary-row:focus-visible {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
      outline: none;
    }
    .cutie-files-summary-path {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 11px;
      line-height: 1.45;
      word-break: break-word;
      color: var(--text);
    }
    .cutie-files-summary-stats {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .cutie-files-stat {
      font-size: 10px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      padding: 2px 7px;
      border-radius: 999px;
      line-height: 1.35;
    }
    .cutie-files-stat.add {
      background: color-mix(in srgb, var(--success) 22%, transparent);
      color: var(--success);
    }
    .cutie-files-stat.del {
      background: color-mix(in srgb, var(--danger) 18%, transparent);
      color: var(--danger);
    }
    .objectives-panel {
      display: none;
      flex: 0 0 auto;
      min-width: 0;
      width: 100%;
      padding: 8px 12px 6px;
      border-top: 1px solid var(--line);
      background: color-mix(in srgb, var(--accent) 6%, var(--canvas));
      font-size: 11px;
      line-height: 1.4;
    }
    .objectives-panel.is-hidden {
      display: none;
    }
    .objectives-panel-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }
    .objective-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 4px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
    }
    .objective-row:last-child {
      border-bottom: 0;
    }
    .objective-status {
      flex: 0 0 auto;
      font-weight: 700;
      min-width: 4.5rem;
    }
    .objective-row.objective-pending .objective-status {
      color: color-mix(in srgb, var(--muted) 60%, var(--text) 40%);
    }
    .objective-row.objective-done .objective-status {
      color: var(--success);
    }
    .objective-row.objective-blocked .objective-status {
      color: var(--danger);
    }
    .objective-text {
      flex: 1 1 auto;
      min-width: 0;
      color: var(--text);
    }
    .composer {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
      width: 100%;
      padding: 6px 10px 8px;
      display: grid;
      gap: 4px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--canvas) 98%, #000 2%), var(--canvas));
      overflow: visible;
    }
    .prompt-queue-wrap {
      min-width: 0;
      width: 100%;
      max-width: 100%;
      border: 1px solid var(--accent-line);
      border-radius: 11px;
      background: color-mix(in srgb, var(--accent) 9%, var(--panel-elevated) 91%);
      padding: 8px 10px 7px;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .prompt-queue-wrap.is-hidden {
      display: none;
    }
    .prompt-queue-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .prompt-queue-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .prompt-queue-badge {
      flex: 0 0 auto;
      min-width: 1.5rem;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      line-height: 1.3;
    }
    .prompt-queue-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 200px;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-gutter: stable;
    }
    .prompt-queue-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      padding: 5px 8px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--line) 88%, var(--accent) 12%);
      background: color-mix(in srgb, var(--canvas) 40%, transparent);
      font-size: 11px;
      line-height: 1.45;
      color: var(--text);
    }
    .prompt-queue-num {
      flex: 0 0 auto;
      font-weight: 700;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      line-height: 1.45;
    }
    .prompt-queue-text {
      flex: 1 1 0%;
      min-width: 0;
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      font-feature-settings: normal;
      line-height: 1.45;
    }
    .composer-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel-elevated) 90%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 8%, transparent);
      overflow: hidden;
    }
    .mentions {
      display: none;
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: calc(100% + 4px);
      z-index: 12;
      max-height: 168px;
      overflow: auto;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel-elevated) 96%, transparent);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
      padding: 2px;
    }
    .mentions.show {
      display: block;
    }
    .mention-item {
      padding: 0;
    }
    .mention-item.placeholder button {
      cursor: default;
      opacity: 0.86;
    }
    .mention-item button {
      width: 100%;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      text-align: left;
      padding: 3px 6px;
      min-height: 0;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 5px;
    }
    .mention-item button:hover {
      border-color: color-mix(in srgb, var(--accent) 20%, var(--line) 80%);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .mention-item button.active,
    .mention-item button:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 64%, #fff 36%);
      background: var(--accent);
      color: var(--accent-foreground);
      outline: none;
    }
    .mention-kind {
      flex: 0 0 auto;
      min-width: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      align-self: center;
      min-height: 14px;
      padding: 0 4px;
      border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
      border-radius: 999px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      line-height: 1.1;
    }
    .mention-item button.active .mention-kind,
    .mention-item button:focus-visible .mention-kind {
      color: inherit;
      border-color: color-mix(in srgb, var(--accent-foreground) 42%, transparent);
    }
    .mention-copy {
      min-width: 0;
      display: grid;
      gap: 0;
    }
    .mention-label {
      font-size: 10px;
      line-height: 1.28;
      color: inherit;
      word-break: break-word;
    }
    .mention-detail {
      font-size: 9px;
      line-height: 1.25;
      color: var(--muted);
      word-break: break-word;
    }
    .mention-item button.active .mention-detail,
    .mention-item button:focus-visible .mention-detail {
      color: color-mix(in srgb, var(--accent-foreground) 78%, transparent);
    }
    textarea {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--text);
      padding: 6px 10px 5px;
      resize: none;
      min-height: 40px;
      max-height: 88px;
      outline: none;
      line-height: 1.45;
    }
    .composer-row {
      position: relative;
      z-index: 2;
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      align-items: center;
      padding: 4px 8px 5px;
    }
    .composer-footer {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px;
      padding: 8px 4px 2px;
      margin-top: 2px;
      min-width: 0;
    }
    .composer-footer-select {
      flex: 1 1 0;
      min-width: 0;
      max-width: none;
      padding: 5px 8px;
      border-radius: 8px;
      border: none;
      background: var(--panel-soft);
      color: var(--text);
      font-size: 11px;
      line-height: 1.35;
      cursor: pointer;
      outline: none;
      box-shadow: none;
    }
    .composer-footer-select:hover,
    .composer-footer-select:focus-visible {
      background: color-mix(in srgb, var(--panel-soft) 70%, var(--accent) 8%);
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .chip {
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 0 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .chip:hover,
    .chip:focus-visible {
      color: var(--text);
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      outline: none;
    }
    .composer-send {
      width: 36px;
      height: 36px;
      padding: 0;
      line-height: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid color-mix(in srgb, var(--accent) 72%, var(--line) 28%);
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-foreground);
      cursor: pointer;
      flex: 0 0 auto;
    }
    .composer-send svg {
      display: block;
      flex-shrink: 0;
    }
    .composer-send:hover,
    .composer-send:focus-visible {
      background: var(--accent-hover);
      border-color: var(--accent);
      outline: none;
    }
    .composer-send.is-busy {
      opacity: 0.82;
      transform: scale(0.98);
    }
    .composer-send.is-stop {
      background: var(--accent);
      border-color: color-mix(in srgb, var(--accent) 72%, var(--line) 28%);
      color: var(--accent-foreground);
    }
    .composer-send.is-stop:hover,
    .composer-send.is-stop:focus-visible {
      background: var(--accent-hover);
      border-color: var(--accent);
      outline: none;
    }
    .status-line {
      display: none;
      padding: 0;
      font-size: 11px;
    }
    .binary-panel {
      flex: 0 0 auto;
      margin: 0 12px 6px;
      min-width: 0;
    }
    .binary-panel:not(.is-collapsed) {
      padding: 10px 12px 12px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line) 78%);
      background: color-mix(in srgb, var(--panel-elevated) 92%, var(--canvas) 8%);
    }
    .binary-panel.is-collapsed {
      margin-bottom: 4px;
    }
    .binary-panel-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--line) 88%, var(--accent) 12%);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-elevated) 90%, var(--canvas) 10%);
      color: inherit;
      cursor: pointer;
      text-align: left;
      transition: background-color 0.16s ease, border-color 0.16s ease;
    }
    .binary-panel:not(.is-collapsed) .binary-panel-toggle {
      border: 0;
      border-radius: 10px;
      padding: 4px 2px 10px;
      margin: 0 0 2px;
      background: transparent;
    }
    .binary-panel-toggle:hover,
    .binary-panel-toggle:focus-visible {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 8%, var(--panel-elevated) 92%);
      outline: none;
    }
    .binary-panel:not(.is-collapsed) .binary-panel-toggle:hover,
    .binary-panel:not(.is-collapsed) .binary-panel-toggle:focus-visible {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
    }
    .binary-panel-chevron {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      font-size: 14px;
      line-height: 1;
      color: var(--muted);
      transition: transform 0.2s ease;
      transform: rotate(0deg);
    }
    .binary-panel:not(.is-collapsed) .binary-panel-chevron {
      transform: rotate(90deg);
    }
    .binary-panel-title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .binary-panel-chip {
      flex: 0 1 auto;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      max-width: 42%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .binary-panel-body {
      min-width: 0;
    }
    .binary-panel-body[hidden] {
      display: none !important;
    }
    .binary-progress-track {
      height: 4px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--line) 55%, transparent);
      overflow: hidden;
      margin-bottom: 8px;
    }
    .binary-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: inherit;
      background: color-mix(in srgb, var(--accent) 78%, var(--line) 22%);
      transition: width 0.2s ease;
    }
    .binary-meta {
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
      margin-bottom: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .binary-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .binary-action {
      font-size: 11px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid var(--accent-line);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--text);
      cursor: pointer;
    }
    .binary-action:hover,
    .binary-action:focus-visible {
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      outline: none;
    }
    .binary-action:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .binary-action.subtle {
      border-color: var(--line);
      background: color-mix(in srgb, var(--widget-surface) 80%, transparent);
    }
    .binary-runtime-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .binary-runtime-select {
      flex: 0 0 auto;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
      color: var(--text);
    }
    .binary-execute-row {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
    }
    .binary-execute-row input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 5px 8px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
      color: var(--text);
      font-size: 11px;
    }
    .binary-activity-log {
      font-size: 10px;
      color: var(--muted);
      line-height: 1.4;
      max-height: 72px;
      overflow-y: auto;
      font-family: ui-monospace, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .bubble.assistant.live-binary {
      border-left: 3px solid color-mix(in srgb, var(--accent) 70%, var(--line) 30%);
      padding-left: 10px;
    }
    .live-binary-meta {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .live-binary-body {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .bubble.assistant.live-actions {
      align-self: stretch;
      max-width: 100%;
      margin: 2px 0 8px;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line) 80%);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-elevated) 94%, var(--canvas) 6%);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 10%, transparent);
    }
    .live-actions-meta {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .live-actions-body {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .live-actions-line {
      color: var(--text);
      opacity: 0.96;
    }
    .live-actions-line.is-status {
      color: var(--muted);
    }
    .live-actions-line.is-step {
      color: color-mix(in srgb, var(--text) 88%, var(--accent) 12%);
    }
    .bubble.assistant.transcript-message {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 0 10px;
      white-space: normal;
    }
    .transcript-line {
      display: block;
      min-width: 0;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.62;
      text-align: left;
    }
    .transcript-line.is-chat {
      color: var(--text);
      font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
    }
    .transcript-line.is-section {
      margin-top: 6px;
      color: color-mix(in srgb, var(--text) 88%, var(--accent) 12%);
      font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .transcript-line.is-ops {
      padding-left: 12px;
      border-left: 2px solid color-mix(in srgb, var(--line) 78%, transparent);
      color: color-mix(in srgb, var(--text) 84%, var(--muted) 16%);
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11.5px;
      letter-spacing: 0.01em;
    }
    .transcript-line.is-ops.is-strong {
      border-left-color: color-mix(in srgb, var(--accent) 36%, var(--line) 64%);
      color: var(--text);
    }
    .transcript-gap {
      height: 8px;
    }
    @media (max-width: 1080px) {
      .workspace-main {
        grid-template-columns: 200px minmax(0, 1fr);
      }
    }
    @media (max-width: 900px) {
      .workspace-header-actions {
        gap: 4px;
      }
      .workspace-header-title {
        font-size: 12px;
      }
      .auth-status-button {
        min-width: 24px;
        min-height: 24px;
        padding: 0 6px;
      }
      .auth-status-label,
      .auth-status-dot {
        display: none;
      }
      .auth-status-button svg {
        width: 13px;
        height: 13px;
      }
      .workspace-main {
        grid-template-columns: 1fr;
      }
      .sidebar {
        display: none;
      }
      .history-drawer,
      .artifacts-drawer {
        width: 100%;
        max-width: none;
      }
    }
    @media (max-width: 720px) {
      .utility-rail {
        padding: 4px 6px;
      }
    }
    @media (max-width: 620px) {
      .chat {
        padding: 8px 10px 6px;
      }
      .composer {
        padding: 5px 8px 6px;
      }
      .mentions {
        left: 8px;
        right: 8px;
      }
      .bubble.assistant {
        padding: 2px 0 8px;
      }
      .composer-row {
        align-items: flex-end;
      }
    }
  </style>
</head>
<body>
  <div class="workspace-shell" id="workspaceShell" data-history-open="false" data-artifacts-open="false">
    <aside class="utility-rail" aria-label="Cutie Product navigation">
      <div class="workspace-header-title" id="currentChatTitle">New chat</div>
      <div class="workspace-header-actions">
        <button type="button" class="rail-button" id="historyToggle" aria-controls="historyDrawer" aria-expanded="false" title="Chats">${chatIcon}</button>
        <button type="button" class="rail-button" id="newChatBtn" title="New chat">${plusIcon}</button>
        <button type="button" class="rail-button" id="artifactsToggle" aria-controls="artifactsDrawer" aria-expanded="false" title="Artifacts">${artifactsIcon}</button>
        <button type="button" class="auth-status-button" id="authStatusButton" title="Set Xpersona API key">
          ${keyIcon}
          <span class="auth-status-dot" id="authStatusDot" aria-hidden="true"></span>
          <span class="auth-status-label" id="authChip">Key</span>
        </button>
        <div class="settings-menu-wrap">
          <button type="button" class="rail-button" id="settingsToggle" aria-controls="settingsMenu" aria-expanded="false" title="Settings">${settingsIcon}</button>
          <div class="settings-menu is-hidden" id="settingsMenu" role="menu" aria-label="Cutie Product settings">
            <button type="button" id="settingsSetKey" role="menuitem">Set Xpersona API key</button>
            <button type="button" id="settingsSignIn" role="menuitem">Browser sign in</button>
            <button type="button" id="settingsUndoPlayground" role="menuitem">Undo last playground batch</button>
            <button type="button" id="settingsSignOut" role="menuitem">Sign out</button>
            <button type="button" id="settingsCopyDebug" role="menuitem">Copy debug report</button>
            <button type="button" id="settingsCapture" role="menuitem">Capture desktop</button>
            <button type="button" id="settingsBinaryConfigure" role="menuitem">App builder…</button>
          </div>
        </div>
      </div>
    </aside>

    <div class="workspace-main">
      <button type="button" class="drawer-scrim" id="drawerScrim" aria-label="Close panel"></button>

      <aside class="history-drawer" id="historyDrawer" aria-hidden="true" aria-label="Cutie chats">
        <div class="history-drawer-head">
          <div>
            <div class="history-drawer-label">Chats</div>
            <h1 class="history-drawer-title">Cutie Product</h1>
            <p class="history-drawer-copy">Workspace and desktop sessions for this folder.</p>
          </div>
          <div class="history-drawer-actions">
            <span class="drawer-count" id="historyCount">0</span>
            <button type="button" class="icon-button" id="historyRefreshBtn" title="Refresh chats">${refreshIcon}</button>
            <button type="button" class="icon-button" id="historyCloseBtn" title="Close chats">${closeIcon}</button>
          </div>
        </div>
        <div class="task-list" id="sessionList"></div>
        <div class="task-footer is-hidden" id="historyFooter"><button type="button" class="binary-button" id="historyFooterButton">View all</button></div>
      </aside>

      <aside class="artifacts-drawer" id="artifactsDrawer" aria-hidden="true" aria-label="Cutie artifacts">
        <div class="history-drawer-head">
          <div>
            <div class="history-drawer-label">Artifacts</div>
            <h1 class="history-drawer-title">File changes</h1>
            <p class="history-drawer-copy">Workspace edits from the active chat. Click an item to open the diff.</p>
          </div>
          <div class="history-drawer-actions">
            <span class="drawer-count" id="artifactsCount">0</span>
            <button type="button" class="icon-button" id="artifactsCloseBtn" title="Close artifacts">${closeIcon}</button>
          </div>
        </div>
        <div class="task-list" id="artifactsList"></div>
      </aside>

      <aside class="sidebar">
        <div class="brand">
          <span class="brand-kicker">Workspace Agent</span>
          <strong>Cutie Product</strong>
          <span id="authLabel">Not signed in</span>
        </div>
        <div class="desktop-panel" id="desktopSummaryPanel">Desktop not loaded yet.</div>
        <div class="sidebar-note">Use @ to target files or windows before you run a task.</div>
      </aside>

      <main class="main">
        <div class="chat" id="chat"></div>
        <div class="objectives-panel is-hidden" id="objectivesPanel" aria-live="polite" aria-label="Task objectives"></div>
        <div class="composer">
          <div class="mentions" id="mentions"></div>
          <div class="prompt-queue-wrap is-hidden" id="promptQueueWrap" aria-live="polite" aria-label="Queued prompts">
            <div class="prompt-queue-header">
              <span class="prompt-queue-title">Queued — runs after this one</span>
              <span class="prompt-queue-badge" id="promptQueueCount">0</span>
            </div>
            <div class="prompt-queue-list" id="promptQueueList"></div>
          </div>
          <div class="composer-card" id="composerForm">
            <textarea id="input" placeholder="Ask Cutie to work in this workspace or help with a desktop task"></textarea>
            <div class="composer-row">
              <button type="button" class="composer-send" id="sendBtn" aria-label="Submit">
                ${submitIcon}
              </button>
            </div>
            <div class="status-line" id="runtimeLine"></div>
          </div>
          <footer class="composer-footer" aria-label="Model and reasoning">
            <select class="composer-footer-select" id="composerModelSelect" aria-label="Model"></select>
            <select class="composer-footer-select" id="composerReasoningSelect" aria-label="Reasoning level"></select>
          </footer>
        </div>
      </main>
    </div>
  </div>

  <script nonce="${nonce}">
    const ICON_SUBMIT = ${encodedComposerSubmitIcon};
    const ICON_STOP = ${encodedComposerStopIcon};
    const vscode = acquireVsCodeApi();
    let fatalErrorShown = false;
    function describeFatalError(error) {
      if (!error) return 'Unknown Cutie webview error.';
      if (typeof error === 'string') return error;
      if (error instanceof Error) return error.stack || error.message || String(error);
      if (typeof error === 'object' && 'message' in error && error.message) return String(error.message);
      return String(error);
    }
    function escapeFatalHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function reportFatalError(error) {
      const message = describeFatalError(error);
      console.error('Cutie webview fatal error', error);
      try {
        vscode.postMessage({ type: 'webviewError', message: message });
      } catch {
        /* ignore host messaging failures */
      }
      if (fatalErrorShown) return;
      fatalErrorShown = true;
      document.body.innerHTML =
        '<div style="padding:20px;font-family:var(--vscode-font-family,Segoe UI,sans-serif);color:var(--vscode-foreground,#f5f7fb);background:var(--vscode-editor-background,#111418);min-height:100vh;box-sizing:border-box;">' +
        '<div style="max-width:720px;padding:16px;border:1px solid var(--vscode-panel-border,#2d3440);border-radius:12px;background:var(--vscode-sideBar-background,#171b22);box-shadow:0 14px 32px rgba(0,0,0,0.28);">' +
        '<h1 style="margin:0 0 10px;font-size:16px;">Cutie could not finish loading</h1>' +
        '<p style="margin:0 0 12px;color:var(--vscode-descriptionForeground,#a4acb9);line-height:1.5;">Reload the window after installing the latest Cutie build. If this keeps happening, the error below is the part we need.</p>' +
        '<pre style="margin:0;padding:12px;overflow:auto;border-radius:10px;background:var(--vscode-input-background,#11161d);white-space:pre-wrap;word-break:break-word;">' +
        escapeFatalHtml(message) +
        '</pre>' +
        '</div>' +
        '</div>';
    }
    window.addEventListener('error', function (event) {
      reportFatalError((event && (event.error || event.message)) || event);
    });
    window.addEventListener('unhandledrejection', function (event) {
      reportFatalError(event ? event.reason : event);
    });
    const workspaceShell = document.getElementById('workspaceShell');
    const currentChatTitle = document.getElementById('currentChatTitle');
    const historyToggle = document.getElementById('historyToggle');
    const artifactsToggle = document.getElementById('artifactsToggle');
    const historyDrawer = document.getElementById('historyDrawer');
    const artifactsDrawer = document.getElementById('artifactsDrawer');
    const drawerScrim = document.getElementById('drawerScrim');
    const historyCount = document.getElementById('historyCount');
    const artifactsCount = document.getElementById('artifactsCount');
    const historyRefreshBtn = document.getElementById('historyRefreshBtn');
    const historyCloseBtn = document.getElementById('historyCloseBtn');
    const artifactsCloseBtn = document.getElementById('artifactsCloseBtn');
    const artifactsList = document.getElementById('artifactsList');
    const composerForm = document.getElementById('composerForm');
    const input = document.getElementById('input');
    const chat = document.getElementById('chat');
    const sessions = document.getElementById('sessionList');
    const mentions = document.getElementById('mentions');
    const authLabel = document.getElementById('authLabel');
    const authChip = document.getElementById('authChip');
    const authStatusButton = document.getElementById('authStatusButton');
    const desktopSummaryPanel = document.getElementById('desktopSummaryPanel');
    const runtimeLine = document.getElementById('runtimeLine');
    const promptQueueWrap = document.getElementById('promptQueueWrap');
    const promptQueueList = document.getElementById('promptQueueList');
    const promptQueueCount = document.getElementById('promptQueueCount');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    const sendBtn = document.getElementById('sendBtn');
    const composerModelSelect = document.getElementById('composerModelSelect');
    const composerReasoningSelect = document.getElementById('composerReasoningSelect');
    const objectivesPanel = document.getElementById('objectivesPanel');
    const binaryPanel = document.getElementById('binaryPanel');
    const binaryPanelToggle = document.getElementById('binaryPanelToggle');
    const binaryPanelBody = document.getElementById('binaryPanelBody');
    const binaryStatusChip = document.getElementById('binaryStatusChip');
    const binaryProgressFill = document.getElementById('binaryProgressFill');
    const binaryMeta = document.getElementById('binaryMeta');
    const binaryActivityLog = document.getElementById('binaryActivityLog');
    const binaryGenerateBtn = document.getElementById('binaryGenerateBtn');
    const binaryRefineBtn = document.getElementById('binaryRefineBtn');
    const binaryBranchBtn = document.getElementById('binaryBranchBtn');
    const binaryRewindBtn = document.getElementById('binaryRewindBtn');
    const binaryValidateBtn = document.getElementById('binaryValidateBtn');
    const binaryPublishBtn = document.getElementById('binaryPublishBtn');
    const binaryCancelBtn = document.getElementById('binaryCancelBtn');
    const binaryConfigureBtn = document.getElementById('binaryConfigureBtn');
    const binaryExecuteBtn = document.getElementById('binaryExecuteBtn');
    const binaryEntryInput = document.getElementById('binaryEntryInput');
    const binaryRuntimeSelect = document.getElementById('binaryRuntimeSelect');
    const settingsBinaryConfigure = document.getElementById('settingsBinaryConfigure');
    const drafts = new Map();
    const draftMentions = new Map();
    let state = {
      sessions: [],
      messages: [],
      chatDiffs: [],
      liveActionLog: [],
      liveTranscript: [],
      activeSessionId: null,
      submitState: 'idle',
      running: false,
      status: 'Ready',
      activeRun: null,
      progress: null,
      binary: null,
      binaryActivity: [],
      binaryLiveBubble: null,
      composerPrefs: { selectedModel: '', modelOptions: [], reasoningLevel: 'Medium' },
      warmStartState: null,
      promptState: null,
      authState: { kind: 'none', label: 'Not signed in' },
      ideRuntime: 'cutie',
      canUndoPlayground: false,
    };
    let pendingSubmission = null;
    let isSubmitting = false;
    let selectedArtifactsRunId = '';
    let queuedPrompts = [];
    let recentSubmissionGuard = {
      prompt: '',
      until: 0,
    };
    let mentionState = {
      requestId: 0,
      items: [],
      activeIndex: 0,
      range: null,
      loading: false,
    };
    let mentionDebounceTimer = null;
    let mentionQueryRaf = 0;
    let cachedEmptyMentionItems = [];
    let allowNextLineBreak = false;
    let lastInputValue = input ? String(input.value || '') : '';
    let composerWatchTimer = null;
    let lastBareEnterIntentAt = 0;

    if (composerForm) composerForm.addEventListener('submit', postSendOrStop, true);
    if (composerModelSelect) {
      composerModelSelect.addEventListener('change', function () {
        vscode.postMessage({ type: 'setComposerModel', model: String(composerModelSelect.value || '').trim() });
      });
    }
    if (composerReasoningSelect) {
      composerReasoningSelect.addEventListener('change', function () {
        vscode.postMessage({
          type: 'setComposerReasoningLevel',
          level: String(composerReasoningSelect.value || '').trim(),
        });
      });
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', postSendOrStop, true);
      sendBtn.addEventListener('pointerup', postSendOrStop, true);
      sendBtn.addEventListener('mouseup', postSendOrStop, true);
      sendBtn.onclick = postSendOrStop;
      sendBtn.onpointerup = postSendOrStop;
      sendBtn.onmouseup = postSendOrStop;
    }
    if (input) {
      input.addEventListener('keydown', onComposerKeydown, true);
      input.addEventListener('keypress', composerKeypressFallback, true);
      input.addEventListener('beforeinput', composerBeforeInput, true);
      input.addEventListener('input', composerInputFallback, true);
      input.onkeydown = onComposerKeydown;
      input.onkeypress = composerKeypressFallback;
      input.onbeforeinput = composerBeforeInput;
      input.oninput = composerInputFallback;
    }
    document.addEventListener('keydown', onComposerKeydown, true);
    document.addEventListener('keypress', composerKeypressFallback, true);
    document.addEventListener('beforeinput', composerBeforeInput, true);

    const BINARY_PANEL_COLLAPSED_STORAGE_KEY = 'cutiePortableBundlePanelCollapsed';

    function readBinaryPanelCollapsedPreference() {
      try {
        const raw = localStorage.getItem(BINARY_PANEL_COLLAPSED_STORAGE_KEY);
        if (raw === null || raw === '') return true;
        return raw === '1' || raw === 'true';
      } catch {
        return true;
      }
    }

    function writeBinaryPanelCollapsedPreference(collapsed) {
      try {
        localStorage.setItem(BINARY_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
      } catch {
        /* ignore quota / private mode */
      }
    }

    function applyBinaryPanelCollapseUi(collapsed) {
      if (!binaryPanel || !binaryPanelToggle) return;
      binaryPanel.classList.toggle('is-collapsed', collapsed);
      binaryPanelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (binaryPanelBody) binaryPanelBody.hidden = collapsed;
    }

    applyBinaryPanelCollapseUi(readBinaryPanelCollapsedPreference());

    function isHistoryOpen() {
      return workspaceShell.dataset.historyOpen === 'true';
    }

    function setHistoryOpen(open) {
      workspaceShell.dataset.historyOpen = open ? 'true' : 'false';
      historyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      historyToggle.classList.toggle('active', open);
      historyDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        workspaceShell.dataset.artifactsOpen = 'false';
        artifactsToggle.classList.remove('active');
        artifactsToggle.setAttribute('aria-expanded', 'false');
        artifactsDrawer.setAttribute('aria-hidden', 'true');
      }
    }

    function setArtifactsOpen(open) {
      workspaceShell.dataset.artifactsOpen = open ? 'true' : 'false';
      artifactsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      artifactsToggle.classList.toggle('active', open);
      artifactsDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        workspaceShell.dataset.historyOpen = 'false';
        historyToggle.classList.remove('active');
        historyToggle.setAttribute('aria-expanded', 'false');
        historyDrawer.setAttribute('aria-hidden', 'true');
      }
    }

    function closeAllDrawers() {
      setHistoryOpen(false);
      setArtifactsOpen(false);
    }

    function currentDraftKey() {
      return state.activeSessionId || '__new__';
    }

    function syncLastInputValue() {
      lastInputValue = input ? String(input.value || '') : '';
    }

    function noteBareEnterIntent(event) {
      if (!event) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      lastBareEnterIntentAt = Date.now();
    }

    function startComposerWatch() {
      if (composerWatchTimer || !input) return;
      composerWatchTimer = setInterval(() => {
        if (document.activeElement !== input) return;
        maybeSendFromImplicitTrailingLineBreak();
      }, 50);
    }

    function stopComposerWatch() {
      if (!composerWatchTimer) return;
      clearInterval(composerWatchTimer);
      composerWatchTimer = null;
    }

    function getDraftMentions() {
      return draftMentions.get(currentDraftKey()) || [];
    }

    function setDraftMentions(items) {
      draftMentions.set(currentDraftKey(), items);
    }

    function collectCurrentMentions(text) {
      return getDraftMentions().filter((item) => String(text || '').includes(item.insertText));
    }

    function reconcileDraftMentions() {
      setDraftMentions(collectCurrentMentions(input.value));
    }

    function saveDraft() {
      reconcileDraftMentions();
      drafts.set(currentDraftKey(), input.value);
    }

    function restoreDraft() {
      input.value = drafts.get(currentDraftKey()) || '';
      reconcileDraftMentions();
      closeMentions();
      autoSize();
      syncLastInputValue();
    }

    function autoSize() {
      input.style.height = 'auto';
      input.style.height = Math.min(Math.max(input.scrollHeight, 40), 88) + 'px';
    }

    function submitStateValue() {
      return String(state.submitState || (state.running ? 'running' : 'idle'));
    }

    function isBusySubmitState() {
      const value = submitStateValue();
      return value === 'submitting' || value === 'starting' || value === 'running' || value === 'stopping';
    }

    function updateComposerPrimaryButton() {
      if (isBusySubmitState()) {
        sendBtn.innerHTML = ICON_STOP;
        sendBtn.classList.add('is-stop');
        sendBtn.classList.toggle('is-busy', submitStateValue() === 'stopping');
        sendBtn.disabled = submitStateValue() === 'stopping';
        sendBtn.setAttribute('aria-label', 'Stop run');
        return;
      }
      sendBtn.classList.remove('is-stop');
      sendBtn.innerHTML = ICON_SUBMIT;
      sendBtn.disabled = isSubmitting;
      sendBtn.classList.toggle('is-busy', isSubmitting);
      sendBtn.setAttribute('aria-label', 'Submit');
    }

    const REASONING_LEVELS = ['Low', 'Medium', 'High', 'Extra High'];

    function renderComposerFooter() {
      if (!composerModelSelect || !composerReasoningSelect) return;
      const prefs = state.composerPrefs || {};
      const models =
        Array.isArray(prefs.modelOptions) && prefs.modelOptions.length > 0
          ? prefs.modelOptions
          : prefs.selectedModel
            ? [prefs.selectedModel]
            : [];
      const currentModel = String(prefs.selectedModel || '').trim();
      const level = String(prefs.reasoningLevel || 'Medium').trim();

      composerModelSelect.innerHTML = '';
      for (let mi = 0; mi < models.length; mi += 1) {
        const m = models[mi];
        const mOpt = document.createElement('option');
        mOpt.value = m;
        mOpt.textContent = m;
        composerModelSelect.appendChild(mOpt);
      }
      if (currentModel && models.indexOf(currentModel) !== -1) composerModelSelect.value = currentModel;
      else if (models.length) composerModelSelect.selectedIndex = 0;

      composerReasoningSelect.innerHTML = '';
      for (let ri = 0; ri < REASONING_LEVELS.length; ri += 1) {
        const r = REASONING_LEVELS[ri];
        const rOpt = document.createElement('option');
        rOpt.value = r;
        rOpt.textContent = r;
        composerReasoningSelect.appendChild(rOpt);
      }
      composerReasoningSelect.value = REASONING_LEVELS.indexOf(level) !== -1 ? level : 'Medium';
    }

    function setComposerSubmitting(nextSubmitting) {
      isSubmitting = Boolean(nextSubmitting);
      updateComposerPrimaryButton();
    }

    function normalizePromptText(text) {
      return String(text || '').trim();
    }

    function armRecentSubmissionGuard(prompt) {
      recentSubmissionGuard = {
        prompt: normalizePromptText(prompt),
        until: Date.now() + 700,
      };
    }

    function matchesRecentSubmissionGuard(prompt) {
      return (
        recentSubmissionGuard.until > Date.now() &&
        recentSubmissionGuard.prompt !== '' &&
        recentSubmissionGuard.prompt === normalizePromptText(prompt)
      );
    }

    function escapeHtmlText(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getMentionRange() {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      if (start !== end) return null;
      const before = input.value.slice(0, start);
      const match = /(^|[\\s(])@([A-Za-z0-9_./:-]*)$/.exec(before);
      if (!match) return null;
      const query = match[2] || '';
      return {
        start: start - query.length - 1,
        end: start,
        query,
      };
    }

    function closeMentions() {
      if (mentionDebounceTimer) {
        clearTimeout(mentionDebounceTimer);
        mentionDebounceTimer = null;
      }
      if (mentionQueryRaf) {
        cancelAnimationFrame(mentionQueryRaf);
        mentionQueryRaf = 0;
      }
      mentionState.range = null;
      mentionState.items = [];
      mentionState.activeIndex = 0;
      mentionState.loading = false;
      mentions.classList.remove('show');
      mentions.innerHTML = '';
    }

    function renderMentions() {
      mentions.innerHTML = '';
      if (!mentionState.range || (!mentionState.items.length && !mentionState.loading)) {
        mentions.classList.remove('show');
        return;
      }

      if (mentionState.loading && !mentionState.items.length) {
        const row = document.createElement('div');
        row.className = 'mention-item placeholder';
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = true;

        const kind = document.createElement('span');
        kind.className = 'mention-kind';
        kind.textContent = 'Loading';
        button.appendChild(kind);

        const copy = document.createElement('span');
        copy.className = 'mention-copy';

        const label = document.createElement('span');
        label.className = 'mention-label';
        label.textContent = 'Looking up suggestions...';
        copy.appendChild(label);

        button.appendChild(copy);
        row.appendChild(button);
        mentions.appendChild(row);
        mentions.classList.add('show');
        return;
      }

      mentionState.activeIndex = Math.max(0, Math.min(mentionState.activeIndex, mentionState.items.length - 1));
      for (let index = 0; index < mentionState.items.length; index += 1) {
        const item = mentionState.items[index];
        const row = document.createElement('div');
        row.className = 'mention-item';

        const button = document.createElement('button');
        button.type = 'button';
        if (index === mentionState.activeIndex) button.classList.add('active');
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        button.addEventListener('click', () => acceptMention(index));

        const kind = document.createElement('span');
        kind.className = 'mention-kind';
        kind.textContent = item.kind === 'window' ? 'Window' : 'File';
        button.appendChild(kind);

        const copy = document.createElement('span');
        copy.className = 'mention-copy';

        const label = document.createElement('span');
        label.className = 'mention-label';
        label.textContent = item.label;
        copy.appendChild(label);

        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'mention-detail';
          detail.textContent = item.detail;
          copy.appendChild(detail);
        }

        button.appendChild(copy);
        row.appendChild(button);
        mentions.appendChild(row);
      }

      mentions.classList.add('show');
    }

    function requestMentions() {
      const range = getMentionRange();
      if (!range) {
        closeMentions();
        return;
      }
      mentionState.range = range;
      if (mentionDebounceTimer) {
        clearTimeout(mentionDebounceTimer);
        mentionDebounceTimer = null;
      }
      if (mentionQueryRaf) {
        cancelAnimationFrame(mentionQueryRaf);
        mentionQueryRaf = 0;
      }
      const delay = range.query.length === 0 ? 0 : 24;
      const canReuseEmptySuggestions = range.query.length === 0 && cachedEmptyMentionItems.length > 0;
      const sendQuery = () => {
        mentionDebounceTimer = null;
        mentionQueryRaf = 0;
        const live = getMentionRange();
        if (!live || !mentionState.range) return;
        if (live.start !== mentionState.range.start || live.query !== mentionState.range.query) return;
        mentionState.loading = true;
        if (!(live.query.length === 0 && mentionState.items.length)) {
          mentionState.items = [];
          mentionState.activeIndex = 0;
        }
        renderMentions();
        const requestId = mentionState.requestId + 1;
        mentionState.requestId = requestId;
        vscode.postMessage({ type: 'mentionsQuery', query: live.query, requestId });
      };
      if (delay === 0) {
        if (canReuseEmptySuggestions) {
          mentionState.loading = true;
          mentionState.items = cachedEmptyMentionItems.slice();
          mentionState.activeIndex = 0;
          renderMentions();
        }
        sendQuery();
      } else {
        mentionState.loading = true;
        mentionState.items = [];
        mentionState.activeIndex = 0;
        renderMentions();
        mentionDebounceTimer = setTimeout(sendQuery, delay);
      }
    }

    function scheduleMentionRequestSoon() {
      if (mentionQueryRaf) cancelAnimationFrame(mentionQueryRaf);
      mentionQueryRaf = requestAnimationFrame(() => {
        mentionQueryRaf = 0;
        requestMentions();
      });
    }

    function applyMentionsResponse(requestId, items) {
      if (requestId !== mentionState.requestId || !mentionState.range) return;
      mentionState.loading = false;
      mentionState.items = Array.isArray(items) ? items : [];
      if (mentionState.range.query === '') {
        cachedEmptyMentionItems = mentionState.items.slice();
      }
      mentionState.activeIndex = 0;
      renderMentions();
    }

    function acceptMention(index) {
      if (!mentionState.range || !mentionState.items.length) return false;
      const item = mentionState.items[index];
      if (!item) return false;

      const range = mentionState.range;
      const value = input.value;
      const before = value.slice(0, range.start);
      const after = value.slice(range.end);
      const needsSpace = after && !/^\\s/.test(after) ? ' ' : '';
      const nextValue = before + item.insertText + needsSpace + after;
      const caret = (before + item.insertText + needsSpace).length;

      input.value = nextValue;
      input.focus();
      input.setSelectionRange(caret, caret);
      setDraftMentions(
        [...getDraftMentions().filter((existing) => existing.insertText !== item.insertText), item].filter((existing) =>
          nextValue.includes(existing.insertText)
        )
      );
      closeMentions();
      autoSize();
      saveDraft();
      return true;
    }

    function renderSessions() {
      sessions.innerHTML = '';
      const list = Array.isArray(state.sessions) ? state.sessions : [];
      historyCount.textContent = String(list.length);
      for (const session of list) {
        const wrap = document.createElement('div');
        wrap.className = 'task-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'session' + (session.id === state.activeSessionId ? ' active' : '');
        button.innerHTML =
          '<span class="session-title">' + escapeHtmlText(session.title || 'Untitled chat') + '</span>' +
          '<small>' + escapeHtmlText((session.lastStatus || 'idle') + ' - ' + (session.updatedAt || '')) + '</small>';
        button.addEventListener('click', () => {
          saveDraft();
          clearEphemeralConversationState();
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'selectSession', sessionId: session.id });
        });
        wrap.appendChild(button);
        sessions.appendChild(wrap);
      }
    }

    function latestRunIdWithDiffs(chatDiffs) {
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const diff = list[i];
        const runId = String(diff && diff.runId ? diff.runId : '').trim();
        if (runId) return runId;
      }
      return '';
    }

    function resolveArtifactsRunId(chatDiffs) {
      const preferred = String(selectedArtifactsRunId || '').trim();
      if (preferred && aggregateFileStatsForRun(preferred, chatDiffs).length) {
        return preferred;
      }
      const activeRunId = String(state.activeRun && state.activeRun.id ? state.activeRun.id : '').trim();
      if (activeRunId && aggregateFileStatsForRun(activeRunId, chatDiffs).length) {
        return activeRunId;
      }
      return latestRunIdWithDiffs(chatDiffs);
    }

    function openArtifactsForRun(runId) {
      const resolved = String(runId || '').trim() || latestRunIdWithDiffs(state.chatDiffs);
      if (resolved) {
        selectedArtifactsRunId = resolved;
      }
      closeSettingsMenu();
      setHistoryOpen(false);
      setArtifactsOpen(true);
      renderArtifactsList();
    }

    function buildRunFilesSummaryCard(runId, chatDiffs, options) {
      const rows = aggregateFileStatsForRun(runId, chatDiffs);
      if (!rows.length) return null;

      const opts = options || {};
      let totalAdd = 0;
      let totalDel = 0;
      for (let r = 0; r < rows.length; r += 1) {
        totalAdd += rows[r].added;
        totalDel += rows[r].removed;
      }

      const wrap = document.createElement('div');
      wrap.className = 'cutie-files-summary' + (opts.inDrawer ? ' in-drawer' : '');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Files changed this run');

      const head = document.createElement('div');
      head.className = 'cutie-files-summary-head';

      const title = document.createElement('div');
      title.className = 'cutie-files-summary-title';
      const n = rows.length;
      title.textContent =
        n +
        ' file' +
        (n === 1 ? '' : 's') +
        ' changed +' +
        totalAdd +
        ' -' +
        totalDel;

      const actions = document.createElement('div');
      actions.className = 'cutie-files-summary-actions';

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'cutie-files-summary-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.title = 'Open Source Control to review or revert changes';
      undoBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'openScm' });
      });

      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = 'cutie-files-summary-btn cutie-files-summary-btn-primary';
      reviewBtn.textContent = 'Review';
      reviewBtn.title = opts.inDrawer ? 'Open Source Control review' : 'Open file changes panel';
      reviewBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opts.inDrawer) {
          vscode.postMessage({ type: 'openScm' });
          return;
        }
        openArtifactsForRun(runId);
      });

      actions.appendChild(undoBtn);
      actions.appendChild(reviewBtn);
      head.appendChild(title);
      head.appendChild(actions);

      const list = document.createElement('div');
      list.className = 'cutie-files-summary-list';

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cutie-files-summary-row';
        const pathEl = document.createElement('span');
        pathEl.className = 'cutie-files-summary-path';
        pathEl.textContent = row.path;
        const stats = document.createElement('span');
        stats.className = 'cutie-files-summary-stats';
        const addPill = document.createElement('span');
        addPill.className = 'cutie-files-stat add';
        addPill.textContent = '+' + row.added;
        const delPill = document.createElement('span');
        delPill.className = 'cutie-files-stat del';
        delPill.textContent = '-' + row.removed;
        stats.appendChild(addPill);
        stats.appendChild(delPill);
        btn.appendChild(pathEl);
        btn.appendChild(stats);
        btn.addEventListener('click', function () {
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'diffWorkspaceFile', path: row.path });
        });
        list.appendChild(btn);
      }

      wrap.appendChild(head);
      wrap.appendChild(list);
      return wrap;
    }

    function renderArtifactsList() {
      artifactsList.innerHTML = '';
      const diffs = Array.isArray(state.chatDiffs) ? state.chatDiffs : [];
      const focusedRunId = resolveArtifactsRunId(diffs);
      const focusedRows = focusedRunId ? aggregateFileStatsForRun(focusedRunId, diffs) : [];
      artifactsCount.textContent = String(focusedRows.length || diffs.length);
      if (focusedRows.length) {
        const summary = buildRunFilesSummaryCard(focusedRunId, diffs, { inDrawer: true });
        if (summary) {
          artifactsList.appendChild(summary);
        }
        return;
      }
      if (!diffs.length) {
        const empty = document.createElement('div');
        empty.className = 'task-empty';
        empty.textContent = 'No file changes recorded for this chat yet.';
        artifactsList.appendChild(empty);
        return;
      }
      for (let i = diffs.length - 1; i >= 0; i -= 1) {
        const diff = diffs[i];
        const wrap = document.createElement('div');
        wrap.className = 'task-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'session';
        const path = diff.relativePath || 'File';
        const tool = diff.toolName === 'write_file' ? 'write' : diff.toolName === 'patch_file' ? 'patch' : 'edit';
        button.innerHTML =
          '<span class="session-title">' + escapeHtmlText(path) + '</span>' +
          '<small>' + escapeHtmlText(tool) + '</small>';
        button.addEventListener('click', () => {
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'diffWorkspaceFile', path: diff.relativePath });
        });
        wrap.appendChild(button);
        artifactsList.appendChild(wrap);
      }
    }

    function countPatchLineStats(patch) {
      let added = 0;
      let removed = 0;
      const lines = String(patch || '').split(/\\r\\n|\\n|\\r/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        if (line.indexOf('+++ ') === 0 || line.indexOf('--- ') === 0) continue;
        if (line.indexOf('@@') === 0) continue;
        if (line.indexOf('\\\\') === 0) continue;
        if (line.indexOf('diff --git ') === 0) continue;
        if (line.indexOf('+') === 0) added += 1;
        else if (line.indexOf('-') === 0) removed += 1;
      }
      return { added, removed };
    }

    function aggregateFileStatsForRun(runId, chatDiffs) {
      if (!runId) return [];
      const byPath = new Map();
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      for (let i = 0; i < list.length; i += 1) {
        const d = list[i];
        if (!d || d.runId !== runId) continue;
        const p = String(d.relativePath || '').trim();
        if (!p) continue;
        const { added, removed } = countPatchLineStats(d.patch);
        const prev = byPath.get(p) || { added: 0, removed: 0 };
        byPath.set(p, { added: prev.added + added, removed: prev.removed + removed });
      }
      return Array.from(byPath.entries())
        .map(function (entry) {
          return { path: entry[0], added: entry[1].added, removed: entry[1].removed };
        })
        .sort(function (a, b) {
          return a.path.localeCompare(b.path);
        });
    }

    function chatDiffsForRun(runId, chatDiffs) {
      if (!runId) return [];
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      return list
        .filter(function (diff) {
          return diff && diff.runId === runId;
        })
        .sort(function (a, b) {
          const aSort = a && a.createdAt ? a.createdAt : '';
          const bSort = b && b.createdAt ? b.createdAt : '';
          if (aSort < bSort) return -1;
          if (aSort > bSort) return 1;
          return String(a && a.id ? a.id : '').localeCompare(String(b && b.id ? b.id : ''));
        });
    }

    function isTerminalAssistantForRun(message, timelineMessages) {
      const runId = message && message.runId;
      if (!runId || message.role !== 'assistant') return false;
      let lastIdx = -1;
      for (let i = 0; i < timelineMessages.length; i += 1) {
        const m = timelineMessages[i];
        if (m.role === 'assistant' && m.runId === runId) lastIdx = i;
      }
      if (lastIdx < 0) return false;
      return timelineMessages[lastIdx] === message;
    }

    function appendRunFilesSummaryCard(runId, chatDiffs) {
      const wrap = buildRunFilesSummaryCard(runId, chatDiffs, { inDrawer: false });
      if (!wrap) return;
      chat.appendChild(wrap);
    }

    function appendCutieDiffBubble(diff) {
      const wrap = document.createElement('div');
      wrap.className = 'bubble cutie-diff';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Cutie code change');

      const head = document.createElement('div');
      head.className = 'cutie-diff-head';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'cutie-diff-title-wrap';

      const kicker = document.createElement('div');
      kicker.className = 'cutie-diff-kicker';
      kicker.textContent = 'Edited file';

      const title = document.createElement('div');
      title.className = 'cutie-diff-title';
      title.textContent = diff.relativePath || 'File';

      titleWrap.appendChild(kicker);
      titleWrap.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'cutie-diff-meta';

      const badge = document.createElement('span');
      badge.className = 'cutie-diff-badge';
      badge.textContent = diff.toolName === 'write_file' ? 'write' : diff.toolName === 'patch_file' ? 'patch' : 'edit';

      const stats = countPatchLineStats(diff.patch);
      if (stats.added || stats.removed) {
        const statWrap = document.createElement('div');
        statWrap.className = 'cutie-diff-stats';
        if (stats.added) {
          const addPill = document.createElement('span');
          addPill.className = 'cutie-diff-stat add';
          addPill.textContent = '+' + stats.added;
          statWrap.appendChild(addPill);
        }
        if (stats.removed) {
          const delPill = document.createElement('span');
          delPill.className = 'cutie-diff-stat del';
          delPill.textContent = '-' + stats.removed;
          statWrap.appendChild(delPill);
        }
        meta.appendChild(statWrap);
      }

      meta.appendChild(badge);

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'cutie-diff-open';
      openBtn.textContent = 'Review diff';
      openBtn.addEventListener('click', function () {
        vscode.postMessage({ type: 'diffWorkspaceFile', path: diff.relativePath });
      });

      meta.appendChild(openBtn);

      head.appendChild(titleWrap);
      head.appendChild(meta);

      const body = document.createElement('div');
      body.className = 'cutie-diff-body';
      const patchEl = document.createElement('div');
      patchEl.className = 'cutie-diff-patch';
      const raw = String(diff.patch || '');
      const lines = raw.split(/\\r\\n|\\n|\\r/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.indexOf('diff --git ') === 0) continue;
        if (line.indexOf('--- ') === 0) continue;
        if (line.indexOf('+++ ') === 0) continue;
        const row = document.createElement('div');
        if (line.indexOf('+') === 0 && line.indexOf('+++') !== 0) {
          row.className = 'diff-line add';
        } else if (line.indexOf('-') === 0 && line.indexOf('---') !== 0) {
          row.className = 'diff-line del';
        } else if (line.indexOf('@@') === 0) {
          row.className = 'diff-line hunk';
        } else {
          row.className = 'diff-line ctx';
        }
        row.textContent = line;
        patchEl.appendChild(row);
      }
      if (!patchEl.childElementCount) {
        const row = document.createElement('div');
        row.className = 'diff-line ctx';
        row.textContent = 'Change recorded — open in editor for the full side-by-side diff.';
        patchEl.appendChild(row);
      }
      body.appendChild(patchEl);
      wrap.appendChild(head);
      wrap.appendChild(body);
      chat.appendChild(wrap);
    }

    function truncateRanText(text, maxLen) {
      const s = String(text || '')
        .replace(/[\\r\\n]+/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
      if (s.length <= maxLen) return s;
      return s.slice(0, Math.max(0, maxLen - 1)) + '…';
    }

    function truncateReceiptDetailBlock(text, maxLen) {
      const value = String(text || '').trim();
      if (!value) return '';
      if (value.length <= maxLen) return value;
      return value.slice(0, Math.max(0, maxLen - 1)) + '…';
    }

    function buildReceiptDetailText(receipt) {
      if (!receipt) return '';
      const d = receipt.data && typeof receipt.data === 'object' ? receipt.data : {};
      const parts = [];
      const name = String(receipt.toolName || 'tool');

      if (typeof receipt.step === 'number' && receipt.step > 0) {
        parts.push('step: ' + receipt.step);
      }
      parts.push('tool: ' + name);
      if (receipt.domain) parts.push('domain: ' + String(receipt.domain));
      if (receipt.kind) parts.push('kind: ' + String(receipt.kind));
      if (receipt.status) parts.push('status: ' + String(receipt.status));
      if (typeof d.command === 'string' && d.command.trim()) {
        parts.push('');
        parts.push('$ ' + d.command.trim());
      }
      if (typeof d.path === 'string' && d.path.trim()) {
        parts.push(parts.length ? '' : '');
        parts.push('path: ' + d.path.trim());
      }
      if (typeof d.range === 'string' && d.range.trim()) {
        parts.push('range: ' + d.range.trim());
      }
      if (typeof d.exitCode === 'number') {
        parts.push('exit code: ' + d.exitCode);
      }
      if (typeof receipt.summary === 'string' && receipt.summary.trim()) {
        parts.push('');
        parts.push('summary: ' + truncateReceiptDetailBlock(receipt.summary, 1000));
      }
      if (typeof d.stdout === 'string' && d.stdout.trim()) {
        parts.push('');
        parts.push('stdout:');
        parts.push(truncateReceiptDetailBlock(d.stdout, 4000));
      }
      if (typeof d.stderr === 'string' && d.stderr.trim()) {
        parts.push('');
        parts.push('stderr:');
        parts.push(truncateReceiptDetailBlock(d.stderr, 3000));
      }
      if (receipt.status !== 'completed' && receipt.error) {
        parts.push('');
        parts.push('error:');
        parts.push(truncateReceiptDetailBlock(String(receipt.error || ''), 1500));
      }

      if (name === 'read_file' && typeof d.content === 'string' && d.content.trim()) {
        parts.push('');
        parts.push('preview:');
        parts.push(truncateReceiptDetailBlock(d.content, 2500));
      }

      if (!parts.filter(Boolean).length) {
        return 'No additional details recorded for this action.';
      }
      return parts.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
    }

    function formatRanLineFromReceipt(receipt) {
      if (!receipt) return 'Ran (unknown step)';
      const d = receipt.data && typeof receipt.data === 'object' ? receipt.data : {};
      const statusNote =
        receipt.status === 'failed' ? ' — failed' : receipt.status === 'blocked' ? ' — blocked' : '';
      const name = receipt.toolName || 'tool';

      if (name === 'run_command' && typeof d.command === 'string' && d.command.trim()) {
        return 'Ran ' + truncateRanText(d.command, 220) + statusNote;
      }
      if (name === 'search_workspace') {
        const q = typeof d.query === 'string' ? d.query : '';
        return (
          'Ran rg (workspace)' +
          (q ? ' ' + truncateRanText(q, 160) : '') +
          statusNote
        );
      }
      if (name === 'read_file' && typeof d.path === 'string') {
        const range = typeof d.range === 'string' && d.range ? ' ' + d.range : '';
        return 'Ran read_file ' + truncateRanText(d.path + range, 200) + statusNote;
      }
      if (name === 'list_files') {
        const n = Array.isArray(d.files) ? d.files.length : 0;
        return 'Ran list_files' + (n ? ' (' + n + ' paths)' : '') + statusNote;
      }
      if (name === 'get_diagnostics') {
        const p = typeof d.path === 'string' ? d.path : '';
        return 'Ran get_diagnostics' + (p ? ' ' + truncateRanText(p, 160) : '') + statusNote;
      }
      if (name === 'git_status') {
        return 'Ran git status' + statusNote;
      }
      if (name === 'git_diff') {
        const p = typeof d.path === 'string' ? d.path : '';
        return 'Ran git diff' + (p ? ' ' + truncateRanText(p, 180) : '') + statusNote;
      }
      if (name === 'write_file' && typeof d.path === 'string') {
        return 'Ran write_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'patch_file' && typeof d.path === 'string') {
        return 'Ran patch_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'edit_file' && typeof d.path === 'string') {
        return 'Ran edit_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'mkdir' && typeof d.path === 'string') {
        return 'Ran mkdir ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'create_checkpoint') {
        return 'Ran create_checkpoint' + statusNote;
      }
      if (name === 'desktop_capture_screen') {
        return 'Ran desktop_capture_screen' + statusNote;
      }
      if (name === 'desktop_get_active_window') {
        return 'Ran desktop_get_active_window' + statusNote;
      }
      if (name === 'desktop_list_windows') {
        return 'Ran desktop_list_windows' + statusNote;
      }
      if (name === 'desktop_open_app' && typeof d.app === 'string') {
        return 'Ran open_app ' + truncateRanText(d.app, 120) + statusNote;
      }
      if (name === 'desktop_open_url' && typeof d.url === 'string') {
        return 'Ran open_url ' + truncateRanText(d.url, 200) + statusNote;
      }
      if (name === 'desktop_focus_window') {
        return 'Ran desktop_focus_window' + statusNote;
      }
      if (name === 'desktop_click' || name === 'desktop_type' || name === 'desktop_keypress' || name === 'desktop_scroll') {
        return 'Ran ' + name + statusNote;
      }
      if (name === 'desktop_wait') {
        return 'Ran desktop_wait' + statusNote;
      }

      const sum = typeof receipt.summary === 'string' ? receipt.summary.trim() : '';
      return (
        'Ran ' +
        name +
        (sum ? ' — ' + truncateRanText(sum, 140) : '') +
        statusNote
      );
    }

    function receiptsForActiveRunTimeline() {
      const run = state.activeRun;
      if (!run || !Array.isArray(run.receipts) || !run.receipts.length) return [];
      if (state.activeSessionId && run.sessionId && run.sessionId !== state.activeSessionId) return [];
      return run.receipts;
    }

    function receiptStatusLabel(status) {
      if (status === 'blocked') return 'Blocked';
      if (status === 'failed') return 'Failed';
      return 'Ran';
    }

    function appendReceiptActivityRow(container, receipt, options) {
      if (!container || !receipt) return;
      const row = document.createElement('div');
      row.className = 'activity-row' + (options && options.prominent ? ' is-prominent' : '');
      const badge = document.createElement('div');
      const status = String(receipt.status || 'completed');
      badge.className = 'activity-badge status-' + status;
      badge.textContent = receiptStatusLabel(status);
      const body = document.createElement('div');
      body.className = 'activity-body';
      const title = document.createElement('div');
      title.className = 'activity-title';
      const ranLine = formatRanLineFromReceipt(receipt);
      title.textContent = ranLine;
      title.title = ranLine;
      const meta = document.createElement('div');
      meta.className = 'activity-meta';
      const metaParts = [];
      if (typeof receipt.step === 'number' && receipt.step > 0) metaParts.push('Step ' + receipt.step);
      if (receipt.domain) metaParts.push(String(receipt.domain));
      if (receipt.kind) metaParts.push(String(receipt.kind));
      if (status !== 'completed' && receipt.error) metaParts.push(truncateRanText(String(receipt.error || ''), 160));
      meta.textContent = metaParts.join(' - ');
      body.appendChild(title);
      if (meta.textContent) body.appendChild(meta);
      if (!options || !options.prominent) {
        const detailText = buildReceiptDetailText(receipt);
        if (detailText) {
          const detail = document.createElement('div');
          detail.className = 'ran-inline-details';
          detail.textContent = detailText;
          body.appendChild(detail);
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-expanded', 'false');
          const toggleExpanded = function () {
            const expanded = row.classList.toggle('is-expanded');
            row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          };
          row.addEventListener('click', toggleExpanded);
          row.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleExpanded();
            }
          });
        }
      }
      row.appendChild(badge);
      row.appendChild(body);
      container.appendChild(row);
    }

    function appendLiveRunActivityCard(run, progress, receipts) {
      if (!run) return;
      const card = document.createElement('div');
      card.className = 'run-activity-card';
      const head = document.createElement('div');
      head.className = 'run-activity-head';
      const titleWrap = document.createElement('div');
      titleWrap.className = 'run-activity-title-wrap';
      const pulse = document.createElement('span');
      pulse.className = 'run-activity-pulse';
      pulse.setAttribute('aria-hidden', 'true');
      const title = document.createElement('div');
      title.className = 'run-activity-title';
      title.textContent = 'Cutie is working';
      titleWrap.appendChild(pulse);
      titleWrap.appendChild(title);
      const chips = document.createElement('div');
      chips.className = 'run-activity-chips';

      function appendChip(text) {
        if (!text) return;
        const chip = document.createElement('span');
        chip.className = 'run-activity-chip';
        chip.textContent = text;
        chips.appendChild(chip);
      }

      appendChip(progress && progress.phaseLabel ? progress.phaseLabel : 'Working');
      if (typeof run.stepCount === 'number' && typeof run.maxSteps === 'number' && run.maxSteps > 0) {
        appendChip('Step ' + run.stepCount + '/' + run.maxSteps);
      }
      if (progress && progress.repairLabel) appendChip(progress.repairLabel);
      if (run.lastToolName) appendChip(run.lastToolName);

      head.appendChild(titleWrap);
      head.appendChild(chips);

      const body = document.createElement('div');
      body.className = 'run-activity-body';
      const status = document.createElement('div');
      status.className = 'run-activity-status';
      status.textContent = String(state.status || '').trim() || 'Cutie is working through the next step...';
      body.appendChild(status);

      const summaryText =
        (progress && progress.stallReason) ||
        (progress && progress.lastActionSummary) ||
        (progress && progress.lastMeaningfulProgressSummary) ||
        (progress && progress.pursuingLabel) ||
        (progress && progress.suggestedNextAction) ||
        '';
      if (summaryText) {
        const summary = document.createElement('div');
        summary.className = 'run-activity-summary';
        summary.textContent = summaryText;
        body.appendChild(summary);
      }

      const list = document.createElement('div');
      list.className = 'run-activity-list';
      const visibleReceipts = Array.isArray(receipts) ? receipts : [];
      if (visibleReceipts.length) {
        for (let index = 0; index < visibleReceipts.length; index += 1) {
          appendReceiptActivityRow(list, visibleReceipts[index], { prominent: true });
        }
      } else {
        const empty = document.createElement('div');
        empty.className = 'run-activity-empty';
        empty.textContent =
          (progress && progress.phaseLabel ? progress.phaseLabel + '...' : '') ||
          'Thinking through the next useful action...';
        list.appendChild(empty);
      }
      body.appendChild(list);

      if (progress && progress.escalationMessage) {
        const note = document.createElement('div');
        note.className = 'run-activity-summary';
        note.textContent = progress.escalationMessage;
        body.appendChild(note);
      }

      card.appendChild(head);
      card.appendChild(body);
      chat.appendChild(card);
    }

    function formatLiveActionLogText(lines) {
      const rows = Array.isArray(lines) ? lines.filter(Boolean).slice(-48) : [];
      if (!rows.length) return '';
      return rows
        .map(function (line) {
          return String(line || '').trim();
        })
        .filter(Boolean)
        .join('\\n');
    }

    function isLowSignalConversationStatus(text) {
      return /^(Cutie is replying|Cutie is finishing the response|Cutie completed the run)\.?$/i.test(
        String(text || '').trim()
      );
    }

    function isTranscriptEventVisible(event, goal) {
      if (!event || typeof event !== 'object') return false;
      const text = String(event.text || '').trim();
      if (!text) return false;
      if (goal === 'conversation' && event.kind === 'status' && isLowSignalConversationStatus(text)) return false;
      return true;
    }

    function buildTranscriptSections(events, goal) {
      const rows = Array.isArray(events) ? events.slice(-96) : [];
      const operational = [];
      const assistant = [];
      for (let index = 0; index < rows.length; index += 1) {
        const event = rows[index];
        if (!isTranscriptEventVisible(event, goal)) continue;
        const text = String(event.text || '').trim();
        if (!text) continue;
        if (event.kind === 'assistant_text' || event.kind === 'final') {
          assistant.push(text);
        } else {
          operational.push(text);
        }
      }
      return {
        operational: operational,
        assistant: assistant.length ? String(assistant[assistant.length - 1] || '').trim() : '',
      };
    }

    function formatLiveTranscriptText(events, goal) {
      const sections = buildTranscriptSections(events, goal);
      if (!sections.operational.length && !sections.assistant) return '';
      const parts = [];
      if (sections.operational.length) {
        parts.push('Cutie action log:');
        parts.push(sections.operational.join('\\n\\n'));
      }
      if (sections.assistant) {
        parts.push('Cutie response:');
        parts.push(sections.assistant);
      }
      return parts.join('\\n\\n');
    }

    function classifyTranscriptLine(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return 'gap';
      if (/^Cutie action log:$/i.test(trimmed) || /^Cutie response:$/i.test(trimmed)) return 'section';
      if (/^(Cutie\\b|Step\\s+\\d+:|Recovered\\s+\`|Created checkpoint\\b)/i.test(trimmed)) return 'ops';
      return 'chat';
    }

    function appendTranscriptBubble(container, text) {
      const wrap = document.createElement('div');
      wrap.className = 'bubble assistant transcript-message';
      const lines = String(text || '').split('\\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = String(lines[index] || '');
        const trimmed = line.trim();
        if (!trimmed) {
          const gap = document.createElement('div');
          gap.className = 'transcript-gap';
          wrap.appendChild(gap);
          continue;
        }
        const row = document.createElement('div');
        const kind = classifyTranscriptLine(trimmed);
        row.className =
          'transcript-line ' +
          (kind === 'ops' ? 'is-ops' : kind === 'section' ? 'is-section' : 'is-chat');
        if (/^(Step\\s+\\d+:|Recovered\\s+\`)/i.test(trimmed) || kind === 'section') {
          row.className += ' is-strong';
        }
        row.textContent = trimmed;
        wrap.appendChild(row);
      }
      container.appendChild(wrap);
    }

    function renderBinaryPanel() {
      if (!binaryPanel || !binaryStatusChip || !binaryProgressFill || !binaryMeta || !binaryActivityLog) return;
      const b = state.binary;
      if (!b) {
        binaryStatusChip.textContent = '—';
        binaryProgressFill.style.width = '0%';
        binaryMeta.textContent = '';
        binaryActivityLog.textContent = '';
        return;
      }
      const ab = b.activeBuild;
      const phase = b.phase || (ab && ab.phase) || 'idle';
      const streamTransport = ab && ab.stream ? (ab.stream.transport === 'websocket' ? 'WS' : 'SSE') : '';
      const streamNote = b.streamConnected && streamTransport ? ' · ' + streamTransport : '';
      const statusPart = ab ? ab.status : 'none';
      binaryStatusChip.textContent = statusPart + ' · ' + phase + streamNote;
      const p = typeof b.progress === 'number' ? Math.max(0, Math.min(100, b.progress)) : 0;
      binaryProgressFill.style.width = p + '%';
      const lines = [];
      if (ab) {
        lines.push('Build: ' + ab.id);
        if (ab.intent) lines.push('Intent: ' + String(ab.intent).slice(0, 220));
      }
      if (b.pendingRefinement && b.pendingRefinement.intent) {
        lines.push('Refinement: ' + String(b.pendingRefinement.intent).slice(0, 160));
      }
      binaryMeta.textContent = lines.join('\\n');
      const act = Array.isArray(state.binaryActivity) ? state.binaryActivity : [];
      binaryActivityLog.textContent = act.slice(-14).join('\\n');
      const busy = !!b.busy;
      if (binaryCancelBtn) binaryCancelBtn.disabled = !b.canCancel;
      if (binaryGenerateBtn) binaryGenerateBtn.disabled = busy;
      if (binaryRefineBtn) binaryRefineBtn.disabled = busy;
      if (binaryBranchBtn) binaryBranchBtn.disabled = busy;
      if (binaryRewindBtn) binaryRewindBtn.disabled = busy;
      if (binaryValidateBtn) binaryValidateBtn.disabled = busy;
      if (binaryPublishBtn) binaryPublishBtn.disabled = busy;
      if (binaryExecuteBtn) binaryExecuteBtn.disabled = busy;
      if (binaryRuntimeSelect) {
        binaryRuntimeSelect.value = b.targetEnvironment && b.targetEnvironment.runtime === 'node20' ? 'node20' : 'node18';
      }
    }

    function renderMessages() {
      chat.innerHTML = '';
      const visibleMessages = [...(Array.isArray(state.messages) ? state.messages : [])];
      if (
        pendingSubmission &&
        !visibleMessages.some((message) => message.role === 'user' && message.content === pendingSubmission.content)
      ) {
        visibleMessages.push(pendingSubmission);
      }

      const chatDiffs = Array.isArray(state.chatDiffs) ? state.chatDiffs : [];
      const liveActionLog = Array.isArray(state.liveActionLog) ? state.liveActionLog : [];
      const liveTranscript = Array.isArray(state.liveTranscript) ? state.liveTranscript : [];
      const liveActionText = state.running ? formatLiveActionLogText(liveActionLog) : '';
      const liveTranscriptText = state.running
        ? formatLiveTranscriptText(liveTranscript, state.activeRun ? state.activeRun.goal : '')
        : '';
      const transcriptRunIds = new Set();
      for (let mi = 0; mi < visibleMessages.length; mi += 1) {
        const message = visibleMessages[mi];
        if (message && message.presentation === 'run_transcript' && message.runId) {
          transcriptRunIds.add(String(message.runId));
        }
      }
      const activeTranscriptRunId =
        state.running && state.activeRun && liveTranscriptText ? String(state.activeRun.id || '') : '';
      if (activeTranscriptRunId) transcriptRunIds.add(activeTranscriptRunId);
      const timelineMessages = visibleMessages.filter(function (message) {
        const runId = String(message && message.runId ? message.runId : '');
        if (activeTranscriptRunId && runId === activeTranscriptRunId && message.role === 'assistant') {
          return false;
        }
        if (runId && transcriptRunIds.has(runId) && message.role === 'system') {
          return false;
        }
        return true;
      });
      const displayedDiffIds = new Set();
      const merged = [];
      let mergeSeq = 0;
      for (let i = 0; i < timelineMessages.length; i += 1) {
        const message = timelineMessages[i];
        merged.push({ kind: 'msg', sort: message.createdAt || '', seq: mergeSeq++, message: message });
      }
      const runReceipts = receiptsForActiveRunTimeline();
      if (!state.running && state.activeRun && !transcriptRunIds.has(String(state.activeRun.id || ''))) {
        for (let r = 0; r < runReceipts.length; r += 1) {
          const receipt = runReceipts[r];
          merged.push({
            kind: 'ran',
            sort: receipt.finishedAt || receipt.startedAt || '',
            seq: mergeSeq++,
            receipt: receipt,
            ranKey: receipt.id || 'r' + r,
          });
        }
      }
      merged.sort(function (a, b) {
        if (a.sort < b.sort) return -1;
        if (a.sort > b.sort) return 1;
        if (a.kind !== b.kind) {
          if (a.kind === 'msg') return -1;
          if (b.kind === 'msg') return 1;
          if (a.kind === 'ran') return -1;
          if (b.kind === 'ran') return 1;
        }
        return a.seq - b.seq;
      });

      if (!merged.length && !liveTranscriptText) {
        const empty = document.createElement('div');
        empty.className = 'empty empty-minimal';
        empty.textContent = 'Cutie is ready. Ask in this workspace or use @ for files and windows.';
        chat.appendChild(empty);
        return;
      }

      for (let k = 0; k < merged.length; k += 1) {
        const entry = merged[k];
        if (entry.kind === 'msg') {
          if (entry.message.presentation === 'live_binary' && entry.message.live) {
            const wrap = document.createElement('div');
            wrap.className = 'bubble assistant live-binary';
            const meta = document.createElement('div');
            meta.className = 'live-binary-meta';
            const lv = entry.message.live;
            const parts = [];
            if (lv.transport === 'binary') parts.push('App build');
            if (lv.phase) parts.push(lv.phase);
            if (typeof lv.progress === 'number') parts.push(Math.round(lv.progress) + '%');
            meta.textContent = parts.join(' · ');
            const body = document.createElement('div');
            body.className = 'live-binary-body';
            body.textContent = entry.message.content || '';
            wrap.appendChild(meta);
            wrap.appendChild(body);
            chat.appendChild(wrap);
          } else if (entry.message.presentation === 'run_transcript') {
            appendTranscriptBubble(chat, entry.message.content || '');
          } else {
            const div = document.createElement('div');
            div.className = 'bubble ' + entry.message.role;
            div.textContent = entry.message.content;
            chat.appendChild(div);
          }
          if (
            entry.message.role === 'assistant' &&
            isTerminalAssistantForRun(entry.message, timelineMessages)
          ) {
            appendRunFilesSummaryCard(entry.message.runId, chatDiffs);
            const runDiffs = chatDiffsForRun(entry.message.runId, chatDiffs);
            for (let d = 0; d < runDiffs.length; d += 1) {
              const diff = runDiffs[d];
              appendCutieDiffBubble(diff);
              if (diff && diff.id) displayedDiffIds.add(diff.id);
            }
          }
        } else if (entry.kind === 'ran') {
          const wrap = document.createElement('div');
          wrap.className = 'bubble assistant ran-line';
          appendReceiptActivityRow(wrap, entry.receipt, { prominent: false });
          chat.appendChild(wrap);
        }
      }

      if (liveTranscriptText) {
        appendTranscriptBubble(chat, liveTranscriptText);
      } else if (liveActionText) {
        appendTranscriptBubble(chat, liveActionText);
      } else {
        const progressText = buildLiveAssistantNarrationText(state.activeRun || null, state.progress || null, runReceipts);
        if (progressText) {
          const div = document.createElement('div');
          div.className = 'bubble assistant';
          div.textContent = progressText;
          chat.appendChild(div);
        }
      }

      if (state.running && state.activeRun) {
        const activeRunDiffs = chatDiffsForRun(state.activeRun.id, chatDiffs);
        if (activeRunDiffs.length) {
          appendRunFilesSummaryCard(state.activeRun.id, chatDiffs);
        }
        for (let d = 0; d < activeRunDiffs.length; d += 1) {
          const diff = activeRunDiffs[d];
          if (diff && diff.id && displayedDiffIds.has(diff.id)) continue;
          appendCutieDiffBubble(diff);
          if (diff && diff.id) displayedDiffIds.add(diff.id);
        }
      }

      for (let d = 0; d < chatDiffs.length; d += 1) {
        const diff = chatDiffs[d];
        if (diff && diff.id && displayedDiffIds.has(diff.id)) continue;
        appendCutieDiffBubble(diff);
        if (diff && diff.id) displayedDiffIds.add(diff.id);
      }

      chat.scrollTop = chat.scrollHeight;
    }

    function renderDesktop(desktop) {
      const parts = [];
      if (desktop.platform) parts.push(desktop.platform);
      if (desktop.activeWindow && (desktop.activeWindow.app || desktop.activeWindow.title)) {
        parts.push((desktop.activeWindow.app || 'window') + ': ' + (desktop.activeWindow.title || ''));
      }
      if (desktop.displays && desktop.displays.length) {
        parts.push(desktop.displays.length + ' display' + (desktop.displays.length === 1 ? '' : 's'));
      }
      if (desktop.recentSnapshots && desktop.recentSnapshots.length) {
        parts.push(desktop.recentSnapshots.length + ' snapshot' + (desktop.recentSnapshots.length === 1 ? '' : 's'));
      }
      const summary = parts.join(' - ') || 'Desktop unavailable.';
      desktopSummaryPanel.textContent = summary;
    }

    function formatStatusPillBase(status) {
      return String(status || 'Ready').trim() || 'Ready';
    }

    function liveStatusBubbleText() {
      if (!state.running) return '';
      const base = formatStatusPillBase(state.status);
      if (!base || /^ready$/i.test(base)) return '';
      return queuedPrompts.length ? base + ' · ' + queuedPrompts.length + ' queued next' : base;
    }

    function ensureSentence(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return '';
      return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.';
    }

    function formatObjectiveSummaryText(run) {
      const objectives = run && Array.isArray(run.objectives) ? run.objectives : [];
      if (!objectives.length) return '';
      const pending = objectives.filter(function (objective) {
        return String(objective && objective.status ? objective.status : 'pending') !== 'done';
      });
      const relevant = (pending.length ? pending : objectives).slice(0, 4);
      if (!relevant.length) return '';
      const lines = ['I’m working through this now.'];
      if (relevant[0]) {
        lines.push('');
        lines.push('Right now: ' + (String(relevant[0].text || '').trim() || 'Continue the task.'));
      }
      if (relevant.length > 1) {
        lines.push('');
        lines.push('Next:');
        for (let index = 1; index < relevant.length; index += 1) {
          const text = String(relevant[index].text || '').trim();
          if (text) lines.push('• ' + text);
        }
      }
      if (pending.length > relevant.length) {
        lines.push('');
        lines.push('After that I’ll keep going through the remaining steps.');
      }
      return lines.join('\\n');
    }

    function buildLiveAssistantNarrationText(run, progress, receipts) {
      if (!state.running) return '';
      const lines = [];
      const objectiveText = formatObjectiveSummaryText(run);
      const statusText = liveStatusBubbleText();

      if (objectiveText) {
        lines.push(objectiveText);
      } else if (statusText) {
        lines.push(ensureSentence(statusText));
      } else {
        lines.push('I’m working through this now.');
      }

      if (!objectiveText && progress && progress.pursuingLabel) {
        lines.push('');
        lines.push(ensureSentence(progress.pursuingLabel));
      }

      if (progress && progress.phaseLabel) {
        lines.push('');
        lines.push('Current phase: ' + ensureSentence(progress.phaseLabel));
      }

      if (progress && progress.taskFrameSummary) {
        lines.push('Task frame: ' + ensureSentence(progress.taskFrameSummary));
      }

      if (progress && progress.targetSummary) {
        lines.push('Targeting: ' + ensureSentence(progress.targetSummary));
      }

      if (progress && progress.repairLabel) {
        lines.push('Repair status: ' + ensureSentence(progress.repairLabel));
      }

      if (progress && progress.objectiveRepairLabel) {
        lines.push('Objective repair: ' + ensureSentence(progress.objectiveRepairLabel));
      }

      if (progress && progress.repairTacticLabel) {
        lines.push('Repair tactic: ' + ensureSentence(progress.repairTacticLabel));
      }

      if (progress && progress.currentStrategyLabel) {
        lines.push('');
        lines.push('Current strategy: ' + ensureSentence(progress.currentStrategyLabel));
      }

      if (progress && progress.modelStrategySummary) {
        lines.push('Model path: ' + ensureSentence(progress.modelStrategySummary));
      }

      if (progress && progress.stallLabel) {
        lines.push('');
        lines.push(ensureSentence(progress.stallLabel));
      }

      const latestReceipt = Array.isArray(receipts) && receipts.length ? receipts[receipts.length - 1] : null;
      if (latestReceipt) {
        lines.push('');
        lines.push('Latest action: ' + formatRanLineFromReceipt(latestReceipt));
      } else if (progress && progress.lastActionSummary) {
        lines.push('');
        lines.push('Latest action: ' + ensureSentence(progress.lastActionSummary));
      }

      if (progress && progress.lastMeaningfulProgressSummary) {
        lines.push('');
        lines.push('Last real progress: ' + ensureSentence(progress.lastMeaningfulProgressSummary));
      }

      if (progress && progress.lastNewEvidence) {
        lines.push('');
        lines.push('Latest evidence: ' + ensureSentence(progress.lastNewEvidence));
      }

      if (progress && progress.stallReason) {
        lines.push('');
        lines.push(ensureSentence(progress.stallReason));
      }

      if (progress && progress.stallNextAction) {
        lines.push('');
        lines.push('Next tactic: ' + ensureSentence(progress.stallNextAction));
      } else if (!objectiveText && progress && progress.suggestedNextAction) {
        lines.push('');
        lines.push('Next up: ' + ensureSentence(progress.suggestedNextAction));
      }

      if (progress && progress.escalationMessage) {
        lines.push('');
        lines.push(ensureSentence(progress.escalationMessage));
      }

      if (progress && progress.noOpConclusion) {
        lines.push('');
        lines.push(ensureSentence(progress.noOpConclusion));
      }

      return lines.join('\\n').trim();
    }

    function buildPendingAssistantStartupText() {
      if (!isSubmitting || state.running) return '';
      const status = String(state.status || '').trim();
      if (status && !/^ready\\b/i.test(status)) {
        return ensureSentence(status);
      }
      return '';
    }

    function refreshComposerStatusLine() {
      if (!runtimeLine) return;
      if (state.running || isSubmitting) {
        runtimeLine.textContent = '';
        return;
      }
      const warm = state.warmStartState || null;
      const promptState = state.promptState || null;
      if (!warm) {
        runtimeLine.textContent = '';
        return;
      }
      if (warm.warming && !warm.localReady) {
        runtimeLine.textContent = 'Cutie is warming up.';
        return;
      }
      if (promptState && promptState.promptSource === 'external_fallback' && promptState.promptLoadError) {
        runtimeLine.textContent = 'Cutie is ready with the built-in prompt; the workspace markdown prompt could not be loaded.';
        return;
      }
      if (warm.localReady && warm.hostReady === false) {
        runtimeLine.textContent = 'Cutie is locally ready; host not yet confirmed.';
        return;
      }
      if (warm.localReady) {
        runtimeLine.textContent =
          promptState && promptState.promptSource === 'external_markdown'
            ? 'Cutie is ready with the workspace operating prompt.'
            : promptState && promptState.promptSource === 'bundled_markdown'
              ? 'Cutie is ready with the bundled operating prompt.'
            : 'Cutie is ready.';
        return;
      }
      if (warm.warmFailureSummary) {
        runtimeLine.textContent = 'Cutie warmup is still in progress.';
        return;
      }
      runtimeLine.textContent = '';
    }

    function renderPromptQueue() {
      const n = queuedPrompts.length;
      if (!promptQueueWrap || !promptQueueList || !promptQueueCount) return;
      if (!n) {
        promptQueueWrap.classList.add('is-hidden');
        promptQueueList.innerHTML = '';
        promptQueueCount.textContent = '0';
        return;
      }
      promptQueueWrap.classList.remove('is-hidden');
      promptQueueCount.textContent = String(n);
      promptQueueList.innerHTML = '';
      for (let index = 0; index < queuedPrompts.length; index += 1) {
        const item = queuedPrompts[index];
        const row = document.createElement('div');
        row.className = 'prompt-queue-item';
        const num = document.createElement('span');
        num.className = 'prompt-queue-num';
        num.textContent = (index + 1) + '.';
        const text = document.createElement('div');
        text.className = 'prompt-queue-text';
        const normalized = String(item.prompt || '').replace(/\\s+/g, ' ').trim();
        const full = normalized || '(empty)';
        text.textContent = full;
        if (full.length > 280) {
          text.textContent = full.slice(0, 277) + '…';
        }
        text.title = normalized || '(empty)';
        row.appendChild(num);
        row.appendChild(text);
        promptQueueList.appendChild(row);
      }
    }

    function renderRuntime(run) {
      if (objectivesPanel) {
        objectivesPanel.classList.add('is-hidden');
        objectivesPanel.innerHTML = '';
      }
      void run;
      refreshComposerStatusLine();
    }

    function drainQueuedPrompts() {
      if (state.running || isSubmitting || !queuedPrompts.length) return;
      const next = queuedPrompts.shift();
      if (!next) return;
      renderPromptQueue();
      refreshComposerStatusLine();
      sendPrompt(next.prompt, { mentions: next.mentions || [] });
    }

    function queuePrompt(prompt, mentions) {
      queuedPrompts.push({
        prompt,
        mentions: Array.isArray(mentions) ? mentions : [],
      });
      refreshComposerStatusLine();
      renderPromptQueue();
      renderMessages();
      renderRuntime(state.activeRun || null);
    }

    function clearEphemeralConversationState() {
      pendingSubmission = null;
      queuedPrompts = [];
      recentSubmissionGuard = { prompt: '', until: 0 };
      setComposerSubmitting(false);
      syncLastInputValue();
      renderPromptQueue();
      refreshComposerStatusLine();
      renderMessages();
      renderRuntime(state.activeRun || null);
    }

    function closeSettingsMenu() {
      settingsMenu.classList.add('is-hidden');
      settingsToggle.setAttribute('aria-expanded', 'false');
    }

    function toggleSettingsMenu(force) {
      const shouldOpen = typeof force === 'boolean' ? force : settingsMenu.classList.contains('is-hidden');
      settingsMenu.classList.toggle('is-hidden', !shouldOpen);
      settingsToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function syncIdeRuntimeUi() {
      const rt = state.ideRuntime || 'cutie';
      const signInEl = document.getElementById('settingsSignIn');
      if (signInEl) {
        signInEl.classList.toggle('is-hidden', rt === 'qwenCode');
      }
      const undoEl = document.getElementById('settingsUndoPlayground');
      if (undoEl) {
        undoEl.classList.toggle('is-hidden', rt !== 'playgroundApi');
        undoEl.disabled = rt !== 'playgroundApi' || !state.canUndoPlayground;
      }
    }

    function applyState(next) {
      try {
        applyStateInner(next);
      } catch (err) {
        console.error('Cutie webview applyState failed', err);
        const chatEl = document.getElementById('chat');
        if (chatEl) {
          chatEl.innerHTML =
            '<div class="empty" style="color:var(--vscode-errorForeground,#f88);max-width:100%">' +
            'Cutie hit a UI error while updating the chat. Try Developer: Reload Window, or check the webview console (Help → Toggle Developer Tools).' +
            '</div>';
        }
      }
    }

    function applyStateInner(next) {
      const previousSessionId = state.activeSessionId;
      const switchedConversation = Boolean(previousSessionId) && previousSessionId !== next.activeSessionId;
      const hasPendingEcho =
        pendingSubmission &&
        Array.isArray(next.messages) &&
        next.messages.some((message) => message.role === 'user' && message.content === pendingSubmission.content);
      const shouldClearPendingWithoutEcho =
        pendingSubmission &&
        !next.running &&
        typeof next.status === 'string' &&
        /sign in|failed|stopped|cancelled|canceled|guidance/i.test(next.status);
      if (hasPendingEcho || shouldClearPendingWithoutEcho) {
        pendingSubmission = null;
      }
      if (switchedConversation) {
        clearEphemeralConversationState();
        selectedArtifactsRunId = '';
      }

      state = next;
      isSubmitting = false;
      updateComposerPrimaryButton();
      renderComposerFooter();

      const authState = next.authState || { kind: 'none', label: 'Not signed in' };
      authLabel.textContent = authState.label || 'Not signed in';
      authChip.textContent = authState.kind === 'browser' ? 'Browser' : 'Key';
      authStatusButton.classList.toggle('is-ready', authState.kind !== 'none');
      authStatusButton.title = 'Set Xpersona API key';

      let chatTitle = 'New chat';
      const sessionList = Array.isArray(next.sessions) ? next.sessions : [];
      if (next.activeSessionId) {
        const active = sessionList.find((s) => s.id === next.activeSessionId);
        if (active && active.title) {
          chatTitle = active.title;
        }
      }
      currentChatTitle.textContent = chatTitle;

      renderDesktop(next.desktop || { platform: '', displays: [], recentSnapshots: [] });
      renderRuntime(next.activeRun || null);
      renderBinaryPanel();
      refreshComposerStatusLine();
      renderPromptQueue();
      renderSessions();
      renderArtifactsList();
      renderMessages();
      syncIdeRuntimeUi();

      const settingsSignOutEl = document.getElementById('settingsSignOut');
      if (settingsSignOutEl) settingsSignOutEl.disabled = authState.kind === 'none';

      if (previousSessionId !== next.activeSessionId) {
        restoreDraft();
      }

      if (!next.running) {
        drainQueuedPrompts();
      }
    }

    function sendPrompt(text, options) {
      const prompt = normalizePromptText(text || input.value || '');
      if (!prompt) return;
      const mentionItems = options && Array.isArray(options.mentions)
        ? options.mentions
        : text
          ? []
          : collectCurrentMentions(prompt);
      pendingSubmission = {
        id: '__pending_user__',
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      };
      armRecentSubmissionGuard(prompt);
      setComposerSubmitting(true);
      if (runtimeLine) runtimeLine.textContent = '';
      saveDraft();
      drafts.set(currentDraftKey(), '');
      draftMentions.set(currentDraftKey(), []);
      input.value = '';
      closeMentions();
      closeSettingsMenu();
      autoSize();
      syncLastInputValue();
      renderMessages();
      vscode.postMessage({ type: 'submitPrompt', prompt, mentions: mentionItems });
    }

    function handleComposerSendError(error) {
      console.error('Cutie composer send failed', error);
      if (runtimeLine) {
        runtimeLine.textContent = 'Cutie hit a send UI error. Reload the panel if this keeps happening.';
      }
      syncLastInputValue();
    }

    function safelyQueueOrSendPrompt() {
      try {
        queueOrSendPrompt();
      } catch (error) {
        handleComposerSendError(error);
      }
    }

    function queueOrSendPrompt() {
      const prompt = normalizePromptText(input.value || '');
      if (!prompt) return;
      const mentionItems = collectCurrentMentions(prompt);
      if (isSubmitting || matchesRecentSubmissionGuard(prompt)) {
        return;
      }
      if (state.running) {
        queuePrompt(prompt, mentionItems);
        saveDraft();
        drafts.set(currentDraftKey(), '');
        draftMentions.set(currentDraftKey(), []);
        input.value = '';
        closeMentions();
        closeSettingsMenu();
        autoSize();
        syncLastInputValue();
        return;
      }
      sendPrompt(prompt, { mentions: mentionItems });
    }

    try {
      document.getElementById('newChatBtn').addEventListener('click', () => {
        saveDraft();
        clearEphemeralConversationState();
        closeSettingsMenu();
        closeAllDrawers();
        vscode.postMessage({ type: 'newChat' });
      });
      historyToggle.addEventListener('click', () => {
        closeSettingsMenu();
        setHistoryOpen(!isHistoryOpen());
      });
      artifactsToggle.addEventListener('click', () => {
        closeSettingsMenu();
        setArtifactsOpen(workspaceShell.dataset.artifactsOpen !== 'true');
      });
      drawerScrim.addEventListener('click', () => {
        closeAllDrawers();
        closeSettingsMenu();
      });
      historyCloseBtn.addEventListener('click', () => setHistoryOpen(false));
      artifactsCloseBtn.addEventListener('click', () => setArtifactsOpen(false));
      historyRefreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refreshView' });
      });
      document.getElementById('settingsSetKey').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'setApiKey' });
      });
      document.getElementById('settingsSignIn').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'signIn' });
      });
      const settingsUndoPlayground = document.getElementById('settingsUndoPlayground');
      if (settingsUndoPlayground) {
        settingsUndoPlayground.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'undoPlaygroundBatch' });
        });
      }
      document.getElementById('settingsSignOut').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'signOut' });
      });
      document.getElementById('settingsCopyDebug').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'copyDebug' });
      });
      document.getElementById('settingsCapture').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'captureScreen' });
      });
      if (settingsBinaryConfigure) {
        settingsBinaryConfigure.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryConfigure' });
        });
      }
      function composerIntentText() {
        return String(input.value || '').trim();
      }
      if (binaryPanelToggle && binaryPanel) {
        binaryPanelToggle.addEventListener('click', () => {
          const nextCollapsed = !binaryPanel.classList.contains('is-collapsed');
          writeBinaryPanelCollapsedPreference(nextCollapsed);
          applyBinaryPanelCollapseUi(nextCollapsed);
        });
      }
      if (binaryGenerateBtn) {
        binaryGenerateBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryGenerate', intent: composerIntentText() });
        });
      }
      if (binaryRefineBtn) {
        binaryRefineBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryRefine', intent: composerIntentText() });
        });
      }
      if (binaryBranchBtn) {
        binaryBranchBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryBranch', intent: composerIntentText() });
        });
      }
      if (binaryRewindBtn) {
        binaryRewindBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryRewind' });
        });
      }
      if (binaryValidateBtn) {
        binaryValidateBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryValidate' });
        });
      }
      if (binaryPublishBtn) {
        binaryPublishBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryPublish' });
        });
      }
      if (binaryCancelBtn) {
        binaryCancelBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryCancel' });
        });
      }
      if (binaryConfigureBtn) {
        binaryConfigureBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryConfigure' });
        });
      }
      if (binaryExecuteBtn && binaryEntryInput) {
        binaryExecuteBtn.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryExecute', entryPoint: String(binaryEntryInput.value || '').trim() });
        });
      }
      if (binaryRuntimeSelect) {
        binaryRuntimeSelect.addEventListener('change', () => {
          vscode.postMessage({ type: 'binarySetTarget', runtime: binaryRuntimeSelect.value });
        });
      }
    function postSendOrStop(event) {
      try {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }
        if (isBusySubmitState()) {
          closeSettingsMenu();
          vscode.postMessage({ type: 'stopAutomation' });
          return;
        }
        if (sendBtn.disabled) return;
        safelyQueueOrSendPrompt();
      } catch (error) {
        handleComposerSendError(error);
      }
    }
    function queueOrAcceptMention() {
      if (mentions.classList.contains('show') && mentionState.items.length) {
        if (acceptMention(mentionState.activeIndex)) {
          return;
        }
        closeMentions();
      }
      safelyQueueOrSendPrompt();
    }

      authStatusButton.addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'setApiKey' });
      });
      settingsToggle.addEventListener('click', () => toggleSettingsMenu());
      document.addEventListener('mousedown', (event) => {
        const t = event.target;
        if (!t || !(t instanceof Node)) return;
        if (t instanceof Element && t.closest('.utility-rail')) return;
        if (
          settingsMenu.contains(t) ||
          settingsToggle.contains(t) ||
          historyDrawer.contains(t) ||
          artifactsDrawer.contains(t) ||
          historyToggle.contains(t) ||
          artifactsToggle.contains(t)
        ) {
          return;
        }
        closeSettingsMenu();
      });

    function isEnterKey(event) {
      if (!event) return false;
      return (
        event.key === 'Enter' ||
        event.key === 'NumpadEnter' ||
        event.code === 'Enter' ||
        event.code === 'NumpadEnter' ||
        event.keyCode === 13 ||
        event.which === 13
      );
    }

    function isMainEnterNoShift(event) {
      if (!event) return false;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
      return isEnterKey(event);
    }

    function isComposerEvent(event) {
      if (!input || !event) return false;
      if (event.target === input) return true;
      if (document.activeElement === input) return true;
      if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        if (Array.isArray(path) && path.indexOf(input) !== -1) return true;
      }
      return false;
    }

    function shouldTreatTrailingNewlineAsSend(previousValue, currentValue) {
      const current = String(currentValue || '');
      const previous = String(previousValue || '');
      const normalizedCurrent = current.replace(/\\r\\n/g, '\\n');
      const normalizedPrevious = previous.replace(/\\r\\n/g, '\\n');
      if (!normalizedCurrent.endsWith('\\n')) return false;
      if (!normalizePromptText(normalizedCurrent)) return false;
      if (normalizedCurrent === normalizedPrevious + '\\n') return true;
      if (Date.now() - lastBareEnterIntentAt <= 300) return true;
      const currentWithoutTrailing = normalizedCurrent.replace(/\\n$/, '');
      if (
        currentWithoutTrailing === normalizePromptText(currentWithoutTrailing) &&
        normalizedCurrent.split('\\n').length <= 2
      ) {
        return true;
      }
      return false;
    }

    function onComposerKeydown(event) {
      if (!isComposerEvent(event)) return;

      if (mentions.classList.contains('show') && mentionState.items.length) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          mentionState.activeIndex = (mentionState.activeIndex + 1) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          mentionState.activeIndex = (mentionState.activeIndex - 1 + mentionState.items.length) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          acceptMention(mentionState.activeIndex);
          return;
        }
        if (isMainEnterNoShift(event)) {
          event.preventDefault();
          event.stopPropagation();
          if (acceptMention(mentionState.activeIndex)) {
            return;
          }
          closeMentions();
          queueOrAcceptMention();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeMentions();
          closeSettingsMenu();
          closeAllDrawers();
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMentions();
        closeSettingsMenu();
        closeAllDrawers();
        return;
      }

      if (event.key === '@' && !event.ctrlKey && !event.metaKey) {
        scheduleMentionRequestSoon();
      }

      if (!isEnterKey(event)) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        allowNextLineBreak = true;
        return;
      }
      if (event.isComposing) return;
      noteBareEnterIntent(event);
      allowNextLineBreak = false;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerBeforeInput(event) {
      if (!isComposerEvent(event)) return;
      const isLineBreak =
        event.inputType === 'insertLineBreak' ||
        event.inputType === 'insertParagraph' ||
        (event.inputType === 'insertText' && event.data === '\\n');
      if (!isLineBreak) return;
      if (typeof event.isComposing === 'boolean' && event.isComposing) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        allowNextLineBreak = true;
        return;
      }
      noteBareEnterIntent(event);
      if (allowNextLineBreak) {
        allowNextLineBreak = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerKeypressFallback(event) {
      if (!isComposerEvent(event)) return;
      if (!isMainEnterNoShift(event)) return;
      noteBareEnterIntent(event);
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerInputFallback(event) {
      if (!isComposerEvent(event)) return;
      const inputType = String(event && event.inputType ? event.inputType : '');
      const isPlainLineBreak =
        inputType === 'insertLineBreak' ||
        inputType === 'insertParagraph' ||
        (inputType === 'insertText' && event.data === '\\n');
      const currentValue = String(input.value || '');
      const previousValue = String(lastInputValue || '');
      if (!isPlainLineBreak && !shouldTreatTrailingNewlineAsSend(previousValue, currentValue)) return;
      if (allowNextLineBreak) {
        allowNextLineBreak = false;
        return;
      }
      if (!currentValue.endsWith('\\n')) return;
      input.value = currentValue.replace(/\\r?\\n$/, '');
      autoSize();
      syncLastInputValue();
      queueOrAcceptMention();
    }

    function maybeSendFromImplicitTrailingLineBreak() {
      if (!input) return false;
      if (allowNextLineBreak) {
        syncLastInputValue();
        return false;
      }
      const currentValue = String(input.value || '');
      const previousValue = String(lastInputValue || '');
      if (!previousValue) {
        syncLastInputValue();
        return false;
      }
      const caretAtEnd =
        (input.selectionStart || 0) === currentValue.length && (input.selectionEnd || 0) === currentValue.length;
      const appendedBareEnter = shouldTreatTrailingNewlineAsSend(previousValue, currentValue);
      if (!caretAtEnd || !appendedBareEnter) {
        syncLastInputValue();
        return false;
      }
      input.value = previousValue;
      autoSize();
      syncLastInputValue();
      queueOrAcceptMention();
      return true;
    }

    function composerKeyupFallback(event) {
      if (!isComposerEvent(event)) return;
      if (isMainEnterNoShift(event)) {
        noteBareEnterIntent(event);
      }
      if (isMainEnterNoShift(event) && maybeSendFromImplicitTrailingLineBreak()) {
        return;
      }
      if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        allowNextLineBreak = false;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        requestMentions();
      }
    }

      input.addEventListener('input', () => {
        if (maybeSendFromImplicitTrailingLineBreak()) {
          return;
        }
        saveDraft();
        autoSize();
        requestMentions();
        syncLastInputValue();
      }, true);
      input.addEventListener('click', () => requestMentions());
      input.addEventListener('keyup', composerKeyupFallback, true);
      input.onkeyup = composerKeyupFallback;
      input.addEventListener('focus', startComposerWatch, true);
      input.addEventListener('blur', () => {
        allowNextLineBreak = false;
        stopComposerWatch();
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message) return;
        if (message.type === 'state') {
          applyState(message.state);
          return;
        }
        if (message.type === 'mentions') {
          applyMentionsResponse(Number(message.requestId || 0), message.items || []);
        }
      });

      autoSize();
      closeSettingsMenu();
      vscode.postMessage({ type: 'ready' });
    } catch (error) {
      reportFatalError(error);
    }
  </script>
</body>
</html>`;
}
