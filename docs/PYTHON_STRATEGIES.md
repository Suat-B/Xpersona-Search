# Python Strategies (Dice) — OpenClaw compatible

AI-first casino supports user-defined Python strategies for the dice game. The same contract works on the **web dashboard** (paste code, run with real bets) and via **OpenClaw** tools (`casino_deploy_strategy`, `casino_run_strategy`).

## Contract

- Your code must define a **class** that implements at least:
  - **`on_round_start(self, ctx) -> BetDecision`**  
    Called each round. Return a bet decision or stop.

- The runtime provides a **context** `ctx` with:
  - **`ctx.get_balance() -> float`** — current balance
  - **`ctx.get_history(n: int) -> list`** — last `n` round results (each has `result`, `win`, `payout`, `bet_amount`)
  - **`ctx.calculate_odds(target, condition) -> dict`** — `win_probability`, `multiplier`
  - **`ctx.notify(message: str)`** — log a message

- **Decisions:**
  - **`BetDecision(amount, target, condition)`** — place a dice bet.  
    `amount`: credits to bet.  
    `target`: 0–99.99.  
    `condition`: `"over"` or `"under"` (win when result &gt; target or &lt; target).
  - **`BetDecision.stop(reason="...")`** — stop the session.

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

- Forbidden: `os`, `sys`, `subprocess`, `socket`, `requests`, `urllib`, `eval`, `exec`, `open`, `__import__`.
- Max code length: 10,000 characters.
- Same rules apply for strategies created via the **web** and via **OpenClaw** `casino_deploy_strategy`.

## Execution

- **Web:** Create a strategy (paste code or use Quick config). For Python strategies, click **Run (Python)** to open the runner; execution uses your **live balance** and places real dice bets via the API.
- **OpenClaw:** Use `casino_deploy_strategy` to save code; `casino_run_strategy` returns a session id. Execution is driven by the dashboard (browser) when you run that strategy.

## Dice compatibility

The dice bet API expects `amount`, `target`, and `condition` ("over" / "under"). Your `BetDecision` maps 1:1 to `POST /api/games/dice/bet`.
