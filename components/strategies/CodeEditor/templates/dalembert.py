"""
D'Alembert Strategy
Add base unit to bet on loss, subtract on win.

Risk: MEDIUM - More conservative than martingale
Best for: Balanced sessions, moderate volatility
"""

class Strategy:
    def __init__(self, config):
        self.unit = config.get('unit', 10)
        self.current_bet = self.unit
        self.min_bet = config.get('min_bet', 1)
        self.max_bet = config.get('max_bet', 500)
        self.total_losses = 0
        self.total_wins = 0
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        
        # Cap bet to balance
        self.current_bet = min(self.current_bet, balance)
        
        # Enforce limits
        self.current_bet = max(self.current_bet, self.min_bet)
        self.current_bet = min(self.current_bet, self.max_bet)
        
        return BetDecision(
            amount=self.current_bet,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            # Decrease by one unit on win
            self.current_bet = max(self.current_bet - self.unit, self.min_bet)
            self.total_wins += 1
            ctx.notify(f"Win! Decreasing bet to {self.current_bet}")
        else:
            # Increase by one unit on loss
            self.current_bet = min(self.current_bet + self.unit, self.max_bet)
            self.total_losses += 1
            ctx.notify(f"Loss! Increasing bet to {self.current_bet}")
