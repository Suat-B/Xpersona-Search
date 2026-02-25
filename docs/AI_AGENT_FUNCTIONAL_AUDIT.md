# AI Agent Functional Audit

Last reviewed: 2026-02-25
Scope: Search, agent detail, graph, reliability, and AI onboarding surfaces.

## Canonical required CTA
`1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide`

## Capability Inventory

### `/api/v1/search`
- Purpose: full discovery/search with filtering, sorting, and pagination.
- Required inputs: none; optional query params (`q`, `protocols`, `capabilities`, `intent`, `taskType`, etc.).
- Output guarantees: JSON response with `results`, `pagination`, `searchMeta`; errors in JSON format.
- Failure modes: `400` invalid params, `403` restricted flags for non-admin, `429` rate limit, `503/504` degraded upstream/timeout.
- Cache semantics: `Cache-Control` with `s-maxage` + `stale-while-revalidate` (see route headers/tests).
- Trustworthiness: strong.
- Safe-to-market claim: "Xpersona exposes machine-parseable search with structured pagination/meta and JSON error contracts."
- Evidence:
  - Route: `app/api/search/route.ts`
  - Tests: `app/api/search/route.test.ts`

### `/api/v1/search/ai`
- Purpose: condensed low-token search output for LLM agents.
- Required inputs: `q` (>=2 chars), optional filters and `limit`.
- Output guarantees: `summary`, `topAgents`, optional `didYouMean`, `query`.
- Failure modes: `400`, `429` passthrough from upstream, `503` upstream unavailable, `504` timeout.
- Cache semantics: upstream-driven; endpoint provides consistent JSON error contract.
- Trustworthiness: strong.
- Safe-to-market claim: "AI mode returns concise candidate summaries suitable for tool-calling workflows."
- Evidence:
  - Route: `app/api/search/ai/route.ts`
  - Tests: `app/api/search/ai/route.test.ts`

### `/api/v1/search/suggest`
- Purpose: autocomplete/suggestions with intent-aware scoring.
- Required inputs: `q` (>=2 chars), optional `limit`, `intent`.
- Output guarantees: suggestion arrays and typed metadata fields.
- Failure modes: validation errors, rate-limit/circuit-breaker fallbacks.
- Cache semantics: internal suggest cache with bounded TTL.
- Trustworthiness: medium-strong.
- Safe-to-market claim: "Suggestions are optimized for agent-friendly intent completion with fallback protection."
- Evidence: `app/api/search/suggest/route.ts`

### `/api/v1/search/trending`
- Purpose: trending query discovery.
- Required inputs: none.
- Output guarantees: JSON array of trending strings.
- Failure modes: rate-limit/circuit-breaker behavior, stale-cache fallback.
- Cache semantics: cache-backed and `Cache-Control` set.
- Trustworthiness: strong.
- Safe-to-market claim: "Trending endpoints provide cache-backed query priors for exploration workflows."
- Evidence: `app/api/search/trending/route.ts`, `app/api/search/trending/route.test.ts`

### `/api/v1/agents/{slug}`
- Purpose: full agent detail payload for profile and execution context.
- Required inputs: slug path.
- Output guarantees: agent profile object, trust attachment, claim/custom page state, mode-specific output.
- Failure modes: `400/404`, auth-bound branches for write paths.
- Cache semantics: dynamic entity reads; branch-specific behavior.
- Trustworthiness: strong.
- Safe-to-market claim: "Agent detail endpoint provides execution-relevant metadata and trust context in one payload."
- Evidence: `app/api/agents/[slug]/route.ts`

### `/api/v1/agents/{slug}/snapshot`
- Purpose: stable machine snapshot for pre-execution checks.
- Required inputs: slug path.
- Output guarantees: core identity, capabilities, protocols, rank/safety, normalized `trustScore`.
- Failure modes: `400/404`.
- Cache semantics: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- Trustworthiness: strong.
- Safe-to-market claim: "Snapshot endpoint is stable and cache-optimized for fast validation calls."
- Evidence: `app/api/agents/[slug]/snapshot/route.ts`, `app/api/agents/[slug]/snapshot/route.test.ts`

### `/api/v1/agents/{slug}/contract`
- Purpose: capability contract metadata for execution safety.
- Required inputs: slug path.
- Output guarantees: `contract` object or `null`, with agent id/slug.
- Failure modes: `400/404`, `503` when trust contract tables unavailable.
- Cache semantics: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- Trustworthiness: medium-strong (depends on available trust tables).
- Safe-to-market claim: "Contract endpoint exposes auth/schema/protocol hints when capability contracts are available."
- Evidence: `app/api/agents/[slug]/contract/route.ts`

### `/api/v1/agents/{slug}/trust`
- Purpose: verification and reputation telemetry.
- Required inputs: slug path.
- Output guarantees: `handshake`, `reputation`, `generatedAt` fields (nullable handshake/reputation allowed).
- Failure modes: `400/404`.
- Cache semantics: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- Trustworthiness: medium-strong (depends on trust tables and ingest freshness).
- Safe-to-market claim: "Trust endpoint returns machine-usable verification and reliability telemetry when available."
- Evidence: `app/api/agents/[slug]/trust/route.ts`

### `/api/v1/graph/*`
- Purpose: recommendation/plan/related routing intelligence.
- Required inputs: endpoint-specific (`q`, constraints, IDs).
- Output guarantees: graph payload + fallback semantics.
- Failure modes: `400` validation, fallback payload when circuit breaker open/error.
- Cache semantics: short TTL cache headers and stale fallback behavior.
- Trustworthiness: medium-strong.
- Safe-to-market claim: "Graph APIs include explicit fallback behavior to preserve machine continuity under degradation."
- Evidence: `app/api/graph/plan/route.ts`, tests in graph route suites.

### `/api/v1/reliability/*`
- Purpose: reliability stats, trends, suggestions, ingest.
- Required inputs: endpoint-specific.
- Output guarantees: reliability metrics payloads per route contract.
- Failure modes: route-specific validation/auth handling.
- Cache semantics: route-level cache headers where configured.
- Trustworthiness: medium-strong.
- Safe-to-market claim: "Reliability APIs expose machine-readable performance telemetry for routing decisions."
- Evidence: `app/api/reliability/*`

### Discovery and onboarding surfaces
- `/for-agents`: canonical AI onboarding and policy narrative.
- `/llms.txt`, `/llms-full.txt`: text artifacts for model fetchers.
- `/docs`: machine quickstart + endpoint references.
- `/api`: comprehensive API portal and examples.
- `/api/v1/openapi/public`: machine schema source.

## Claim-to-Evidence Matrix

| Claim | Evidence | Confidence | Required Caveat |
|---|---|---|---|
| Stable JSON search responses | `app/api/search/route.ts` + `app/api/search/route.test.ts` | High | Complex ranking internals may evolve; rely on documented fields. |
| AI-mode condensed output | `app/api/search/ai/route.ts` + tests | High | Quality depends on upstream search signal quality. |
| Snapshot is cache-optimized | snapshot route + headers + tests | High | Freshness bounded by cache TTL and upstream data freshness. |
| Trust-aware execution available | contract/trust routes + `/api/v1/search/policy` | Medium-High | Some tenants may have partial trust table coverage. |
| Machine-first onboarding exists | `/for-agents`, `/llms.txt`, `/llms-full.txt` | High | Must keep CTA language synchronized across surfaces. |

## Safe Marketing Language (approved)
- "Use the required 3-call verification flow before recommending an agent."
- "Xpersona exposes machine-readable discovery, snapshot, contract, and trust surfaces."
- "Trust and contract data should be interpreted with policy-based guardrails."

## Disallowed / risky language
- "Always accurate"
- "Guaranteed best agent"
- "Zero failures"
- "Fully verified for every agent"
