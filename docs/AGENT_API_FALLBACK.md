# Agent API Fallback & Resilience

**Purpose:** Ensure AI agents playing on xpersona casino have clear fallbacks when the API is unavailable or fails. Same API powers the website — agents and humans share one backend.

---

## Fallback Rule: API Unavailable → Use Website UI

When the API fails (5xx, network error, timeout, rate limit 429), **agents should suggest the user play via the website** instead of failing silently or retrying indefinitely.

### Ready-to-Paste System Prompt Block

Copy this entire block into your agent's system prompt or instructions for xpersona casino integration:

```
[ xpersona Casino API - Agent Instructions ]

Auth: Every request must include Authorization: Bearer <XPERSONA_API_KEY>. Get your key at https://xpersona.co/dashboard (API section).

Preferred endpoints:
- "How am I doing?" → GET /api/me/session-stats (single call; avoid balance + bets separately)
- Place bet → POST /api/games/dice/bet
- Run strategy → POST /api/games/dice/run-strategy or POST /api/games/dice/run-advanced-strategy

Error handling:
- 401: Tell user "Invalid or missing API key. Get your key at https://xpersona.co/dashboard"
- 429: Wait 60s, retry once. If still failing, suggest website.
- 5xx / network timeout: Retry once after 2-5 seconds. If still failing, do NOT retry again.

API fallback (critical): If the API is unavailable (5xx, network error, timeout, or 429 after retry):
1. Inform the user: "The casino API is temporarily unavailable. You can play directly on the website: https://xpersona.co/games/dice — same games, same balance, same provably fair results."
2. The website provides full functionality: dice, strategies (basic + advanced), session stats, faucet, deposit/withdraw.
3. Suggest they try the API again later.
```

### Shorter Prompt (minimal)

For agents with limited system prompt space, use this shorter version:

```
If the xpersona casino API returns an error (5xx, network timeout, or rate limit 429):
1. Do NOT retry excessively (max 1–2 retries with backoff).
2. Inform the user: "The casino API is temporarily unavailable. You can play directly on the website: https://xpersona.co/games/dice — same games, same balance, same provably fair results."
3. The website provides full functionality: dice, strategies (basic + advanced), session stats, faucet, deposit/withdraw.
4. Suggest they try the API again later.
```

### Error → Fallback Mapping

| Error | Agent Action |
|-------|--------------|
| **401 Unauthorized** | "Invalid or missing API key. Get your key at https://xpersona.co/dashboard (API section)." |
| **429 Rate limit** | "Rate limited. Please wait a moment. Or play on the website: https://xpersona.co/games/dice" |
| **500 / 502 / 503** | "API temporarily unavailable. Play on the website: https://xpersona.co/games/dice" |
| **Network timeout** | "Connection failed. Try the website: https://xpersona.co/games/dice" |
| **INSUFFICIENT_BALANCE** | Suggest `casino_claim_faucet` or `casino_list_credit_packages` + checkout |
| **FAUCET_COOLDOWN** | "Faucet on cooldown. Next claim at {data.nextFaucetAt}. Or deposit at https://xpersona.co/dashboard/deposit" |

---

## Website UI Parity

Everything available via API is available on the website:

| Feature | API | Website |
|---------|-----|---------|
| Dice bet | POST /api/games/dice/bet | Roll button, Target/Condition/Bet |
| Session stats | GET /api/me/session-stats | Statistics tab |
| Basic strategies | POST /api/games/dice/run-strategy | Simple Preset Strategies |
| **Advanced strategies** | POST /api/games/dice/run-advanced-strategy | Strategy tab → Add rules, Run Strategy |
| Create advanced strategy | POST /api/me/advanced-strategies | Dashboard → Strategies |
| Simulate strategy | POST /api/me/advanced-strategies/simulate | Test Simulation button |
| Faucet | POST /api/faucet | Dashboard faucet |
| Balance | GET /api/me/balance | Header balance display |

---

## Retry Guidance

- **Transient 5xx:** Retry once after 2–5 seconds. If still failing → suggest website.
- **429:** Wait `Retry-After` seconds (if provided) or 60s, then retry once.
- **401/403:** Do not retry; user must fix API key or permissions.

---

## Tool Discovery

`GET https://xpersona.co/api/openclaw/tools` returns all available tools. Agents can call this at startup to ensure they have the latest schema.
