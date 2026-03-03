import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { createHash } from "crypto";

const API_KEY_SECRET = "xpersona.apiKey";
const MODE_KEY = "xpersona.playground.mode";
type Mode = "auto" | "plan" | "yolo";

export function activate(context: vscode.ExtensionContext) {
  const view = new Provider(context);
  const reg = vscode.window.registerWebviewViewProvider("xpersona.playgroundView", view);
  const cmds = [
    vscode.commands.registerCommand("xpersona.playground.prompt", () => view.show()),
    vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
      const e = vscode.window.activeTextEditor; if (!e) return;
      const t = e.selection.isEmpty ? e.document.lineAt(e.selection.active.line).text : e.document.getText(e.selection);
      await view.show(t.trim());
    }),
    vscode.commands.registerCommand("xpersona.playground.setApiKey", () => view.setApiKey()),
    vscode.commands.registerCommand("xpersona.playground.mode.auto", () => view.setMode("auto")),
    vscode.commands.registerCommand("xpersona.playground.mode.plan", () => view.setMode("plan")),
    vscode.commands.registerCommand("xpersona.playground.mode.yolo", () => view.setMode("yolo")),
    vscode.commands.registerCommand("xpersona.playground.generate", async () => { const t = await vscode.window.showInputBox({ prompt: "Generate task" }); if (t) view.ask(t, false); }),
    vscode.commands.registerCommand("xpersona.playground.debug", async () => { const t = await vscode.window.showInputBox({ prompt: "Debug task" }); if (t) view.ask(t, false); }),
    vscode.commands.registerCommand("xpersona.playground.history.open", () => view.loadHistory()),
    vscode.commands.registerCommand("xpersona.playground.image.attach", () => vscode.window.showInformationMessage("Attach image from panel button.")),
    vscode.commands.registerCommand("xpersona.playground.agents.parallelRun", async () => { const t = await vscode.window.showInputBox({ prompt: "Parallel task" }); if (t) view.ask(t, true); }),
    vscode.commands.registerCommand("xpersona.playground.index.rebuild", () => view.post({ type: "indexState", data: { chunks: 0, freshness: "stale", lastQueryMatches: 0 } })),
    vscode.commands.registerCommand("xpersona.playground.replay.session", () => view.replay()),
  ];
  context.subscriptions.push(reg, ...cmds);
}
export function deactivate() {}

class Provider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private mode: Mode;
  private sessionId: string | null = null;
  private timeline: Array<{ ts: number; phase: string; detail: string }> = [];
  constructor(private ctx: vscode.ExtensionContext) { this.mode = (ctx.workspaceState.get(MODE_KEY) as Mode | undefined) ?? "auto"; }
  resolveWebviewView(v: vscode.WebviewView): void {
    this.view = v; v.webview.options = { enableScripts: true }; v.webview.html = html();
    v.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "check") { const k = await this.ctx.secrets.get(API_KEY_SECRET); this.post({ type: "api", ok: !!k }); this.post({ type: "mode", value: this.mode }); this.post({ type: "timeline", data: this.timeline }); }
      else if (m.type === "saveKey") { if (m.key?.trim()) await this.ctx.secrets.store(API_KEY_SECRET, m.key.trim()); this.post({ type: "api", ok: true }); }
      else if (m.type === "setMode") await this.setMode(m.value as Mode);
      else if (m.type === "send") await this.ask(String(m.text || ""), Boolean(m.parallel));
      else if (m.type === "history") await this.loadHistory();
      else if (m.type === "openSession") await this.openSession(String(m.id || ""));
      else if (m.type === "replay") await this.replay();
      else if (m.type === "clear") { this.timeline = []; this.sessionId = null; this.post({ type: "timeline", data: this.timeline }); }
    });
  }
  async show(prefill?: string) { await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => {}); await vscode.commands.executeCommand("xpersona.playgroundView.focus").then(undefined, () => {}); if (prefill) this.post({ type: "prefill", text: prefill }); }
  async setApiKey() { const k = await vscode.window.showInputBox({ title: "API key", password: true }); if (!k?.trim()) return; await this.ctx.secrets.store(API_KEY_SECRET, k.trim()); this.post({ type: "api", ok: true }); }
  async setMode(m: Mode) { this.mode = m; await this.ctx.workspaceState.update(MODE_KEY, m); this.post({ type: "mode", value: m }); }
  async ask(text: string, parallel: boolean) {
    if (!text.trim()) return; const key = await this.ctx.secrets.get(API_KEY_SECRET); if (!key) return this.post({ type: "err", text: "No API key set" });
    this.post({ type: "start" }); this.addTimeline("intent", text.slice(0, 120));
    if (!this.sessionId) { const s = await req<any>("POST", `${base()}/api/v1/playground/sessions`, key, { title: text.slice(0, 60), mode: this.mode }).catch(() => ({})); this.sessionId = s?.data?.id || null; }
    await stream(`${base()}/api/v1/playground/assist`, key, { mode: this.mode, task: text, stream: true, historySessionId: this.sessionId, agentConfig: parallel ? { strategy: "parallel", roles: ["planner", "implementer", "reviewer"] } : { strategy: "single" } }, async (ev, p) => {
      if (ev === "final") this.post({ type: "token", text: typeof p === "string" ? p : JSON.stringify(p) });
      else if (ev === "decision") { this.post({ type: "status", text: `Decision: ${p?.mode || "unknown"} (${p?.confidence ?? "?"})` }); this.addTimeline("decision", p?.mode || "unknown"); }
      else if (ev === "phase") this.addTimeline(p?.name || "phase", p?.name || "");
      else if (ev === "meta") this.post({ type: "meta", data: p });
    }).catch((e) => this.post({ type: "err", text: err(e) }));
    this.post({ type: "end" });
  }
  async loadHistory() {
    const key = await this.ctx.secrets.get(API_KEY_SECRET); if (!key) return;
    const r = await req<any>("GET", `${base()}/api/v1/playground/sessions?limit=30`, key).catch(() => ({}));
    const items = (r?.data?.data || []).map((x: any) => ({ id: x.id, title: x.title || "Untitled", mode: x.mode || "auto" }));
    this.post({ type: "historyItems", data: items });
  }
  async openSession(id: string) {
    const key = await this.ctx.secrets.get(API_KEY_SECRET); if (!key || !id) return;
    this.sessionId = id;
    const r = await req<any>("GET", `${base()}/api/v1/playground/sessions/${encodeURIComponent(id)}/messages?includeAgentEvents=true`, key).catch(() => ({}));
    const msgs = (r?.data || []).filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => ({ role: m.role, content: m.content }));
    this.post({ type: "load", data: msgs.reverse() });
    this.addTimeline("history", `loaded ${id.slice(0, 8)}`);
  }
  async replay() {
    const key = await this.ctx.secrets.get(API_KEY_SECRET); if (!key || !this.sessionId) return this.post({ type: "err", text: "No active session" });
    const r = await req<any>("POST", `${base()}/api/v1/playground/replay`, key, { sessionId: this.sessionId, workspaceFingerprint: "vscode", mode: this.mode }).catch(() => ({}));
    const s = r?.data?.driftReport?.summary || "Replay prepared.";
    const st = r?.data?.replayPlan?.steps || [];
    this.post({ type: "assistant", text: `${s}\n\n${st.map((x: string, i: number) => `${i + 1}. ${x}`).join("\n")}` });
    this.addTimeline("replay", s);
  }
  private addTimeline(phase: string, detail: string) { this.timeline.push({ ts: Date.now(), phase, detail }); this.timeline = this.timeline.slice(-200); this.post({ type: "timeline", data: this.timeline }); }
  post(m: any) { this.view?.webview.postMessage(m); }
}

function req<T>(method: "GET" | "POST", u: string, key: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new URL(u), c = x.protocol === "https:" ? https : http, p = body === undefined ? "" : JSON.stringify(body);
    const r = c.request({ hostname: x.hostname, port: x.port || (x.protocol === "https:" ? 443 : 80), path: x.pathname + x.search, method, headers: { "X-API-Key": key, "Content-Type": "application/json", ...(body === undefined ? {} : { "Content-Length": Buffer.byteLength(p) }) } }, (res) => {
      let t = ""; res.on("data", (d: Buffer) => (t += d.toString("utf8"))); res.on("end", () => { if ((res.statusCode || 500) >= 400) return reject(new Error(parseErr(t, res.statusCode))); try { resolve((t ? JSON.parse(t) : {}) as T); } catch { resolve({} as T); } });
    });
    r.on("error", reject); if (p) r.write(p); r.end();
  });
}

function stream(u: string, key: string, body: unknown, onEvent: (event: string, payload: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new URL(u), c = x.protocol === "https:" ? https : http, p = JSON.stringify(body); let b = "";
    const r = c.request({ hostname: x.hostname, port: x.port || (x.protocol === "https:" ? 443 : 80), path: x.pathname + x.search, method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(p), Accept: "text/event-stream" } }, (res) => {
      if ((res.statusCode || 500) >= 400) { let t = ""; res.on("data", (d: Buffer) => (t += d.toString("utf8"))); res.on("end", () => reject(new Error(parseErr(t, res.statusCode)))); return; }
      res.on("data", (d: Buffer) => { b += d.toString("utf8"); let i = b.indexOf("\n\n"); while (i >= 0) { const e = b.slice(0, i); b = b.slice(i + 2); i = b.indexOf("\n\n"); const lines = e.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()); if (!lines.length) continue; const raw = lines.join("\n"); if (raw === "[DONE]") continue; try { const o = JSON.parse(raw); onEvent(o.event || "message", o.data ?? o.message ?? o); } catch {} } });
      res.on("end", () => resolve());
    });
    r.on("error", reject); r.write(p); r.end();
  });
}

function parseErr(text: string, code?: number) { try { const j = JSON.parse(text); return `HTTP ${code}: ${j.error?.message || j.message || j.error || text}`; } catch { return `HTTP ${code}: ${text.slice(0, 300)}`; } }
function err(e: unknown) { return e instanceof Error ? e.message : String(e); }
function base() { return (vscode.workspace.getConfiguration("xpersona.playground").get<string>("baseApiUrl") || "http://localhost:3000").replace(/\/$/, ""); }
function nonce() { return createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 16); }
function html() { return `<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:var(--vscode-font-family);margin:0;height:100vh;display:flex;flex-direction:column;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}.top{padding:8px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:6px;flex-wrap:wrap;align-items:center}.tabs{display:flex;border-bottom:1px solid var(--vscode-panel-border)}.tab{border:0;background:transparent;color:inherit;padding:7px 9px;cursor:pointer;border-right:1px solid var(--vscode-panel-border)}.tab.active{background:var(--vscode-input-background)}.panel{display:none;flex:1;overflow:auto;padding:8px;white-space:pre-wrap}.panel.active{display:block}.m{padding:8px;border-radius:8px;margin-bottom:8px;max-width:95%}.u{margin-left:auto;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.a{background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.e{background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder)}.chip{font-size:11px;padding:2px 6px;border:1px solid var(--vscode-panel-border);border-radius:999px;margin-right:6px}.item{border:1px solid var(--vscode-panel-border);padding:8px;border-radius:8px;margin-bottom:8px}.input{border-top:1px solid var(--vscode-panel-border);padding:8px}textarea{width:100%;min-height:90px}#setup{display:none;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:8px}#app{display:none;flex:1;flex-direction:column;min-height:0}</style></head><body><div id="setup"><h3>Set API key</h3><input id="k" type="password" placeholder="xp_..."><button id="ks">Save</button></div><div id="app"><div class="top"><strong>Playground</strong><select id="mode"><option value="auto">Auto</option><option value="plan">Plan</option><option value="yolo">YOLO</option></select><select id="safety"><option value="standard">Safety: Standard</option><option value="aggressive">Safety: Aggressive</option></select><label><input id="parallel" type="checkbox"> Parallel agents</label><button id="hist">History</button><button id="rep">Replay</button><button id="idx">Rebuild Index</button><span id="ac">images:0</span></div><div class="tabs"><button class="tab active" data-p="chat">Chat</button><button class="tab" data-p="timeline">Timeline</button><button class="tab" data-p="history">History</button><button class="tab" data-p="index">Index</button><button class="tab" data-p="agents">Agents</button><button class="tab" data-p="exec">Execution</button></div><div id="chat" class="panel active"><div id="chips"></div><div id="msgs"><div class="m a">Hello! I'm your Playground AI coding assistant.</div></div></div><div id="timeline" class="panel"></div><div id="history" class="panel"></div><div id="index" class="panel"></div><div id="agents" class="panel"></div><div id="exec" class="panel"></div><div class="input"><textarea id="t" placeholder="Type a message"></textarea><button id="s">Send</button><button id="c">Clear</button></div></div><script>const v=acquireVsCodeApi(),setup=document.getElementById("setup"),app=document.getElementById("app"),msgs=document.getElementById("msgs"),chips=document.getElementById("chips"),timeline=document.getElementById("timeline"),history=document.getElementById("history"),index=document.getElementById("index"),agents=document.getElementById("agents"),exec=document.getElementById("exec");let sb=null,streaming=false;function add(x,cls){const d=document.createElement("div");d.className="m "+cls;d.textContent=x;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;}function tab(p){document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));document.querySelectorAll(".panel").forEach(t=>t.classList.remove("active"));document.querySelector('.tab[data-p="'+p+'"]').classList.add("active");document.getElementById(p).classList.add("active");}document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>tab(b.dataset.p));document.getElementById("ks").onclick=()=>{const key=document.getElementById("k").value.trim();if(key)v.postMessage({type:"saveKey",key});};document.getElementById("s").onclick=()=>{const t=document.getElementById("t"),x=t.value.trim();if(!x||streaming)return;add(x,"u");t.value="";streaming=true;sb=add("","a");v.postMessage({type:"send",text:x,parallel:document.getElementById("parallel").checked});tab("chat");};document.getElementById("c").onclick=()=>{while(msgs.firstChild)msgs.removeChild(msgs.firstChild);chips.innerHTML="";v.postMessage({type:"clear"});};document.getElementById("mode").onchange=e=>v.postMessage({type:"setMode",value:e.target.value});document.getElementById("safety").onchange=e=>v.postMessage({type:"setSafety",value:e.target.value});document.getElementById("hist").onclick=()=>{v.postMessage({type:"history"});tab("history");};document.getElementById("rep").onclick=()=>v.postMessage({type:"replay"});document.getElementById("idx").onclick=()=>{v.postMessage({type:"indexRebuild"});tab("index");};window.addEventListener("message",ev=>{const m=ev.data;if(m.type==="api"){if(m.ok){setup.style.display="none";app.style.display="flex";}else{setup.style.display="flex";app.style.display="none";}}else if(m.type==="mode"){document.getElementById("mode").value=m.value;}else if(m.type==="att"){document.getElementById("ac").textContent="images:"+m.count;}else if(m.type==="start"){streaming=true;}else if(m.type==="token"){if(sb)sb.textContent+=(m.text||"");else sb=add(m.text||"","a");}else if(m.type==="end"){streaming=false;sb=null;}else if(m.type==="status"){add("[status] "+m.text,"a");}else if(m.type==="assistant"){add(m.text||"","a");}else if(m.type==="meta"){chips.innerHTML="";if(m.data?.confidence!==undefined){const c=document.createElement("span");c.className="chip";c.textContent="Confidence "+Math.round(m.data.confidence*100)+"%";chips.appendChild(c);}if(m.data?.risk){const r=document.createElement("span");r.className="chip";r.textContent="Risk "+m.data.risk.blastRadius+" / rollback "+m.data.risk.rollbackComplexity;chips.appendChild(r);}}else if(m.type==="timeline"){timeline.innerHTML=(m.data||[]).map(x=>'<div class="item"><strong>'+new Date(x.ts).toLocaleTimeString()+'</strong><div>'+x.phase+'</div><div>'+x.detail+'</div></div>').join("")||"No timeline";}else if(m.type==="historyItems"){history.innerHTML=(m.data||[]).map(x=>'<div class="item" data-id="'+x.id+'"><strong>'+x.title+'</strong><div>'+x.mode+' · '+x.id.slice(0,8)+'</div></div>').join("")||"No history";history.querySelectorAll(".item").forEach(el=>el.onclick=()=>v.postMessage({type:"openSession",id:el.getAttribute("data-id")}));}else if(m.type==="indexState"){index.innerHTML='<div class="item">chunks: '+(m.data?.chunks||0)+'</div><div class="item">freshness: '+(m.data?.freshness||"stale")+'</div><div class="item">last matches: '+(m.data?.lastQueryMatches||0)+'</div><div class="item">last rebuild: '+(m.data?.lastRebuildAt||"n/a")+'</div>';}else if(m.type==="roundtable"){agents.textContent=JSON.stringify(m.data||{},null,2);}else if(m.type==="execLogs"){exec.innerHTML=(m.data||[]).map(x=>'<div class="item"><strong>'+x.level.toUpperCase()+'</strong> '+new Date(x.ts).toLocaleTimeString()+'<div>'+x.message+'</div></div>').join("")||"No execution logs";}else if(m.type==="err"){streaming=false;sb=null;add("Error: "+m.text,"e");}else if(m.type==="prefill"){document.getElementById("t").value=m.text||"";}else if(m.type==="load"){while(msgs.firstChild)msgs.removeChild(msgs.firstChild);(m.data||[]).forEach(x=>add(x.content,x.role==="user"?"u":"a"));tab("chat");}});v.postMessage({type:"check"});</script></body></html>`; }
