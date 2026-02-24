"use client";

const SCROLL_KEY_PREFIX = "xpersona:scroll:";

function buildKey(path: string): string {
  return `${SCROLL_KEY_PREFIX}${path}`;
}

export function saveScrollPosition(path: string): void {
  if (typeof window === "undefined" || !path) return;
  try {
    window.sessionStorage.setItem(buildKey(path), String(window.scrollY));
  } catch {
    // ignore storage failures
  }
}

export function restoreScrollPosition(path: string): void {
  if (typeof window === "undefined" || !path) return;
  try {
    const key = buildKey(path);
    const value = window.sessionStorage.getItem(key);
    if (!value) return;
    window.sessionStorage.removeItem(key);
    const y = Number.parseInt(value, 10);
    if (!Number.isFinite(y) || y < 0) return;
    requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {
    // ignore storage failures
  }
}
