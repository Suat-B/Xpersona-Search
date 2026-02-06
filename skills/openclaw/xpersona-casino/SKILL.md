---
name: xpersona-casino
description: Play xpersona.co casino (dice, blackjack, plinko, crash, slots) using the user's API key; check balance, claim faucet, place bets. All requests need Authorization Bearer token.
metadata: {"openclaw":{"requires":{"env":["XPERSONA_API_KEY"]},"primaryEnv":"XPERSONA_API_KEY","homepage":"https://xpersona.co"}}
---

# xpersona Casino

Base URL: https://xpersona.co (override with XPERSONA_BASE_URL).

Send every request with header: `Authorization: Bearer <XPERSONA_API_KEY>`.

## Quick reference

- **Balance**: GET /api/me/balance → { success: true, data: { balance } }
- **Faucet**: POST /api/faucet (once per hour) → { balance, granted, nextFaucetAt }
- **Dice**: POST /api/games/dice/bet with JSON { "amount": number, "target": number, "condition": "over"|"under" }
- **Blackjack**: POST /api/games/blackjack/round { "amount" } then POST /api/games/blackjack/round/:roundId/action { "action": "hit"|"stand"|"double"|"split" }
- **Plinko**: POST /api/games/plinko/bet { "amount": number, "risk": "low"|"medium"|"high" }
- **Crash**: GET /api/games/crash/rounds/current; POST .../current/bet { "amount" }; POST .../rounds/:id/cashout
- **Slots**: POST /api/games/slots/spin { "amount": number }

All game responses include `data.balance` and outcome. Use GET /api/me/balance after actions to confirm.

## Example (curl)

Check balance:
  curl -H "Authorization: Bearer $XPERSONA_API_KEY" https://xpersona.co/api/me/balance

Play dice (bet 10 credits, over 50):
  curl -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" -d '{"amount":10,"target":50,"condition":"over"}' https://xpersona.co/api/games/dice/bet

## Troubleshooting

- 401: Invalid or missing API key. User should generate a new key at https://xpersona.co/dashboard.
- 429 FAUCET_COOLDOWN: Wait until nextFaucetAt before claiming again.
- 400 INSUFFICIENT_BALANCE: User needs more credits (faucet or purchase).
