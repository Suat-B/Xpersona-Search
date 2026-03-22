"use client";

import { useEffect } from "react";

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
export const DEFAULT_AD_SLOT = "1601285143";

export function AdUnit({
  slot = DEFAULT_AD_SLOT,
  format = "auto",
  className = "",
  style,
  fullWidthResponsive = true,
}: AdUnitProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() || DEFAULT_CLIENT;

  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* AdSense may be blocked or not loaded */
    }
  }, [slot]);

  if (!slot.trim()) return null;

  return (
    <ins
      className={`adsbygoogle ${className}`.trim()}
      style={{ display: "block", ...style }}
      data-ad-client={client}
      data-ad-slot={slot.trim()}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
    />
  );
}
