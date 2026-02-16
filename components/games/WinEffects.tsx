"use client";

import { useEffect, useState } from "react";

interface WinEffectsProps {
  active: boolean;
  win: boolean;
  payout: number;
  betAmount: number;
}

export function WinEffects({ active, win }: WinEffectsProps) {
  const [showEffects, setShowEffects] = useState(false);

  useEffect(() => {
    if (active) {
      setShowEffects(true);
      const timer = setTimeout(() => setShowEffects(false), 600);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (!showEffects) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Brief screen-edge flash — professional quant feedback */}
      <div
        className={`absolute inset-0 rounded-none ${
          win ? "win-effects-border-win" : "win-effects-border-lose"
        }`}
        style={{ animationDuration: "0.4s" }}
      />
    </div>
  );
}
