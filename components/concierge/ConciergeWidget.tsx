"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ConciergeDrawer } from "@/components/concierge/ConciergeDrawer";
import { CONCIERGE_FLOW } from "@/components/concierge/conciergeFlows";

const STORAGE_DISMISSED = "xp_concierge_dismissed";
const STORAGE_LAST_STEP = "xp_concierge_last_step";

export function ConciergeWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [stepId, setStepId] = useState(CONCIERGE_FLOW.intro.id);

  const currentAgentSlug = useMemo(() => {
    if (!pathname?.startsWith("/agent/")) return null;
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    try {
      const storedDismissed = localStorage.getItem(STORAGE_DISMISSED);
      if (storedDismissed === "true") setDismissed(true);
      const storedStep = localStorage.getItem(STORAGE_LAST_STEP);
      if (storedStep) setStepId(storedStep);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setIsOpen(false);
    try {
      localStorage.setItem(STORAGE_DISMISSED, "true");
    } catch {
      // ignore storage errors
    }
  };

  if (dismissed) {
    return (
      <button
        onClick={() => {
          setDismissed(false);
          setIsOpen(true);
        }}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9997] rounded-full border border-white/20 bg-black/60 text-white/80 px-3 py-2 text-xs hover:text-white hover:border-white/40 transition safe-area-bottom"
      >
        Concierge
      </button>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9997] flex flex-col items-end gap-2 safe-area-bottom">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open concierge"
          className="relative group flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-white/[0.2] bg-white/[0.06] shadow-[0_0_24px_rgba(191,90,242,0.25)] hover:shadow-[0_0_32px_rgba(191,90,242,0.4)] transition concierge-bob"
        >
          <span className="absolute inset-0 rounded-full border border-[var(--accent-heart)]/50 concierge-pulse-ring" aria-hidden />
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-white/[0.25] bg-[var(--bg-deep)]">
            <Image
              src="/concierge/concierge.png"
              alt="Concierge avatar"
              fill
              sizes="64px"
              className="object-cover"
              priority
              onError={(e) => {
                const target = e.currentTarget;
                target.style.opacity = "0";
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70 bg-gradient-to-br from-white/5 to-white/15">
              XP
            </div>
          </div>
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-full border border-white/[0.15] bg-white/[0.06] px-3 py-1 text-xs text-white/80 hover:text-white hover:border-white/30 transition"
          >
            Open
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-full border border-white/[0.15] bg-white/[0.02] px-3 py-1 text-xs text-white/60 hover:text-white/80 hover:border-white/30 transition"
          >
            Hide
          </button>
        </div>
      </div>

      <ConciergeDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        currentAgentSlug={currentAgentSlug}
        stepId={stepId}
        onStepChange={setStepId}
      />
    </>
  );
}
