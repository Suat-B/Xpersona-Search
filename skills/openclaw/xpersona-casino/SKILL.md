---
name: xpersona-casino
description: Play xpersona.co casino (dice, blackjack, plinko, crash, slots) using the user's API key; check balance, claim faucet, place bets, get session PnL, create and run custom strategies (AI/OpenClaw). AI-first: all responses are { success, data?, error? }; use GET /api/me/bets for session history and GET/POST /api/me/strategies and POST /api/games/{game}/run-strategy for strategies.
metadata: {"openclaw":{"requires":{"env":["XPERSONA_API_KEY"]},"primaryEnv":"XPERSONA_API_KEY","homepage":"https://xpersona.co"}}
---

# xpersona Casino (AI-first)

Base URL: `https://xpersona.co` (override with `XPERSONA_BASE_URL` if set).

**Every request:** `Authorization: Bearer <XPERSONA_API_KEY>`.

**Every response:** JSON with `success: true|false`. On success use `data`; on error body has `error` (e.g. `INSUFFICIENT_BALANCE`, `VALIDATION_ERROR`). Same API powers the website and AI agents.

---

## Quick reference

| Action | Method | Path | Body / Notes |
|--------|--------|------|--------------|
| Balance | GET | /api/me/balance | → `data.balance` |
| Session PnL & history | GET | /api/me/bets?limit=50 | → `data.bets`, `data.sessionPnl`, `data.roundCount` |
| List strategies | GET | /api/me/strategies?gameType=dice | → `data.strategies` |
| Create strategy | POST | /api/me/strategies | `{ gameType, name, config }` |
| Get strategy | GET | /api/me/strategies/:id | → `data` |
| Update strategy | PATCH | /api/me/strategies/:id | `{ name?, config? }` |
| Delete strategy | DELETE | /api/me/strategies/:id | |
| Run dice strategy | POST | /api/games/dice/run-strategy | `{ strategyId? or config?, maxRounds? }` → `data.results`, `data.sessionPnl`, `data.finalBalance` |
| Faucet | POST | /api/faucet | Once per hour → `data.balance`, `data.granted`, `data.nextFaucetAt` |
| Dice | POST | /api/games/dice/bet | `{ amount, target, condition: "over"\|"under" }` |

All game responses include `data.balance` and outcome (e.g. `data.payout`, `data.win`). Use GET /api/me/balance after actions to confirm.

---

## Tools API (OpenClaw-native)

You can use **REST** or the **Tools API**. Same auth; Tools API is a single POST per action and returns a structured `result`. Prefer Tools when the OpenClaw integration is configured to call our tools endpoint.

**Endpoint:** `POST https://xpersona.co/api/openclaw/tools` (or `XPERSONA_BASE_URL`).

**Auth:** `Authorization: Bearer <XPERSONA_API_KEY>` (same as REST). Required for all tools except `casino_auth_guest`.

**Body:** `{ "tool": "<tool_name>", "parameters": { ... }, "agent_token": "<optional>" }`.

**Response:** `{ "success": true, "tool": "<name>", "result": { ... }, "meta": { "timestamp", "agent_id", "rate_limit_remaining" } }` or `{ "success": false, "error": "..." }`. On error the HTTP status may be 400, 401, or 429 (rate limit).

**Tool discovery:** `GET /api/openclaw/tools` returns `{ "success": true, "tools": { ... } }` with the full schema (tool names, parameters, returns). Use this for programmatic discovery. Full parameter details: https://xpersona.co/dashboard/api.

**Tool list (one-line purpose):**

| Tool | Purpose |
|------|---------|
| casino_auth_guest | Create or authenticate as a guest user |
| casino_auth_agent | Authenticate as an AI agent with permissions |
| casino_place_dice_bet | Place a dice bet (amount, target, condition) |
| casino_get_balance | Get balance and session stats |
| casino_get_history | Get bet history and statistics |
| casino_analyze_patterns | Analyze patterns and trends |
| casino_deploy_strategy | Deploy a Python strategy (name, python_code, game_type) |
| casino_run_strategy | Execute a deployed strategy |
| casino_list_strategies | List deployed strategies |
| casino_get_strategy | Get strategy details and code |
| casino_delete_strategy | Delete a strategy |
| casino_stop_session | Stop an active strategy session |
| casino_get_session_status | Get status of active or recent session |
| casino_notify | Send notification about game events |
| casino_get_limits | Get betting and rate limits |
| casino_calculate_odds | Calculate odds and expected value for dice |
| casino_claim_faucet | Claim the hourly faucet for the user |
| casino_list_credit_packages | List credit packages for purchase |
| casino_create_checkout | Create a Stripe checkout URL for a package (deposit) |
| casino_place_plinko_bet | Place a plinko bet (amount, risk) |
| casino_spin_slots | Spin slots (amount) |
| casino_blackjack_start_round | Start blackjack round (amount) → round_id |
| casino_blackjack_action | Hit/stand/double/split on round_id |
| casino_crash_get_current | Get current crash round (multiplier, status) |
| casino_crash_bet | Place bet on current crash round |
| casino_crash_cashout | Cash out on crash round_id |
| casino_list_games | List all games with limits and house edge |
| casino_game_rules | Get rules and odds for a game |
| casino_get_profile | Get user profile (name, credits, lastFaucetAt) |
| casino_random_game | Pick a random game and suggested bet |
| casino_session_summary | Session PnL, win rate, best/worst bet, by game |
| casino_house_edge_by_game | House edge and min/max bet per game |
| casino_run_plinko_strategy | Run plinko strategy (strategyId or config) |
| casino_run_slots_strategy | Run slots strategy (strategyId or config) |

Rate limits may apply; the response may include `meta.rate_limit_remaining`. Error codes in `result` or `error` mirror REST (e.g. `INSUFFICIENT_BALANCE`, `VALIDATION_ERROR`, `FAUCET_COOLDOWN`).

**Recommended flow for an agent:** (1) Get balance (`casino_get_balance`). (2) If low, claim faucet (`casino_claim_faucet`) or suggest deposit (`casino_list_credit_packages` then `casino_create_checkout` and share the URL). (3) Place bets (`casino_place_dice_bet`) or run a strategy (`casino_run_strategy`). (4) Report session PnL from `casino_get_balance` or `casino_get_history`.

---

## Session PnL (AI-first)

**GET /api/me/bets?limit=50** returns the user’s recent bets and session PnL so the AI can report performance without keeping state:

- `data.bets`: array of `{ id, gameType, amount, outcome, payout, pnl, createdAt }` (pnl = payout - amount)
- `data.sessionPnl`: sum of pnl over returned bets
- `data.roundCount`: number of bets returned (up to limit, max 200)

Use this to answer “how am I doing this session?” or to show a simple PnL summary.

---

## Auto-play (AI pattern)

The website’s auto-play uses the same endpoints. To auto-play as an agent:

1. **Dice / Plinko / Slots:** Call the bet/spin endpoint in a loop with a short delay (e.g. 200–500 ms). Stop on `success: false` (e.g. `INSUFFICIENT_BALANCE`) or when the user asks to stop.
2. **Blackjack:** For each round, POST .../round, then in a loop POST .../round/:roundId/action with `hit` until hand value ≥ 17, then `stand`; when `data.status === "settled"`, record outcome and start next round if auto continues.
3. **Crash:** GET current round; when `status === "running"` and no bet yet, POST .../current/bet; when you have a bet and multiplier reaches a target, POST .../rounds/:id/cashout. Repeat for next round.

Always check `data.balance` and stop if the user cannot afford another bet.

---

## Custom strategies (AI/OpenClaw)

You can create, list, and run **saved strategies** so the user (or the AI) can define unique play styles per game.

**Create a strategy:**  
`POST /api/me/strategies` with `{ "gameType": "dice", "name": "Conservative over 50", "config": { "amount": 10, "target": 50, "condition": "over", "stopIfBalanceBelow": 100 } }`.  
Config shape per game:
- **dice:** `amount`, `target`, `condition` ("over"|"under"), optional `stopAfterRounds`, `stopIfBalanceBelow`, `stopIfBalanceAbove`
- **plinko:** `amount`, `risk` ("low"|"medium"|"high"), optional stop conditions
- **slots:** `amount`, optional stop conditions

**List strategies:**  
`GET /api/me/strategies` or `GET /api/me/strategies?gameType=dice` → `data.strategies` (id, gameType, name, config, createdAt).

**Run a strategy (one API call, server runs up to maxRounds):**  
- `POST /api/games/dice/run-strategy` with `{ "strategyId": "<id>" }` or `{ "config": { "amount": 10, "target": 50, "condition": "over" }, "maxRounds": 30 }`  
- Response: `data.results`, `data.sessionPnl`, `data.finalBalance`, `data.roundsPlayed`, `data.stoppedReason` (e.g. "max_rounds", "insufficient_balance", "balance_below").

Use this to let the user define strategies (e.g. “bet 10 on over 50, stop if balance under 100”) and run them in one request, or to run your own inline config without saving.

---

## Example (curl)

Check balance:
```bash
curl -s -H "Authorization: Bearer $XPERSONA_API_KEY" https://xpersona.co/api/me/balance
```

Session PnL and last 20 bets:
```bash
curl -s -H "Authorization: Bearer $XPERSONA_API_KEY" "https://xpersona.co/api/me/bets?limit=20"
```

Play dice (bet 10, over 50):
```bash
curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \
  -d '{"amount":10,"target":50,"condition":"over"}' https://xpersona.co/api/games/dice/bet
```

---

## Troubleshooting

- **401:** Invalid or missing API key. User should generate a key at https://xpersona.co/dashboard (API key section).
- **400 INSUFFICIENT_BALANCE:** User needs more credits (faucet or purchase).
- **429 / FAUCET_COOLDOWN:** Wait until `data.nextFaucetAt` before claiming again.
- **400 ROUND_ENDED (Crash):** Round already crashed or cashed out; get current round and try again.
- **404 ROUND_NOT_FOUND:** Invalid round id (e.g. blackjack or crash); fetch current state and use the correct id.

Full API spec: https://xpersona.co/openapi.yaml or /docs on the site.
