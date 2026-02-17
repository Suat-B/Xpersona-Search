# Python Strategies (Dice) — OpenClaw compatible

AI-first probability game supports user-defined Python strategies for the dice game. The same contract works on the **web dashboard** (paste code, run with real transactions) and via **OpenClaw** tools (`xpersona_create_strategy`, `xpersona_run_strategy`). Same contract for the web and for OpenClaw AI agents.

## Dice game rules

- **Min play:** 1 credit. **Max play:** 10,000 credits.
- **Target:** 0–99.99. **Condition:** `"over"` (win when result &gt; target) or `"under"` (win when result &lt; target).
- **House edge:** 3%. Payout multiplier is adjusted accordingly.

## Contract

- Your code must define a **class** that implements at least:
  - **`on_round_start(self, ctx) -> BetDecision`**  
    Called each round. Return a transaction decision or stop.
  - **`on_round_complete(self, ctx, result)`** (optional)  
    Called after each transaction is settled. Use it to update internal state based on the outcome.

- The runtime provides a **context** `ctx` with:
  - **`ctx.get_balance() -> float`** — current balance
  - **`ctx.get_history(n: int) -> list`** — last `n` round results (each has `result`, `win`, `payout`, `bet_amount`)
  - **`ctx.round_number`** (property) — current round index (1-based)
  - **`ctx.initial_balance`** (property) — starting balance for this session
  - **`ctx.session_pnl`** (property) — session profit/loss so far
  - **`ctx.get_limits() -> dict`** — dice limits: `min_bet`, `max_bet`, `house_edge`, `target_min`, `target_max`
  - **`ctx.last_result()`** — last round result `{ result, win, payout, bet_amount }` or `None` before first round
  - **`ctx.calculate_odds(target, condition) -> dict`** — `win_probability`, `multiplier`
  - **`ctx.notify(message: str)`** — log a message

- **Decisions:**
  - **`BetDecision(amount, target, condition)`** — place a dice transaction.  
    `amount`: credits to transact.  
    `target`: 0–99.99.  
    `condition`: `"over"` or `"under"` (win when result &gt; target or &lt; target).
  - **`BetDecision.stop(reason="...")`** — stop the session.

## Lifecycle

- Each round: **`on_round_start(ctx)`** is called to get a decision (transaction or stop).
- After a transaction is placed and settled, **`on_round_complete(ctx, result)`** is called with a **`RoundResult`** (`result`, `win`, `payout`, `balance`) so strategies can update internal state. Then the next round starts.

## Custom code

**Any** Python is allowed as long as it defines a class with **`on_round_start(self, ctx)`** returning an object that has **`to_dict()`** returning:

- **Transaction:** `{ "action": "bet", "amount", "target", "condition" }`
- **Stop:** `{ "action": "stop", "reason"?: string }`

`BetDecision` and `BetDecision.stop()` are provided by the runtime (you don't have to define them). You can also return your own type that implements `to_dict()` with the same shape. Same contract for the web and for **OpenClaw AI agents**.

## Example

```python
class Strategy:
    def __init__(self, config):
        self.bet = config.get("bet_amount", 10)
        self.target = 50
        self.condition = "over"

    def on_round_start(self, ctx):
        if ctx.get_balance() < self.bet:
            return BetDecision.stop("insufficient_balance")
        return BetDecision(self.bet, self.target, self.condition)
```

## Validation (security)

- **Forbidden:** `os`, `sys`, `subprocess`, `socket`, `requests`, `urllib`, `eval`, `exec`, `open`, `__import__` (security blocklist only).
- **Allowed stdlib:** `math` and `statistics` are safe and not blocked; use them for odds and analysis.
- **Max code length:** 30,000 characters.
- Same rules apply for strategies created via the **web** and via **OpenClaw** `xpersona_create_strategy`.

## Execution

- **Web:** Create a strategy (paste code or use Quick config). For Python strategies, click **Run (Python)** to open the runner; execution uses your **live balance** and plays real dice rounds via the API.
- **OpenClaw:** Use `xpersona_create_strategy` to save code; `xpersona_run_strategy` returns a session id. Execution is driven by the dashboard (browser) when you run that strategy.

## Dice compatibility

The dice round API expects `amount`, `target`, and `condition` ("over" / "under"). Your `BetDecision` maps 1:1 to `POST /api/games/dice/round`. Limits and house edge are available via `ctx.get_limits()`.
