# HuggingFace Router Implementation Summary (Audited)

Audit date: March 3, 2026

## Current Status

The core HF router is implemented and working:
- API key auth
- subscription gating
- 5-hour cycle + monthly total-token quota checks
- OpenAI-compatible chat route
- usage logging and aggregate counters
- usage API for end users and dashboard
- Stripe checkout + webhook sync for Playground subscriptions

## Verified Implemented

### Core HF Router
- `app/api/v1/hf/chat/completions/route.ts`
- `app/api/v1/hf/usage/route.ts`
- `lib/hf-router/rate-limit.ts`

### Data Model + Migration
- `lib/db/playground-schema.ts`
- `drizzle/0025_playground_hf_router.sql`

### Billing + Access Control
- `app/api/me/playground-checkout/route.ts` (+ v1 re-export)
- `app/api/stripe/webhook/route.ts` (+ v1 re-export)
- `app/api/me/playground-usage/route.ts` (+ v1 re-export)
- `lib/playground/auth.ts`
- `lib/playground/orchestration.ts` (`guardPlaygroundAccess`)

### Dashboard UX (already live)
- `app/(dashboard)/dashboard/playground/page.tsx`
  - Checkout actions wired to `/api/v1/me/playground-checkout`
  - Usage pull from `/api/v1/me/playground-usage`

## Plan Limits (Current Code)

Reset semantics:
- 5-hour UTC cycle windows for request + cycle-token budgets
- Monthly UTC calendar windows for monthly total-token budgets

Trial:
- Max requests/5h: `30`
- Context hard cap/request: `8192`
- Max input/request: `8192`
- Max output/request: `256`
- Max total tokens/5h: `120000`
- Max total tokens/month: `1500000`

Starter:
- Max requests/5h: `300`
- Context hard cap/request: `32768`
- Max input/request: `32768`
- Max output/request: `512`
- Max total tokens/5h: `600000`
- Max total tokens/month: `8000000`

Builder:
- Max requests/5h: `1000`
- Context hard cap/request: `32768`
- Max input/request: `32768`
- Max output/request: `512`
- Max total tokens/5h: `1800000`
- Max total tokens/month: `25000000`

Studio:
- Max requests/5h: `3000`
- Context hard cap/request: `32768`
- Max input/request: `32768`
- Max output/request: `512`
- Max total tokens/5h: `4500000`
- Max total tokens/month: `60000000`

Source: `PLAN_LIMITS` in `lib/hf-router/rate-limit.ts`.

## Environment Variables (Current)

HF token:
- `HF_ROUTER_TOKEN` (preferred)
- `HF_TOKEN` (fallback)
- `HUGGINGFACE_TOKEN` (fallback)

Playground pricing (Stripe):
- `STRIPE_PLAYGROUND_PRICE_ID_STARTER_MONTHLY`
- `STRIPE_PLAYGROUND_PRICE_ID_STARTER_YEARLY`
- `STRIPE_PLAYGROUND_PRICE_ID_BUILDER_MONTHLY`
- `STRIPE_PLAYGROUND_PRICE_ID_BUILDER_YEARLY`
- `STRIPE_PLAYGROUND_PRICE_ID_STUDIO_MONTHLY`
- `STRIPE_PLAYGROUND_PRICE_ID_STUDIO_YEARLY`
- `STRIPE_PLAYGROUND_PRICE_ID` (legacy fallback for builder monthly)

Feature flags:
- `PLAYGROUND_ENABLE_AGGRESSIVE_YOLO`
- `PLAYGROUND_ENABLE_LONG_CONTEXT`
- `PLAYGROUND_LONG_CONTEXT_MODEL`

## Gaps Still Missing (Priority)

### P0
- [ ] Add test coverage for HF router and limits.
  - Missing unit tests for `lib/hf-router/rate-limit.ts`
  - Missing integration tests for:
    - `/api/v1/hf/chat/completions`
    - `/api/v1/hf/usage`
    - subscription-required (`402`) and limit-reached (`429`) paths

### P1
- [ ] Add admin-level observability for HF router economics and abuse signals.
  - global request volume by day/week
  - trial vs starter/builder/studio consumption
  - error/rate-limit trends
  - top models and high-cost users

- [ ] Harden request validation on `/api/v1/hf/chat/completions`.
  - Add explicit schema validation (zod) for request body fields and bounds
  - Normalize unsupported params and fail with structured validation errors

- [ ] Improve token accounting precision.
  - Current accounting is heuristic (`chars / 4`)
  - Add provider/model-aware token counting where available

### P2
- [ ] Document and standardize reset semantics.
  - Quota reset currently uses UTC 5-hour boundaries
  - Add explicit docs in public API docs to avoid user confusion

- [ ] Revisit request payload logging policy.
  - `hf_usage_logs.request_payload` can be useful for debug, but may capture sensitive prompt content
  - Add retention policy + optional redaction toggle

## Important Tech Debt Found

- [ ] Resolve schema drift between:
  - `lib/db/playground-schema.ts` (HF router source of truth used by router code)
  - `lib/db/schema.ts` (duplicate table definitions)

Specifically, `hf_daily_usage.usageDate` differs in type across the two files (`date` vs `timestamp`), and index naming differs in places. This can cause confusion and future migration mistakes.

## Recommended Next Steps

1. Add tests first (P0), because billing and gating paths are high-risk regressions.
2. Add a small admin metrics endpoint/page for HF router visibility.
3. Remove or reconcile duplicate HF table definitions in `lib/db/schema.ts`.
4. Add request schema validation + payload redaction controls.

## Notes

- Stripe integration is already implemented (checkout + webhook + subscription sync). The previous summary section that marked Stripe as "still needed" was outdated.
- Dashboard usage UI and checkout wiring are already implemented and should no longer be listed as missing.

## Cost Controls

- "Unlimited context" is UX framing; enforced limits still cap per-request input tokens.
- Spend protection uses layered controls:
  - max input/request
  - max output/request
  - max total tokens/5h cycle
  - max total tokens/month
- Token accounting remains heuristic (`chars / 4`) and should be upgraded later for tighter cost prediction.
