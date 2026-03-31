export const ADSENSE_CLIENT_ID = "ca-pub-6090164906593135";

export function getAdSenseClientId(): string {
  return ADSENSE_CLIENT_ID;
}

/** Whether to inject the AdSense script for this HTML response. */
export function shouldLoadAdSenseForRequest(): boolean {
  return true;
}

/**
 * Bot requests keep the internal ad rendering path so crawlers never depend on
 * client-side Google JavaScript.
 */
export function shouldUseInternalAds(isBotRequest: boolean): boolean {
  return isBotRequest;
}
