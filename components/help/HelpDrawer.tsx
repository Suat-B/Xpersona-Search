"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HELP_FLOW, type HelpChoice, type HelpStep } from "@/components/help/helpFlows";

const STORAGE_LAST_STEP = "xp_help_last_step";

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentAgentSlug?: string | null;
  onStepChange: (stepId: string) => void;
  stepId: string;
}

export function HelpDrawer({
  isOpen,
  onClose,
  currentAgentSlug,
  onStepChange,
  stepId,
}: HelpDrawerProps) {
  const router = useRouter();

  const step: HelpStep = useMemo(() => {
    if (stepId === HELP_FLOW.intro.id) return HELP_FLOW.intro;
    return HELP_FLOW.steps[stepId] ?? HELP_FLOW.intro;
  }, [stepId]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.setItem(STORAGE_LAST_STEP, step.id);
    } catch {
      // ignore storage errors
    }
  }, [isOpen, step.id]);

  const handleChoice = (choice: HelpChoice) => {
    if (choice.action === "RESET") {
      onStepChange(HELP_FLOW.intro.id);
      return;
    }

    if (choice.action === "NAVIGATE" && choice.payload) {
      onStepChange(choice.payload);
      return;
    }

    if (choice.action === "OPEN_SEARCH") {
      const q = choice.payload?.trim() || "agent";
      router.push(`/?q=${encodeURIComponent(q)}`);
      onClose();
      return;
    }

    if (choice.action === "OPEN_CONNECT_AI") {
      router.push("/dashboard/connect-ai");
      onClose();
      return;
    }

    if (choice.action === "OPEN_DOCS") {
      router.push("/docs");
      onClose();
      return;
    }

    if (choice.action === "OPEN_SEARCH_API") {
      router.push("/search-api");
      onClose();
      return;
    }

    if (choice.action === "OPEN_CLAIM") {
      if (currentAgentSlug) {
        router.push(`/agent/${currentAgentSlug}/claim`);
      } else {
        router.push("/?q=claim%20agent");
      }
      onClose();
      return;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Xpersona Help"
      onClick={(e) => e.currentTarget === e.target && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" aria-hidden />
      <div className="relative z-10 h-full w-full sm:max-w-[420px] bg-[var(--bg-deep)]/95 border-l border-white/[0.08] shadow-2xl animate-slide-in-from-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-tertiary)]">Help</p>
            <p className="text-lg font-semibold text-white">Xpersona Help</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/[0.15] px-3 py-1.5 text-xs text-white/80 hover:text-white hover:border-white/30 transition"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-6 h-[calc(100dvh-76px)] overflow-y-auto">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_0_24px_rgba(0,0,0,0.25)]">
            <p className="text-sm text-white/80 mb-2">Message</p>
            <p className="text-[var(--text-primary)] leading-relaxed">{step.text}</p>
          </div>

          <div className="flex flex-col gap-2">
            {step.choices.map((choice) => (
              <button
                key={choice.label}
                onClick={() => handleChoice(choice)}
                className="w-full text-left rounded-xl border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.12] transition px-4 py-3 text-sm text-white"
              >
                {choice.label}
              </button>
            ))}
          </div>

          <div className="mt-auto text-xs text-white/50 leading-relaxed">
            Pure love mode: I only use Xpersona navigation. No external actions, no surprises.
          </div>
        </div>
      </div>
    </div>
  );
}
