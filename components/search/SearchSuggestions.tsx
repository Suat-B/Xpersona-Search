"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import Link from "next/link";
import { ProtocolBadge } from "./ProtocolBadge";

export interface SuggestionAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  protocols: string[];
}

interface Props {
  query: string;
  onSelect: (agent: SuggestionAgent) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  loading?: boolean;
  /** Optional id for aria-controls. Defaults to "agent-suggestions". */
  id?: string;
}

export interface SearchSuggestionsHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export const SearchSuggestions = forwardRef<SearchSuggestionsHandle, Props>(function SearchSuggestions(
  { query, onSelect, onClose, anchorRef, visible, id = "agent-suggestions" },
  ref
) {
  const [suggestions, setSuggestions] = useState<SuggestionAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** True only after user has pressed ArrowDown/ArrowUp. Enter selects suggestion only when this is true. */
  const hasUsedArrowKeysRef = useRef(false);

  const select = useCallback(
    (agent: SuggestionAgent) => {
      onSelect(agent);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          hasUsedArrowKeysRef.current = true;
          setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          hasUsedArrowKeysRef.current = true;
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          if (hasUsedArrowKeysRef.current) {
            e.preventDefault();
            if (suggestions[highlightedIndex]) select(suggestions[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, suggestions, highlightedIndex, select, onClose]
  );

  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search/suggest?q=${encodeURIComponent(q)}&limit=8`,
        { signal: abortRef.current.signal }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Suggest failed");
      hasUsedArrowKeysRef.current = false;
      setSuggestions(data.suggestions ?? []);
      setHighlightedIndex(0);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || query.length < MIN_QUERY_LENGTH) {
      hasUsedArrowKeysRef.current = false;
      setSuggestions([]);
      setHighlightedIndex(0);
      return;
    }
    const t = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, visible, fetchSuggestions]);

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

  if (!visible || (query.length < MIN_QUERY_LENGTH && !loading)) return null;

  return (
    <div
      id={id}
      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden max-h-[min(320px,50vh)] overflow-y-auto"
      role="listbox"
      aria-expanded={visible}
      aria-label="Agent suggestions"
    >
      <ul ref={listRef} className="py-2">
        {loading ? (
          <li className="px-4 py-6 text-center text-[var(--text-tertiary)] text-sm">
            <span className="inline-block w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
            <span className="ml-2">Searching...</span>
          </li>
        ) : suggestions.length === 0 ? (
          <li className="px-4 py-6 text-center text-[var(--text-tertiary)] text-sm">
            No agents found. Try different search terms.
          </li>
        ) : (
          suggestions.map((agent, i) => (
            <li key={agent.id} data-index={i}>
              <Link
                href={`/agent/${agent.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  select(agent);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                data-index={i}
                role="option"
                aria-selected={i === highlightedIndex}
                className={`block px-4 py-3 hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] focus:outline-none focus:ring-0 ${
                  i === highlightedIndex ? "bg-[var(--bg-elevated)]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[var(--text-primary)] block truncate">
                      {agent.name}
                    </span>
                    {agent.description && (
                      <span className="text-sm text-[var(--text-tertiary)] line-clamp-2 mt-0.5 block">
                        {agent.description}
                      </span>
                    )}
                    {agent.protocols.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {agent.protocols.slice(0, 4).map((p) => (
                          <ProtocolBadge key={p} protocol={p} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
});
