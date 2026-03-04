import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { createHash } from "crypto";
import * as path from "path";

const API_KEY_SECRET = "xpersona.apiKey";
const MODE_KEY = "xpersona.playground.mode";
const SAFETY_KEY = "xpersona.playground.safety";

type Mode = "auto" | "plan" | "yolo";
type Safety = "standard" | "aggressive";
type ReasoningLevel = "low" | "medium" | "high" | "max";
type PendingAction = { type: "edit"; path: string; patch: string } | { type: "command"; command: string };

function normalizeWorkspaceRelativePath(input: string): string | null {
  const trimmed = input.replace(/\\/g, "/").trim();
  if (!trimmed || trimmed.startsWith("/") || /^[a-z]:\//i.test(trimmed) || trimmed.includes("..")) return null;
  return trimmed;
}

function extractContentFromAddPatch(patch: string): string | null {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) {
      out.push(line.slice(1));
      continue;
    }
    if (line.startsWith(" ")) {
      out.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) return null;
  }

  if (!out.length) return null;
  return out.join("\n");
}

export function activate(context: vscode.ExtensionContext) {
  const view = new Provider(context);
  const reg = vscode.window.registerWebviewViewProvider("xpersona.playgroundView", view);
  const cmds = [
    vscode.commands.registerCommand("xpersona.playground.prompt", () => view.show()),
    vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
      const e = vscode.window.activeTextEditor;
      if (!e) return;
      const t = e.selection.isEmpty ? e.document.lineAt(e.selection.active.line).text : e.document.getText(e.selection);
      await view.show(t.trim());
    }),
    vscode.commands.registerCommand("xpersona.playground.setApiKey", () => view.setApiKey()),
    vscode.commands.registerCommand("xpersona.playground.mode.auto", () => view.setMode("auto")),
    vscode.commands.registerCommand("xpersona.playground.mode.plan", () => view.setMode("plan")),
    vscode.commands.registerCommand("xpersona.playground.mode.yolo", () => view.setMode("yolo")),
    vscode.commands.registerCommand("xpersona.playground.generate", async () => {
      const t = await vscode.window.showInputBox({ prompt: "Generate task" });
      if (t) view.ask(t, false);
    }),
    vscode.commands.registerCommand("xpersona.playground.debug", async () => {
      const t = await vscode.window.showInputBox({ prompt: "Debug task" });
      if (t) view.ask(t, false);
    }),
    vscode.commands.registerCommand("xpersona.playground.history.open", () => view.loadHistory()),
    vscode.commands.registerCommand("xpersona.playground.image.attach", () => vscode.window.showInformationMessage("Attach image from panel button.")),
    vscode.commands.registerCommand("xpersona.playground.agents.parallelRun", async () => {
      const t = await vscode.window.showInputBox({ prompt: "Parallel task" });
      if (t) view.ask(t, true);
    }),
    vscode.commands.registerCommand("xpersona.playground.index.rebuild", () =>
      view.post({
        type: "indexState",
        data: { chunks: 0, freshness: "rebuilding", lastQueryMatches: 0, lastRebuildAt: new Date().toLocaleTimeString() },
      })
    ),
    vscode.commands.registerCommand("xpersona.playground.replay.session", () => view.replay()),
  ];
  context.subscriptions.push(reg, ...cmds);
}

export function deactivate() {}

class Provider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private mode: Mode;
  private safety: Safety;
  private sessionId: string | null = null;
  private timeline: Array<{ ts: number; phase: string; detail: string }> = [];
  private pendingActions: PendingAction[] = [];
  private commandTerminal: vscode.Terminal | null = null;
  private hasExecutionIntent(task: string): boolean {
    return /\b(create|make|add|build|implement|refactor|fix|debug|run|test|lint|typecheck|command|file|patch|edit|ship)\b/i.test(task);
  }
  private isConversationalPrompt(task: string): boolean {
    const t = task.trim().toLowerCase();
    return (
      /^(hi|hello|hey|yo|sup|thanks|thank you|thx)\b/.test(t) ||
      /\b(how are you|what can you do|who are you)\b/.test(t)
    );
  }

  constructor(private ctx: vscode.ExtensionContext) {
    this.mode = (ctx.workspaceState.get(MODE_KEY) as Mode | undefined) ?? "auto";
    this.safety = (ctx.workspaceState.get(SAFETY_KEY) as Safety | undefined) ?? "standard";
  }

  resolveWebviewView(v: vscode.WebviewView): void {
    this.view = v;
    const mediaRoot = vscode.Uri.joinPath(this.ctx.extensionUri, "media");
    v.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    v.webview.html = html(v.webview, this.ctx.extensionUri);

    v.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "check") {
        let hasKey = false;
        try {
          const k = await this.ctx.secrets.get(API_KEY_SECRET);
          hasKey = !!k;
        } catch (e) {
          this.post({ type: "err", text: `Failed to read API key: ${err(e)}` });
        }
        this.post({ type: "api", ok: hasKey });
        this.post({ type: "mode", value: this.mode });
        this.post({ type: "safety", value: this.safety });
        this.post({ type: "timeline", data: this.timeline });
        this.post({ type: "pendingActions", count: this.pendingActions.length });
      } else if (m.type === "saveKey") {
        if (m.key?.trim()) await this.ctx.secrets.store(API_KEY_SECRET, m.key.trim());
        this.post({ type: "api", ok: true });
      } else if (m.type === "setMode") {
        await this.setMode(m.value as Mode);
      } else if (m.type === "setSafety") {
        await this.setSafety(m.value as Safety);
      } else if (m.type === "send") {
        this.post({ type: "sendAck" });
        await this.ask(
          String(m.text || ""),
          Boolean(m.parallel),
          String(m.model || "Playground"),
          String(m.reasoning || "medium") as ReasoningLevel
        );
      } else if (m.type === "history") {
        await this.loadHistory();
      } else if (m.type === "openSession") {
        await this.openSession(String(m.id || ""));
      } else if (m.type === "replay") {
        await this.replay();
      } else if (m.type === "indexRebuild") {
        this.post({
          type: "indexState",
          data: { chunks: 0, freshness: "rebuilding", lastQueryMatches: 0, lastRebuildAt: new Date().toLocaleTimeString() },
        });
      } else if (m.type === "clear") {
        this.timeline = [];
        this.sessionId = null;
        this.pendingActions = [];
        this.post({ type: "timeline", data: this.timeline });
        this.post({ type: "pendingActions", count: 0 });
      } else if (m.type === "execute") {
        await this.executePendingActions();
      }
    });
  }

  async show(prefill?: string) {
    await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => {});
    await vscode.commands.executeCommand("xpersona.playgroundView.focus").then(undefined, () => {});
    if (prefill) this.post({ type: "prefill", text: prefill });
  }

  async setApiKey() {
    const k = await vscode.window.showInputBox({ title: "API key", password: true });
    if (!k?.trim()) return;
    await this.ctx.secrets.store(API_KEY_SECRET, k.trim());
    this.post({ type: "api", ok: true });
  }

  async setMode(m: Mode) {
    this.mode = m;
    await this.ctx.workspaceState.update(MODE_KEY, m);
    this.post({ type: "mode", value: m });
  }

  async setSafety(s: Safety) {
    this.safety = s;
    await this.ctx.workspaceState.update(SAFETY_KEY, s);
    this.post({ type: "safety", value: s });
  }

  async ask(text: string, parallel: boolean, model: string = "Playground AI", reasoning: ReasoningLevel = "medium") {
    if (!text.trim()) return;
    const key = await this.ctx.secrets.get(API_KEY_SECRET);
    if (!key) return this.post({ type: "err", text: "No API key set" });

    this.pendingActions = [];
    this.post({ type: "pendingActions", count: 0 });
    this.post({ type: "start" });
    this.addTimeline("intent", text.slice(0, 120));
    const conversational = this.isConversationalPrompt(text);
    if (!conversational) {
      this.post({ type: "status", text: `Model: ${model} • Reasoning: ${reasoning}` });
    }

    const reasoningGuidance: Record<ReasoningLevel, string> = {
      low: "Use lightweight reasoning and prioritize speed.",
      medium: "Use balanced reasoning with concise planning.",
      high: "Use thorough step-by-step reasoning before acting.",
      max: "Use maximum deliberation, verify assumptions, and prioritize safety over speed.",
    };
    const taskWithReasoning = `${text}\n\n[Playground runtime]\nModel requested: Playground AI\nReasoning level: ${reasoning}\nInstruction: ${reasoningGuidance[reasoning]}`;
    const requestMode: Mode | "generate" = conversational ? "generate" : this.mode;

    if (!this.sessionId) {
      const s = await req<any>("POST", `${base()}/api/v1/playground/sessions`, key, {
        title: text.slice(0, 60),
        mode: this.mode,
      }).catch(() => ({}));
      this.sessionId = s?.data?.id || null;
    }

    const runStream = async (historySessionId: string | null) => {
      let sawTokenEvent = false;
      return (
      stream(
        `${base()}/api/v1/playground/assist`,
        key,
        {
          mode: requestMode,
          task: taskWithReasoning,
          stream: true,
          ...(historySessionId ? { historySessionId } : {}),
          workflowIntentId: `reasoning:${reasoning}`,
          safetyProfile: this.safety,
          agentConfig: parallel
            ? { strategy: "parallel", roles: ["planner", "implementer", "reviewer"] }
            : { strategy: "single" },
        },
        async (ev, p) => {
          if (ev === "token") {
            const chunk = typeof p === "string" ? p : String(p ?? "");
            if (chunk) {
              sawTokenEvent = true;
              this.post({ type: "token", text: chunk });
            }
          } else if (ev === "status") {
            const statusText = typeof p === "string" ? p : String(p ?? "");
            if (statusText.trim()) this.post({ type: "status", text: statusText.trim() });
          } else if (ev === "log") {
            const logText =
              typeof p === "string"
                ? p
                : typeof (p as { message?: unknown })?.message === "string"
                  ? String((p as { message: string }).message)
                  : "";
            if (logText.trim()) {
              if (/assist_started/i.test(logText)) {
                this.post({ type: "status", text: "Thinking..." });
              } else {
                this.post({ type: "status", text: logText.trim() });
              }
            }
          } else if (ev === "final") {
            if (!sawTokenEvent) {
              this.post({ type: "token", text: typeof p === "string" ? p : JSON.stringify(p) });
            }
          } else if (ev === "decision") {
            if (!conversational) {
              this.post({ type: "status", text: `Decision: ${p?.mode || "unknown"} (${p?.confidence ?? "?"})` });
            }
            this.addTimeline("decision", p?.mode || "unknown");
          } else if (ev === "diff_chunk") {
            const editItems = Array.isArray(p) ? p : Array.isArray((p as { edits?: unknown[] } | null)?.edits) ? (p as { edits: unknown[] }).edits : [];
            if (editItems.length) {
              for (const edit of editItems) {
                const rawPatch =
                  typeof (edit as { patch?: unknown })?.patch === "string"
                    ? ((edit as { patch: string }).patch || "")
                    : typeof (edit as { diff?: unknown })?.diff === "string"
                      ? ((edit as { diff: string }).diff || "")
                      : "";
                if (
                  edit &&
                  typeof edit.path === "string" &&
                  edit.path.trim() &&
                  rawPatch.trim()
                ) {
                  const editPath = edit.path.trim();
                  const editPatch = rawPatch.trim();
                  this.pendingActions.push({ type: "edit", path: editPath, patch: editPatch });
                  this.post({ type: "editPreview", path: editPath, patch: editPatch });
                }
              }
              this.post({ type: "pendingActions", count: this.pendingActions.length });
            }
          } else if (ev === "commands_chunk") {
            if (Array.isArray(p)) {
              for (const command of p) {
                if (typeof command === "string" && command.trim()) {
                  this.pendingActions.push({ type: "command", command: command.trim() });
                }
              }
              this.post({ type: "pendingActions", count: this.pendingActions.length });
            }
          } else if (ev === "phase") {
            const phaseName = String(p?.name || "phase");
            this.addTimeline(phaseName, phaseName);
            if (!conversational) {
              this.post({ type: "status", text: `Thinking: ${phaseName}` });
            }
          } else if (ev === "meta") {
            this.post({ type: "meta", data: p });
          }
        }
      ));
    };

    try {
      await runStream(this.sessionId);
    } catch (e) {
      const message = err(e);
      if (this.sessionId && /historysessionid|unknown historysessionid/i.test(message)) {
        this.addTimeline("session", "stale history session recovered");
        this.sessionId = null;
        await runStream(null).catch((inner) => this.post({ type: "err", text: err(inner) }));
      } else {
        this.post({ type: "err", text: message });
      }
    }

    this.post({ type: "end" });
    if (this.pendingActions.length > 0) {
      if (this.hasExecutionIntent(text) || this.pendingActions.some((a) => a.type === "edit")) {
        if (!conversational) {
          this.post({ type: "status", text: `Prepared ${this.pendingActions.length} tool action(s). Auto-executing now.` });
        }
        await this.executePendingActions();
      } else {
        if (!conversational) {
          this.post({ type: "status", text: "Detected conversational prompt; skipped automatic tool execution." });
        }
        this.pendingActions = [];
        this.post({ type: "pendingActions", count: 0 });
      }
    }
  }

  async loadHistory() {
    const key = await this.ctx.secrets.get(API_KEY_SECRET);
    if (!key) return;
    const r = await req<any>("GET", `${base()}/api/v1/playground/sessions?limit=30`, key).catch(() => ({}));
    const items = (r?.data?.data || []).map((x: any) => ({
      id: x.id,
      title: x.title || "Untitled",
      mode: x.mode || "auto",
      updatedAt: x.updatedAt || x.updated_at || x.createdAt || x.created_at || null,
    }));
    this.post({ type: "historyItems", data: items });
  }

  async openSession(id: string) {
    const key = await this.ctx.secrets.get(API_KEY_SECRET);
    if (!key || !id) return;
    this.sessionId = id;
    const r = await req<any>(
      "GET",
      `${base()}/api/v1/playground/sessions/${encodeURIComponent(id)}/messages?includeAgentEvents=true`,
      key
    ).catch(() => ({}));
    const msgs = (r?.data || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: m.content }));
    this.post({ type: "load", data: msgs.reverse() });
    this.addTimeline("history", `loaded ${id.slice(0, 8)}`);
  }

  async replay() {
    const key = await this.ctx.secrets.get(API_KEY_SECRET);
    if (!key || !this.sessionId) return this.post({ type: "status", text: "No active session yet. Send a prompt first, then replay." });
    const r = await req<any>("POST", `${base()}/api/v1/playground/replay`, key, {
      sessionId: this.sessionId,
      workspaceFingerprint: "vscode",
      mode: this.mode,
    }).catch(() => ({}));
    const s = r?.data?.driftReport?.summary || "Replay prepared.";
    const st = r?.data?.replayPlan?.steps || [];
    this.post({ type: "assistant", text: `${s}\n\n${st.map((x: string, i: number) => `${i + 1}. ${x}`).join("\n")}` });
    this.addTimeline("replay", s);
  }

  async executePendingActions() {
    const key = await this.ctx.secrets.get(API_KEY_SECRET);
    if (!key) return this.post({ type: "err", text: "No API key set" });
    if (!this.pendingActions.length) return this.post({ type: "status", text: "No pending actions to execute." });

    this.post({ type: "status", text: `Executing ${this.pendingActions.length} action(s)...` });

    const r = await req<any>("POST", `${base()}/api/v1/playground/execute`, key, {
      sessionId: this.sessionId || undefined,
      workspaceFingerprint: "vscode",
      actions: this.pendingActions.map((a) =>
        a.type === "edit"
          ? { type: "edit", path: a.path, patch: a.patch }
          : { type: "command", command: a.command }
      ),
    }).catch((e) => ({ error: err(e) }));

    if (r?.error) {
      this.post({ type: "err", text: r.error });
      return;
    }

    const results = (r?.data?.results || []) as Array<{
      status?: string;
      reason?: string;
      exitCode?: number;
      action?: { type?: string; path?: string; command?: string };
    }>;

    const logs = results.map((row) => ({
      ts: Date.now(),
      level: row.status === "approved" ? "info" : "error",
      message:
        row.action?.type === "edit"
          ? `${row.status?.toUpperCase() || "UNKNOWN"} edit ${row.action.path || "unknown"}${row.reason ? ` (${row.reason})` : ""}`
          : `${row.status?.toUpperCase() || "UNKNOWN"} command ${row.action?.command || "unknown"}${row.reason ? ` (${row.reason})` : ""} [exit ${row.exitCode ?? "?"}]`,
    }));

    this.post({ type: "execLogs", data: logs });
    let appliedEdits = 0;
    let launchedCommands = 0;
    const applyErrors: string[] = [];

    for (const row of results) {
      if (row.status !== "approved" || !row.action) continue;
      if (row.action.type === "edit") {
        const previewPatch = (row.action as { patch?: string; diff?: string }).patch || (row.action as { patch?: string; diff?: string }).diff || "";
        if (previewPatch.trim()) {
          this.post({ type: "editPreview", path: row.action.path || "unknown", patch: previewPatch });
        }
        const applied = await this.applyEditAction({
          path: row.action.path,
          patch: (row.action as { patch?: string }).patch,
          diff: (row.action as { diff?: string }).diff,
        });
        if (applied.ok) {
          appliedEdits += 1;
          this.post({ type: "fileAction", path: row.action.path || "unknown" });
        }
        else if (applied.reason) applyErrors.push(`${row.action.path || "unknown"}: ${applied.reason}`);
      } else if (row.action.type === "command" && row.action.command) {
        this.post({ type: "terminalCommand", command: row.action.command });
        this.runApprovedCommand(row.action.command);
        launchedCommands += 1;
      }
    }

    const approved = results.filter((x) => x.status === "approved").length;
    this.post({
      type: "status",
      text: `Execute finished: ${approved}/${results.length} approved. Applied ${appliedEdits} edit(s), launched ${launchedCommands} command(s).`,
    });
    if (applyErrors.length) {
      this.post({ type: "err", text: `Some approved edits were not auto-applied:\n- ${applyErrors.join("\n- ")}` });
    }
    this.addTimeline("execute", `approved ${approved}/${results.length}`);
    this.pendingActions = [];
    this.post({ type: "pendingActions", count: 0 });
  }

  private getWorkspaceRoot(): vscode.WorkspaceFolder | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0];
  }

  private async applyEditAction(action: { path?: string; patch?: string; diff?: string }): Promise<{ ok: boolean; reason?: string }> {
    const rel = normalizeWorkspaceRelativePath(action.path || "");
    if (!rel) return { ok: false, reason: "Invalid relative path in edit action." };
    const root = this.getWorkspaceRoot();
    if (!root) return { ok: false, reason: "No workspace folder open." };

    const patchText = action.patch || action.diff || "";
    if (!patchText) return { ok: false, reason: "Missing patch/diff content for edit action." };

    const content = extractContentFromAddPatch(patchText);
    if (content == null) {
      return { ok: false, reason: "Unsupported patch format (only additive file content is auto-applied)." };
    }

    const relParts = rel.split("/").filter(Boolean);
    const target = vscode.Uri.joinPath(root.uri, ...relParts);
    const parent = path.posix.dirname(rel);
    if (parent && parent !== ".") {
      const parentUri = vscode.Uri.joinPath(root.uri, ...parent.split("/").filter(Boolean));
      await vscode.workspace.fs.createDirectory(parentUri);
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
    return { ok: true };
  }

  private runApprovedCommand(command: string) {
    if (!this.commandTerminal) {
      this.commandTerminal = vscode.window.createTerminal({ name: "Playground Execute" });
    }
    this.commandTerminal.show(true);
    this.commandTerminal.sendText(command, true);
  }

  private addTimeline(phase: string, detail: string) {
    this.timeline.push({ ts: Date.now(), phase, detail });
    this.timeline = this.timeline.slice(-200);
    this.post({ type: "timeline", data: this.timeline });
  }

  post(m: any) {
    this.view?.webview.postMessage(m);
  }
}

function req<T>(method: "GET" | "POST", u: string, key: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new URL(u);
    const c = x.protocol === "https:" ? https : http;
    const p = body === undefined ? "" : JSON.stringify(body);

    const r = c.request(
      {
        hostname: x.hostname,
        port: x.port || (x.protocol === "https:" ? 443 : 80),
        path: x.pathname + x.search,
        method,
        headers: {
          "X-API-Key": key,
          "Content-Type": "application/json",
          ...(body === undefined ? {} : { "Content-Length": Buffer.byteLength(p) }),
        },
      },
      (res) => {
        let t = "";
        res.on("data", (d: Buffer) => (t += d.toString("utf8")));
        res.on("end", () => {
          if ((res.statusCode || 500) >= 400) return reject(new Error(parseErr(t, res.statusCode)));
          try {
            resolve((t ? JSON.parse(t) : {}) as T);
          } catch {
            resolve({} as T);
          }
        });
      }
    );

    r.on("error", reject);
    if (p) r.write(p);
    r.end();
  });
}

function stream(u: string, key: string, body: unknown, onEvent: (event: string, payload: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new URL(u);
    const c = x.protocol === "https:" ? https : http;
    const p = JSON.stringify(body);
    let b = "";

    const r = c.request(
      {
        hostname: x.hostname,
        port: x.port || (x.protocol === "https:" ? 443 : 80),
        path: x.pathname + x.search,
        method: "POST",
        headers: {
          "X-API-Key": key,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(p),
          Accept: "text/event-stream",
        },
      },
      (res) => {
        if ((res.statusCode || 500) >= 400) {
          let t = "";
          res.on("data", (d: Buffer) => (t += d.toString("utf8")));
          res.on("end", () => reject(new Error(parseErr(t, res.statusCode))));
          return;
        }

        res.on("data", (d: Buffer) => {
          b += d.toString("utf8");
          let i = b.indexOf("\n\n");
          while (i >= 0) {
            const e = b.slice(0, i);
            b = b.slice(i + 2);
            i = b.indexOf("\n\n");
            const lines = e
              .split(/\r?\n/)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim());
            if (!lines.length) continue;
            const raw = lines.join("\n");
            if (raw === "[DONE]") continue;
            try {
              const o = JSON.parse(raw);
              onEvent(o.event || "message", o.data ?? o.message ?? o);
            } catch {
              // ignore malformed SSE chunks
            }
          }
        });

        res.on("end", () => resolve());
      }
    );

    r.on("error", reject);
    r.write(p);
    r.end();
  });
}

function parseErr(text: string, code?: number) {
  try {
    const j = JSON.parse(text);
    return `HTTP ${code}: ${j.error?.message || j.message || j.error || text}`;
  } catch {
    return `HTTP ${code}: ${text.slice(0, 300)}`;
  }
}

function err(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function base() {
  return (vscode.workspace.getConfiguration("xpersona.playground").get<string>("baseApiUrl") || "http://localhost:3000").replace(/\/$/, "");
}

function nonce() {
  return createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 16);
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const n = nonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "webview.js"));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    // Keep styles flexible (we use a few inline style attributes), but lock scripts to a nonce.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    // Use an external script (served via webview.asWebviewUri) for maximum compatibility across VS Code forks.
    `script-src ${webview.cspSource}`,
].join("; ");
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <style nonce="${n}">
      :root {
        --bg-0: #000000;
        --bg-1: #050505;
        --bg-2: #090909;
        --bg-3: #0d0d0d;
        --fg: var(--vscode-editor-foreground);
        --muted: #8a8a8a;
        --border: #1c1c1c;
        --accent: #f3f3f3;
        --accent-fg: var(--vscode-button-foreground);
        --ok: #22c55e;
        --err: #ef4444;
        --surface: var(--vscode-editorWidget-background, var(--bg-1));
        --surface-border: var(--vscode-editorWidget-border, var(--border));
        --diff-add-bg: var(--vscode-diffEditor-insertedTextBackground, rgba(34, 197, 94, 0.16));
        --diff-del-bg: var(--vscode-diffEditor-removedTextBackground, rgba(239, 68, 68, 0.16));
        --diff-add-fg: var(--vscode-gitDecoration-addedResourceForeground, #86efac);
        --diff-del-fg: var(--vscode-gitDecoration-deletedResourceForeground, #fca5a5);
        --line-fg: var(--vscode-editorLineNumber-foreground, #62708a);
        --gutter-bg: var(--vscode-editorGutter-background, #0d1016);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
        font-family: var(--vscode-font-family);
        color: var(--fg);
        background: var(--bg-0);
      }
      button, select, input, textarea { font-family: inherit; font-size: 12px; }
      button, select, input {
        border: 1px solid var(--border);
        background: var(--bg-1);
        color: var(--fg);
        border-radius: 10px;
        padding: 7px 10px;
      }
      button {
        cursor: pointer;
        transition: transform .08s ease, border-color .2s ease, background .2s ease;
      }
      button:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
      }
      button:disabled { opacity: .55; cursor: not-allowed; transform: none; }
      .primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
      .ghost { background: transparent; }
      .js-gate {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.88);
        z-index: 9999;
      }
      .js-gate-card {
        width: 100%;
        max-width: 420px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--bg-1);
        padding: 14px 14px 12px;
      }
      .js-gate-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .js-gate-sub {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .setup {
        display: none;
        flex: 1;
        align-items: center;
        justify-content: center;
        padding: 22px;
      }
      .setup-card {
        width: 100%;
        max-width: 380px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--bg-1);
        padding: 14px;
        box-shadow: none;
      }
      .setup-card h3 { margin: 2px 0 6px; font-size: 14px; }
      .setup-card p { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
      .app {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
      .toolbar {
        padding: 10px 12px 8px;
        border-bottom: 1px solid var(--border);
        background: #000;
        display: grid;
        gap: 6px;
      }
      .toolbar,
      .tabs {
        display: none;
      }
      .startup {
        border-bottom: 1px solid #1d1d1d;
        padding: 12px;
        background: #000;
      }
      .startup-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .startup-title {
        font-size: 12px;
        font-weight: 700;
        color: #f7f7f7;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .startup-actions {
        display: none;
      }
      .tasks-label {
        color: #9f9f9f;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .task-entry {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 8px 0;
        cursor: pointer;
        border-bottom: 1px solid #121212;
      }
      .task-entry:hover {
        background: transparent;
      }
      .task-title {
        font-size: 14px;
        color: #f0f0f0;
        margin-bottom: 3px;
      }
      .task-meta {
        font-size: 12px;
        color: #747474;
      }
      .view-all {
        margin-top: 10px;
        font-size: 12px;
        color: #9f9f9f;
        background: transparent;
        border: none;
        padding: 0;
        text-align: left;
      }
      .toolbar-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .title {
        font-size: 19px;
        font-weight: 700;
        letter-spacing: .01em;
        color: #fff;
        margin-right: 6px;
      }
      .toolbar-sub {
        color: var(--muted);
        font-size: 11px;
      }
      .pill {
        font-size: 11px;
        border: none !important;
        box-shadow: none !important;
        border-radius: 999px;
        padding: 4px 9px;
        background: var(--bg-1);
      }
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 6px 12px;
        border-bottom: 1px solid var(--border);
        background: #000;
      }
      .tab {
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--bg-1);
        color: var(--muted);
        padding: 5px 10px;
        white-space: nowrap;
      }
      .tab.active {
        color: #fff;
        border-color: #3a3a3a;
        background: #111;
        font-weight: 600;
      }
      .startup,
      .tabs {
        display: none !important;
      }
      .panel {
        display: none;
        flex: 1;
        overflow: auto;
        padding: 10px 12px;
        white-space: pre-wrap;
      }
      .hidden-panel { display: none !important; }
      .panel.active { display: block; }
      .chat-top {
        display: none;
      }
      .chat-hint {
        color: var(--muted);
        font-size: 11px;
      }
      .chips {
        display: none;
      }
      .chip {
        font-size: 11px;
        padding: 4px 9px;
        border: none !important;
        box-shadow: none !important;
        border-radius: 999px;
        background: #0b0b0b;
      }
      .messages {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .m {
        border: none;
        border-radius: 0;
        padding: 0;
        max-width: 96%;
        line-height: 1.6;
        animation: pop .16s ease;
      }
      .m-body {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .m-time {
        margin-top: 6px;
        font-size: 10px;
        color: var(--muted);
        opacity: .85;
        text-align: right;
      }
      @keyframes pop {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .u {
        margin-left: auto;
        border-color: #3a3a3a;
        background: #111;
        border: 1px solid #2d2d2d;
        border-radius: 12px;
        padding: 10px 12px;
      }
      .a { background: transparent; color: #f0f0f0; }
      .e {
        background: color-mix(in srgb, var(--err) 22%, transparent);
        border-color: color-mix(in srgb, var(--err) 55%, var(--border));
        border-radius: 10px;
        padding: 10px 12px;
      }
      .cmd {
        background: transparent;
        border: none;
        padding: 0;
        max-width: 100%;
        opacity: 0.92;
      }
      .cmd .m-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 72%, var(--muted) 28%);
      }
      .cmd .m-time { display: none; }
      .terminal-live {
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        background: var(--surface);
      }
      .terminal-live .m-body {
        white-space: normal;
      }
      .terminal-live .m-time { display: none; }
      .term-disclosure {
        margin: 0;
      }
      .term-disclosure > summary {
        list-style: none;
      }
      .term-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .term-disclosure > summary::before {
        content: ">";
        display: inline-block;
        margin-right: 8px;
        color: color-mix(in srgb, var(--fg) 60%, var(--muted) 40%);
        transform: rotate(90deg);
        transition: transform .15s ease;
      }
      .term-disclosure:not([open]) > summary::before {
        transform: rotate(0deg);
      }
      .term-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 10px;
        border-bottom: 1px solid var(--surface-border);
        background: color-mix(in srgb, var(--surface) 78%, var(--bg-0));
        cursor: pointer;
        user-select: none;
      }
      .term-title {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
        font-weight: 600;
      }
      .term-state {
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 64%, var(--muted));
      }
      .term-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11.5px;
        line-height: 1.45;
        padding: 8px 10px 10px;
        display: grid;
        gap: 3px;
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .term-line {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .term-line.cmdline { color: color-mix(in srgb, var(--fg) 86%, var(--muted)); }
      .term-line.ok { color: color-mix(in srgb, var(--ok) 70%, var(--fg)); }
      .term-line.err { color: color-mix(in srgb, var(--err) 72%, var(--fg)); }
      .term-line.info { color: color-mix(in srgb, var(--fg) 70%, var(--muted)); }
      .term-line.summary { color: color-mix(in srgb, var(--fg) 88%, var(--muted)); border-top: 1px solid var(--surface-border); margin-top: 4px; padding-top: 6px; }
      .change {
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--surface);
      }
      .change .m-time {
        display: none;
      }
      .diff-disclosure {
        margin: 0;
      }
      .diff-disclosure > summary {
        list-style: none;
      }
      .diff-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .diff-disclosure > summary::before {
        content: ">";
        display: inline-block;
        margin-right: 8px;
        color: color-mix(in srgb, var(--fg) 60%, var(--muted) 40%);
        transform: rotate(90deg);
        transition: transform .15s ease;
      }
      .diff-disclosure:not([open]) > summary::before {
        transform: rotate(0deg);
      }
      .diff-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 10px;
        border-bottom: 1px solid var(--surface-border);
        cursor: pointer;
        user-select: none;
        background: color-mix(in srgb, var(--surface) 76%, var(--bg-0));
      }
      .diff-summary-title {
        font-size: 12px;
        font-weight: 600;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
      }
      .change-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        border-bottom: 1px solid #1d1d1d;
      }
      .change-count {
        font-size: 14px;
        font-weight: 600;
      }
      .change-file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        font-size: 12px;
      }
      .change-path {
        color: #d8d8d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .change-stats {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        white-space: nowrap;
      }
      .change-stats .add { color: #56d364; }
      .change-stats .del { color: #ff7b7b; }
      .patch {
        padding: 0;
        overflow: hidden;
        background: #0b0d12;
        border-color: #2a303d;
      }
      .patch .m-body {
        white-space: normal;
      }
      .patch .m-time {
        padding: 0 10px 9px;
      }
      .diff-card {
        border-bottom: 1px solid var(--surface-border);
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        background: color-mix(in srgb, var(--surface) 68%, var(--bg-0));
        border-bottom: 1px solid var(--surface-border);
      }
      .diff-title {
        color: color-mix(in srgb, var(--fg) 78%, var(--muted));
        font-size: 11px;
      }
      .diff-path {
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        font-weight: 600;
      }
      .diff-stats {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11px;
      }
      .diff-stats .add {
        color: var(--diff-add-fg);
      }
      .diff-stats .del {
        color: var(--diff-del-fg);
      }
      .diff-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 12px;
        line-height: 1.45;
        max-height: 280px;
        overflow: auto;
      }
      .diff-row {
        display: grid;
        grid-template-columns: 44px 44px 16px 1fr;
        width: fit-content;
        min-width: 100%;
      }
      .diff-row .ln {
        color: var(--line-fg);
        text-align: right;
        padding: 0 8px 0 0;
        border-right: 1px solid color-mix(in srgb, var(--surface-border) 70%, transparent);
        background: var(--gutter-bg);
      }
      .diff-row .sig {
        text-align: center;
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-row .txt {
        white-space: pre;
        padding: 0 8px;
      }
      .diff-row.ctx .sig,
      .diff-row.ctx .txt {
        color: color-mix(in srgb, var(--fg) 72%, var(--muted));
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-row.add .sig,
      .diff-row.add .txt {
        background: var(--diff-add-bg);
        color: color-mix(in srgb, var(--diff-add-fg) 75%, var(--fg));
      }
      .diff-row.del .sig,
      .diff-row.del .txt {
        background: var(--diff-del-bg);
        color: color-mix(in srgb, var(--diff-del-fg) 72%, var(--fg));
      }
      .diff-row.meta .sig,
      .diff-row.meta .txt {
        color: color-mix(in srgb, var(--fg) 55%, var(--muted));
        background: color-mix(in srgb, var(--surface) 62%, var(--bg-0));
      }
      .diff-trunc {
        color: color-mix(in srgb, var(--fg) 62%, var(--muted));
        font-size: 11px;
        padding: 6px 10px 8px;
        border-top: 1px solid var(--surface-border);
      }
      .typing .m-time { display: none; }
      .typing-dots {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .typing-dots i {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 70%, white 30%);
        opacity: .75;
        animation: dotPulse 1s infinite ease-in-out;
      }
      .typing-dots i:nth-child(2) { animation-delay: .16s; }
      .typing-dots i:nth-child(3) { animation-delay: .32s; }
      @keyframes dotPulse {
        0%, 80%, 100% { transform: translateY(0); opacity: .45; }
        40% { transform: translateY(-3px); opacity: 1; }
      }
      .item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 8px;
        background: #080808;
      }
      .item-title { font-weight: 600; margin-bottom: 4px; }
      .item-sub { color: var(--muted); font-size: 11px; }
      .input {
        border-top: 1px solid #161616;
        padding: 10px 12px;
        display: grid;
        gap: 7px;
        background: linear-gradient(to top, #000000 72%, rgba(0, 0, 0, 0.98));
        position: relative;
      }
      .composer-form {
        display: grid;
        gap: 7px;
      }
      .hidden {
        display: none !important;
      }
      .mode-banner {
        margin: 0 12px 8px;
        padding: 8px 11px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        color: #b9dcff;
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.26), rgba(14, 116, 144, 0.2));
        border: 1px solid rgba(107, 168, 233, 0.45);
      }
      .startup.hidden,
      .panel.hidden {
        display: none !important;
      }
      .startup,
      .tabs {
        display: none !important;
      }
      .settings-bar {
        display: none;
      }
      .settings-group {
        display: none;
        align-items: center;
        gap: 6px;
      }
      .settings-group.show {
        display: inline-flex;
      }
      .composer-tools {
        border: 1px solid #1f1f1f;
        border-radius: 14px;
        background: #040404;
        padding: 8px 10px;
        display: grid;
        gap: 8px;
      }
      .tools-main-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .upload-btn {
        border: none;
        background: transparent;
        color: #f2f2f2;
        padding: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .upload-btn::before {
        content: "+";
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 1px solid #3a3a3a;
        color: #d5d5d5;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        line-height: 1;
      }
      .upload-btn:hover {
        transform: none;
        color: #ffffff;
      }
      .tool-muted {
        color: #8f8f8f;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .file-input {
        display: none;
      }
      .tools-toggle-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .tool-toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        color: #ebebeb;
      }
      .tool-toggle input {
        appearance: none;
        width: 30px;
        height: 18px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid #2f2f2f;
        background: #151515;
        position: relative;
        cursor: pointer;
      }
      .tool-toggle input::after {
        content: "";
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        top: 2px;
        left: 2px;
        background: #8a8a8a;
        transition: transform .16s ease, background .16s ease;
      }
      .tool-toggle input:checked {
        background: rgba(34, 119, 216, 0.46);
        border-color: rgba(92, 165, 249, 0.86);
      }
      .tool-toggle input:checked::after {
        transform: translateX(12px);
        background: #ffffff;
      }
      textarea {
        width: 100%;
        min-height: 76px;
        max-height: 210px;
        resize: vertical;
        border: 1px solid #272727;
        border-radius: 18px;
        background: #050505;
        color: var(--fg);
        padding: 12px 14px;
        line-height: 1.45;
        font-size: 13px;
      }
      textarea:focus {
        outline: none;
        border-color: #3a3a3a;
      }
      .input-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: nowrap;
        min-width: 0;
      }
      .menu-anchor {
        display: inline-flex;
        align-items: center;
      }
      .menu-icon {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: 999px;
        padding: 0;
        font-size: 16px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #0c0c0c;
        border: 1px solid #2e2e2e;
        color: #d9d9d9;
      }
      .action-menu {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(3px);
        z-index: 60;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 14px;
      }
      .action-menu-sheet {
        width: min(640px, 100%);
        max-height: 86vh;
        overflow: auto;
        border: 1px solid #272727;
        border-radius: 18px;
        background: radial-gradient(circle at top right, rgba(30, 58, 138, 0.2), rgba(10, 10, 10, 0.98) 45%), #080808;
        box-shadow: 0 26px 42px rgba(0, 0, 0, 0.52);
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .sheet-title {
        font-size: 14px;
        font-weight: 700;
        color: #f4f4f4;
      }
      .sheet-sub {
        color: #9a9a9a;
        font-size: 11px;
      }
      .sheet-close {
        border: 1px solid #2e2e2e;
        background: #101010;
        border-radius: 999px;
        width: 28px;
        height: 28px;
        min-width: 28px;
        padding: 0;
        color: #d8d8d8;
        font-size: 16px;
      }
      .sheet-grid {
        display: grid;
        gap: 10px;
      }
      .sheet-card {
        border: 1px solid #1f1f1f;
        border-radius: 14px;
        background: #0a0a0a;
        padding: 10px;
        display: grid;
        gap: 8px;
      }
      .sheet-card-title {
        font-size: 12px;
        font-weight: 600;
        color: #f1f1f1;
      }
      .action-item {
        border: none;
        border-radius: 8px;
        background: #101010;
        color: #e8e8e8;
        text-align: left;
        padding: 7px 8px;
        font-size: 12px;
      }
      .action-item:hover {
        background: #141414;
        transform: none;
      }
      .action-sep {
        height: 1px;
        background: #1d1d1d;
        margin: 3px 2px;
      }
      .sheet-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sheet-toggle {
        justify-content: space-between;
        width: 100%;
      }
      .sheet-toggle .tool-toggle {
        width: 100%;
        justify-content: space-between;
      }
      .input-actions > * {
        min-width: 0;
      }
      .spacer { flex: 1; }
      .hint {
        color: var(--muted);
        font-size: 11px;
        white-space: nowrap;
      }
      .composer-select {
        border-radius: 0;
        padding: 0 2px;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: #dcdcdc;
        font-size: 12px;
        font-weight: 500;
        max-width: none;
        flex: 0 1 auto;
        min-width: 0;
      }
      .composer-select:focus {
        outline: none;
      }
      .composer-select option {
        color: #111111;
        background: #f3f3f3;
      }
      .composer-select option:checked {
        color: #ffffff;
        background: #1f6feb;
      }
      .context-pill {
        display: inline-flex;
        align-items: center;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0;
        padding: 0;
        font-size: 12px;
        font-weight: 600;
        color: #7ab7ff;
        background: transparent !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: none;
        flex: 0 0 auto;
      }
      .send-round {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border-radius: 999px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 700;
        background: #111111 !important;
        border: 1px solid #303030 !important;
        color: #f4f4f4 !important;
        flex-shrink: 0;
      }
      #c {
        display: none;
      }
      .footer-row {
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        padding: 0 2px;
        flex-wrap: wrap;
      }
      .footer-muted {
        color: var(--muted);
      }
      .footer-accent {
        color: #f2d74e;
      }
      .kbd {
        border: 1px solid var(--border);
        border-bottom-width: 2px;
        border-radius: 6px;
        padding: 1px 5px;
        font-size: 10px;
        color: var(--muted);
      }
      .jump-wrap {
        position: sticky;
        bottom: 10px;
        display: flex;
        justify-content: flex-end;
        pointer-events: none;
        margin-top: 8px;
      }
      .jump-btn {
        display: none;
        pointer-events: auto;
        border-radius: 999px;
        padding: 6px 10px;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        color: var(--fg);
        font-size: 11px;
        box-shadow: none;
      }
      .jump-btn.show { display: inline-flex; }
      @media (max-width: 420px) {
        .input {
          padding: 8px 10px;
        }
        .composer-tools {
          padding: 7px 8px;
          gap: 6px;
        }
        .upload-btn {
          font-size: 12px;
        }
        textarea {
          min-height: 68px;
          padding: 10px 11px;
          font-size: 12px;
        }
        .input-actions {
          gap: 6px;
          flex-wrap: wrap;
        }
        .action-menu {
          padding: 10px;
        }
        .action-menu-sheet {
          max-height: 92vh;
          border-radius: 14px;
          padding: 10px;
        }
        .composer-select {
          max-width: none;
          font-size: 11px;
          padding: 0 2px;
          flex: 0 1 auto;
        }
        .context-pill {
          max-width: none;
          font-size: 11px;
          padding: 0;
        }
        .hint {
          display: none;
        }
        .tool-muted {
          display: none;
        }
        .mode-banner {
          margin: 0 10px 6px;
          font-size: 11px;
          padding: 7px 9px;
        }
        .tab {
          font-size: 11px;
          padding: 4px 8px;
        }
        .startup-title {
          letter-spacing: 0;
        }
      }
      @media (max-width: 600px) {
        .input-actions {
          flex-wrap: wrap;
        }
        .input-actions .spacer {
          display: none;
        }
        .send-round {
          margin-left: auto;
        }
      }
      @media (max-width: 330px) {
        #reasonSel {
          max-width: 96px;
        }
        .context-pill {
          display: none;
        }
      }

      /* Right panel (Codex-like) layout */
      .startup {
        display: none !important;
      }
      .toolbar,
      .tabs {
        display: none !important;
      }
      textarea {
        min-height: 64px;
        border-radius: 16px;
      }
      .menu-icon {
        width: 24px;
        height: 24px;
        min-width: 24px;
        font-size: 16px;
      }
      .send-round {
        width: 34px;
        height: 34px;
        min-width: 34px;
      }
      .footer-row {
        padding: 0;
        margin-top: 2px;
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 14px;
      }
      #usagePct {
        text-align: right;
        opacity: 0.65;
      }
    </style>
  </head>
  <body>
    <div id="jsGate" class="js-gate" role="status" aria-live="polite">
      <div class="js-gate-card">
        <div class="js-gate-title">Loading Playground AI UI…</div>
        <div class="js-gate-sub">If this doesn’t disappear, run <span class="kbd">Developer: Reload Window</span>.</div>
      </div>
    </div>
    <div id="setup" class="setup">
      <div class="setup-card">
        <h3>Connect Playground AI</h3>
        <p>Paste your API key to start chatting. You can update it anytime from command palette.</p>
        <input id="k" type="password" placeholder="xp_..." />
        <div style="height:8px"></div>
        <button id="ks" class="primary">Save API Key</button>
      </div>
    </div>

    <div id="app" class="app">
      <div class="startup">
        <div class="startup-head">
          <span class="startup-title">PLAYGROUND AI</span>
        </div>
        <div class="tasks-head">
          <span class="tasks-label">Tasks</span>
          <div class="startup-actions">
            <button id="histQuick" class="task-icon-btn" type="button" aria-label="Refresh history">&#9432;</button>
            <button id="repQuick" class="task-icon-btn" type="button" aria-label="Replay session">&#9881;</button>
            <button id="idxQuick" class="task-icon-btn" type="button" aria-label="Rebuild index">&#9998;</button>
          </div>
        </div>
        <div id="taskList" class="task-list">No task history yet.</div>
        <button id="viewAllTasks" class="view-all" type="button">View all (0)</button>
      </div>
      <div class="toolbar">
        <div class="toolbar-row">
          <span class="title">PLAYGROUND AI</span>
          <span class="toolbar-sub">Playground AI assistant</span>
          <div class="spacer"></div>
          <span id="ac" class="pill">images:0</span>
          <span class="pill">Local tools: on</span>
        </div>
        <div class="toolbar-row">
          <select id="mode">
            <option value="auto">Mode: Auto</option>
            <option value="plan">Mode: Plan</option>
            <option value="yolo">Mode: YOLO</option>
          </select>
          <select id="safety">
            <option value="standard">Safety: Standard</option>
            <option value="aggressive">Safety: Aggressive</option>
          </select>
          <label class="pill"><input id="parallel" type="checkbox"> Parallel agents</label>
          <button id="hist" class="ghost">History</button>
          <button id="rep" class="ghost">Replay</button>
          <button id="idx" class="ghost">Rebuild Index</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-p="chat">Chat</button>
        <button class="tab" data-p="timeline">Timeline</button>
        <button class="tab" data-p="history">History</button>
        <button class="tab" data-p="index">Index</button>
        <button class="tab" data-p="agents">Agents</button>
        <button class="tab" data-p="exec">Execution</button>
      </div>
      <div id="modeBanner" class="mode-banner hidden">Plan mode active. I will plan before acting.</div>

      <div id="chat" class="panel active">
        <div class="chat-top">
          <div id="chips" class="chips"></div>
          <div class="chat-hint">
            Send: <span class="kbd">Enter</span> New line: <span class="kbd">Shift + Enter</span>
          </div>
        </div>
        <div id="msgs" class="messages"></div>
        <div class="jump-wrap">
          <button id="jumpLatest" class="jump-btn" type="button">Jump to latest</button>
        </div>
      </div>
      <div id="timeline" class="panel"></div>
      <div id="history" class="panel"></div>
      <div id="index" class="panel"></div>
      <div id="agents" class="panel"></div>
      <div id="exec" class="panel"></div>

      <div class="input">
        <form id="composerForm" class="composer-form" novalidate>
          <textarea id="t" placeholder="Ask for follow-up changes" enterkeyhint="send"></textarea>
          <div class="settings-bar">
            <button id="settingsToggle" class="ghost" type="button">Settings</button>
            <div id="settingsGroup" class="settings-group">
              <select id="modeQuick" class="composer-select">
                <option value="auto">Mode: Auto</option>
                <option value="plan">Mode: Plan</option>
                <option value="yolo">Mode: YOLO</option>
              </select>
              <select id="safetyQuick" class="composer-select">
                <option value="standard">Safety: Standard</option>
                <option value="aggressive">Safety: Aggressive</option>
              </select>
              <label class="pill"><input id="parallelQuick" type="checkbox"> Parallel</label>
            </div>
            <div class="spacer"></div>
            <span class="hint">Local tools: on</span>
          </div>
          <div class="input-actions">
            <div class="menu-anchor">
              <button id="actionMenuBtn" type="button" class="menu-icon" aria-label="Open actions" aria-expanded="false">+</button>
            </div>
            <button id="c" type="button" class="ghost">Clear</button>
            <select id="modelSel" class="composer-select">
              <option value="Playground AI">Playground AI</option>
            </select>
            <select id="reasonSel" class="composer-select">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="max">Extra High</option>
            </select>
            <span id="contextPill" class="context-pill">&#10023; IDE context</span>
            <span id="modeHint" class="hint">Auto execution enabled</span>
            <div class="spacer"></div>
            <button id="s" type="button" class="primary send-round" aria-label="Send">&#8593;</button>
          </div>
          <div class="footer-row">
            <span id="runState" class="footer-muted">Local</span>
            <span id="permState" class="footer-accent">Full access</span>
            <span id="usagePct" class="footer-muted">0%</span>
          </div>
          <div id="actionMenu" class="action-menu hidden" aria-hidden="true">
            <div class="action-menu-sheet" role="dialog" aria-label="Composer controls">
              <div class="sheet-head">
                <div>
                  <div class="sheet-title">Control Center</div>
                  <div class="sheet-sub">Everything moved here for a cleaner chat layout.</div>
                </div>
                <button id="actionMenuClose" type="button" class="sheet-close" aria-label="Close control center">x</button>
              </div>

              <div class="sheet-grid">
                <div class="sheet-card">
                  <div class="sheet-card-title">Attachments</div>
                  <div class="sheet-row">
                    <button id="uploadBtn" class="upload-btn" type="button">Add photos & files</button>
                    <span id="uploadCount" class="tool-muted">No files selected</span>
                    <input id="uploadInput" class="file-input" type="file" accept="image/*,.pdf,.txt,.md,.json" multiple />
                  </div>
                </div>

                <div class="sheet-card">
                  <div class="sheet-card-title">Conversation</div>
                  <div class="sheet-row sheet-toggle">
                    <label class="tool-toggle">
                      <span>Include IDE context</span>
                      <input id="ctxToggle" type="checkbox" checked />
                    </label>
                  </div>
                  <div class="sheet-row sheet-toggle">
                    <label class="tool-toggle">
                      <span>Plan mode</span>
                      <input id="planToggle" type="checkbox" />
                    </label>
                  </div>
                </div>

                <div class="sheet-card">
                  <div class="sheet-card-title">Panels</div>
                  <div class="sheet-grid">
                    <button class="action-item" type="button" data-menu-action="show:chat">Show Chat</button>
                    <button class="action-item" type="button" data-menu-action="show:timeline">Show Timeline</button>
                    <button class="action-item" type="button" data-menu-action="show:history">Show History</button>
                    <button class="action-item" type="button" data-menu-action="show:index">Show Index</button>
                    <button class="action-item" type="button" data-menu-action="show:agents">Show Agents</button>
                    <button class="action-item" type="button" data-menu-action="show:exec">Show Execution</button>
                  </div>
                </div>

                <div class="sheet-card">
                  <div class="sheet-card-title">Actions</div>
                  <div class="sheet-grid">
                    <button class="action-item" type="button" data-menu-action="history">Refresh History</button>
                    <button class="action-item" type="button" data-menu-action="replay">Replay Session</button>
                    <button class="action-item" type="button" data-menu-action="indexRebuild">Rebuild Index</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>

    <script nonce="${n}" src="${scriptUri}"></script>
  </body>
</html>`;
}





