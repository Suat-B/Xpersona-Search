"""
Kelly Criterion Strategy
Mathematically optimal bet sizing based on edge.
Bet fraction of bankroll: f = (bp - q) / b
where b = odds, p = win prob, q = loss prob

Risk: CALCULATED - Uses math to maximize growth
Best for: Players with edge (if any exist)
"""

class Strategy:
    def __init__(self, config):
        self.fraction = config.get('kelly_fraction', 0.25)  # 25% of Kelly (conservative)
        self.min_bet = config.get('min_bet', 1)
        self.max_bet = config.get('max_bet', 500)
        self.house_edge = 0.03  # 3% house edge
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        
        # Use 50/50 bet (closest to even odds with 3% edge)
        target = 50
        condition = "over"
        
        # Calculate theoretical win probability (with house edge)
        win_prob = 0.50  # For 50/50 bet
        odds = (1 - self.house_edge) / win_prob  # Actual payout multiplier
        
        # Kelly criterion formula
        # f* = (bp - q) / b
        # where b = odds - 1, p = win_prob, q = 1 - p
        b = odds - 1
        p = win_prob
        q = 1 - p
        kelly_fraction = (b * p - q) / b if b > 0 else 0
        
        # With 3% house edge, kelly_fraction will be negative
        # So we cap at 0 (don't bet with negative edge)
        if kelly_fraction <= 0:
            # No edge - use conservative fixed bet
            bet_amount = min(self.min_bet, balance)
        else:
            # Apply fraction of Kelly (to be conservative)
            bet_fraction = kelly_fraction * self.fraction
            bet_amount = balance * bet_fraction
        
        # Enforce limits
        bet_amount = max(bet_amount, self.min_bet)
        bet_amount = min(bet_amount, self.max_bet)
        bet_amount = min(bet_amount, balance)
        
        ctx.notify(f"Kelly bet: {bet_amount:.2f} ({(bet_amount/balance*100):.2f}% of balance)")
        
        return BetDecision(
            amount=bet_amount,
            target=target,
            condition=condition
        )
    
    def on_round_complete(self, ctx, result):
        # Kelly criterion is based on current balance, so no state needed
        ctx.notify(f"Result: {'WIN' if result.win else 'LOSS'} | Balance: {result.balance}")
