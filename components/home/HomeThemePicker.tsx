"use client";

import { useEffect, useState, useCallback } from "react";
import { THEME_PRESETS, HOME_ACCENT_STORAGE_KEY, applyPreset, type ThemePresetId } from "@/lib/theme-presets";

export function HomeThemePicker() {
  const [activeId, setActiveId] = useState<ThemePresetId | null>(null);
  const [mounted, setMounted] = useState(false);

  const selectTheme = useCallback((id: ThemePresetId) => {
    setActiveId(id);
    applyPreset(id);
    try {
      localStorage.setItem(HOME_ACCENT_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const syncFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(HOME_ACCENT_STORAGE_KEY) as ThemePresetId | null;
      if (stored && stored in THEME_PRESETS) {
        setActiveId(stored);
        applyPreset(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    syncFromStorage();
  }, [syncFromStorage]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) syncFromStorage();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncFromStorage();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncFromStorage]);

  if (!mounted) return null;

  const handleSelect = (e: React.MouseEvent, id: ThemePresetId) => {
    e.preventDefault();
    e.stopPropagation();
    selectTheme(id);
  };

  return (
    <div
      className="flex items-center gap-2 shrink-0 relative z-[1]"
      role="group"
      aria-label="Accent color theme"
    >
      {(Object.keys(THEME_PRESETS) as ThemePresetId[]).map((id) => {
        const preset = THEME_PRESETS[id];
        const isActive = activeId === id || (activeId === null && id === "blue");
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => handleSelect(e, id)}
            aria-pressed={isActive}
            aria-label={`Use ${preset.label} accent`}
            className={`min-w-[36px] min-h-[36px] w-9 h-9 rounded-full border-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation ${
              isActive
                ? "scale-110 border-white shadow-lg shadow-black/30"
                : "border-white/20 hover:border-white/40 hover:scale-105 active:scale-95"
            }`}
            style={{ backgroundColor: preset.accentHeart }}
          />
        );
      })}
    </div>
  );
}
