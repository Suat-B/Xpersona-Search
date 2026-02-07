"""
Fibonacci Strategy
Follow Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, 21...
Move back two steps on win, forward one on loss.

Risk: MEDIUM - More controlled progression
Best for: Moderate variance, structured approach
"""

class Strategy:
    def __init__(self, config):
        self.unit = config.get('unit', 10)
        self.fib_sequence = [1, 1]
        self.current_index = 0  # Position in sequence
        self.max_bet = config.get('max_bet', 1000)
        self.max_index = 10  # Don't go too deep into sequence
        
    def on_round_start(self, ctx):
        # Get bet amount from sequence
        fib_number = self.fib_sequence[self.current_index]
        bet_amount = fib_number * self.unit
        
        # Cap to balance and max bet
        bet_amount = min(bet_amount, ctx.get_balance(), self.max_bet)
        
        return BetDecision(
            amount=bet_amount,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            # Move back two steps (or to start)
            if self.current_index >= 2:
                self.current_index -= 2
            else:
                self.current_index = 0
            ctx.notify("Win! Moving back in Fibonacci sequence")
        else:
            # Move forward one step
            if self.current_index < self.max_index:
                # Generate next fibonacci number if needed
                if self.current_index + 1 >= len(self.fib_sequence):
                    next_num = self.fib_sequence[-1] + self.fib_sequence[-2]
                    self.fib_sequence.append(next_num)
                self.current_index += 1
            ctx.notify("Loss! Moving forward in Fibonacci sequence")
