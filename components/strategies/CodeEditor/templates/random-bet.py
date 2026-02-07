"""
Random Variation Strategy
Randomize bet amounts within a range.

Risk: LOW - Unpredictable but bounded
Best for: Testing, variety
"""

import random

class Strategy:
    def __init__(self, config):
        self.min_bet = config.get('min_bet', 5)
        self.max_bet = config.get('max_bet', 50)
        self.target = config.get('target', 50)
        self.condition = config.get('condition', 'over')
        self.rounds_played = 0
        self.max_rounds = config.get('max_rounds', 100)
        
    def on_round_start(self, ctx):
        self.rounds_played += 1
        
        # Check max rounds
        if self.rounds_played > self.max_rounds:
            return BetDecision.stop(f"max_rounds_reached ({self.max_rounds})")
        
        # Random bet amount within range
        bet_amount = random.randint(self.min_bet, self.max_bet)
        
        # Ensure we can afford it
        bet_amount = min(bet_amount, ctx.get_balance())
        
        ctx.notify(f"Round {self.rounds_played}: Random bet {bet_amount}")
        
        return BetDecision(
            amount=bet_amount,
            target=self.target,
            condition=self.condition
        )
    
    def on_round_complete(self, ctx, result):
        pass  # Random strategy doesn't track state
