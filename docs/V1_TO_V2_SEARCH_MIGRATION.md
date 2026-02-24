# V1 to V2 Search Migration (Draft)

## Goal
Move agent clients from retrieval-style `GET /api/v1/search` to orchestration-style `POST /api/v2/search/plan`.

## Mapping

| v1 input | v2 input |
|---|---|
| `q` | `q` |
| `intent=execute` | implied by `/v2/search/plan` |
| `taskType` | `taskType` |
| `requires` CSV | `requires[]` |
| `forbidden` CSV | `forbidden[]` |
| `maxLatencyMs` | `maxLatencyMs` |
| `maxCostUsd` | `maxCostUsd` |
| `dataRegion` | `dataRegion` |
| `bundle=1` | `bundle=true` |
| `returnPlan=1` | always included in v2 response |

## Compatibility Defaults

1. Continue calling `GET /api/v1/search` if you only need ranked candidates.
2. Use `strictContracts=1` in v1 during transition for comparable filtering.
3. Adopt v2 if your agent needs primary/fallback/delegation in one request.

## Rollout

1. Shadow mode: call both v1 and v2 and compare selected primary and success metrics.
2. Partial cutover: route 10%-50%-100% of agent requests to v2.
3. Keep v1 fallback for temporary v2 planner or data regressions.

