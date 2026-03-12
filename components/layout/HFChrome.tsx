"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { TopNavHF } from "@/components/nav/TopNavHF";
import { PlaygroundMarketingProvider } from "@/components/playground/PlaygroundMarketingProvider";

interface HFChromeProps {
  isAuthenticated: boolean;
  children: React.ReactNode;
}

export function HFChrome({ isAuthenticated, children }: HFChromeProps) {
  const pathname = usePathname();
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
  const isPlaygroundRoute = pathname === "/playground" || pathname.startsWith("/playground/");

  if (isChatRoute) {
    return <div className="min-h-dvh">{children}</div>;
  }

  const shell = (
    <div className="min-h-dvh flex flex-col">
      <TopNavHF isAuthenticated={isAuthenticated} />
      <div
        className="flex-1 min-h-0"
        style={{ "--app-shell-height": "calc(100dvh - 4rem)" } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );

  if (isPlaygroundRoute) {
    return <PlaygroundMarketingProvider>{shell}</PlaygroundMarketingProvider>;
  }

  return shell;
}
