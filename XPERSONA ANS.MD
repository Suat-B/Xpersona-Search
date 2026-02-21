# XPERSONA ANS — Single Source of Truth

**Agent Name Service for xpersona.co.** This document defines UX, logic, API contracts, and rollout constraints. All implementation must derive from this spec.

---

## 1. Product Vision

Xpersona ANS is the domain name system for AI agents. Users land on `xpersona.co`, search for a name like they would on Google, and immediately get availability + next steps.

**Core value:**
- Human-readable identity: `kimi.xpersona.agent` instead of UUIDs
- Agent Card hosting at `https://{name}.xpersona.agent/card.json`
- Cryptographic verification (ED25519)
- Works with OpenClaw, A2A, MCP, ANP

---

## 2. User Journeys

### 2.1 Primary Journey: Search → Claim

1. User arrives at `xpersona.co`
2. Sees one centered search input; types name (e.g. `kimi`)
3. Clicks Search or presses Enter
4. System returns one of: `available` | `taken` | `invalid` | `error`
5. **If available:** User sees CTA "Claim kimi.xpersona.agent"
6. User proceeds to registration (email, payment when enabled, verification steps)
7. User receives confirmation and verification instructions

### 2.2 Secondary Journey: Taken Domain Discovery

1. User searches; result is `taken`
2. UI shows alternatives: `{name}-agent`, `{name}-bot`, `my-{name}`
3. Optional: "View agent card" link if domain is discoverable (future)

### 2.3 Tertiary: Game/Trading Access

- De-emphasized links in footer/header allow access to existing Game and Trading surfaces
- No change to subdomain routing (`game.xpersona.co`, `trading.xpersona.co`)

---

## 3. UI States (Deterministic)

| State       | Trigger                      | UI Behavior |
|------------|------------------------------|-------------|
| `idle`     | Initial load, no search yet   | Centered input, placeholder "Search your .agent name" |
| `loading`  | Search submitted             | Disable input/button, show spinner |
| `available`| API returns `available`      | Green result card, CTA "Claim {name}.xpersona.agent" |
| `taken`    | API returns `taken`          | Red/neutral result card, alternatives list |
| `invalid`   | API returns `invalid`        | Inline error, reason + suggested correction |
| `error`    | Network/server failure       | Resilient message, "Try again" button |

**Copy style (non-negotiable):**
- Short, direct, lowercase for technical terms
- No marketing fluff in result states
- Example: "kimi.xpersona.agent is available" not "Congratulations! Your domain is ready!"

---

## 4. API Contract

### 4.1 GET `/api/ans/check?name={query}`

**Purpose:** Check domain availability and validity.

**Request:**
- `name` (required): Raw query string. Server normalizes.

**Response schema (success):**
```json
{
  "success": true,
  "state": "available" | "taken" | "invalid",
  "name": "kimi",
  "fullDomain": "kimi.xpersona.agent",
  "suggestions": ["kimi-agent", "kimi-bot"],
  "error": null,
  "code": null
}
```

**Response (invalid):**
```json
{
  "success": true,
  "state": "invalid",
  "name": null,
  "fullDomain": null,
  "suggestions": ["kimi"],
  "error": "Domain name must be between 3 and 63 characters",
  "code": "INVALID_LENGTH"
}
```

**Response (error):**
```json
{
  "success": false,
  "state": "error",
  "error": "Service temporarily unavailable",
  "code": "INTERNAL_ERROR"
}
```

**Cache:** `Cache-Control: public, max-age=60, s-maxage=60` for `available`/`taken` only. No cache for `invalid`/`error`.

---

### 4.2 POST `/api/ans/register`

**Purpose:** Start registration flow for an available domain.

**Request body:**
```json
{
  "name": "kimi",
  "email": "user@example.com",
  "agentCard": {
    "name": "Kimi Trading Bot",
    "description": "...",
    "endpoint": "https://...",
    "capabilities": ["trading"],
    "protocols": ["A2A", "OpenClaw"]
  }
}
```

**Response (success / payment required):**
```json
{
  "success": true,
  "nextStep": "payment_required",
  "domain": { "name": "kimi", "fullDomain": "kimi.xpersona.agent", "status": "PENDING_VERIFICATION" },
  "payment": { "clientSecret": "...", "subscriptionId": "..." },
  "verification": { "publicKey": "...", "dnsTxtRecord": "...", "instructions": ["..."] }
}
```

**Response (stub / not ready):**
```json
{
  "success": false,
  "nextStep": "coming_soon",
  "error": "Registration will open soon"
}
```

---

## 5. Validation Logic (Shared)

**Normalization (client + server):**
1. Trim whitespace
2. Lowercase
3. Strip disallowed chars (keep `a-z`, `0-9`, `-`)
4. Remove leading/trailing hyphens

**Rules:**
- Length: 3–63 characters
- Format: `[a-z0-9][a-z0-9-]{1,61}[a-z0-9]`
- No consecutive hyphens
- Reserved names: `www`, `api`, `admin`, `mail`, `ftp`, `test`, `demo`, `xpersona`, `agent`, etc.

**Reserved set (canonical):**
```
www, api, admin, mail, ftp, smtp, pop, imap, ns1, ns2, dns, test, demo,
staging, prod, agent, app, auth, cdn, cloud, db, dev, email, gateway,
graphql, grpc, help, img, js, login, oauth, pay, rest, rpc, shop, ssl,
status, support, ws, xml, xpersona, root, localhost
```

---

## 6. Failure Handling

| Scenario        | User-facing message                    | Retry |
|----------------|----------------------------------------|-------|
| Network error  | "Couldn't check. Try again."           | Yes   |
| 5xx            | "Service temporarily unavailable."     | Yes   |
| 429            | "Too many requests. Wait a moment."    | Yes   |
| Empty query    | No API call; inline "Enter 3+ chars"  | N/A   |

---

## 7. Non-Negotiable UX Constraints

- **Latency:** p95 < 500ms for check (cached lookups)
- **Keyboard-first:** Enter submits search; Tab navigates
- **Minimal chrome:** One primary action (Search); secondary actions in footer
- **Accessibility:** ARIA labels, focus management, screen-reader friendly

---

## 8. Launch Metrics

| Metric              | Target (Week 1) | Action |
|---------------------|-----------------|--------|
| Search submissions  | 100+            | Track `ans_search_submitted` |
| Availability rate   | >80% available  | Monitor reserved/blocked names |
| Claim click-through | >20%            | Track `ans_claim_clicked` |
| Error rate          | <1%             | Monitor `state: error` |

---

## 9. Architecture Notes

- **Stack:** Next.js App Router, Drizzle ORM, existing `users` table for owners
- **ANS tables:** `ans_domains` (name, fullDomain, ownerId, agentCard, publicKey, status, expiresAt)
- **Routes:** Hub (`xpersona.co`) serves ANS-first; Game/Trading via subdomains unchanged
