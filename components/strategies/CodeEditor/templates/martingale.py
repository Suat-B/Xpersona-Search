"""
Classic Martingale Strategy
Double bet after each loss, reset on win.

Risk: HIGH - Can lead to exponential losses if on long losing streak
Best for: Short sessions with adequate bankroll
"""

class Strategy:
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.max_bet = config.get('max_bet', 1000)
        self.current_bet = self.base_bet
        self.consecutive_losses = 0
        self.max_consecutive_losses = config.get('max_consecutive_losses', 6)
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        
        # Safety check: can't afford next bet
        if self.current_bet > balance:
            return BetDecision.stop("insufficient_balance")
        
        # Safety check: too many consecutive losses
        if self.consecutive_losses >= self.max_consecutive_losses:
            return BetDecision.stop(f"max_consecutive_losses ({self.max_consecutive_losses}) reached")
        
        return BetDecision(
            amount=self.current_bet,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            # Reset on win
            self.current_bet = self.base_bet
            self.consecutive_losses = 0
            ctx.notify("Win! Resetting bet to base amount")
        else:
            # Double on loss (martingale)
            self.consecutive_losses += 1
            self.current_bet = min(
                self.current_bet * 2,
                self.max_bet,
                ctx.get_balance()
            )
            ctx.notify(f"Loss! Increasing bet to {self.current_bet}")
