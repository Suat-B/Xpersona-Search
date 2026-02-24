---
title: Xpersona API v1 Agent Guide
description: Agent-first API contract for search and ownership workflows.
base_url: https://xpersona.co
auth: Authorization Bearer <XPERSONA_API_KEY>
version: v1
---

# Xpersona API v1

Base URL: `https://xpersona.co`

All supported endpoints are under `/api/v1/*`.
Legacy `/api/*` endpoints return `410 API_VERSION_DEPRECATED` with migration details.

## Contract

Every response uses a unified envelope.

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "version": "v1",
    "timestamp": "2026-02-24T00:00:00.000Z"
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "...",
    "details": {}
  },
  "meta": {
    "requestId": "...",
    "version": "v1",
    "timestamp": "2026-02-24T00:00:00.000Z"
  }
}
```

Response headers:
- `X-Request-Id`
- `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `Retry-After` (when applicable)

## Search API (Public)

- `GET /api/v1/search`
- `GET /api/v1/search/suggest`
- `GET /api/v1/search/trending`
- `POST /api/v1/search/click`
- `GET /api/v1/agents/{slug}`

Examples:

```bash
curl "https://xpersona.co/api/v1/search?q=code+review+agent&protocols=MCP,OPENCLAW&limit=10"
```

```bash
curl "https://xpersona.co/api/v1/search/suggest?q=trad&limit=8"
```

```bash
curl "https://xpersona.co/api/v1/search/trending"
```

```bash
curl -X POST "https://xpersona.co/api/v1/search/click" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: click-123" \
  -d '{"query":"code review agent","agentId":"550e8400-e29b-41d4-a716-446655440000","position":0}'
```

Notes:
- `cursor` must be a UUID or returns `400`.
- Protocol naming is canonicalized as `OPENCLAW` in API responses.
- `fields=compact` can be used on search for smaller agent payloads.

## Ownership / Claim API (Authenticated)

- `POST /api/v1/agents/{slug}/claim`
- `GET /api/v1/agents/{slug}/claim`
- `POST /api/v1/agents/{slug}/claim/verify`
- `GET/POST /api/v1/agents/{slug}/manage`
- `GET/POST /api/v1/agents/{slug}/customization`
- `POST /api/v1/agents/{slug}/customization/preview`

Claim initiation now returns the real `claimId` from the claim row.

## Specs

- Public OpenAPI JSON: `GET /api/v1/openapi/public`
- Internal OpenAPI JSON: `GET /api/v1/openapi/internal` (internal auth)
- Human docs: `https://xpersona.co/docs`

## Auth model

- Programmatic/agent endpoints: Bearer API key first.
- Browser UX auth endpoints: session/cookie first.
- Do not mix implicit auth modes in one integration flow.
