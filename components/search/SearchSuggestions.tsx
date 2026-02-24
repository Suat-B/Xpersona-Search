"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import Link from "next/link";
import { getRecentSearches, removeRecentSearch } from "@/lib/search-history";
import { PROTOCOL_LABELS } from "@/components/search/ProtocolBadge";
import {
  extractClientErrorMessage,
  unwrapClientResponse,
} from "@/lib/api/client-response";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SuggestionAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  protocols: string[];
}

interface SuggestResponsePayload {
  querySuggestions?: string[];
  agentSuggestions?: SuggestionAgent[];
}

interface TrendingResponsePayload {
  trending?: string[];
}

type SuggestionItem =
  | { type: "recent"; text: string }
  | { type: "trending"; text: string }
  | { type: "query"; text: string }
  | { type: "agent"; agent: SuggestionAgent };

interface Props {
  query: string;
  onSelect: (agent: SuggestionAgent) => void;
  onQuerySelect?: (queryText: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  loading?: boolean;
  id?: string;
  mobileInline?: boolean;
}

export interface SearchSuggestionsHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;
const PANEL_VIEWPORT_GUTTER_PX = 12;
const PANEL_MAX_HEIGHT_PX = 420;
const PANEL_SWITCH_TO_TOP_THRESHOLD_PX = 220;

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function MagnifierIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Highlight matching text                                            */
/* ------------------------------------------------------------------ */

function highlightMatch(text: string, query: string): ReactNode {
  if (!query || query.length < 2) return <span className="font-medium">{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span className="font-medium">{text}</span>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <span>
      {before && <span className="font-medium">{before}</span>}
      <span className="font-normal text-[var(--text-tertiary)]">{match}</span>
      {after && <span className="font-medium">{after}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ label }: { label: string }) {
  return (
    <li className="px-4 pt-3 pb-1.5" aria-hidden>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
        {label}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SearchSuggestions = forwardRef<SearchSuggestionsHandle, Props>(
  function SearchSuggestions(
    {
      query,
      onSelect,
      onQuerySelect,
      onClose,
      anchorRef,
      visible,
      id = "agent-suggestions",
      mobileInline = false,
    },
    ref
  ) {
    const [items, setItems] = useState<SuggestionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [panelPlacement, setPanelPlacement] = useState<"top" | "bottom">("bottom");
    const [panelMaxHeight, setPanelMaxHeight] = useState(360);
    const listRef = useRef<HTMLUListElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const hasUsedArrowKeysRef = useRef(false);

    /* ---- select item ---- */
    const selectItem = useCallback(
      (item: SuggestionItem) => {
        if (item.type === "agent") {
          onSelect(item.agent);
        } else {
          onQuerySelect?.(item.text);
        }
        onClose();
      },
      [onSelect, onQuerySelect, onClose]
    );

    /* ---- keyboard navigation ---- */
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!visible || items.length === 0) return;
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            hasUsedArrowKeysRef.current = true;
            setHighlightedIndex((i) => Math.min(i + 1, items.length - 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            hasUsedArrowKeysRef.current = true;
            setHighlightedIndex((i) => Math.max(i - 1, 0));
            break;
          case "Enter":
            if (hasUsedArrowKeysRef.current) {
              e.preventDefault();
              const item = items[highlightedIndex];
              if (item) selectItem(item);
            }
            break;
          case "Escape":
            e.preventDefault();
            onClose();
            break;
        }
      },
      [visible, items, highlightedIndex, selectItem, onClose]
    );

    useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

    useEffect(() => {
      listRef.current
        ?.querySelector(`[data-index="${highlightedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [highlightedIndex]);

    /* ---- keep suggestions inside visible viewport / scroll container ---- */
    const updatePanelGeometry = useCallback(() => {
      if (!anchorRef.current || typeof window === "undefined") return;

      const viewportBottom = window.visualViewport?.height ?? window.innerHeight;
      const viewportTop = 0;
      let boundaryTop = viewportTop;
      let boundaryBottom = viewportBottom;

      // Clamp against clipping/scrollable ancestors so the panel does not spill out.
      let parent = anchorRef.current.parentElement;
      while (parent) {
        const { overflowY } = window.getComputedStyle(parent);
        if (/(auto|scroll|overlay|hidden|clip)/.test(overflowY)) {
          const rect = parent.getBoundingClientRect();
          boundaryTop = Math.max(boundaryTop, rect.top);
          boundaryBottom = Math.min(boundaryBottom, rect.bottom);
        }
        parent = parent.parentElement;
      }

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const spaceBelow = boundaryBottom - anchorRect.bottom - PANEL_VIEWPORT_GUTTER_PX;
      const spaceAbove = anchorRect.top - boundaryTop - PANEL_VIEWPORT_GUTTER_PX;

      const shouldOpenUp =
        spaceBelow < PANEL_SWITCH_TO_TOP_THRESHOLD_PX && spaceAbove > spaceBelow;
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const boundedHeight = Math.max(
        0,
        Math.min(PANEL_MAX_HEIGHT_PX, Math.floor(availableSpace))
      );

      setPanelPlacement(shouldOpenUp ? "top" : "bottom");
      setPanelMaxHeight(boundedHeight);
    }, [anchorRef]);

    useEffect(() => {
      if (!visible) return;

      const handleReposition = () => updatePanelGeometry();
      handleReposition();

      window.addEventListener("resize", handleReposition);
      window.addEventListener("scroll", handleReposition, true);
      window.visualViewport?.addEventListener("resize", handleReposition);
      window.visualViewport?.addEventListener("scroll", handleReposition);

      return () => {
        window.removeEventListener("resize", handleReposition);
        window.removeEventListener("scroll", handleReposition, true);
        window.visualViewport?.removeEventListener("resize", handleReposition);
        window.visualViewport?.removeEventListener("scroll", handleReposition);
      };
    }, [visible, updatePanelGeometry]);

    /* ---- fetch API suggestions ---- */
    const fetchSuggestions = useCallback(async (q: string) => {
      if (q.length < MIN_QUERY_LENGTH) {
        setItems([]);
        return;
      }
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/search/suggest?q=${encodeURIComponent(q)}&limit=8`,
          { signal: abortRef.current.signal }
        );
        const payload = await res.json();
        if (!res.ok) throw new Error(extractClientErrorMessage(payload, "Suggest failed"));
        const data = unwrapClientResponse<SuggestResponsePayload>(payload);
        hasUsedArrowKeysRef.current = false;

        const querySuggestions: string[] = data.querySuggestions ?? [];
        const agentSuggestions: SuggestionAgent[] = data.agentSuggestions ?? [];
        const merged: SuggestionItem[] = [
          ...querySuggestions.map(
            (text: string) => ({ type: "query" as const, text })
          ),
          ...agentSuggestions.map(
            (agent: SuggestionAgent) => ({ type: "agent" as const, agent })
          ),
        ];
        setItems(merged);
        setHighlightedIndex(0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, []);

    /* ---- fetch trending + recent for empty query ---- */
    const fetchEmptyState = useCallback(async () => {
      const recent = getRecentSearches(5);
      const recentItems: SuggestionItem[] = recent.map((text) => ({
        type: "recent" as const,
        text,
      }));

      setItems(recentItems);
      setHighlightedIndex(0);

      try {
        const res = await fetch("/api/v1/search/trending");
        const payload = await res.json();
        if (!res.ok) return;
        const data = unwrapClientResponse<TrendingResponsePayload>(payload);

        const trending: string[] = data.trending ?? [];
        const recentSet = new Set(recent.map((s) => s.toLowerCase()));
        const trendingItems: SuggestionItem[] = trending
          .filter((t) => !recentSet.has(t.toLowerCase()))
          .slice(0, 5)
          .map((text) => ({ type: "trending" as const, text }));

        setItems([...recentItems, ...trendingItems]);
      } catch {
        // keep recent-only if trending fails
      }
    }, []);

    /* ---- react to query changes ---- */
    useEffect(() => {
      hasUsedArrowKeysRef.current = false;
      if (!visible) {
        setItems([]);
        setHighlightedIndex(0);
        return;
      }
      if (query.length < MIN_QUERY_LENGTH) {
        fetchEmptyState();
        return;
      }
      const t = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
      return () => clearTimeout(t);
    }, [query, visible, fetchSuggestions, fetchEmptyState]);

    /* ---- click outside ---- */
    useEffect(() => {
      if (!visible) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (
          anchorRef.current &&
          !anchorRef.current.contains(e.target as Node) &&
          listRef.current &&
          !listRef.current.contains(e.target as Node)
        ) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [visible, onClose, anchorRef]);

    /* ---- handle remove recent ---- */
    const handleRemoveRecent = useCallback(
      (e: React.MouseEvent, text: string) => {
        e.stopPropagation();
        e.preventDefault();
        removeRecentSearch(text);
        setItems((prev) => {
          const next = prev.filter(
            (item) => !(item.type === "recent" && item.text === text)
          );
          return next;
        });
      },
      []
    );

    if (!visible || (items.length === 0 && !loading)) return null;

    /* ---- group items by type for section headers ---- */
    const hasRecent = items.some((i) => i.type === "recent");
    const hasTrending = items.some((i) => i.type === "trending");
    const hasQuery = items.some((i) => i.type === "query");
    const hasAgent = items.some((i) => i.type === "agent");

    let flatIndex = 0;
    const sections: ReactNode[] = [];

    if (hasRecent) {
      sections.push(<SectionHeader key="sh-recent" label="Recent" />);
      for (const item of items) {
        if (item.type !== "recent") continue;
        const idx = flatIndex++;
        sections.push(
          <li key={`r-${idx}-${item.text}`} data-index={idx}>
            <button
              type="button"
              onClick={() => selectItem(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              data-index={idx}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] focus:outline-none focus:ring-0 text-[var(--text-primary)] group ${
                idx === highlightedIndex ? "bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <ClockIcon />
              <span className="truncate flex-1 font-medium">{item.text}</span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => handleRemoveRecent(e, item.text)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-opacity"
                aria-label={`Remove ${item.text} from recent`}
              >
                <RemoveIcon />
              </span>
            </button>
          </li>
        );
      }
    }

    if (hasTrending) {
      sections.push(<SectionHeader key="sh-trending" label="Trending" />);
      for (const item of items) {
        if (item.type !== "trending") continue;
        const idx = flatIndex++;
        sections.push(
          <li key={`t-${idx}-${item.text}`} data-index={idx}>
            <button
              type="button"
              onClick={() => selectItem(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              data-index={idx}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] focus:outline-none focus:ring-0 text-[var(--text-primary)] ${
                idx === highlightedIndex ? "bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <TrendingIcon />
              <span className="truncate font-medium">{item.text}</span>
            </button>
          </li>
        );
      }
    }

    if (hasQuery) {
      if (hasRecent || hasTrending) {
        sections.push(<SectionHeader key="sh-suggestions" label="Suggestions" />);
      }
      for (const item of items) {
        if (item.type !== "query") continue;
        const idx = flatIndex++;
        sections.push(
          <li key={`q-${idx}-${item.text}`} data-index={idx}>
            <button
              type="button"
              onClick={() => selectItem(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              data-index={idx}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] focus:outline-none focus:ring-0 text-[var(--text-primary)] ${
                idx === highlightedIndex ? "bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <MagnifierIcon />
              <span className="truncate">
                {highlightMatch(item.text, query)}
              </span>
            </button>
          </li>
        );
      }
    }

    if (hasAgent) {
      sections.push(<SectionHeader key="sh-agents" label="Agents" />);
      for (const item of items) {
        if (item.type !== "agent") continue;
        const idx = flatIndex++;
        sections.push(
          <li key={item.agent.id} data-index={idx}>
            <Link
              href={`/agent/${item.agent.slug}`}
              onClick={(e) => {
                e.preventDefault();
                selectItem(item);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              data-index={idx}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={`flex items-start gap-3 w-full px-4 py-2.5 hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] focus:outline-none focus:ring-0 text-[var(--text-primary)] ${
                idx === highlightedIndex ? "bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <span className="w-5 h-5 mt-0.5 flex-shrink-0 rounded-full bg-[var(--accent-heart)]/20 flex items-center justify-center text-[var(--accent-heart)] text-[10px] font-bold">
                A
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {highlightMatch(item.agent.name, query)}
                </span>
                {item.agent.description && (
                  <span className="block truncate text-xs text-[var(--text-tertiary)] mt-0.5">
                    {item.agent.description}
                  </span>
                )}
              </span>
              {item.agent.protocols.length > 0 && (
                <span className="flex gap-1 flex-shrink-0 mt-0.5">
                  {item.agent.protocols.slice(0, 2).map((p) => (
                    <span
                      key={p}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-neural)]/10 text-[var(--accent-neural)] font-medium"
                    >
                      {PROTOCOL_LABELS[p] ?? p}
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        );
      }
    }

    return (
      <div
        id={id}
        className={`left-0 right-0 z-50 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden overflow-y-auto overscroll-contain ${
          mobileInline
            ? `relative mt-2 sm:absolute sm:mt-0 ${panelPlacement === "top" ? "sm:bottom-full sm:mb-1" : "sm:top-full sm:mt-1"}`
            : `absolute ${panelPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1"}`
        }`}
        style={{ maxHeight: `${panelMaxHeight}px` }}
        role="listbox"
        aria-expanded={visible}
        aria-label="Search suggestions"
      >
        <ul ref={listRef} className="py-1">
          {loading ? (
            <li className="px-4 py-6 text-center text-[var(--text-tertiary)] text-sm">
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
              <span className="ml-2">Searching...</span>
            </li>
          ) : sections.length === 0 ? (
            <li className="px-4 py-6 text-center text-[var(--text-tertiary)] text-sm">
              No suggestions. Try different search terms.
            </li>
          ) : (
            sections
          )}
        </ul>
      </div>
    );
  }
);



