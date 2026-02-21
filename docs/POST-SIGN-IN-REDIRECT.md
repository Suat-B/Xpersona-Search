# Post-Sign-In Redirect Specification

Aligned with **XPERSONA ANS.MD** Section 2.3: "De-emphasized links in footer/header allow access to existing Game and Trading surfaces."

## Redirect Logic

| Sign-in context | Default redirect |
|-----------------|-----------------|
| **Hub** (xpersona.co) | `/dashboard` (Game dashboard) |
| **Game** subdomain | `/dashboard` |
| **Trading** subdomain | `/trading` (marketplace as root) |
| **link=agent** or **link=guest** | `/dashboard/profile` (link flow) |
| **callbackUrl** provided & valid | Use it |

## Valid callbackUrl

- Must be a path (e.g. `/`, `/trading`, `/dashboard/api`)
- Must not point to auth routes: `/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth-error`

## Implementation

- **Utility:** `lib/post-sign-in-redirect.ts` — `getPostSignInRedirectPath(service, callbackUrl, link)`
- **Usage:** Sign-in and sign-up pages call this with service (from host), `callbackUrl` from query, and `link` from query.
- **Subdomain handling:** Middleware redirects `/dashboard` and `/games` from hub/trading to game subdomain; `/trading` from hub/game to trading subdomain. Path-based redirects suffice.
