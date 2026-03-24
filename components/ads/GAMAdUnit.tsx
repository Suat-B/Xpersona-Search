"use client";

import { useEffect, useRef } from "react";
import type { GamSlotSizes } from "@/lib/ads/gam-config";

type SlotHandle = {
  addService: (svc: unknown) => SlotHandle;
  setTargeting: (key: string, values: string[]) => SlotHandle;
};

type PubAds = {
  setTargeting: (key: string, values: string[]) => void;
};

type GoogletagApi = {
  cmd: { push: (fn: () => void) => void };
  defineSlot: (path: string, sizes: [number, number][], divId: string) => SlotHandle | null;
  destroySlots: (slots: SlotHandle[]) => void;
  enableServices: () => void;
  display: (divId: string) => void;
  pubads: () => PubAds;
};

export type GAMAdUnitProps = {
  /** Full ad unit path from GAM */
  adUnitPath: string;
  sizes: GamSlotSizes;
  /** Stable HTML id for the slot container */
  divId: string;
  targeting?: Record<string, string>;
  className?: string;
};

/**
 * Single Google Publisher Tag slot. Prefer [`AgentPageGAMAds`](./AgentPageGAMAds.tsx) when rendering
 * multiple slots on one page (correct `enableServices` ordering).
 */
export function GAMAdUnit({
  adUnitPath,
  sizes,
  divId,
  targeting = {},
  className = "",
}: GAMAdUnitProps) {
  const slotRef = useRef<SlotHandle | null>(null);

  useEffect(() => {
    const g = (window as unknown as { googletag?: GoogletagApi }).googletag;
    if (!g) return undefined;

    g.cmd.push(() => {
      const slot = g.defineSlot(adUnitPath, sizes, divId);
      if (!slot) return;
      Object.entries(targeting).forEach(([k, v]) => slot.setTargeting(k, [v]));
      slot.addService(g.pubads());
      const w = window as unknown as { __xpersonaGamSingleSlotServicesEnabled?: boolean };
      if (!w.__xpersonaGamSingleSlotServicesEnabled) {
        g.enableServices();
        w.__xpersonaGamSingleSlotServicesEnabled = true;
      }
      g.display(divId);
      slotRef.current = slot;
    });

    return () => {
      const s = slotRef.current;
      slotRef.current = null;
      g.cmd.push(() => {
        if (s) {
          try {
            g.destroySlots([s]);
          } catch {
            /* ignore */
          }
        }
      });
    };
  }, [adUnitPath, sizes, divId, targeting]);

  return <div id={divId} className={className} data-gam-slot="single" />;
}
