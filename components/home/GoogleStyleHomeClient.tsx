"use client";

import dynamic from "next/dynamic";

const GoogleStyleHome = dynamic(
  () => import("./GoogleStyleHome").then((m) => m.GoogleStyleHome),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen min-h-dvh flex flex-col overflow-hidden bg-[var(--bg-deep)] animate-pulse">
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[var(--text-tertiary)] text-lg">Loading...</span>
        </div>
      </div>
    ),
  }
);

interface Props {
  isAuthenticated?: boolean;
  privacyUrl: string;
  termsUrl: string;
}

export function GoogleStyleHomeClient({ isAuthenticated, privacyUrl, termsUrl }: Props) {
  return (
    <GoogleStyleHome
      isAuthenticated={isAuthenticated}
      privacyUrl={privacyUrl}
      termsUrl={termsUrl}
    />
  );
}
