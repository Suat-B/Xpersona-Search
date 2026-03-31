"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

type ChatViewer = {
  userId: string;
  email: string;
  isAnonymous: boolean;
  accountType: string;
  source: string;
};

type ConnectedModel = {
  id: string;
  provider: string;
  alias: string;
  displayName: string;
  authMode: string;
  defaultModel: string | null;
  status: string;
  browserAuthSupported: boolean;
};

type ChatModelSettings = {
  platformDefaultModelAlias: string;
  preferredModelAlias: string | null;
  preferredChatModelSource: "platform" | "user_connected";
  fallbackToPlatformModel: boolean;
  browserAuth: { enabled: boolean; reason: string };
  connections: ConnectedModel[];
};

const STARTER_PROMPTS = [
  "Plan a feature with clear next steps.",
  "Debug a bug and explain the fix.",
  "Rewrite this text to sound sharper.",
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

function extractFinalFromStructuredText(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced?.trim()) candidates.push(fenced.trim());

  for (const candidate of candidates) {
    const attempts = [candidate, candidate.replace(/\\"/g, '"')];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt) as { final?: unknown };
        if (typeof parsed.final === "string" && parsed.final.trim()) {
          return parsed.final.trim();
        }
      } catch {
        // Ignore parse failures and keep trying other candidates.
      }
    }
  }

  const unescaped = text.includes('\\"final\\"') ? text.replace(/\\"/g, '"') : text;
  const match = unescaped.match(/"final"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\n/g, "\n").trim();
  }
}

function normalizeAssistantFinalText(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const extracted = extractFinalFromStructuredText(text);
  return extracted?.trim() ? extracted.trim() : text;
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
  const [viewer, setViewer] = useState<ChatViewer | null>(null);
  const [modelSettings, setModelSettings] = useState<ChatModelSettings | null>(null);
  const [selectedModelAlias, setSelectedModelAlias] = useState<string>("");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [runMetaText, setRunMetaText] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingSessionIdRef = useRef<string | null>(null);
  const skipNextAutoLoadSessionIdRef = useRef<string | null>(null);
  const didFocusComposerRef = useRef(false);
  const isEmpty = !loadingMessages && messages.length === 0;

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );
  const draftStorageKey = useMemo(
    () => `xpersona:chat:draft:${activeSessionId ?? "new"}`,
    [activeSessionId]
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
        const bootJson = (await bootRes.json().catch(() => ({}))) as {
          data?: { viewer?: unknown; modelSettings?: unknown };
        };
        const candidate = bootJson?.data?.viewer as Partial<ChatViewer> | undefined;
        const nextViewer =
          candidate &&
          typeof candidate.userId === "string" &&
          typeof candidate.email === "string" &&
          typeof candidate.isAnonymous === "boolean" &&
          typeof candidate.accountType === "string" &&
          typeof candidate.source === "string"
            ? ({
                userId: candidate.userId,
                email: candidate.email,
                isAnonymous: candidate.isAnonymous,
                accountType: candidate.accountType,
                source: candidate.source,
              } as ChatViewer)
            : null;
        if (!cancelled) setViewer(nextViewer);
        const modelSettingsCandidate = bootJson?.data?.modelSettings as Partial<ChatModelSettings> | undefined;
        const normalizedModelSettings =
          modelSettingsCandidate &&
          typeof modelSettingsCandidate.platformDefaultModelAlias === "string" &&
          typeof modelSettingsCandidate.preferredChatModelSource === "string" &&
          typeof modelSettingsCandidate.fallbackToPlatformModel === "boolean" &&
          modelSettingsCandidate.browserAuth &&
          typeof modelSettingsCandidate.browserAuth === "object" &&
          Array.isArray(modelSettingsCandidate.connections)
            ? ({
                platformDefaultModelAlias: modelSettingsCandidate.platformDefaultModelAlias,
                preferredModelAlias:
                  typeof modelSettingsCandidate.preferredModelAlias === "string"
                    ? modelSettingsCandidate.preferredModelAlias
                    : null,
                preferredChatModelSource:
                  modelSettingsCandidate.preferredChatModelSource === "user_connected"
                    ? "user_connected"
                    : "platform",
                fallbackToPlatformModel: modelSettingsCandidate.fallbackToPlatformModel,
                browserAuth: {
                  enabled:
                    (modelSettingsCandidate.browserAuth as { enabled?: unknown }).enabled === true,
                  reason: String(
                    (modelSettingsCandidate.browserAuth as { reason?: unknown }).reason || ""
                  ),
                },
                connections: (modelSettingsCandidate.connections as unknown[]).map((item) => {
                  const row = item as Partial<ConnectedModel>;
                  return {
                    id: String(row.id || ""),
                    provider: String(row.provider || ""),
                    alias: String(row.alias || ""),
                    displayName: String(row.displayName || row.alias || "Connected model"),
                    authMode: String(row.authMode || ""),
                    defaultModel:
                      typeof row.defaultModel === "string" ? row.defaultModel : null,
                    status: String(row.status || "active"),
                    browserAuthSupported: row.browserAuthSupported === true,
                  };
                }),
              } satisfies ChatModelSettings)
            : null;
        if (!cancelled) {
          setModelSettings(normalizedModelSettings);
          setSelectedModelAlias(
            normalizedModelSettings?.preferredModelAlias ||
              (normalizedModelSettings?.preferredChatModelSource === "user_connected"
                ? normalizedModelSettings?.connections[0]?.alias || normalizedModelSettings?.platformDefaultModelAlias || ""
                : normalizedModelSettings?.platformDefaultModelAlias || "")
          );
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
        setViewer(null);
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
    if (skipNextAutoLoadSessionIdRef.current === activeSessionId) {
      skipNextAutoLoadSessionIdRef.current = null;
      return;
    }
    void loadMessages(activeSessionId);
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    if (!messageViewportRef.current) return;
    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
  }, [messages, loadingMessages, sending]);

  useEffect(() => {
    try {
      const storedDraft = window.localStorage.getItem(draftStorageKey);
      setInput(storedDraft ?? "");
    } catch {
      setInput("");
    }
  }, [draftStorageKey]);

  useEffect(() => {
    try {
      if (!input.trim()) {
        window.localStorage.removeItem(draftStorageKey);
        return;
      }
      window.localStorage.setItem(draftStorageKey, input);
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
  }, [draftStorageKey, input]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    const minComposerHeight = 52;
    const maxComposerHeight = 144;
    const nextHeight = Math.min(element.scrollHeight, maxComposerHeight);
    element.style.height = `${Math.max(nextHeight, minComposerHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxComposerHeight ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    // Prevent mobile pull-to-refresh from reloading the page mid-chat.
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    drawerCloseButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (booting || bootError || didFocusComposerRef.current) return;
    didFocusComposerRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
  }, [bootError, booting]);

  const onNewChat = useCallback(async () => {
    try {
      setStatusText(null);
      await createSession();
      await refreshSessions();
      setSidebarOpen(false);
      inputRef.current?.focus({ preventScroll: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create chat";
      setStatusText(message);
    }
  }, [createSession, refreshSessions]);

  const onSelectSession = useCallback((id: string) => {
    setStatusText(null);
    setMessages([]);
    setLoadingMessages(true);
    setActiveSessionId(id);
    setSidebarOpen(false);
  }, []);

  const onUseStarterPrompt = useCallback((prompt: string) => {
    setStatusText(null);
    setInput(prompt);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const onSend = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (sending) return;
      const task = input.trim();
      if (!task) return;

      setInput("");
      try {
        window.localStorage.removeItem(draftStorageKey);
      } catch {
        // Ignore storage errors.
      }
      setStatusText(null);
      setRunMetaText(null);
      const userMessage: ChatMessage = { id: makeId(), role: "user", content: task };
      const assistantId = makeId();
      setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "", pending: true }]);
      setSending(true);

      try {
        const effectiveModelAlias =
          selectedModelAlias || modelSettings?.platformDefaultModelAlias || "";
        const sendAssist = async (sessionId: string | null): Promise<Response> =>
          fetch("/api/v1/me/chat/assist", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              task,
              ...(effectiveModelAlias ? { model: effectiveModelAlias } : {}),
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
            assistantText = normalizeAssistantFinalText(parsed.data);
            setAssistant(assistantText, false);
            setStatusText(null);
          } else if (parsed.event === "status" && typeof parsed.data === "string") {
            setStatusText(parsed.data);
          } else if (parsed.event === "meta" && parsed.data && typeof parsed.data === "object") {
            const meta = parsed.data as Record<string, unknown>;
            const pieces = [
              typeof meta.chatModelAlias === "string" && meta.chatModelAlias
                ? `chat ${meta.chatModelAlias}`
                : "",
              typeof meta.chatModelSource === "string" && meta.chatModelSource
                ? meta.chatModelSource === "user_connected"
                  ? "your connected model"
                  : "platform model"
                : "",
              typeof meta.orchestrator === "string" && meta.orchestrator
                ? `orchestrator ${meta.orchestrator}`
                : "",
              meta.fallbackApplied === true ? "fell back to platform" : "",
            ].filter(Boolean);
            setRunMetaText(pieces.length ? pieces.join(" • ") : null);
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

        assistantText = normalizeAssistantFinalText(assistantText);
        if (!assistantText.trim()) {
          assistantText = "No response received.";
        }
        setAssistant(assistantText, false);
        const resolvedSessionId = pendingSessionIdRef.current ?? activeSessionId;
        pendingSessionIdRef.current = null;
        const rows = await refreshSessions();
        const nextActiveId = resolvedSessionId ?? rows[0]?.id ?? null;
        if (nextActiveId && nextActiveId !== activeSessionId) {
          // Preserve optimistic + streamed messages when a brand new session
          // becomes active after first send; avoid immediate empty-state flicker.
          skipNextAutoLoadSessionIdRef.current = nextActiveId;
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
    [activeSessionId, draftStorageKey, input, modelSettings?.platformDefaultModelAlias, refreshSessions, selectedModelAlias, sending]
  );

  const shellTitle = activeSession?.title && activeSession.title.trim() !== "New chat" ? activeSession.title.trim() : "Chat";
  const viewerLabel = viewer && !viewer.isAnonymous ? viewer.email : "Guest access";
  const sessionTimestamp = prettyTime(activeSession?.updatedAt ?? null);
  const modelOptions = [
    ...(modelSettings?.platformDefaultModelAlias
      ? [
          {
            alias: modelSettings.platformDefaultModelAlias,
            label: "Binary platform model",
          },
        ]
      : []),
    ...((modelSettings?.connections || [])
      .filter((item) => item.status === "active")
      .map((item) => ({
        alias: item.alias,
        label: `${item.displayName}${item.defaultModel ? ` • ${item.defaultModel}` : ""}`,
      }))),
  ];

  const composer = (
    <form onSubmit={onSend} className="chat-editorial-composer-form">
      <div className="chat-editorial-composer">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--chat-text-secondary)]">
          <label className="flex items-center gap-2">
            <span>Reply with</span>
            <select
              value={selectedModelAlias}
              onChange={(event) => setSelectedModelAlias(event.target.value)}
              className="rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-1 text-xs text-[var(--chat-text-primary)]"
              aria-label="Choose reply model"
            >
              {modelOptions.map((option) => (
                <option key={option.alias} value={option.alias}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Link href="/dashboard/playground" className="underline underline-offset-4">
            Manage connected models
          </Link>
        </div>
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
          placeholder="Ask for help with code, writing, or next steps"
          className="chat-editorial-input"
          aria-label="Message input"
        />

        <div className="chat-editorial-composer-footer">
          <div className="chat-editorial-status" role="status" aria-live="polite">
            {sending ? <span className="chat-editorial-spinner" aria-hidden="true" /> : null}
            <span>
              {statusText ||
                runMetaText ||
                (sending ? "Streaming response..." : "Enter to send · Shift+Enter for a new line")}
            </span>
          </div>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="chat-editorial-send"
            aria-label="Send"
          >
            {sending ? (
              <span className="chat-editorial-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5.5 12h11.5m0 0-4.5-4.5m4.5 4.5-4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  if (booting) {
    return (
      <div className="chat-editorial flex min-h-dvh items-center justify-center p-6">
        <div className="chat-editorial-card flex items-center gap-3 rounded-2xl px-5 py-4">
          <div className="chat-editorial-spinner" aria-hidden="true" />
          <p className="text-sm text-[var(--chat-text-secondary)]">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="chat-editorial flex min-h-dvh items-center justify-center p-6">
        <div className="chat-editorial-card max-w-lg rounded-3xl p-7">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--chat-text-muted)]">Chat</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--chat-text-primary)]">Chat unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--chat-text-secondary)]">{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-editorial h-dvh overflow-hidden">
      <div className="chat-editorial-shell">
        <header className="chat-editorial-header safe-area-inset-top">
          <div className="mx-auto flex w-full max-w-[1040px] items-center gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              className="chat-editorial-control"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chat history"
              aria-expanded={sidebarOpen}
              aria-controls="chat-history-drawer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 7.5h15" />
                <path d="M4.5 12h10.5" />
                <path d="M4.5 16.5h15" />
              </svg>
              <span className="hidden sm:inline">History</span>
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--chat-text-primary)] sm:text-base">
                  {shellTitle}
                </h1>
                <span className="chat-editorial-badge">Playground 1</span>
              </div>
              <p className="mt-1 truncate text-xs text-[var(--chat-text-muted)] sm:text-sm">
                {loadingMessages
                  ? "Loading conversation"
                  : sessionTimestamp
                    ? `Updated ${sessionTimestamp}`
                    : isEmpty
                      ? "Ready to write"
                      : "Live conversation"}
              </p>
            </div>

            <button type="button" className="chat-editorial-control chat-editorial-control-primary" onClick={() => void onNewChat()} aria-label="Start a new chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5.5v13" />
                <path d="M5.5 12h13" />
              </svg>
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </header>

        <div className={`chat-editorial-drawer ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
          <button
            type="button"
            className="chat-editorial-drawer-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close chat history"
            tabIndex={sidebarOpen ? 0 : -1}
          />
          <aside
            id="chat-history-drawer"
            className="chat-editorial-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chat history"
          >
            <div className="chat-editorial-drawer-surface">
              <div className="chat-editorial-drawer-head">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--chat-text-muted)]">History</p>
                  <p className="mt-1 text-sm text-[var(--chat-text-secondary)]">Jump back into a recent thread</p>
                </div>
                <button
                  ref={drawerCloseButtonRef}
                  type="button"
                  className="chat-editorial-control"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close chat history"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l12 12" />
                    <path d="M18 6 6 18" />
                  </svg>
                </button>
              </div>

              <div className="px-4 pb-3">
                <button type="button" onClick={() => void onNewChat()} className="chat-editorial-control chat-editorial-control-primary w-full justify-start">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5.5v13" />
                    <path d="M5.5 12h13" />
                  </svg>
                  <span>New chat</span>
                </button>
              </div>

              <div className="chat-editorial-drawer-list">
                {sessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-[var(--chat-text-secondary)]">
                    No chats yet. Start a new one to begin.
                  </div>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className={`chat-editorial-session ${session.id === activeSessionId ? "is-active" : ""}`}
                      type="button"
                    >
                      <p className="chat-editorial-session-title truncate">{session.title}</p>
                      <p className="chat-editorial-session-meta truncate">{prettyTime(session.updatedAt)}</p>
                    </button>
                  ))
                )}
              </div>

              <div className="chat-editorial-drawer-footer">
                <p className="chat-editorial-drawer-note truncate" title={viewerLabel}>
                  {viewerLabel}
                </p>
                <div className="chat-editorial-link-row">
                  <Link href="/" className="chat-editorial-link">
                    Home
                  </Link>
                  {viewer && !viewer.isAnonymous ? (
                    <Link href="/dashboard" className="chat-editorial-link is-primary">
                      Dashboard
                    </Link>
                  ) : (
                    <>
                      <Link href="/auth/signin" className="chat-editorial-link">
                        Sign in
                      </Link>
                      <Link href="/auth/signup" className="chat-editorial-link is-primary">
                        Sign up
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <main className="chat-editorial-main">
          <div ref={messageViewportRef} className="chat-editorial-scroll flex-1 overflow-y-auto overscroll-y-contain">
            <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-4 py-4 sm:px-6 sm:py-5">
              {loadingMessages ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="chat-editorial-card flex items-center gap-3 rounded-2xl px-5 py-4">
                    <div className="chat-editorial-spinner" aria-hidden="true" />
                    <p className="text-sm text-[var(--chat-text-secondary)]">Loading messages...</p>
                  </div>
                </div>
              ) : isEmpty ? (
                <div className="chat-editorial-empty flex min-h-full items-center justify-center">
                  <div className="chat-editorial-empty-copy">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--chat-text-muted)]">Minimal chat</p>
                    <h2 className="chat-editorial-empty-title mt-3">What should we work on?</h2>
                    <p className="chat-editorial-empty-text">
                      Keep the surface clean and use this space for code help, product thinking, or quick writing.
                    </p>
                    <div className="chat-editorial-chip-row">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="chat-editorial-chip"
                          onClick={() => onUseStarterPrompt(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chat-editorial-message-list">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chat-editorial-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
                    >
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
          </div>

          <div className="chat-editorial-composer-shell safe-area-inset-bottom">
            <div className="mx-auto w-full max-w-[1040px] px-4 py-2.5 sm:px-6 sm:py-3">{composer}</div>
          </div>
        </main>
      </div>
    </div>
  );
}


