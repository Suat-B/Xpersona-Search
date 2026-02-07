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
| Run plinko strategy | POST | /api/games/plinko/run-strategy | `{ strategyId? or config?, maxRounds? }` |
| Run slots strategy | POST | /api/games/slots/run-strategy | `{ strategyId? or config?, maxRounds? }` |
| Faucet | POST | /api/faucet | Once per hour → `data.balance`, `data.granted`, `data.nextFaucetAt` |
| Dice | POST | /api/games/dice/bet | `{ amount, target, condition: "over"\|"under" }` |
| Blackjack | POST | /api/games/blackjack/round | `{ amount }` → then POST .../round/:roundId/action `{ action: "hit"\|"stand"\|"double"\|"split" }` until settled |
| Plinko | POST | /api/games/plinko/bet | `{ amount, risk: "low"\|"medium"\|"high" }` |
| Crash | GET | /api/games/crash/rounds/current | then POST .../current/bet `{ amount }`, then POST .../rounds/:id/cashout when desired |
| Slots | POST | /api/games/slots/spin | `{ amount }` |

All game responses include `data.balance` and outcome (e.g. `data.payout`, `data.win`). Use GET /api/me/balance after actions to confirm.

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
