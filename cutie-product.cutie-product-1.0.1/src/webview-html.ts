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

  const plusIcon = icon("M12 5v14 M5 12h14");
  const captureIcon = icon("M4 7h3l2-2h6l2 2h3v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8");
  const stopIcon = icon("M8 8h8v8H8z");
  const keyIcon = icon("M21 2l-2 2m-7 5a5 5 0 1 0-7 7l2-2h3l2-2v-3z");
  const settingsIcon = icon(
    "M12 3a2.5 2.5 0 0 0-2.45 2l-.13.78a7.96 7.96 0 0 0-1.52.88l-.72-.29a2.5 2.5 0 0 0-3.18 1.42 2.5 2.5 0 0 0 .85 3.02l.65.46a8.77 8.77 0 0 0 0 1.76l-.65.46a2.5 2.5 0 0 0-.85 3.02 2.5 2.5 0 0 0 3.18 1.42l.72-.29c.47.36.98.65 1.52.88l.13.78A2.5 2.5 0 0 0 12 21a2.5 2.5 0 0 0 2.45-2l.13-.78a7.96 7.96 0 0 0 1.52-.88l.72.29a2.5 2.5 0 0 0 3.18-1.42 2.5 2.5 0 0 0-.85-3.02l-.65-.46a8.77 8.77 0 0 0 0-1.76l.65-.46a2.5 2.5 0 0 0 .85-3.02 2.5 2.5 0 0 0-3.18-1.42l-.72.29a7.96 7.96 0 0 0-1.52-.88l-.13-.78A2.5 2.5 0 0 0 12 3z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4",
    13
  );
  const submitIcon = icon("M12 19V5 M6 11l6-6 6 6", 18);

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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
    }
    .workspace-header-title {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      overflow: hidden;
    }
    .header-copy {
      min-width: 0;
      display: grid;
      gap: 1px;
    }
    .header-kicker {
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      line-height: 1;
    }
    .header-title-line {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
    }
    .header-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 13px;
      font-weight: 620;
      letter-spacing: 0.01em;
    }
    .header-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
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
    .chip,
    .session,
    .menu-button {
      transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
    }
    .rail-button {
      min-width: 28px;
      min-height: 28px;
      display: inline-grid;
      place-items: center;
      gap: 2px;
      padding: 2px 8px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .rail-button:hover,
    .rail-button:focus-visible {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--text);
      outline: none;
    }
    .rail-button-stack {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .rail-button-text {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 8px;
      font-weight: 700;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .rail-button.stop {
      color: var(--danger);
    }
    .rail-button.is-hidden {
      display: none;
    }
    .rail-button.stop:hover,
    .rail-button.stop:focus-visible {
      border-color: color-mix(in srgb, var(--danger) 46%, var(--line) 54%);
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }
    .status-pill {
      max-width: 300px;
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--panel-elevated) 86%, transparent);
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .auth-status-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--panel-elevated) 82%, transparent);
      color: var(--muted);
      cursor: pointer;
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
      min-width: 190px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-elevated) 96%, transparent);
      box-shadow: var(--shadow);
    }
    .settings-menu.is-hidden {
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
    .workspace-main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
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
      padding: 16px 18px 14px;
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
      margin-top: 7px;
      font-size: 18px;
      font-weight: 620;
    }
    .brand span,
    .desktop-panel,
    .status-line,
    .sidebar-note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .desktop-panel {
      padding: 12px 18px 14px;
      border-bottom: 1px solid var(--line);
    }
    .sidebar-note {
      padding: 12px 18px 0;
    }
    .sessions {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 14px 12px 16px;
    }
    .session {
      width: 100%;
      margin-bottom: 8px;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text);
      padding: 12px 14px;
      border-radius: 14px;
      cursor: pointer;
    }
    .session:hover,
    .session:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 18%, var(--line) 82%);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .session.active {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .session-title {
      display: block;
      font-size: 13px;
      font-weight: 560;
      line-height: 1.4;
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
      padding: 18px 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
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
    .bubble {
      max-width: min(760px, 92%);
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--assistant);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.62;
    }
    .bubble.user {
      align-self: flex-end;
      background: var(--user);
      border-color: var(--accent-line);
      border-radius: 20px 20px 10px 20px;
    }
    .bubble.assistant {
      align-self: flex-start;
      min-width: min(620px, 76%);
    }
    .bubble.system {
      align-self: center;
      max-width: 100%;
      padding: 10px 14px;
      border-style: dashed;
      border-radius: 999px;
      background: transparent;
      color: var(--muted);
      text-align: center;
      min-width: 0;
    }
    .composer {
      position: relative;
      flex: 0 0 auto;
      padding: 12px 16px 14px;
      display: grid;
      gap: 8px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--canvas) 98%, #000 2%), var(--canvas));
      overflow: visible;
    }
    .composer-card {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: color-mix(in srgb, var(--panel-elevated) 90%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 8%, transparent);
      overflow: hidden;
    }
    .mentions {
      display: none;
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: calc(100% + 8px);
      z-index: 12;
      max-height: 240px;
      overflow: auto;
      border: 1px solid var(--line-strong);
      border-radius: 16px;
      background: color-mix(in srgb, var(--panel-elevated) 96%, transparent);
      box-shadow: var(--shadow);
      padding: 6px;
    }
    .mentions.show {
      display: block;
    }
    .mention-item {
      padding: 2px 0;
    }
    .mention-item.placeholder button {
      cursor: default;
      opacity: 0.86;
    }
    .mention-item button {
      width: 100%;
      border: 1px solid transparent;
      border-radius: 12px;
      background: transparent;
      color: var(--text);
      text-align: left;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 10px;
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
      min-width: 56px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 0 8px;
      border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .mention-item button.active .mention-kind,
    .mention-item button:focus-visible .mention-kind {
      color: inherit;
      border-color: color-mix(in srgb, var(--accent-foreground) 42%, transparent);
    }
    .mention-copy {
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .mention-label {
      font-size: 12px;
      line-height: 1.45;
      color: inherit;
      word-break: break-word;
    }
    .mention-detail {
      font-size: 11px;
      line-height: 1.4;
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
      border-bottom: 1px solid var(--line);
      background: transparent;
      color: var(--text);
      padding: 12px 14px 10px;
      resize: none;
      min-height: 64px;
      max-height: 140px;
      outline: none;
      line-height: 1.56;
    }
    .composer-row {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px 10px;
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .chip {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 0 10px;
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
      width: 34px;
      height: 34px;
      display: inline-grid;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--accent) 72%, var(--line) 28%);
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-foreground);
      cursor: pointer;
      flex: 0 0 auto;
    }
    .composer-send:hover,
    .composer-send:focus-visible {
      background: var(--accent-hover);
      border-color: var(--accent);
      outline: none;
    }
    .status-line {
      padding: 0 14px 12px;
    }
    @media (max-width: 1080px) {
      .workspace-main {
        grid-template-columns: 260px minmax(0, 1fr);
      }
      .status-pill {
        max-width: 220px;
      }
    }
    @media (max-width: 900px) {
      .workspace-shell {
        grid-template-rows: 50px minmax(0, 1fr);
      }
      .utility-rail {
        padding: 6px 8px;
      }
      .workspace-header-actions {
        gap: 4px;
      }
      .status-pill {
        display: none;
      }
      .auth-status-label {
        display: none;
      }
      .workspace-main {
        grid-template-columns: 1fr;
      }
      .sidebar {
        display: none;
      }
    }
    @media (max-width: 620px) {
      .rail-button-text {
        display: none;
      }
      .header-meta {
        display: none;
      }
      .chat {
        padding: 14px 12px 12px;
      }
      .composer {
        padding: 10px 12px 12px;
      }
      .mentions {
        left: 12px;
        right: 12px;
      }
      .bubble.assistant {
        min-width: 0;
        max-width: 100%;
      }
      .composer-row {
        align-items: flex-end;
      }
      .chips {
        gap: 6px;
      }
    }
  </style>
</head>
<body>
  <div class="workspace-shell">
    <header class="utility-rail" aria-label="Cutie Product header">
      <div class="workspace-header-title">
        <div class="header-copy">
          <span class="header-kicker">Cutie Runtime</span>
          <div class="header-title-line">
            <span class="header-title">Cutie Product</span>
            <span class="header-meta" id="desktopSummary">Desktop not loaded yet.</span>
          </div>
        </div>
      </div>
      <div class="workspace-header-actions">
        <div class="status-pill" id="statusPill">Ready</div>
        <button type="button" class="rail-button rail-button-stack" id="newChatBtn" title="New chat">
          ${plusIcon}
          <span class="rail-button-text">New</span>
        </button>
        <button type="button" class="rail-button rail-button-stack" id="captureBtn" title="Capture desktop">
          ${captureIcon}
          <span class="rail-button-text">Capture</span>
        </button>
        <button type="button" class="rail-button rail-button-stack stop is-hidden" id="stopBtn" title="Stop run">
          ${stopIcon}
          <span class="rail-button-text">Stop</span>
        </button>
        <button type="button" class="auth-status-button" id="authStatusButton" title="Authentication">
          ${keyIcon}
          <span class="auth-status-dot" id="authStatusDot" aria-hidden="true"></span>
          <span class="auth-status-label" id="authChip">Guest</span>
        </button>
        <div class="settings-menu-wrap">
          <button type="button" class="rail-button" id="settingsToggle" aria-controls="settingsMenu" aria-expanded="false" title="Settings">
            ${settingsIcon}
          </button>
          <div class="settings-menu is-hidden" id="settingsMenu" role="menu" aria-label="Cutie settings">
            <button type="button" class="menu-button" id="signInBtn" role="menuitem">Sign in</button>
            <button type="button" class="menu-button danger" id="signOutBtn" role="menuitem">Sign out</button>
            <button type="button" class="menu-button" id="apiKeyBtn" role="menuitem">API key</button>
          </div>
        </div>
      </div>
    </header>

    <div class="workspace-main">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-kicker">Workspace Agent</span>
          <strong>Cutie Product</strong>
          <span id="authLabel">Not signed in</span>
        </div>
        <div class="desktop-panel" id="desktopSummaryPanel">Desktop not loaded yet.</div>
        <div class="sidebar-note">Use @ to target files or windows before you run a task.</div>
        <div class="sessions" id="sessions"></div>
      </aside>

      <main class="main">
        <div class="chat" id="chat"></div>
        <div class="composer">
          <div class="mentions" id="mentions"></div>
          <div class="composer-card">
            <textarea id="input" placeholder="Ask Cutie to work in this workspace or help with a desktop task"></textarea>
            <div class="composer-row">
              <div class="chips">
                <button class="chip" data-prompt="Open the right app and help me finish the task I am working on.">Open app</button>
                <button class="chip" data-prompt="Look at my current setup, then explain what you can automate next.">Inspect desktop</button>
                <button class="chip" data-prompt="Capture the screen, explain the snapshot metadata you have, and continue carefully.">Use screenshot</button>
              </div>
              <button class="composer-send" id="sendBtn" aria-label="Submit">
                ${submitIcon}
              </button>
            </div>
            <div class="status-line" id="runtimeLine">Enter sends. Shift+Enter adds a newline. Use @ for files and windows.</div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('input');
    const chat = document.getElementById('chat');
    const sessions = document.getElementById('sessions');
    const mentions = document.getElementById('mentions');
    const authLabel = document.getElementById('authLabel');
    const authChip = document.getElementById('authChip');
    const authStatusButton = document.getElementById('authStatusButton');
    const statusPill = document.getElementById('statusPill');
    const desktopSummary = document.getElementById('desktopSummary');
    const desktopSummaryPanel = document.getElementById('desktopSummaryPanel');
    const runtimeLine = document.getElementById('runtimeLine');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    const stopBtn = document.getElementById('stopBtn');
    const drafts = new Map();
    const draftMentions = new Map();
    let state = { sessions: [], messages: [], activeSessionId: null, running: false, status: 'Ready', activeRun: null };
    let mentionState = {
      requestId: 0,
      items: [],
      activeIndex: 0,
      range: null,
      loading: false,
    };

    function currentDraftKey() {
      return state.activeSessionId || '__new__';
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
    }

    function autoSize() {
      input.style.height = 'auto';
      input.style.height = Math.min(Math.max(input.scrollHeight, 64), 140) + 'px';
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
      mentionState.loading = true;
      mentionState.items = [];
      mentionState.activeIndex = 0;
      renderMentions();
      const requestId = mentionState.requestId + 1;
      mentionState.requestId = requestId;
      vscode.postMessage({ type: 'mentionsQuery', query: range.query, requestId });
    }

    function applyMentionsResponse(requestId, items) {
      if (requestId !== mentionState.requestId || !mentionState.range) return;
      mentionState.loading = false;
      mentionState.items = Array.isArray(items) ? items : [];
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
      for (const session of state.sessions) {
        const button = document.createElement('button');
        button.className = 'session' + (session.id === state.activeSessionId ? ' active' : '');
        button.innerHTML =
          '<span class="session-title">' + escapeHtmlText(session.title || 'Untitled chat') + '</span>' +
          '<small>' + escapeHtmlText((session.lastStatus || 'idle') + ' - ' + (session.updatedAt || '')) + '</small>';
        button.addEventListener('click', () => {
          saveDraft();
          closeSettingsMenu();
          vscode.postMessage({ type: 'selectSession', sessionId: session.id });
        });
        sessions.appendChild(button);
      }
    }
    
    function renderMessages() {
      chat.innerHTML = '';
      if (!state.messages.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.innerHTML =
          '<strong style="display:block;color:var(--text);margin-bottom:8px;font-size:15px;">Cutie local runtime is ready.</strong>' +
          '<div>Sessions stay in this workspace, runs stay local, and the model is only used for planning and final responses.</div>';
        chat.appendChild(empty);
        return;
      }

      for (const message of state.messages) {
        const div = document.createElement('div');
        div.className = 'bubble ' + message.role;
        div.textContent = message.content;
        chat.appendChild(div);
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
      desktopSummary.textContent = summary;
      desktopSummaryPanel.textContent = summary;
    }

    function renderRuntime(run) {
      if (!run) {
        runtimeLine.textContent = 'Enter sends. Shift+Enter adds a newline. Use @ for files and windows.';
        return;
      }
      runtimeLine.textContent =
        'Phase: ' + (run.phase || 'idle') +
        ' - Step ' + String(run.stepCount || 0) + '/' + String(run.maxSteps || 0) +
        ' - Workspace ' + String(run.workspaceMutationCount || 0) + '/' + String(run.maxWorkspaceMutations || 0) +
        ' - Desktop ' + String(run.desktopMutationCount || 0) + '/' + String(run.maxDesktopMutations || 0);
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

    function applyState(next) {
      const previousSessionId = state.activeSessionId;
      state = next;

      const authState = next.authState || { kind: 'none', label: 'Not signed in' };
      authLabel.textContent = authState.label || 'Not signed in';
      authChip.textContent = authState.kind === 'browser' ? 'Browser' : authState.kind === 'apiKey' ? 'API key' : 'Guest';
      authStatusButton.classList.toggle('is-ready', authState.kind !== 'none');
      authStatusButton.title = authState.label || 'Authentication';

      statusPill.textContent = next.status || 'Ready';
      renderDesktop(next.desktop || { platform: '', displays: [], recentSnapshots: [] });
      renderRuntime(next.activeRun || null);
      renderSessions();
      renderMessages();

      stopBtn.disabled = !next.running;
      stopBtn.classList.toggle('is-hidden', !next.running);
      document.getElementById('signOutBtn').disabled = authState.kind === 'none';

      if (previousSessionId !== next.activeSessionId) {
        restoreDraft();
      }
    }

    function sendPrompt(text) {
      const prompt = String(text || input.value || '').trim();
      if (!prompt) return;
      const mentionItems = text ? [] : collectCurrentMentions(prompt);
      saveDraft();
      drafts.set(currentDraftKey(), '');
      draftMentions.set(currentDraftKey(), []);
      input.value = '';
      closeMentions();
      closeSettingsMenu();
      autoSize();
      vscode.postMessage({ type: 'submitPrompt', prompt, mentions: mentionItems });
    }

    document.getElementById('newChatBtn').addEventListener('click', () => {
      saveDraft();
      closeSettingsMenu();
      vscode.postMessage({ type: 'newChat' });
    });
    document.getElementById('captureBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'captureScreen' });
    });
    document.getElementById('stopBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'stopAutomation' });
    });
    document.getElementById('signInBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'signIn' });
    });
    document.getElementById('signOutBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'signOut' });
    });
    document.getElementById('apiKeyBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'setApiKey' });
    });
    document.getElementById('sendBtn').addEventListener('click', () => sendPrompt());

    authStatusButton.addEventListener('click', () => toggleSettingsMenu());
    settingsToggle.addEventListener('click', () => toggleSettingsMenu());
    document.addEventListener('mousedown', (event) => {
      if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target) && !authStatusButton.contains(event.target)) {
        closeSettingsMenu();
      }
    });

    input.addEventListener('input', () => {
      saveDraft();
      autoSize();
      requestMentions();
    });
    input.addEventListener('click', () => requestMentions());
    input.addEventListener('keyup', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        requestMentions();
      }
    });
    input.addEventListener('keydown', (event) => {
      if (mentions.classList.contains('show') && mentionState.items.length) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          mentionState.activeIndex = (mentionState.activeIndex + 1) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          mentionState.activeIndex = (mentionState.activeIndex - 1 + mentionState.items.length) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          acceptMention(mentionState.activeIndex);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMentions();
          closeSettingsMenu();
          return;
        }
      }

      if (event.key === 'Escape') {
        closeSettingsMenu();
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendPrompt();
      }
    });

    for (const chip of document.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => sendPrompt(chip.getAttribute('data-prompt')));
    }

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
  </script>
</body>
</html>`;
}
