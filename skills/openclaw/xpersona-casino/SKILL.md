---
name: xpersona-casino
description: Play xpersona.co casino (dice only) using the user's API key; check balance, claim faucet, place bets, get session PnL, create and run custom strategies (AI/OpenClaw). AI-first: all responses are { success, data?, error? }; use GET /api/me/session-stats for single-call stats; GET /api/me/bets for history.
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
| **Session stats (AI-first)** | GET | /api/me/session-stats?gameType=dice&limit=50 | → `data.balance`, `data.deposit_alert`, `data.deposit_url`, `data.balance_milestone`, `data.milestone_message`, `data.proof_of_life_alerts`, `data.rounds`, `data.sessionPnl`, `data.winRate`, `data.recentBets` — prefer this for "how am I doing?" |
| Balance | GET | /api/me/balance | → `data.balance`, `data.deposit_alert`, `data.deposit_alert_message`, `data.deposit_url`, `data.balance_milestone`, `data.milestone_message` |
| Session PnL & history | GET | /api/me/bets?limit=50 | → `data.bets`, `data.sessionPnl`, `data.roundCount` |
| List strategies | GET | /api/me/strategies?gameType=dice | → `data.strategies` |
| Create strategy | POST | /api/me/strategies | `{ gameType: "dice", name, config }` |
| Get strategy | GET | /api/me/strategies/:id | → `data` |
| Update strategy | PATCH | /api/me/strategies/:id | `{ name?, config? }` |
| Delete strategy | DELETE | /api/me/strategies/:id | |
| Run dice strategy | POST | /api/games/dice/run-strategy | `{ strategyId? or config?, maxRounds? }` → `data.results`, `data.sessionPnl`, `data.finalBalance` |
| Faucet | POST | /api/faucet | Once per hour → `data.balance`, `data.granted`, `data.nextFaucetAt` |
| Dice bet | POST | /api/games/dice/bet | `{ amount, target, condition: "over"\|"under" }` |

All game responses include `data.balance` and outcome. Use GET /api/me/session-stats for single-call stats.

---

## Dice rules and odds (for explaining to users)

- **House edge:** 3%
- **Min bet:** 1, **max bet:** 10000 credits
- **Win probability:** over X → (100-X)/100; under X → X/100. Example: over 50 = 49% win chance.
- **Multiplier:** (1 - 0.03) / winProbability = 0.97 / winProbability (rounded). Over 50 ≈ 1.98x payout.
- **Faucet:** 100 credits per claim, 1 hour cooldown.

---

## Tools API (OpenClaw-native)

You can use **REST** or the **Tools API**. Same auth; Tools API is a single POST per action and returns a structured `result`. Prefer Tools when the OpenClaw integration is configured to call our tools endpoint.

**Endpoint:** `POST https://xpersona.co/api/openclaw/tools` (or `XPERSONA_BASE_URL`).

**Auth:** `Authorization: Bearer <XPERSONA_API_KEY>` (same as REST). Required for all tools except `casino_auth_guest`.

**Body:** `{ "tool": "<tool_name>", "parameters": { ... }, "agent_token": "<optional>" }`.

**Response:** `{ "success": true, "tool": "<name>", "result": { ... }, "meta": { "timestamp", "agent_id", "rate_limit_remaining" } }` or `{ "success": false, "error": "..." }`. On error the HTTP status may be 400, 401, or 429 (rate limit).

**Tool discovery:** `GET /api/openclaw/tools` returns `{ "success": true, "tools": { ... } }` with the full schema. Full parameter details: https://xpersona.co/dashboard/api.

**Implemented tools:**

| Tool | Purpose |
|------|---------|
| casino_auth_guest | Create or authenticate as a guest user |
| casino_auth_agent | Authenticate as an AI agent with permissions |
| casino_place_dice_bet | Place a dice bet (amount, target, condition) |
| casino_get_balance | Get balance and session stats. Returns deposit_alert, deposit_alert_message — when low/critical, alert player to deposit |
| casino_get_history | Get bet history and statistics by game_type |
| casino_analyze_patterns | Analyze dice patterns and trends |
| casino_run_strategy | Run dice strategy (strategy_id or inline config with progression_type) |
| casino_list_strategies | List deployed strategies |
| casino_get_strategy | Get strategy details (config, progression_type) |
| casino_create_strategy | Create basic strategy (gameType, name, config) |
| casino_update_strategy | Update basic strategy by ID |
| casino_delete_strategy | Delete a strategy |
| casino_withdraw | Request withdrawal (min 10,000 credits) |
| casino_get_transactions | Unified feed: bets + faucet grants |
| casino_verify_bet | Get single bet with provably fair verification |
| casino_notify | Send notification about game events |
| casino_get_limits | Get betting and rate limits |
| casino_calculate_odds | Calculate dice odds and expected value |
| casino_claim_faucet | Claim the hourly faucet for the user |
| casino_list_credit_packages | List credit packages for purchase |
| casino_create_checkout | Create a Stripe checkout URL for a package (deposit) |
| **Advanced strategies (rule-based)** | |
| casino_list_advanced_strategies | List advanced strategies (38+ triggers, 25+ actions) |
| casino_create_advanced_strategy | Create advanced strategy (baseConfig + rules array) |
| casino_get_advanced_strategy | Get advanced strategy by ID |
| casino_update_advanced_strategy | Update advanced strategy |
| casino_delete_advanced_strategy | Delete advanced strategy |
| casino_simulate_advanced_strategy | Simulate (dry run, no real bets) |
| casino_run_advanced_strategy | Run for real (strategy_id or inline strategy) |

**Note:** `casino_stop_session` and `casino_get_session_status` exist in the schema but are reserved for future async sessions. Strategy runs are synchronous; there is no active session to stop. Use `casino_run_strategy` or `casino_run_advanced_strategy` result directly.

---

## Agent flow guidance (when user says X, do Y)

| User intent | Action |
|-------------|--------|
| "Bet 10 on over 50" | `casino_place_dice_bet` or POST /api/games/dice/bet with `{ amount: 10, target: 50, condition: "over" }` |
| "How am I doing?" | GET /api/me/session-stats (single call) or `casino_get_balance` |
| "Run my Martingale" / "Run strategy X" | `casino_run_strategy` with `strategy_id` or `config` |
| "I'm out of credits" | `casino_claim_faucet` (if cooldown passed); else `casino_list_credit_packages` → `casino_create_checkout` → share URL |
| Bet fails: insufficient balance | Tell your player immediately: "You're out of credits. Please deposit at /dashboard/deposit or claim Free Credits to continue playing." Link them to deposit. Do not retry placing bets until they deposit. |
| Proactive deposit alert | When `deposit_alert` is `low` or `critical`, tell the player `deposit_alert_message` and link to `/dashboard/deposit` — they deposit so you can keep playing dice for them |
| Balance milestone reached | When `balance_milestone` is set (1000, 2000, 5000, etc.), congratulate your player with `milestone_message` when it fits — e.g., after a big win or when they ask "how am I doing?" |
| Proof-of-life update | Use `proof_of_life_alerts` to proactively tell your player how it's going — e.g., "You're up 250 this session!", "On a 5-win streak!", "Played 50 rounds so far." Pick 1–2 when appropriate; don't spam. |
| "What are the odds for over 70?" | `casino_calculate_odds` with `{ target: 70, condition: "over" }` |
| "List my strategies" | `casino_list_strategies` or GET /api/me/strategies |
| "Create/save a strategy" | `casino_create_strategy` with game_type, name, config |
| "Request withdrawal" | `casino_withdraw` with amount (min 10,000 credits) |
| "Show my transactions" | `casino_get_transactions` or GET /api/me/transactions |
| "Verify bet X" (provably fair) | `casino_verify_bet` with bet_id, optional reveal=true |

**Recommended flow:** (1) Get balance (`casino_get_balance` or GET /api/me/session-stats). (2) If low, claim faucet (`casino_claim_faucet`) or suggest deposit. (3) Place bets or run strategy. (4) Report session PnL from session-stats or `casino_get_balance`.

---

## Deposit alerts (tell your player to deposit)

When you play dice for a player, you need credits. **If balance is low, alert the player to deposit** so you can keep playing for them.

All balance endpoints return: `deposit_alert` (`"ok"` | `"low"` | `"critical"`), `deposit_alert_message` (ready-to-use text), `deposit_url` (`/dashboard/deposit`).

- **`deposit_alert === "critical"`** (balance &lt; 10): Tell the player immediately. Say `deposit_alert_message` verbatim. Direct them to deposit — credits arrive instantly. Without deposit, you cannot place more bets.
- **`deposit_alert === "low"`** (balance &lt; 100): Suggest deposit soon. Use `deposit_alert_message` or your own phrasing. Link them to `/dashboard/deposit` so they can add funds before they run out.
- **`deposit_alert === "ok"`**: No action needed.

**Rule:** When `deposit_alert` is not `"ok"`, relay the message to your player. They deposit; you keep playing dice for them.

---

## Balance milestones (congratulate your player)

When the player's balance reaches 1,000, 2,000, 5,000, 10,000, 25,000, or 50,000 credits, you can congratulate them. Balance endpoints return:

- **`balance_milestone`**: The highest milestone they've reached (e.g., `2000` if balance ≥ 2000).
- **`milestone_message`**: Ready-to-use text (e.g., "You're doing great! 2,000 credits and climbing.").

**Rule:** When `balance_milestone` is present and it feels natural (e.g., after a win or when they ask how they're doing), tell your player `milestone_message` or your own encouraging phrasing. Don't spam — use it when the moment fits (e.g., they just crossed the threshold or asked for a status update).

**When bet fails (insufficient balance):** If `casino_place_dice_bet` or POST /api/games/dice/bet returns an error indicating insufficient balance, tell your player immediately: "You're out of credits. Please deposit at /dashboard/deposit or claim Free Credits to continue playing." Direct them to deposit — do not retry bets until they add funds.

---

## Proof-of-life alerts (keep your player updated)

When you play dice for a player, proactively send status updates so they know how things are going. Session-stats and `casino_get_balance` return **`proof_of_life_alerts`**: an array of `{ type, message }` ready-to-use updates.

| Type | When | Example message |
|------|------|-----------------|
| `session_pnl` | Session PnL ≥ +100, +250, +500, etc. | "You're up 250 credits this session!" |
| `rounds` | 10, 25, 50, 100+ rounds played | "Played 50 rounds so far." |
| `streak` | 3+ win streak | "On a 5-win streak!" |
| `summary` | Always present | "Session: 45 rounds, +320 credits, 58% win rate." |

**Rule:** Proactively share 1–2 proof-of-life alerts when appropriate — e.g., every few rounds, after a milestone, or when the player might be wondering how it's going. Pick from `proof_of_life_alerts`; the `summary` type is always available as a catch-all. Don't spam; vary your updates.

---

## Session PnL (AI-first)

**GET /api/me/session-stats?gameType=dice&limit=50** — unified stats, preferred for "how am I doing?":

- `data.balance`, `data.rounds`, `data.sessionPnl`, `data.winRate`, `data.recentBets`, `data.proof_of_life_alerts`, `data.current_streak`

**GET /api/me/bets?limit=50** — detailed history:

- `data.bets`: array of `{ id, gameType, amount, outcome, payout, pnl, createdAt }`
- `data.sessionPnl`, `data.roundCount`

---

## Auto-play (AI pattern)

**Dice:** Call POST /api/games/dice/bet in a loop with 200–500 ms delay. Stop on `INSUFFICIENT_BALANCE` or user stop. Always check `data.balance` before each bet.

---

## Custom strategies (AI/OpenClaw)

### Basic strategies (progression: martingale, paroli, etc.)
**Create:** `POST /api/me/strategies` with `{ gameType, name, config }`. Dice config: `amount`, `target`, `condition`, optional `progressionType` (flat|martingale|paroli|dalembert|fibonacci|labouchere|oscar|kelly), `maxBet`, `maxConsecutiveLosses`, `maxConsecutiveWins`, `stopIfBalanceBelow`, `stopIfBalanceAbove`.

**Run (one call):** `POST /api/games/dice/run-strategy` with `{ strategyId }` or `{ config, maxRounds }`. Response: `data.results`, `data.sessionPnl`, `data.finalBalance`, `data.stoppedReason`.

### Advanced strategies (rule-based: triggers + actions)
**Create:** `POST /api/me/advanced-strategies` with `{ name, baseConfig: { amount, target, condition }, rules: [{ id, order, enabled, trigger: { type, value? }, action: { type, value? } }], executionMode?, globalLimits? }`. Triggers: win, loss, streak_loss_at_least, profit_above, balance_below, win_rate_above, etc. Actions: double_bet, reset_bet, switch_over_under, stop, increase_bet_percent, etc.

**List:** `GET /api/me/advanced-strategies`. **Get/Update/Delete:** `GET|PATCH|DELETE /api/me/advanced-strategies/:id`.

**Simulate (dry run):** `POST /api/me/advanced-strategies/simulate` with `{ strategy, rounds?, startingBalance? }` or `POST /api/me/advanced-strategies/:id/simulate` with `{ rounds?, startingBalance? }`.

**Run (real bets):** `POST /api/games/dice/run-advanced-strategy` with `{ strategyId }` or `{ strategy, maxRounds }`. Max 100 rounds per run.


---

## Example (curl)

Session stats (AI-first):
```bash
curl -s -H "Authorization: Bearer $XPERSONA_API_KEY" "https://xpersona.co/api/me/session-stats?gameType=dice&limit=20"
```

Play dice (bet 10, over 50):
```bash
curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \
  -d '{"amount":10,"target":50,"condition":"over"}' https://xpersona.co/api/games/dice/bet
```

---

## Troubleshooting

- **401:** Invalid or missing API key. Generate at https://xpersona.co/dashboard (API section).
- **400 INSUFFICIENT_BALANCE:** Suggest faucet or `casino_list_credit_packages` + `casino_create_checkout`.
- **429 / FAUCET_COOLDOWN:** Wait until `data.nextFaucetAt` before claiming again.
- **5xx / network / timeout: API fallback** — If the API is unavailable (5xx, timeout, 429), suggest the user play via the website: https://xpersona.co/games/dice (same games, same balance, full strategy builder). Do not retry excessively.

Full API spec: https://xpersona.co/openapi.yaml or https://xpersona.co/dashboard/api.

---

## Agent system prompt (optional)

For agents that support a system prompt, paste this block for robust API handling and fallback:

```
[ xpersona Casino ] Auth: Authorization: Bearer <XPERSONA_API_KEY>. Preferred: GET /api/me/session-stats for "how am I doing?". On 5xx/timeout/429: retry once with 2-5s backoff. If still failing, tell user: "API temporarily unavailable. Play at https://xpersona.co/games/dice — same games, same balance." Do not retry excessively.
```
