"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { buildUpgradeAuthUrl } from "@/lib/auth-flow";

interface UserAccountMenuProps {
  displayName: string;
  userEmail?: string | null;
  isPermanent: boolean;
  accountType?: string | null;
}

export function UserAccountMenu({
  displayName,
  userEmail = null,
  isPermanent,
  accountType = null,
}: UserAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();

  const callbackPath = `${pathname || "/dashboard"}${
    currentSearchParams?.toString() ? `?${currentSearchParams.toString()}` : ""
  }`;
  const createAccountHref = buildUpgradeAuthUrl("signup", accountType, callbackPath);
  const signInHref = buildUpgradeAuthUrl("signin", accountType, callbackPath);

  const close = useCallback(() => {
    setOpen(false);
    setRecoveryUrl(null);
    setRecoveryLoading(false);
    setCopied(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, close]);

  const copyRecoveryUrl = useCallback(async () => {
    if (!recoveryUrl) return;
    try {
      await navigator.clipboard.writeText(recoveryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  }, [recoveryUrl]);

  const fetchRecoveryLink = useCallback(async () => {
    setRecoveryLoading(true);
    setRecoveryUrl(null);
    try {
      const res = await fetch("/api/v1/me/recovery-link", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.url) {
        setRecoveryUrl(data.data.url);
      }
    } catch {
      // Silently fail
    } finally {
      setRecoveryLoading(false);
    }
  }, []);

  const triggerRect = triggerRef.current?.getBoundingClientRect();

  return (
    <>
      <div className="pt-2">
        <div className="flex items-center gap-2">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg px-1 py-0.5 -ml-1 font-semibold text-white hover:bg-white hover:text-black transition-colors"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Edit account"
          >
            <span>{displayName}</span>
            <svg
              className="w-3.5 h-3.5 text-white/70"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        </div>
        <p className="text-xs text-white/70 truncate mt-0.5">
          {userEmail ? `Free Plan - ${userEmail}` : "Free Plan"}
        </p>
      </div>

      {open &&
        typeof document !== "undefined" &&
        triggerRect &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-[9990] min-w-[220px] rounded-xl border border-white bg-black text-white shadow-xl py-2 animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: triggerRect.bottom + 8,
              left: triggerRect.left,
            }}
          >
            {recoveryLoading ? (
              <div className="px-4 py-3 flex items-center gap-2 text-sm text-white/70">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Generating recovery linkâ€¦
              </div>
            ) : recoveryUrl ? (
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] text-white/70">
                  Save this link. Expires in 7 days.
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-black border border-white px-3 py-2">
                  <span className="text-xs font-mono text-white truncate flex-1 min-w-0">
                    {recoveryUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyRecoveryUrl}
                    className="shrink-0 px-2 py-1 text-xs font-medium rounded bg-white text-black hover:bg-black hover:text-white border border-white transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            ) : isPermanent ? (
                <>
                  <Link
                    href="/dashboard/profile"
                    onClick={close}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Edit Profile
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    onClick={close}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={createAccountHref}
                    onClick={close}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Create permanent account
                  </Link>
                  <Link
                    href={signInHref}
                    onClick={close}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign in
                  </Link>
                  <button
                    type="button"
                    onClick={fetchRecoveryLink}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Get recovery link
                  </button>
                  <div className="my-1 border-t border-white" />
                  <Link
                    href="/dashboard/profile"
                    onClick={close}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:bg-white hover:text-black transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    View Profile
                  </Link>
                </>
              )}
          </div>,
          document.body
        )}
    </>
  );
}



