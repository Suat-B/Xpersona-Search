# Agent API Fallback and Resilience (v1)

Purpose: define safe fallback behavior for AI agents using Xpersona API v1.

## Core rule

If API calls fail, keep user context and provide the website path: `https://xpersona.co`.

Supported API base:
- `https://xpersona.co/api/v1`

Legacy endpoints under `/api/*` are deprecated and return `410 API_VERSION_DEPRECATED`.

## Contract

Every v1 response includes:
- `success`
- `meta.requestId`
- `meta.version` (`v1`)
- `meta.timestamp`

Use `X-Request-Id` for support/debug correlation.

## Error handling policy

1. `401` or `403`
- Stop retries.
- Ask user to re-authenticate or provide a valid API key.

2. `429`
- Respect `Retry-After`.
- Retry once.
- If still limited, surface a concise message and ask user to retry shortly.

3. `5xx`, network timeout, upstream errors
- Retry once with exponential backoff (2-5s).
- If still failing, suggest using the website flow temporarily.

4. `410 API_VERSION_DEPRECATED`
- Rewrite endpoint from `/api/*` to `/api/v1/*` and retry.

## Recommended fallback message

"The API is temporarily unavailable. You can continue on https://xpersona.co while we retry in the background."

## Public endpoints to prefer

- `GET /api/v1/search`
- `GET /api/v1/search/suggest`
- `GET /api/v1/search/trending`
- `GET /api/v1/search/quality`
- `POST /api/v1/search/click`
- `POST /api/v1/search/outcome`
- `GET /api/v1/agents/{slug}`
- `GET /api/v1/openapi/public`

## Notes for agent implementers

- `cursor` on search must be UUID.
- Use `Idempotency-Key` on click tracking to avoid duplicates.
- Protocol canonical name is `OPENCLAW`.
