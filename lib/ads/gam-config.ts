import { parseAgentDetailSlugFromPath } from "@/lib/agents/route-patterns";

/**
 * Google Ad Manager (GAM) configuration for /agent/* pages.
 *
 * Set NEXT_PUBLIC_GAM_NETWORK_CODE and at least one NEXT_PUBLIC_GAM_AD_UNIT_* path
 * after creating ad units in GAM. Paths are typically `/NETWORK_CODE/.../ad_unit_code`.
 *
 * Key-values (agent_slug, agent_category, page_type) must be defined in GAM UI
 * under Inventory > Key-values if you use targeting.
 */

/** GPT `defineSlot` size list: one or more [width, height] tuples. */
export type GamSlotSizes = [number, number][];

export type GamAgentSlotKey = "agent_top" | "agent_sidebar" | "agent_bottom";

export type GamAgentSlotDef = {
  key: GamAgentSlotKey;
  /** Full GAM ad unit path, e.g. `/12345678/xpersona/agent-page-top` */
  adUnitPath: string;
  sizes: GamSlotSizes;
  /** Div min-height hint for CLS */
  minHeightClass?: string;
};

function trimEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

/** Network code only (digits). */
export function getGamNetworkCode(): string {
  return trimEnv("NEXT_PUBLIC_GAM_NETWORK_CODE");
}

/** When true, agent pages prefer GAM slots over standalone AdSense. Opt-in only. */
export function isGamEnabledForAgentPages(): boolean {
  const v = trimEnv("NEXT_PUBLIC_GAM_AGENT_PAGES_ENABLED").toLowerCase();
  if (v !== "1" && v !== "true" && v !== "yes") return false;
  return getGamNetworkCode().length > 0 && getConfiguredAgentSlots().length > 0;
}

/**
 * Load `gpt.js` in the document only when GAM is active on agent pages.
 * Keeps AdSense-only deployments from downloading GPT until you enable GAM.
 */
export function shouldLoadPublisherTagScript(): boolean {
  return isGamEnabledForAgentPages();
}

/**
 * When GAM is on for agent pages, also render one normal AdSense AdUnit above the GAM stack.
 * Off by default; avoid stacking duplicate identical AdSense slots elsewhere on the same page.
 */
export function shouldShowAdSenseAlongsideGamOnAgentPages(): boolean {
  if (!isGamEnabledForAgentPages()) return false;
  const v = trimEnv("NEXT_PUBLIC_GAM_AGENT_PAGES_ADSENSE_ALSO").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function slot(
  key: GamAgentSlotKey,
  envKey: string,
  sizes: GamSlotSizes,
  minHeightClass?: string
): GamAgentSlotDef | null {
  const path = trimEnv(envKey);
  if (!path) return null;
  return { key, adUnitPath: path, sizes, minHeightClass };
}

/**
 * Configured agent-page slots (env-driven). Order = render order.
 */
export function getConfiguredAgentSlots(): GamAgentSlotDef[] {
  const slots: (GamAgentSlotDef | null)[] = [
    slot("agent_top", "NEXT_PUBLIC_GAM_AD_UNIT_AGENT_TOP", [[728, 90], [320, 50]], "min-h-[90px]"),
    slot("agent_sidebar", "NEXT_PUBLIC_GAM_AD_UNIT_AGENT_SIDEBAR", [[300, 250], [300, 600]], "min-h-[250px]"),
    slot("agent_bottom", "NEXT_PUBLIC_GAM_AD_UNIT_AGENT_BOTTOM", [[728, 90], [320, 50]], "min-h-[90px]"),
  ];
  return slots.filter((s): s is GamAgentSlotDef => s !== null);
}

export type AgentGamTargeting = {
  agentSlug: string;
  agentName?: string;
  agentCategory?: string;
};

/**
 * Key-values passed to GPT setTargeting for agent pages.
 */
export function buildAgentGamTargeting(input: AgentGamTargeting): Record<string, string> {
  const out: Record<string, string> = {
    agent_slug: input.agentSlug.slice(0, 100),
    page_type: "agent_profile",
  };
  if (input.agentCategory?.trim()) {
    out.agent_category = input.agentCategory.trim().slice(0, 100);
  }
  if (input.agentName?.trim()) {
    out.agent_name = input.agentName.trim().slice(0, 100);
  }
  return out;
}

export function getGamCreativeCacheTtlMs(): number {
  const raw = Number(process.env.GAM_CREATIVE_CACHE_TTL_MS?.trim());
  if (Number.isFinite(raw) && raw >= 10_000) return Math.min(raw, 86_400_000);
  return 300_000;
}

/** Parse /agent/{slug} for analytics / GAM dimensions. */
export function parseAgentSlugFromPath(pathname: string): string | null {
  return parseAgentDetailSlugFromPath(pathname);
}
