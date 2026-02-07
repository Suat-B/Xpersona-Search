"""
Paroli Strategy
Positive progression: triple bet on win, reset on 3 wins or loss.
Aim to capitalize on winning streaks.

Risk: LOW - Conservative wins, controlled losses
Best for: Capitalizing on hot streaks
"""

class Strategy:
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.current_bet = self.base_bet
        self.consecutive_wins = 0
        self.max_consecutive_wins = 3  # Triple up to 3 times
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        
        # Cap to balance
        bet_amount = min(self.current_bet, balance)
        
        return BetDecision(
            amount=bet_amount,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            self.consecutive_wins += 1
            if self.consecutive_wins >= self.max_consecutive_wins:
                # Reached max wins, reset
                self.current_bet = self.base_bet
                self.consecutive_wins = 0
                ctx.notify("3-win streak! Resetting to base bet")
            else:
                # Triple bet (paroli)
                self.current_bet = min(self.current_bet * 3, ctx.get_balance())
                ctx.notify(f"Win #{self.consecutive_wins}! Tripling bet to {self.current_bet}")
        else:
            # Loss: reset immediately
            self.current_bet = self.base_bet
            self.consecutive_wins = 0
            ctx.notify("Loss! Resetting to base bet")
