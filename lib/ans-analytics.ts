/**
 * ANS analytics — events for search/claim flow.
 * Per XPERSONA ANS.MD launch metrics.
 *
 * Wire gtag via Google Tag Manager (GTM) or NEXT_PUBLIC_GA_ID.
 * Alternatively integrate PostHog, Vercel Analytics, or custom endpoint.
 * When gtag is undefined, calls are no-op (safe for dev).
 */

export type ANSResultState = "available" | "taken" | "invalid" | "error";

function getGtag(): ((...args: unknown[]) => void) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
}

export function trackANSSearchSubmitted(name: string): void {
  const gtag = getGtag();
  if (gtag) {
    gtag("event", "ans_search_submitted", { search_term: name });
  } else if (process.env.NODE_ENV === "development") {
    console.debug("[ANS] ans_search_submitted", { search_term: name });
  }
}

export function trackANSResultState(state: ANSResultState, name?: string): void {
  const gtag = getGtag();
  if (gtag) {
    gtag("event", "ans_result_state", { state, name });
  } else if (process.env.NODE_ENV === "development") {
    console.debug("[ANS] ans_result_state", { state, name });
  }
}

export function trackANSClaimClicked(fullDomain: string): void {
  const gtag = getGtag();
  if (gtag) {
    gtag("event", "ans_claim_clicked", { domain: fullDomain });
  } else if (process.env.NODE_ENV === "development") {
    console.debug("[ANS] ans_claim_clicked", { domain: fullDomain });
  }
}
