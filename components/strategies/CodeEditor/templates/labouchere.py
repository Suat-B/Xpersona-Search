"""
Labouchère (Cancellation) Strategy
Start with sequence like [1,2,3,4]. Bet sum of first+last.
Win: remove first+last. Loss: add sum to end.
Goal: Cancel entire sequence.

Risk: MEDIUM-HIGH - Can extend on losses
Best for: Patient players, controlled sessions
"""

class Strategy:
    def __init__(self, config):
        # Initial sequence (can be customized)
        initial = config.get('initial_sequence', [1, 2, 3, 4])
        self.unit = config.get('unit', 10)
        self.sequence = [x * self.unit for x in initial]
        self.max_bet = config.get('max_bet', 500)
        self.max_sequence_length = config.get('max_sequence_length', 15)
        
    def on_round_start(self, ctx):
        # If sequence is empty or single number, strategy complete
        if len(self.sequence) == 0:
            return BetDecision.stop("sequence_complete - all numbers cancelled!")
        
        # Bet = first + last
        bet_amount = self.sequence[0] + self.sequence[-1]
        
        # Cap to limits
        bet_amount = min(bet_amount, ctx.get_balance(), self.max_bet)
        
        return BetDecision(
            amount=bet_amount,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            # Remove first and last
            removed = [self.sequence.pop(0)]
            if self.sequence:
                removed.append(self.sequence.pop())
            ctx.notify(f"Win! Cancelled: {removed}")
        else:
            # Add bet amount to end
            added = self.sequence[0] + self.sequence[-1]
            self.sequence.append(added)
            ctx.notify(f"Loss! Added {added} to sequence")
        
        # Safety: sequence too long
        if len(self.sequence) > self.max_sequence_length:
            return BetDecision.stop("sequence_too_long - consider stopping")
