"""
Simple Fixed Bet Strategy
Place same bet every round.

Risk: LOW - Very simple, predictable
Best for: Beginners, learning the basics
"""

class Strategy:
    def __init__(self, config):
        self.bet_amount = config.get('bet_amount', 10)
        self.target = config.get('target', 50)
        self.condition = config.get('condition', 'over')
        self.max_rounds = config.get('max_rounds', 100)
        self.rounds_played = 0
        
    def on_round_start(self, ctx):
        self.rounds_played += 1
        
        # Check if we've reached max rounds
        if self.rounds_played > self.max_rounds:
            return BetDecision.stop(f"max_rounds_reached ({self.max_rounds})")
        
        # Check if we can afford the bet
        if self.bet_amount > ctx.get_balance():
            return BetDecision.stop("insufficient_balance")
        
        return BetDecision(
            amount=self.bet_amount,
            target=self.target,
            condition=self.condition
        )
    
    def on_round_complete(self, ctx, result):
        ctx.notify(f"Round {self.rounds_played}: {'WIN' if result.win else 'LOSS'} | Balance: {result.balance}")
