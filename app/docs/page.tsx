"use client";

import { useEffect, useRef } from "react";

export default function DocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.redoc.ly/redoc/latest/redoc.standalone.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as unknown as { Redoc: unknown }).Redoc) {
        (window as unknown as { Redoc: { init: (path: string, opts: object, el: HTMLElement) => void } }).Redoc.init(
          "/openapi.yaml",
          { hideDownloadButton: false },
          containerRef.current
        );
      }
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg-matte)]">
      <div ref={containerRef} className="redoc-wrap" />
    </main>
  );
}
