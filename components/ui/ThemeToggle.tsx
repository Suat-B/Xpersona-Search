"use client";

import { useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";

const SunIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const MonitorIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <line x1="8" x2="16" y1="21" y2="21" />
    <line x1="12" x2="12" y1="17" y2="21" />
  </svg>
);

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("system");
    } else {
      setTheme("dark");
    }
  };

  const getIcon = () => {
    if (theme === "system") {
      return <MonitorIcon className="w-5 h-5" />;
    }
    if (resolvedTheme === "light") {
      return <SunIcon className="w-5 h-5" />;
    }
    return <MoonIcon className="w-5 h-5" />;
  };

  const getLabel = () => {
    if (theme === "system") return "System";
    if (resolvedTheme === "light") return "Light";
    return "Dark";
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
      title={`Theme: ${getLabel()}`}
    >
      {getIcon()}
      <span className="hidden sm:inline">{getLabel()}</span>
    </button>
  );
}

export function ThemeToggleDropdown() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
      >
        {resolvedTheme === "light" ? (
          <SunIcon className="w-5 h-5" />
        ) : (
          <MoonIcon className="w-5 h-5" />
        )}
        <span className="hidden sm:inline capitalize">{theme}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50">
          <button
            onClick={() => {
              setTheme("light");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-[var(--bg-elevated)] transition-colors ${
              theme === "light" ? "text-[var(--accent-heart)]" : "text-[var(--text-primary)]"
            }`}
          >
            <SunIcon className="w-4 h-4" />
            Light
          </button>
          <button
            onClick={() => {
              setTheme("dark");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-[var(--bg-elevated)] transition-colors ${
              theme === "dark" ? "text-[var(--accent-heart)]" : "text-[var(--text-primary)]"
            }`}
          >
            <MoonIcon className="w-4 h-4" />
            Dark
          </button>
          <button
            onClick={() => {
              setTheme("system");
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-[var(--bg-elevated)] transition-colors ${
              theme === "system" ? "text-[var(--accent-heart)]" : "text-[var(--text-primary)]"
            }`}
          >
            <MonitorIcon className="w-4 h-4" />
            System
          </button>
        </div>
      )}
    </div>
  );
}


