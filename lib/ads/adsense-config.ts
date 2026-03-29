export const ADSENSE_CLIENT_ID = "ca-pub-6090164906593135";

export function getAdSenseClientId(): string {
  return ADSENSE_CLIENT_ID;
}

/**
 * Auto Ads only needs the AdSense script on human page loads.
 * Crawlers continue to use our internal fallback inventory.
 */
export function shouldLoadAdSenseForRequest(isBotRequest: boolean): boolean {
  return !isBotRequest;
}

/**
 * Bot requests keep the internal ad rendering path so crawlers never depend on
 * client-side Google JavaScript.
 */
export function shouldUseInternalAds(isBotRequest: boolean): boolean {
  return isBotRequest;
}
