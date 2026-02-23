const STORAGE_KEY = "xp_recent_searches";
const MAX_ENTRIES = 20;
const MAX_DISPLAY = 8;

function readAll(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeAll(entries: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // quota exceeded or private browsing
  }
}

export function getRecentSearches(limit = MAX_DISPLAY): string[] {
  return readAll().slice(0, limit);
}

export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const current = readAll().filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  current.unshift(trimmed);
  writeAll(current);
}

export function removeRecentSearch(query: string): void {
  const current = readAll().filter((s) => s.toLowerCase() !== query.toLowerCase());
  writeAll(current);
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
