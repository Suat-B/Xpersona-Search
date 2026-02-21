/**
 * ANS analytics — events for search/claim flow.
 * Per XPERSONA ANS.MD launch metrics.
 * Swap implementation for PostHog, Vercel Analytics, etc.
 */

export type ANSResultState = "available" | "taken" | "invalid" | "error";

export function trackANSSearchSubmitted(name: string): void {
  if (typeof window !== "undefined") {
    // Ready for analytics provider integration
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
      "event",
      "ans_search_submitted",
      { search_term: name }
    );
  }
}

export function trackANSResultState(state: ANSResultState, name?: string): void {
  if (typeof window !== "undefined") {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
      "event",
      "ans_result_state",
      { state, name }
    );
  }
}

export function trackANSClaimClicked(fullDomain: string): void {
  if (typeof window !== "undefined") {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
      "event",
      "ans_claim_clicked",
      { domain: fullDomain }
    );
  }
}
