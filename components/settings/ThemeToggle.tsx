"use client";

import { useState, useEffect } from "react";

const THEME_KEY = "theme";
type ThemeValue = "dark" | "light" | "system";

function applyTheme(value: ThemeValue) {
  const effective = value === "system"
    ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : value;
  document.documentElement.setAttribute("data-theme", effective);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeValue>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemeValue) || "dark";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      const stored = (localStorage.getItem(THEME_KEY) as ThemeValue) || "dark";
      if (stored === "system") applyTheme("system");
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const handleChange = (value: ThemeValue) => {
    setTheme(value);
    localStorage.setItem(THEME_KEY, value);
    applyTheme(value);
  };

  return (
    <div className="flex gap-2">
      {(["dark", "light", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => handleChange(t)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            theme === t
              ? "bg-[var(--accent-heart)] text-white"
              : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
          }`}
        >
          {t === "system" ? "System" : t === "dark" ? "Dark" : "Light"}
        </button>
      ))}
    </div>
  );
}
