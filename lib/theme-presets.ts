/**
 * Home page accent theme presets for the theme picker.
 * Overrides --accent-heart and --accent-neural on document.documentElement.
 */

export type ThemePresetId = "blue" | "purple" | "teal" | "green" | "rose";

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  accentHeart: string;
  accentNeural: string;
  /** For theme-color meta / browser chrome */
  themeColor: string;
}

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  blue: {
    id: "blue",
    label: "Blue",
    accentHeart: "#0a84ff",
    accentNeural: "#5e5ce6",
    themeColor: "#000000",
  },
  purple: {
    id: "purple",
    label: "Purple",
    accentHeart: "#a855f7",
    accentNeural: "#8b5cf6",
    themeColor: "#000000",
  },
  teal: {
    id: "teal",
    label: "Teal",
    accentHeart: "#14b8a6",
    accentNeural: "#06b6d4",
    themeColor: "#000000",
  },
  green: {
    id: "green",
    label: "Green",
    accentHeart: "#22c55e",
    accentNeural: "#10b981",
    themeColor: "#000000",
  },
  rose: {
    id: "rose",
    label: "Rose",
    accentHeart: "#f43f5e",
    accentNeural: "#ec4899",
    themeColor: "#000000",
  },
};

export const HOME_ACCENT_STORAGE_KEY = "xpersona-home-accent";

const STYLE_ID = "xpersona-home-accent-override";

export function applyPreset(presetId: ThemePresetId | null): void {
  if (typeof document === "undefined") return;

  let el = document.getElementById(STYLE_ID);
  if (!presetId || presetId === "blue") {
    if (el) el.remove();
    document.documentElement.style.removeProperty("--accent-heart");
    document.documentElement.style.removeProperty("--accent-neural");
    return;
  }

  const preset = THEME_PRESETS[presetId];
  if (!preset) return;

  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `:root{--accent-heart:${preset.accentHeart};--accent-neural:${preset.accentNeural}}`;
}
