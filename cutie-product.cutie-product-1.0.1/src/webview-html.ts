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
  const composerStopIcon = icon("M8 8h8v8H8z", 18);
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
      --shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
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
      grid-template-rows: 34px minmax(0, 1fr);
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
      background: var(--surface);
    }
    .utility-rail {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 8px;
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
      font-size: 12px;
      font-weight: 600;
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
      min-width: 24px;
      min-height: 24px;
      display: inline-grid;
      place-items: center;
      gap: 2px;
      padding: 1px 6px;
      border: 1px solid transparent;
      border-radius: 8px;
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
      color: var(--accent);
    }
    .rail-button.is-hidden {
      display: none;
    }
    .rail-button.stop:hover,
    .rail-button.stop:focus-visible {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--text);
    }
    .status-pill {
      max-width: 280px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
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
    .desktop-panel,
    .sidebar-note {
      display: none;
    }
    .sessions {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 8px 8px 10px;
    }
    .session {
      width: 100%;
      margin-bottom: 6px;
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
    .session.active {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 14%, transparent);
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
    .composer {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
      width: 100%;
      padding: 8px 10px 10px;
      display: grid;
      gap: 6px;
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
      bottom: calc(100% + 6px);
      z-index: 12;
      max-height: 200px;
      overflow: auto;
      border: 1px solid var(--line-strong);
      border-radius: 11px;
      background: color-mix(in srgb, var(--panel-elevated) 96%, transparent);
      box-shadow: var(--shadow);
      padding: 4px;
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
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      text-align: left;
      padding: 5px 8px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 7px;
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
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 18px;
      padding: 0 6px;
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
      font-size: 11px;
      line-height: 1.4;
      color: inherit;
      word-break: break-word;
    }
    .mention-detail {
      font-size: 10px;
      line-height: 1.35;
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
      padding: 8px 10px 7px;
      resize: none;
      min-height: 52px;
      max-height: 120px;
      outline: none;
      line-height: 1.48;
    }
    .composer-row {
      display: flex;
      gap: 6px;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px 6px;
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
      width: 30px;
      height: 30px;
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
      padding: 0 10px 8px;
      font-size: 11px;
    }
    @media (max-width: 1080px) {
      .workspace-main {
        grid-template-columns: 200px minmax(0, 1fr);
      }
      .status-pill {
        max-width: 220px;
      }
    }
    @media (max-width: 900px) {
      .workspace-shell {
        grid-template-rows: 38px minmax(0, 1fr);
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
        padding: 8px 10px 6px;
      }
      .composer {
        padding: 6px 8px 8px;
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
            <button type="button" class="menu-button" id="copyDebugBtn" role="menuitem">Copy debug</button>
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
          <div class="prompt-queue-wrap is-hidden" id="promptQueueWrap" aria-live="polite" aria-label="Queued prompts">
            <div class="prompt-queue-header">
              <span class="prompt-queue-title">Queued — runs after this one</span>
              <span class="prompt-queue-badge" id="promptQueueCount">0</span>
            </div>
            <div class="prompt-queue-list" id="promptQueueList"></div>
          </div>
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
    const ICON_SUBMIT = ${encodedComposerSubmitIcon};
    const ICON_STOP = ${encodedComposerStopIcon};
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
    const promptQueueWrap = document.getElementById('promptQueueWrap');
    const promptQueueList = document.getElementById('promptQueueList');
    const promptQueueCount = document.getElementById('promptQueueCount');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    const stopBtn = document.getElementById('stopBtn');
    const sendBtn = document.getElementById('sendBtn');
    const drafts = new Map();
    const draftMentions = new Map();
    let state = { sessions: [], messages: [], activeSessionId: null, running: false, status: 'Ready', activeRun: null, progress: null };
    let pendingSubmission = null;
    let isSubmitting = false;
    let queuedPrompts = [];
    let mentionState = {
      requestId: 0,
      items: [],
      activeIndex: 0,
      range: null,
      loading: false,
    };
    let mentionDebounceTimer = null;

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
      input.style.height = Math.min(Math.max(input.scrollHeight, 52), 120) + 'px';
    }

    function updateComposerPrimaryButton() {
      if (state.running) {
        sendBtn.innerHTML = ICON_STOP;
        sendBtn.classList.add('is-stop');
        sendBtn.classList.remove('is-busy');
        sendBtn.disabled = false;
        sendBtn.setAttribute('aria-label', 'Stop run');
        return;
      }
      sendBtn.classList.remove('is-stop');
      sendBtn.innerHTML = ICON_SUBMIT;
      sendBtn.disabled = isSubmitting;
      sendBtn.classList.toggle('is-busy', isSubmitting);
      sendBtn.setAttribute('aria-label', 'Submit');
    }

    function setComposerSubmitting(nextSubmitting) {
      isSubmitting = Boolean(nextSubmitting);
      updateComposerPrimaryButton();
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
      const delay = range.query.length === 0 ? 0 : 80;
      const sendQuery = () => {
        mentionDebounceTimer = null;
        const live = getMentionRange();
        if (!live || !mentionState.range) return;
        if (live.start !== mentionState.range.start || live.query !== mentionState.range.query) return;
        mentionState.loading = true;
        mentionState.items = [];
        mentionState.activeIndex = 0;
        renderMentions();
        const requestId = mentionState.requestId + 1;
        mentionState.requestId = requestId;
        vscode.postMessage({ type: 'mentionsQuery', query: live.query, requestId });
      };
      if (delay === 0) {
        sendQuery();
      } else {
        mentionState.loading = true;
        mentionState.items = [];
        mentionState.activeIndex = 0;
        renderMentions();
        mentionDebounceTimer = setTimeout(sendQuery, delay);
      }
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
      const visibleMessages = [...(Array.isArray(state.messages) ? state.messages : [])];
      if (
        pendingSubmission &&
        !visibleMessages.some((message) => message.role === 'user' && message.content === pendingSubmission.content)
      ) {
        visibleMessages.push(pendingSubmission);
      }

      if (!visibleMessages.length) {
        const empty = document.createElement('div');
        empty.className = 'empty empty-minimal';
        empty.textContent = 'Cutie is ready. Ask in this workspace or use @ for files and windows.';
        chat.appendChild(empty);
        return;
      }

      for (let index = 0; index < visibleMessages.length; index += 1) {
        const message = visibleMessages[index];
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

    function formatStatusPillBase(status) {
      return String(status || 'Ready').trim() || 'Ready';
    }

    function refreshStatusPillFromState() {
      const base = formatStatusPillBase(state.status);
      if (queuedPrompts.length) {
        statusPill.textContent = base + ' · ' + queuedPrompts.length + ' queued';
      } else {
        statusPill.textContent = base;
      }
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
        const normalized = String(item.prompt || '').replace(/\s+/g, ' ').trim();
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
      const hint = 'Enter send · Shift+Enter newline · @ files/windows';
      if (!run || run.status !== 'running') {
        runtimeLine.textContent = queuedPrompts.length ? queuedPrompts.length + ' in queue · ' + hint : hint;
        return;
      }
      runtimeLine.textContent = queuedPrompts.length ? 'Working… · ' + queuedPrompts.length + ' waiting in queue' : 'Working…';
    }

    function drainQueuedPrompts() {
      if (state.running || isSubmitting || !queuedPrompts.length) return;
      const next = queuedPrompts.shift();
      if (!next) return;
      renderPromptQueue();
      refreshStatusPillFromState();
      sendPrompt(next.prompt, { mentions: next.mentions || [] });
    }

    function queuePrompt(prompt, mentions) {
      queuedPrompts.push({
        prompt,
        mentions: Array.isArray(mentions) ? mentions : [],
      });
      refreshStatusPillFromState();
      renderPromptQueue();
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

    function applyState(next) {
      const previousSessionId = state.activeSessionId;
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

      state = next;
      isSubmitting = false;
      updateComposerPrimaryButton();

      const authState = next.authState || { kind: 'none', label: 'Not signed in' };
      authLabel.textContent = authState.label || 'Not signed in';
      authChip.textContent = authState.kind === 'browser' ? 'Browser' : authState.kind === 'apiKey' ? 'API key' : 'Guest';
      authStatusButton.classList.toggle('is-ready', authState.kind !== 'none');
      authStatusButton.title = authState.label || 'Authentication';

      renderDesktop(next.desktop || { platform: '', displays: [], recentSnapshots: [] });
      renderRuntime(next.activeRun || null);
      refreshStatusPillFromState();
      renderPromptQueue();
      renderSessions();
      renderMessages();

      stopBtn.disabled = !next.running;
      stopBtn.classList.toggle('is-hidden', !next.running);
      document.getElementById('signOutBtn').disabled = authState.kind === 'none';

      if (previousSessionId !== next.activeSessionId) {
        restoreDraft();
      }

      if (!next.running) {
        drainQueuedPrompts();
      }
    }

    function sendPrompt(text, options) {
      const prompt = String(text || input.value || '').trim();
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
      setComposerSubmitting(true);
      statusPill.textContent =
        queuedPrompts.length > 0
          ? 'Submitting… · ' + queuedPrompts.length + ' still queued'
          : 'Submitting…';
      runtimeLine.textContent = 'Submitting your prompt...';
      saveDraft();
      drafts.set(currentDraftKey(), '');
      draftMentions.set(currentDraftKey(), []);
      input.value = '';
      closeMentions();
      closeSettingsMenu();
      autoSize();
      renderMessages();
      vscode.postMessage({ type: 'submitPrompt', prompt, mentions: mentionItems });
    }

    function queueOrSendPrompt(text) {
      const prompt = String(text || input.value || '').trim();
      if (!prompt) return;
      const mentionItems = text ? [] : collectCurrentMentions(prompt);
      if (state.running || isSubmitting) {
        queuePrompt(prompt, mentionItems);
        saveDraft();
        drafts.set(currentDraftKey(), '');
        draftMentions.set(currentDraftKey(), []);
        input.value = '';
        closeMentions();
        closeSettingsMenu();
        autoSize();
        return;
      }
      sendPrompt(prompt, { mentions: mentionItems });
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
    document.getElementById('copyDebugBtn').addEventListener('click', () => {
      closeSettingsMenu();
      vscode.postMessage({ type: 'copyDebug' });
    });
    sendBtn.addEventListener('click', () => {
      if (state.running) {
        closeSettingsMenu();
        vscode.postMessage({ type: 'stopAutomation' });
        return;
      }
      queueOrSendPrompt();
    });

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
        queueOrSendPrompt();
      }
    });

    for (const chip of document.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => queueOrSendPrompt(chip.getAttribute('data-prompt')));
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
