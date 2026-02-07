"""
Oscar's Grind Strategy
Conservative positive progression.
Add unit on win, keep same on loss. Aim for +1 unit profit per session.

Risk: LOW - Very conservative
Best for: Small, consistent gains
"""

class Strategy:
    def __init__(self, config):
        self.unit = config.get('unit', 10)
        self.current_bet = self.unit
        self.session_profit = 0
        self.target_profit = config.get('target_profit', self.unit * 5)
        self.stop_loss = config.get('stop_loss', -self.unit * 10)
        self.max_bet = config.get('max_bet', 200)
        
    def on_round_start(self, ctx):
        # Check session targets
        if self.session_profit >= self.target_profit:
            return BetDecision.stop(f"target_profit_reached (+{self.session_profit})")
        
        if self.session_profit <= self.stop_loss:
            return BetDecision.stop(f"stop_loss_reached ({self.session_profit})")
        
        # Cap bet to limits
        bet_amount = min(self.current_bet, ctx.get_balance(), self.max_bet)
        
        return BetDecision(
            amount=bet_amount,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        profit = result.payout - (result.balance - result.payout)  # Approximation
        actual_profit = result.payout - (self.current_bet if not result.win else 0)
        
        if result.win:
            # Add unit to bet (but don't exceed max)
            self.current_bet = min(self.current_bet + self.unit, self.max_bet)
            self.session_profit += actual_profit
            ctx.notify(f"Win! Increasing bet to {self.current_bet} | Session P&L: +{self.session_profit}")
        else:
            # Keep same bet on loss (grind)
            # Bet doesn't increase, but we track the loss
            self.session_profit -= self.current_bet
            ctx.notify(f"Loss! Bet stays at {self.current_bet} | Session P&L: {self.session_profit}")
