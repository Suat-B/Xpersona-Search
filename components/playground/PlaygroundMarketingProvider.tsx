"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type PlaygroundPricingTier = "starter" | "builder" | "studio";
type PlaygroundBilling = "monthly" | "yearly";

type PlaygroundMarketingContextValue = {
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
  isCheckoutStarting: boolean;
  checkoutError: string | null;
  clearCheckoutError: () => void;
  startCheckout: (tier: PlaygroundPricingTier) => Promise<void>;
};

const PlaygroundMarketingContext = createContext<PlaygroundMarketingContextValue | null>(null);

export function firePlaygroundAnalyticsEvent(
  eventName: string,
  payload?: Record<string, string | number | boolean>,
) {
  if (typeof window === "undefined") return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) gtag("event", eventName, payload ?? {});
}

async function requestCheckoutLink({
  tier,
  billing,
  allowAuthRetry,
  onAuthRetryFailed,
}: {
  tier: PlaygroundPricingTier;
  billing: PlaygroundBilling;
  allowAuthRetry: boolean;
  onAuthRetryFailed: () => void;
}): Promise<string | null> {
  const res = await fetch("/api/v1/me/playground-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tier, billing }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { url?: string };
    message?: string;
  };

  if (res.status === 401 && allowAuthRetry) {
    const authRes = await fetch("/api/auth/play", { method: "POST", credentials: "include" });
    if (!authRes.ok) {
      onAuthRetryFailed();
      return null;
    }

    return requestCheckoutLink({
      tier,
      billing,
      allowAuthRetry: false,
      onAuthRetryFailed,
    });
  }

  if (!res.ok || !json.success || !json.data?.url) {
    throw new Error(json.message || "Could not start checkout. Please try again.");
  }

  return json.data.url;
}

function usePlaygroundMarketingState(): PlaygroundMarketingContextValue {
  const [isYearly, setIsYearly] = useState(false);
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const clearCheckoutError = useCallback(() => {
    setCheckoutError(null);
  }, []);

  const startCheckout = useCallback(
    async (tier: PlaygroundPricingTier) => {
      if (isCheckoutStarting) return;

      setIsCheckoutStarting(true);
      setCheckoutError(null);

      try {
        const url = await requestCheckoutLink({
          tier,
          billing: isYearly ? "yearly" : "monthly",
          allowAuthRetry: true,
          onAuthRetryFailed: () => {
            setCheckoutError("Sign in failed. Please try again.");
          },
        });

        if (!url) return;
        window.location.href = url;
      } catch {
        setCheckoutError("Could not start checkout. Please try again.");
      } finally {
        setIsCheckoutStarting(false);
      }
    },
    [isCheckoutStarting, isYearly],
  );

  return {
    isYearly,
    setIsYearly,
    isCheckoutStarting,
    checkoutError,
    clearCheckoutError,
    startCheckout,
  };
}

export function PlaygroundMarketingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = usePlaygroundMarketingState();

  return <PlaygroundMarketingContext.Provider value={value}>{children}</PlaygroundMarketingContext.Provider>;
}

export function usePlaygroundMarketing() {
  const context = useContext(PlaygroundMarketingContext);
  if (!context) {
    throw new Error("usePlaygroundMarketing must be used inside PlaygroundMarketingProvider");
  }
  return context;
}

export function useOptionalPlaygroundMarketing() {
  return useContext(PlaygroundMarketingContext);
}

export function useResolvedPlaygroundMarketing() {
  const context = useContext(PlaygroundMarketingContext);
  const fallback = usePlaygroundMarketingState();
  return context ?? fallback;
}
