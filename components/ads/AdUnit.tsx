"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_DEFAULT_SLOT, getAdSenseClientId } from "@/lib/ads/adsense-config";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export type AdUnitFormat = "auto" | "fluid" | "rectangle" | "vertical" | "horizontal";

export type AdUnitProps = {
  /** AdSense ad slot id (numeric string from AdSense UI). Defaults to 1601285143. */
  slot?: string;
  format?: AdUnitFormat;
  className?: string;
  style?: React.CSSProperties;
  fullWidthResponsive?: boolean;
};

const DEFAULT_CLIENT = "ca-pub-6090164906593135";
export const DEFAULT_AD_SLOT = ADSENSE_DEFAULT_SLOT;

export function AdUnit({
  slot = DEFAULT_AD_SLOT,
  format = "auto",
  className = "",
  style,
  fullWidthResponsive = true,
}: AdUnitProps) {
  const client = getAdSenseClientId() || DEFAULT_CLIENT;
  const adRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tryRenderAd = () => {
      if (cancelled) return;

      const node = adRef.current;
      if (!node) return;

      const adStatus =
        node.getAttribute("data-ad-status") ||
        node.getAttribute("data-adsbygoogle-status");
      if (adStatus) return;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        attempts += 1;
        if (attempts < 6) {
          timer = setTimeout(tryRenderAd, 1500);
        }
      }
    };

    timer = setTimeout(tryRenderAd, 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, slot, format, fullWidthResponsive]);

  if (!slot.trim()) return null;

  return (
    <div className={`ad-slot-host w-full ${className}`.trim()}>
      <ins
        ref={adRef}
        className="adsbygoogle block w-full min-h-0 bg-transparent"
        style={{ display: "block", ...style }}
        data-ad-client={client}
        data-ad-slot={slot.trim()}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
}
