"use client";

import { useEffect, useRef } from "react";
import type { GamAgentSlotDef } from "@/lib/ads/gam-config";

type SlotHandle = {
  addService: (svc: unknown) => SlotHandle;
  setTargeting: (key: string, values: string[]) => SlotHandle;
};

type PubAds = {
  setTargeting: (key: string, values: string[]) => void;
  clearTargeting: () => void;
};

type GoogletagApi = {
  cmd: { push: (fn: () => void) => void };
  defineSlot: (path: string, sizes: [number, number][], divId: string) => SlotHandle | null;
  destroySlots: (slots: SlotHandle[]) => void;
  enableServices: () => void;
  display: (divId: string) => void;
  pubads: () => PubAds;
};

declare global {
  interface Window {
    googletag?: GoogletagApi;
  }
}

export type AgentPageGAMAdsProps = {
  slots: GamAgentSlotDef[];
  targeting: Record<string, string>;
  className?: string;
};

/**
 * Defines all agent-page GAM slots in a single GPT command so enableServices runs once per batch.
 */
export function AgentPageGAMAds({ slots, targeting, className = "" }: AgentPageGAMAdsProps) {
  const definedSlotsRef = useRef<SlotHandle[]>([]);

  useEffect(() => {
    if (slots.length === 0) return undefined;

    const g = window.googletag;
    if (!g) return undefined;

    g.cmd.push(() => {
      definedSlotsRef.current = [];
      const pubads = g.pubads();
      try {
        pubads.clearTargeting();
      } catch {
        /* ignore */
      }
      Object.entries(targeting).forEach(([key, value]) => {
        pubads.setTargeting(key, [value]);
      });

      for (const def of slots) {
        const divId = `xpersona-gam-${def.key}`;
        const slot = g.defineSlot(def.adUnitPath, def.sizes, divId);
        if (slot) {
          slot.addService(pubads);
          definedSlotsRef.current.push(slot);
        }
      }

      g.enableServices();
      for (const def of slots) {
        g.display(`xpersona-gam-${def.key}`);
      }
    });

    return () => {
      const toDestroy = definedSlotsRef.current;
      definedSlotsRef.current = [];
      g.cmd.push(() => {
        if (toDestroy.length > 0) {
          try {
            g.destroySlots(toDestroy);
          } catch {
            /* ignore */
          }
        }
      });
    };
  }, [slots, targeting]);

  if (slots.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {slots.map((def) => (
        <div
          key={def.key}
          id={`xpersona-gam-${def.key}`}
          className={`flex w-full justify-center ${def.minHeightClass ?? ""}`.trim()}
          data-gam-slot={def.key}
        />
      ))}
    </div>
  );
}
