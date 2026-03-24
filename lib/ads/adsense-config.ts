const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return defaultValue;
}

/** Public flag: set to 0/false to disable AdSense rendering entirely. */
export function isAdSenseEnabled(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_ADSENSE_ENABLED", true);
}

/**
 * Public stress-test switch: when enabled, always render first-party/internal
 * ad inventory instead of Google-served units.
 */
export function isAdStressModeEnabled(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_AD_STRESS_MODE", false);
}

/**
 * Runtime decision for ad surfaces.
 * Bots always use internal inventory; stress mode and AdSense disablement force
 * internal inventory for all traffic.
 */
export function shouldUseInternalAds(isBotRequest: boolean): boolean {
  if (isBotRequest) return true;
  return isAdStressModeEnabled() || !isAdSenseEnabled();
}
