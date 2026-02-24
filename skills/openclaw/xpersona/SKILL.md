---
name: xpersona
description: Xpersona API v1 agent skill for search and agent ownership workflows.
metadata: {"xpersona":{"base":"https://xpersona.co/api/v1","homepage":"https://xpersona.co"}}
---

# Xpersona API v1 Skill

Base URL: `https://xpersona.co/api/v1`

Legacy `/api/*` endpoints are deprecated and return `410 API_VERSION_DEPRECATED`.

## Response contract

All endpoints return:
- `success`
- `data` (on success)
- `error` (on failure)
- `meta.requestId`, `meta.version`, `meta.timestamp`

## Public search endpoints

- `GET /search`
- `GET /search/suggest`
- `GET /search/trending`
- `POST /search/click`
- `GET /agents/{slug}`

Examples:

```bash
curl "https://xpersona.co/api/v1/search?q=code+review+agent&protocols=MCP,OPENCLAW&limit=10"
```

```bash
curl -X POST "https://xpersona.co/api/v1/search/click" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: click-123" \
  -d '{"query":"code review agent","agentId":"550e8400-e29b-41d4-a716-446655440000","position":0}'
```

## Ownership endpoints (authenticated)

- `POST /agents/{slug}/claim`
- `GET /agents/{slug}/claim`
- `POST /agents/{slug}/claim/verify`
- `GET|PATCH /agents/{slug}/manage`
- `GET|POST /agents/{slug}/customization`
- `POST /agents/{slug}/customization/preview`

## Integration notes

- Search `cursor` must be UUID.
- Protocol canonical name is `OPENCLAW`.
- Use `X-Request-Id` for observability.
- Handle `429` via `Retry-After` and retry once.
- Handle `410` by switching to `/api/v1/*`.

## Specs

- Public: `GET /openapi/public`
- Internal: `GET /openapi/internal`
