"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

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
          code: ({ children, ...props }) => <code {...props}>{children}</code>,
          pre: ({ children }) => <pre>{children}</pre>,
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
  const pendingSessionIdRef = useRef<string | null>(null);
  const suppressNextLoadRef = useRef(false);
  const isEmpty = !loadingMessages && messages.length === 0;

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
          if (!cancelled) {
            setActiveSessionId(null);
            setMessages([]);
          }
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
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (suppressNextLoadRef.current) {
      suppressNextLoadRef.current = false;
      return;
    }
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
      if (!task) return;

      setInput("");
      setStatusText(null);
      const userMessage: ChatMessage = { id: makeId(), role: "user", content: task };
      const assistantId = makeId();
      setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "", pending: true }]);
      setSending(true);

      try {
        const sendAssist = async (sessionId: string | null): Promise<Response> =>
          fetch("/api/v1/me/chat/assist", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              task,
              ...(sessionId ? { historySessionId: sessionId } : {}),
            }),
          });

        let res = await sendAssist(activeSessionId);

        if (!res.ok) {
          const failureText = await res.text().catch(() => "");
          if (failureText.includes("Unknown historySessionId")) {
            pendingSessionIdRef.current = null;
            res = await sendAssist(null);
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

          let parsed: { event?: string; data?: unknown; sessionId?: unknown; message?: unknown } | null = null;
          try {
            parsed = JSON.parse(rawData) as { event?: string; data?: unknown; sessionId?: unknown; message?: unknown };
          } catch {
            parsed = null;
          }
          if (!parsed) return;
          if (typeof parsed.sessionId === "string") {
            pendingSessionIdRef.current = parsed.sessionId;
          }

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
        const resolvedSessionId = pendingSessionIdRef.current ?? activeSessionId;
        pendingSessionIdRef.current = null;
        const rows = await refreshSessions();
        const nextActiveId = resolvedSessionId ?? rows[0]?.id ?? null;
        if (nextActiveId && nextActiveId !== activeSessionId) {
          suppressNextLoadRef.current = true;
          setActiveSessionId(nextActiveId);
        }
        setStatusText(null);
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

  const composer = (
    <form onSubmit={onSend} className="mx-auto w-full max-w-[720px]">
      <div className="chat-editorial-composer rounded-full px-4 py-2.5">
        <div className="chat-editorial-input-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (sending || !input.trim()) return;
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder="Ask anything"
            className="chat-editorial-textarea chat-editorial-textarea-inline"
            aria-label="Message input"
          />
          <div className="chat-editorial-input-actions">
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="chat-editorial-send chat-editorial-send-icon"
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5.5 12h12m0 0-4-4m4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="chat-editorial-hint" role="status" aria-live="polite">
        {statusText || "Enter to send, made with ❤️ in America."}
      </div>
    </form>
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
          className={`chat-editorial-sidebar fixed inset-y-0 left-0 z-40 w-[300px] p-3 transition-transform md:static md:w-[260px] md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Chat sessions"
        >
          <div className="chat-editorial-card chat-editorial-sidebar-card h-full rounded-3xl p-4">
            <div className="chat-editorial-sidebar-inner">
              <div className="chat-editorial-brand">
                <span className="chat-editorial-brand-icon" aria-hidden="true">◎</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--chat-text-primary)]">Playground 1</p>
                  <p className="text-xs text-[var(--chat-text-muted)]">Personal</p>
                </div>
                <svg className="chat-editorial-brand-chevron" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="chat-editorial-brand-links">
                <Link href="/" className="chat-editorial-brand-link">
                  Home
                </Link>
                <Link href="/auth/signin" className="chat-editorial-brand-link">
                  Sign In
                </Link>
                <Link href="/auth/signup" className="chat-editorial-brand-link is-primary">
                  Sign Up
                </Link>
              </div>

              <button onClick={onNewChat} className="chat-editorial-side-action" type="button">
                <span>New chat</span>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 4.5v11M4.5 10h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>

              <div className="chat-editorial-recents">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--chat-text-muted)]">Recents</p>
              </div>

              <div className="chat-editorial-side-scroll">
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

          <div className={`chat-editorial-shell flex min-h-0 flex-1 flex-col ${isEmpty ? "is-empty" : ""}`}>
            <div ref={messageViewportRef} className="chat-editorial-scroll flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-8">
              {loadingMessages ? (
                <div className="mx-auto w-full max-w-[860px]">
                  <p className="text-sm text-[var(--chat-text-secondary)]">Loading messages...</p>
                </div>
              ) : isEmpty ? (
                <div className="chat-editorial-empty chat-editorial-center mx-auto w-full max-w-[720px] animate-fade-in-up">
                  <h1 className="chat-editorial-hero text-balance text-3xl font-semibold text-[var(--chat-text-primary)] sm:text-4xl">
                    How can I help?
                  </h1>
                  <div className="mt-8 w-full">{composer}</div>
                </div>
              ) : (
                <div className="chat-editorial-message-list mx-auto w-full max-w-[860px] space-y-6">
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

            {isEmpty ? null : (
              <div className="chat-editorial-composer-wrap px-4 pb-4 pt-3 sm:px-8">{composer}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
