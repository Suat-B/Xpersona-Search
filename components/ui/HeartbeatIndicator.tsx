"use client";

import { cn } from "@/lib/utils";

interface HeartbeatIndicatorProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Proof-of-life heartbeat indicator for "AI connected" state.
 * Lub-dub double-beat animation in success green.
 */
export function HeartbeatIndicator({ className, size = "sm" }: HeartbeatIndicatorProps) {
  const sizeClasses = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  return (
    <span
      className={cn(
        "inline-block rounded-full bg-[#30d158]",
        "shadow-[0_0_6px_rgba(48,209,88,0.6)]",
        "animate-heartbeat",
        sizeClasses,
        className
      )}
      aria-hidden="true"
      title="AI connected"
    />
  );
}
