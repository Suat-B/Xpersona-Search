"use client";

import { useState, useEffect } from "react";

/**
 * Renders children only after client mount. Use to avoid hydration mismatch
 * when the child tree depends on client-only state or browser APIs.
 * Server and first client render show the fallback so they match.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
