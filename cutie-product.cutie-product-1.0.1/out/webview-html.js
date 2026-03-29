"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewHtml = buildWebviewHtml;
const vscode = __importStar(require("vscode"));
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function icon(path, size = 14) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}
function buildWebviewHtml(webview, extensionUri) {
    const nonce = String(Date.now());
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} https: data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    ].join("; ");
    const chatIcon = icon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", 14);
    const plusIcon = icon("M12 5v14 M5 12h14", 14);
    const artifactsIcon = icon("M3 7l9-4 9 4-9 4-9-4 M3 7v10l9 4 9-4V7 M12 11v10", 14);
    const refreshIcon = icon("M3 12a9 9 0 0 0 15.5 6.36L21 16 M21 21v-5h-5", 14);
    const closeIcon = icon("M18 6 6 18 M6 6l12 12", 14);
    const keyIcon = icon("M21 2l-2 2m-7 5a5 5 0 1 0-7 7l2-2h3l2-2v-3z", 14);
    const settingsIcon = icon("M12 3a2.5 2.5 0 0 0-2.45 2l-.13.78a7.96 7.96 0 0 0-1.52.88l-.72-.29a2.5 2.5 0 0 0-3.18 1.42 2.5 2.5 0 0 0 .85 3.02l.65.46a8.77 8.77 0 0 0 0 1.76l-.65.46a2.5 2.5 0 0 0-.85 3.02 2.5 2.5 0 0 0 3.18 1.42l.72-.29c.47.36.98.65 1.52.88l.13.78A2.5 2.5 0 0 0 12 21a2.5 2.5 0 0 0 2.45-2l.13-.78a7.96 7.96 0 0 0 1.52-.88l.72.29a2.5 2.5 0 0 0 3.18-1.42 2.5 2.5 0 0 0-.85-3.02l-.65-.46a8.77 8.77 0 0 0 0-1.76l.65-.46a2.5 2.5 0 0 0 .85-3.02 2.5 2.5 0 0 0-3.18-1.42l-.72.29a7.96 7.96 0 0 0-1.52-.88l-.13-.78A2.5 2.5 0 0 0 12 3z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4", 14);
    const submitIcon = icon("M12 17V8M8.5 12.5l3.5-3.5 3.5 3.5", 22);
    const composerStopIcon = icon("M8 8h8v8H8z", 22);
    const encodedComposerSubmitIcon = JSON.stringify(submitIcon);
    const encodedComposerStopIcon = JSON.stringify(composerStopIcon);
    const mainWebviewScriptSrcJson = JSON.stringify(String(webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "cutie-webview-main.js"))));
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
    .workspace-header-status {
      flex: 0 1 auto;
      max-width: min(44vw, 280px);
      padding: 5px 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line) 78%);
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: color-mix(in srgb, var(--text) 94%, var(--accent) 6%);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .workspace-header-status.is-hidden {
      display: none;
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
    .settings-menu-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 6px;
      margin-bottom: 2px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
    }
    .settings-menu-label {
      padding: 0 10px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1.4;
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
      display: none !important;
      position: absolute;
      inset: 0;
      z-index: 14;
      border: 0;
      background: rgba(0, 0, 0, 0.34);
      cursor: pointer;
    }
    .history-drawer,
    .artifacts-drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 15;
      display: flex;
      flex-direction: column;
      gap: 0;
      min-height: 0;
      border: 0;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--canvas) 96%, #000 4%), color-mix(in srgb, var(--panel) 90%, var(--canvas) 10%));
      box-shadow: none;
      transform: translateY(12px);
      opacity: 0;
      pointer-events: none;
    }
    .workspace-shell[data-history-open="true"] .history-drawer {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .workspace-shell[data-artifacts-open="true"] .artifacts-drawer {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .history-drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 26px 28px 18px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface-elevated) 72%, transparent);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      width: 100%;
      z-index: 2;
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
      width: 100%;
      max-width: 1040px;
      margin: 0 auto;
      padding: 22px 20px 28px;
    }
    .task-empty {
      padding: 18px 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
      border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, var(--panel-elevated) 78%, transparent);
    }
    .task-item {
      margin-bottom: 10px;
    }
    .task-footer {
      width: 100%;
      max-width: 1040px;
      margin: 0 auto;
      padding: 0 20px 24px;
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
      border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, var(--panel-elevated) 84%, transparent);
      color: var(--text);
      padding: 14px 16px;
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
      border-color: color-mix(in srgb, var(--accent) 24%, var(--line) 76%);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      outline: none;
    }
    .session.active {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .task-list .session.active {
      border-color: var(--accent-line);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
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
      padding: 4px 0;
      margin: 0;
      border: 0;
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
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding: 0;
      margin: 10px 0 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line) 78%);
      border-radius: 12px;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 10%, transparent),
        color-mix(in srgb, var(--panel-elevated) 95%, var(--canvas) 5%)
      );
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
      overflow: hidden;
      white-space: normal;
    }
    .cutie-diff-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 10px 12px;
      padding: 12px 12px 11px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
      flex-shrink: 0;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 12%, var(--panel-elevated) 88%),
        color-mix(in srgb, var(--panel-elevated) 94%, var(--canvas) 6%)
      );
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
      overflow-wrap: anywhere;
      line-height: 1.35;
      letter-spacing: 0.01em;
    }
    .cutie-diff-meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 6px 8px;
      flex: 1 1 auto;
      min-width: 0;
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
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--line) 70%, var(--accent) 30%);
      background: color-mix(in srgb, var(--canvas) 16%, transparent);
      color: color-mix(in srgb, var(--text) 92%, var(--accent) 8%);
      cursor: pointer;
      white-space: nowrap;
    }
    .cutie-diff-open:hover,
    .cutie-diff-open:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 35%, var(--line) 65%);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .cutie-diff-body {
      max-height: min(400px, 52vh);
      min-height: 0;
      overflow-x: auto;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      background: color-mix(in srgb, var(--canvas) 34%, var(--panel-elevated) 66%);
      border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
    }
    .cutie-diff-body.cutie-diff-body--expanded {
      max-height: min(720px, 78vh);
    }
    .cutie-diff-foot {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 6px 10px 8px;
      border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
      background: color-mix(in srgb, var(--canvas) 22%, transparent);
    }
    .cutie-diff-expand {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--line) 78%, var(--accent) 22%);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .cutie-diff-expand:hover,
    .cutie-diff-expand:focus-visible {
      color: var(--text);
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .cutie-diff-patch {
      margin: 0;
      padding: 10px 12px 12px;
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11px;
      line-height: 1.55;
      tab-size: 2;
      width: max-content;
      min-width: 100%;
      box-sizing: border-box;
    }
    .cutie-diff-patch .diff-line {
      padding: 2px 12px 2px 10px;
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
      border-left: 3px solid transparent;
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
    .cutie-files-summary-empty-note {
      padding: 9px 12px 11px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
      border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
      background: color-mix(in srgb, var(--canvas) 18%, transparent);
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
      max-height: min(280px, 42vh);
      min-height: 0;
      overflow: auto;
      overflow-x: auto;
      overscroll-behavior: contain;
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
      background: transparent;
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
      background: transparent;
      box-shadow: none;
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
    .binary-intro {
      margin-bottom: 10px;
    }
    .binary-intro-title {
      font-size: 13px;
      font-weight: 650;
      color: var(--text);
      margin-bottom: 4px;
    }
    .binary-intro-copy {
      font-size: 11px;
      color: var(--muted);
      line-height: 1.5;
    }
    .binary-prompt-card {
      margin-bottom: 10px;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line) 82%);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-soft) 84%, var(--canvas) 16%);
    }
    .binary-input-label {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text);
    }
    .binary-prompt-input {
      width: 100%;
      min-height: 78px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
      color: var(--text);
      resize: vertical;
      line-height: 1.5;
    }
    .binary-prompt-input:focus-visible {
      outline: 1px solid var(--focus);
      border-color: var(--accent-line);
    }
    .binary-create-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .binary-hint {
      flex: 1 1 220px;
      font-size: 10px;
      color: var(--muted);
      line-height: 1.45;
    }
    .binary-starters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 10px;
    }
    .binary-starter {
      padding: 5px 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--widget-surface) 82%, transparent);
      color: var(--muted);
      font-size: 11px;
      cursor: pointer;
    }
    .binary-starter:hover,
    .binary-starter:focus-visible {
      border-color: var(--accent-line);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--text);
      outline: none;
    }
    .binary-starter:disabled {
      opacity: 0.45;
      cursor: not-allowed;
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
    .binary-section-label {
      margin: 10px 0 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .binary-advanced {
      margin-top: 8px;
    }
    .binary-advanced[hidden] {
      display: none !important;
    }
    .binary-advanced-copy {
      margin: 0 0 8px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
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
      padding-left: 0;
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
      padding-left: 0;
      color: color-mix(in srgb, var(--text) 84%, var(--muted) 16%);
      font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Consolas, monospace);
      font-size: 11.5px;
      letter-spacing: 0.01em;
    }
    .transcript-line.is-ops.is-strong {
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
        inset: 0;
      }
    }
    @media (max-width: 720px) {
      .utility-rail {
        padding: 4px 6px;
      }
    }
    @media (max-width: 620px) {
      .history-drawer-head {
        padding: 18px 14px 14px;
      }
      .task-list {
        padding: 14px 12px 18px;
      }
      .task-footer {
        padding: 0 12px 16px;
      }
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
      .cutie-diff-head {
        flex-direction: column;
        align-items: stretch;
      }
      .cutie-diff-meta {
        justify-content: flex-start;
      }
      .cutie-diff-body {
        max-height: min(300px, 46vh);
      }
      .cutie-diff-body.cutie-diff-body--expanded {
        max-height: min(540px, 70vh);
      }
      .cutie-diff-patch {
        padding: 8px 10px 10px;
        font-size: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="workspace-shell" id="workspaceShell" data-history-open="false" data-artifacts-open="false">
      <aside class="utility-rail" aria-label="Cutie Product navigation">
      <div class="workspace-header-title" id="currentChatTitle">New chat</div>
      <div class="workspace-header-status is-hidden" id="backgroundStatusPill"></div>
      <div class="workspace-header-actions">
        <button type="button" class="rail-button" id="newChatBtn" title="New chat">${plusIcon}</button>
        <button type="button" class="rail-button" id="historyToggle" aria-controls="historyDrawer" aria-expanded="false" title="Chats">${chatIcon}</button>
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
            <button type="button" id="settingsSignOut" role="menuitem">Sign out</button>
            <button type="button" id="settingsCopyDebug" role="menuitem">Copy debug report</button>
            <button type="button" id="settingsCapture" role="menuitem">Capture desktop</button>
            <button type="button" id="settingsBinaryConfigure" role="menuitem">Builder settings</button>
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
        <div class="sidebar-note">Describe what you want in plain English. Using @ for files or windows is optional.</div>
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
            <textarea id="input" placeholder="Ask for anything and create binary code"></textarea>
            <div class="composer-row">
              <button type="button" class="composer-send" id="sendBtn" aria-label="Submit">
                ${submitIcon}
              </button>
            </div>
            <div class="status-line" id="runtimeLine"></div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      window.__cutieVscodeApi = vscode;
      window.__cutieComposerIcons = { submit: ${encodedComposerSubmitIcon}, stop: ${encodedComposerStopIcon} };
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
      window.__cutieReportFatalError = reportFatalError;
      window.addEventListener('error', function (event) {
        reportFatalError((event && (event.error || event.message)) || event);
      });
      window.addEventListener('unhandledrejection', function (event) {
        reportFatalError(event ? event.reason : event);
      });
      let cutieReadyPosted = false;
      function postReadyToHostOnce() {
        if (cutieReadyPosted) return;
        cutieReadyPosted = true;
        try {
          vscode.postMessage({ type: 'ready' });
        } catch {
          /* host may not be listening yet */
        }
      }
      postReadyToHostOnce();
      const mainSrc = ${mainWebviewScriptSrcJson};
      const bootScript = document.createElement('script');
      bootScript.src = mainSrc;
      bootScript.addEventListener('error', function () {
        reportFatalError(new Error('Failed to load Cutie UI script (cutie-webview-main.js).'));
      });
      document.body.appendChild(bootScript);
    })();
  </script>
</body>
</html>`;
}
//# sourceMappingURL=webview-html.js.map