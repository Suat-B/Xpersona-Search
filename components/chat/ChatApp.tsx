"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

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

const QUICK_PROMPTS = [
  "Draft a product launch plan for a small AI feature in 7 days.",
  "Review this idea and list risks, assumptions, and test plan.",
  "Turn my rough notes into a clean, structured specification.",
  "Help me debug a bug report with likely root causes and fixes.",
] as const;

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

function AssistantMessage({ message }: { message: ChatMessage }) {
  if (message.pending && !message.content.trim()) {
    return (
      <div className="chat-editorial-typing" aria-label="Assistant is thinking" role="status">
        <span />
        <span />
        <span />
      </div>
    );
  }

  return (
    <div className="chat-editorial-markdown">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p>{children}</p>,
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          code: ({ inline, children, ...props }) => {
            if (inline) {
              return (
                <code {...props}>
                  {children}
                </code>
              );
            }

            return (
              <pre>
                <code {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {message.content || "No response received."}
      </ReactMarkdown>
    </div>
  );
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const refreshSessions = useCallback(async (): Promise<SessionRow[]> => {
    const res = await fetch("/api/v1/me/chat/sessions?limit=40", {
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
    const res = await fetch("/api/v1/me/chat/sessions", {
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
      const res = await fetch(`/api/v1/me/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
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
        const bootRes = await fetch("/api/v1/me/chat/bootstrap", {
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

  const onQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
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
        const sendAssist = async (sessionId: string): Promise<Response> =>
          fetch("/api/v1/me/chat/assist", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              task,
              historySessionId: sessionId,
            }),
          });

        const createFreshSessionForRetry = async (): Promise<SessionRow> => {
          const createRes = await fetch("/api/v1/me/chat/sessions", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: task.slice(0, 80) || "New chat", mode: "generate" }),
          });
          if (!createRes.ok) {
            throw new Error("Failed to create a fresh chat session");
          }
          const createJson = (await createRes.json().catch(() => ({}))) as { data?: unknown };
          const created = normalizeSession(createJson?.data);
          if (!created) throw new Error("Invalid fresh session response");
          setSessions((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
          setActiveSessionId(created.id);
          return created;
        };

        let res = await sendAssist(activeSessionId);

        if (!res.ok) {
          const failureText = await res.text().catch(() => "");
          if (failureText.includes("Unknown historySessionId")) {
            setStatusText("Session went stale. Starting a fresh chat and retrying...");
            const fresh = await createFreshSessionForRetry();
            res = await sendAssist(fresh.id);
          } else {
            throw new Error(failureText || "Chat request failed");
          }
        }

        if (!res.body) {
          throw new Error("Chat stream unavailable");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let done = false;

        const setAssistant = (content: string, pending: boolean) => {
          setMessages((prev) => prev.map((msg) => (msg.id === assistantId ? { ...msg, content, pending } : msg)));
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
            setStatusText(null);
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
      <div className="chat-editorial min-h-dvh flex items-center justify-center p-6">
        <div className="chat-editorial-card flex items-center gap-3 rounded-2xl px-5 py-4">
          <div className="chat-editorial-spinner" aria-hidden="true" />
          <p className="text-sm text-[var(--chat-text-secondary)]">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="chat-editorial min-h-dvh flex items-center justify-center p-6">
        <div className="chat-editorial-card max-w-lg rounded-3xl p-7">
          <p className="chat-editorial-kicker">Chat</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--chat-text-primary)]">Chat unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--chat-text-secondary)]">{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-editorial h-dvh min-h-dvh">
      <div className="flex h-full w-full">
        <aside
          className={`chat-editorial-sidebar fixed inset-y-0 left-0 z-40 w-[300px] p-3 transition-transform md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Chat sessions"
        >
          <div className="chat-editorial-card h-full rounded-3xl p-3">
            <button
              onClick={onNewChat}
              className="chat-editorial-new-chat w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold"
              type="button"
            >
              + New chat
            </button>

            <div className="mt-3 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--chat-text-muted)]">Recent</p>
              <p className="text-xs text-[var(--chat-text-muted)]">{sessions.length}</p>
            </div>

            <div className="mt-2 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100dvh - 140px)" }}>
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--chat-border-strong)] px-4 py-5 text-sm text-[var(--chat-text-secondary)]">
                  No chats yet. Start a new one to begin.
                </div>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`chat-editorial-session w-full rounded-2xl px-3 py-3 text-left transition-colors ${
                      session.id === activeSessionId ? "is-active" : ""
                    }`}
                    type="button"
                  >
                    <p className="truncate text-sm font-medium text-[var(--chat-text-primary)]">{session.title}</p>
                    <p className="mt-1 truncate text-xs text-[var(--chat-text-muted)]">{prettyTime(session.updatedAt)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px] md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        ) : null}

        <main className="relative z-10 flex min-w-0 flex-1 flex-col chat-editorial-main">
          <header className="chat-editorial-mobile-header flex h-14 items-center justify-between px-4 md:hidden">
            <button
              type="button"
              className="chat-editorial-mobile-button rounded-xl px-3 py-1.5 text-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chats"
            >
              Chats
            </button>
            <p className="truncate text-sm text-[var(--chat-text-secondary)]">{activeSession?.title || "New chat"}</p>
          </header>

          <div ref={messageViewportRef} className="chat-editorial-scroll flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-8">
            {loadingMessages ? (
              <div className="mx-auto w-full max-w-[860px]">
                <p className="text-sm text-[var(--chat-text-secondary)]">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="mx-auto mt-10 w-full max-w-[860px] animate-fade-in-up">
                <p className="chat-editorial-kicker">Xpersona Chat</p>
                <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-[var(--chat-text-primary)] sm:text-5xl">
                  Start with a clear prompt.
                </h1>
                <p className="mt-4 max-w-2xl text-pretty text-sm leading-6 text-[var(--chat-text-secondary)] sm:text-base">
                  Ask for plans, debugging help, writing support, or technical breakdowns. You can paste context and we will work through it step by step.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="chat-editorial-quick-prompt rounded-2xl p-4 text-left text-sm"
                      onClick={() => onQuickPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[860px] space-y-6">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`chat-editorial-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
                  >
                    <div className="chat-editorial-avatar" aria-hidden="true">
                      {message.role === "user" ? "U" : "AI"}
                    </div>
                    <div className="chat-editorial-bubble">
                      {message.role === "assistant" ? (
                        <AssistantMessage message={message} />
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-text-primary)]">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="chat-editorial-composer-wrap px-4 pb-4 pt-3 sm:px-8">
            <form onSubmit={onSend} className="mx-auto w-full max-w-[860px]">
              <div className="chat-editorial-composer rounded-[24px] p-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (sending || !input.trim() || !activeSessionId) return;
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything..."
                  className="chat-editorial-textarea max-h-40 min-h-[44px] w-full resize-y"
                  aria-label="Message input"
                />

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-h-5 text-xs leading-5 text-[var(--chat-text-muted)]" role="status" aria-live="polite">
                    {statusText || "Enter to send, Shift+Enter for a new line."}
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !input.trim() || !activeSessionId}
                    className="chat-editorial-send rounded-full px-4 py-2 text-sm font-semibold"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
