"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionRow = {
  id: string;
  title: string;
  mode: string;
  updatedAt: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSession(row: unknown): SessionRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as {
    id?: unknown;
    title?: unknown;
    mode?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  };
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "New chat";
  const mode = typeof candidate.mode === "string" && candidate.mode.trim() ? candidate.mode.trim() : "generate";
  const updatedAtRaw =
    typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : null;
  return {
    id: candidate.id,
    title,
    mode,
    updatedAt: updatedAtRaw,
  };
}

function extractSessions(payload: unknown): SessionRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { data?: unknown };
  const dataObject = root.data as { data?: unknown } | undefined;
  const rows = Array.isArray(dataObject?.data)
    ? dataObject.data
    : Array.isArray(root.data)
      ? (root.data as unknown[])
      : [];
  return rows.map(normalizeSession).filter((x): x is SessionRow => Boolean(x));
}

function extractMessages(payload: unknown): ChatMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { data?: unknown };
  const rows = Array.isArray(root.data) ? root.data : [];
  const filtered = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const m = row as { id?: unknown; role?: unknown; content?: unknown };
      if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
      return {
        id: typeof m.id === "string" && m.id ? m.id : makeId(),
        role: m.role,
        content: m.content,
      } as ChatMessage;
    })
    .filter((x): x is ChatMessage => Boolean(x));
  return filtered.reverse();
}

function prettyTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatApp() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const refreshSessions = useCallback(async (): Promise<SessionRow[]> => {
    const res = await fetch("/api/me/chat/sessions?limit=40", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Failed to load chats");
    }
    const json = (await res.json().catch(() => ({}))) as unknown;
    const rows = extractSessions(json);
    setSessions(rows);
    return rows;
  }, []);

  const createSession = useCallback(async (): Promise<SessionRow> => {
    const res = await fetch("/api/me/chat/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat", mode: "generate" }),
    });
    if (!res.ok) {
      throw new Error("Failed to create chat");
    }
    const json = (await res.json().catch(() => ({}))) as { data?: unknown };
    const row = normalizeSession(json?.data);
    if (!row) throw new Error("Invalid session response");
    setSessions((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
    setActiveSessionId(row.id);
    setMessages([]);
    return row;
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/me/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      const json = (await res.json().catch(() => ({}))) as unknown;
      setMessages(extractMessages(json));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load messages";
      setStatusText(message);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      setBootError(null);
      try {
        const bootRes = await fetch("/api/me/chat/bootstrap", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!bootRes.ok) {
          const text = await bootRes.text();
          throw new Error(text || "Bootstrap failed");
        }
        const rows = await refreshSessions();
        if (cancelled) return;
        if (rows.length === 0) {
          const created = await createSession();
          if (!cancelled) setActiveSessionId(created.id);
        } else {
          setActiveSessionId(rows[0].id);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not initialize chat";
        setBootError(message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createSession, refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    void loadMessages(activeSessionId);
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    if (!messageViewportRef.current) return;
    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
  }, [messages, loadingMessages, sending]);

  const onNewChat = useCallback(async () => {
    try {
      setStatusText(null);
      await createSession();
      await refreshSessions();
      setSidebarOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create chat";
      setStatusText(message);
    }
  }, [createSession, refreshSessions]);

  const onSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setSidebarOpen(false);
  }, []);

  const onSend = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (sending) return;
      const task = input.trim();
      if (!task || !activeSessionId) return;

      setInput("");
      setStatusText(null);
      const userMessage: ChatMessage = { id: makeId(), role: "user", content: task };
      const assistantId = makeId();
      setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "", pending: true }]);
      setSending(true);

      try {
        const res = await fetch("/api/me/chat/assist", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            historySessionId: activeSessionId,
          }),
        });

        if (!res.ok || !res.body) {
          const failureText = await res.text().catch(() => "");
          throw new Error(failureText || "Chat request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let done = false;

        const setAssistant = (content: string, pending: boolean) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content, pending } : msg))
          );
        };

        const processFrame = (rawFrame: string) => {
          const frame = rawFrame.trim();
          if (!frame) return;
          const dataLines = frame
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"));
          if (!dataLines.length) return;
          const rawData = dataLines.map((line) => line.slice(5).trimStart()).join("\n").trim();
          if (!rawData) return;
          if (rawData === "[DONE]") {
            done = true;
            return;
          }

          let parsed: { event?: string; data?: unknown } | null = null;
          try {
            parsed = JSON.parse(rawData) as { event?: string; data?: unknown };
          } catch {
            parsed = null;
          }
          if (!parsed) return;

          if (parsed.event === "token" && typeof parsed.data === "string") {
            assistantText += parsed.data;
            setAssistant(assistantText, true);
          } else if (parsed.event === "final" && typeof parsed.data === "string") {
            assistantText = parsed.data;
            setAssistant(assistantText, false);
          } else if (parsed.event === "status" && typeof parsed.data === "string") {
            setStatusText(parsed.data);
          }
        };

        while (!done) {
          const { value, done: readDone } = await reader.read();
          if (readDone) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let splitIndex = buffer.indexOf("\n\n");
          while (splitIndex >= 0) {
            const frame = buffer.slice(0, splitIndex);
            buffer = buffer.slice(splitIndex + 2);
            splitIndex = buffer.indexOf("\n\n");
            processFrame(frame);
            if (done) break;
          }
        }

        if (!done && buffer.trim()) processFrame(buffer);

        if (!assistantText.trim()) {
          assistantText = "No response received.";
        }
        setAssistant(assistantText, false);
        await refreshSessions();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed";
        setStatusText(message);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `I hit an error: ${message}`, pending: false }
              : msg
          )
        );
      } finally {
        setSending(false);
      }
    },
    [activeSessionId, input, refreshSessions, sending]
  );

  if (booting) {
    return (
      <div className="min-h-dvh bg-[#212121] text-[#f5f5f5] flex items-center justify-center">
        <p className="text-sm text-white/70">Preparing chat...</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-dvh bg-[#212121] text-[#f5f5f5] flex items-center justify-center px-6">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-black/30 p-6">
          <h1 className="text-xl font-semibold">Chat Unavailable</h1>
          <p className="mt-3 text-sm text-white/70">{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh min-h-dvh bg-[#212121] text-[#f5f5f5]">
      <div className="flex h-full w-full">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[280px] border-r border-white/10 bg-[#171717] p-3 transition-transform md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            onClick={onNewChat}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm font-medium hover:bg-white/10"
            type="button"
          >
            + New chat
          </button>
          <div className="mt-4 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "calc(100dvh - 88px)" }}>
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  session.id === activeSessionId ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/7"
                }`}
                type="button"
              >
                <p className="truncate text-sm font-medium">{session.title}</p>
                <p className="mt-1 truncate text-[11px] text-white/45">{prettyTime(session.updatedAt)}</p>
              </button>
            ))}
          </div>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        ) : null}

        <main className="relative z-10 flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-4 md:hidden">
            <button
              type="button"
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm"
              onClick={() => setSidebarOpen(true)}
            >
              Chats
            </button>
            <p className="truncate text-sm text-white/70">{activeSession?.title || "Playground Chat"}</p>
          </header>

          <div ref={messageViewportRef} className="flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-8">
            {loadingMessages ? (
              <p className="text-sm text-white/60">Loading messages...</p>
            ) : messages.length === 0 ? (
              <div className="mx-auto mt-16 max-w-2xl text-center">
                <h1 className="text-4xl font-semibold tracking-tight">What are you working on?</h1>
                <p className="mt-3 text-sm text-white/60">Ask anything and chat with Playground 1.</p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-5">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "bg-[#2f2f2f] text-white"
                          : "bg-[#262626] text-white/95 border border-white/10"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content || (message.pending ? "..." : "")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#212121] px-4 pb-4 pt-3 sm:px-8">
            <form onSubmit={onSend} className="mx-auto w-full max-w-3xl">
              {statusText ? <p className="mb-2 text-xs text-white/55">{statusText}</p> : null}
              <div className="flex items-end gap-2 rounded-3xl border border-white/15 bg-[#2a2a2a] px-3 py-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={1}
                  placeholder="Ask anything"
                  className="max-h-36 min-h-[40px] w-full resize-y bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim() || !activeSessionId}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
