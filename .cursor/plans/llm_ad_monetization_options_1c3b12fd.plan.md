---
name: LLM Ad Monetization Options
overview: A compliant monetization and stress-testing plan for LLM crawler traffic that avoids AdSense invalid-traffic risk and avoids any bypass/evasion tactics.
todos:
  - id: strategy-a-funnel-attribution
    content: "Strategy A: Keep bot-to-human referral attribution (middleware + GA4) and monitor conversion quality."
    status: completed
  - id: strategy-a-citations-and-llms
    content: "Strategy A: Maintain citation-ready page content plus llms.txt/llms-full sponsorship context."
    status: completed
  - id: strategy-b-internal-sponsored-path
    content: "Strategy B: Keep internal sponsored inventory for bot/stress paths with tracked impression/click endpoints."
    status: completed
  - id: strategy-b-stress-toggle
    content: "Strategy B: Add env-driven AdSense disable/stress mode switch (NEXT_PUBLIC_ADSENSE_ENABLED / NEXT_PUBLIC_AD_STRESS_MODE)."
    status: completed
  - id: strategy-b-load-harness
    content: "Strategy B: Add internal ads stress harness script for /api/v1/ad + impression/click endpoints."
    status: completed
  - id: strategy-c-direct-network-integration
    content: "Strategy C: Add direct server-side ad network adapters (Carbon/EthicalAds/BuySellAds) behind feature flags."
    status: pending
  - id: strategy-d-risk-controls
    content: "Strategy D: Add abuse controls for stress runs (rate caps, allowlist, environment isolation, dashboard alerts)."
    status: pending
isProject: false
---

# LLM Crawler Monetization: Compliant Plan

This plan intentionally excludes any ad-serving bypass/evasion techniques. The goal is to monetize and stress test safely using first-party inventory and standard analytics.

---

## Strategy A: Bot-to-Human Traffic Funnel (Low Risk)

**Concept:** Use crawler visibility to earn human referrals, then monetize humans with normal ad serving.

**Current status:**

- Bot detection + bot analytics are active in `middleware.ts` and `lib/server-analytics.ts`.
- `llms.txt`/`llms-full.txt` include machine-readable sponsor and product context.
- Agent pages and structured metadata are already tuned for machine consumption.

**Next actions:**

- Segment dashboards by `bot_name`, `page_type`, and `agent_slug`.
- Add weekly review of crawler-originated human sessions and bounce/engagement deltas.

**Revenue potential:** Medium, indirect, policy-safe.

---

## Strategy B: Internal Sponsored Inventory + Stress Mode (Low Risk)

**Concept:** Serve first-party sponsored placements on bot/stress paths and exercise the path with controlled load tests.

**Implemented in codebase:**

- Internal inventory and text-first sponsor content in `lib/ads/ad-inventory.ts` and `lib/ads/text-ad.ts`.
- Bot/stress rendering in `components/ads/BotAdBanner.tsx`, `components/ads/InlineBotAd.tsx`, and `components/ads/AgentPageAds.tsx`.
- Tracked endpoints:
  - `GET /api/v1/ad`
  - `GET /api/v1/ad/impression/{id}`
  - `GET /api/v1/ad/click/{id}`
- Runtime switches:
  - `NEXT_PUBLIC_ADSENSE_ENABLED=0` disables AdSense.
  - `NEXT_PUBLIC_AD_STRESS_MODE=1` forces internal ad rendering for all traffic.
- Load harness script: `npm run stress:ads:internal`.

**How to run stress testing safely:**

1. In staging, set `NEXT_PUBLIC_AD_STRESS_MODE=1` and optionally `NEXT_PUBLIC_ADSENSE_ENABLED=0`.
2. Run `npm run stress:ads:internal -- --base-url=http://localhost:3000 --requests=5000 --concurrency=50`.
3. Watch `/api/v1/ad/stats` and GA4/Vercel analytics for throughput and error rates.

**Revenue potential:** Low-medium direct revenue from sponsorship deals; strong observability for capacity planning.

---

## Strategy C: Direct Server-Side Ad Network Integrations (Medium Risk)

**Concept:** Add network adapters that explicitly support server-side/API delivery instead of JavaScript-only ad serving.

**Targets:**

- Carbon Ads
- EthicalAds
- BuySellAds
- Direct sponsor API/CRM feed

**Implementation notes:**

- Add adapter interface `lib/ads/server-ad-network.ts`.
- Keep feature flags per network and fallback to internal inventory.
- Preserve explicit sponsorship labels and tracked redirect endpoints.

---

## Strategy D: Risk Controls and Governance (Low Risk)

**Concept:** Keep stress tests and monetization experiments isolated and observable.

**Controls:**

- Run stress tests only on staging or approved test domains.
- Cap QPS and add alert thresholds for 4xx/5xx spikes.
- Require explicit env flags before internal-only ad mode can activate.
- Keep policy audit notes for ad-provider compliance reviews.

---

## Files to modify/create

- `lib/ads/adsense-config.ts` -- shared runtime toggles for AdSense vs internal inventory
- `app/layout.tsx` -- avoid loading Google ad scripts in stress/internal-only mode
- `components/ads/AdUnit.tsx` -- null-render when AdSense is disabled
- `components/ads/BotAdBanner.tsx` -- internal inventory for bot/stress mode
- `components/ads/InlineBotAd.tsx` -- internal inventory for bot/stress mode
- `components/ads/AgentPageAds.tsx` -- internal inventory for bot/stress mode
- `.env.example` -- `NEXT_PUBLIC_ADSENSE_ENABLED` and `NEXT_PUBLIC_AD_STRESS_MODE`
- `scripts/stress-internal-ads.mjs` -- configurable load generator for internal ad endpoints
