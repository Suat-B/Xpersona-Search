"""
Adaptive Pattern Detection Strategy
Analyzes recent history for patterns and adjusts bets accordingly.
Uses statistical analysis (no ML) to detect hot numbers and streaks.

Risk: MEDIUM - Adapts to patterns
Best for: Players who believe in pattern recognition
"""

import statistics

class Strategy:
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.max_bet = config.get('max_bet', 200)
        self.lookback = config.get('lookback_rounds', 20)
        self.min_bet_multiplier = config.get('min_bet_multiplier', 1.0)
        self.max_bet_multiplier = config.get('max_bet_multiplier', 2.5)
        
        # Confidence tracking
        self.recent_wins = []
        self.confidence_window = 10
        
    def analyze_patterns(self, history):
        """Analyze history for patterns and return confidence."""
        if not history:
            return 0.5, 50, "over"  # Default: 50/50
        
        # Calculate win rate in recent history
        recent_results = history[-self.lookback:] if len(history) > self.lookback else history
        wins = sum(1 for r in recent_results if r.get('win', False))
        total = len(recent_results)
        win_rate = wins / total if total > 0 else 0.5
        
        # Calculate streaks
        current_streak = 0
        for r in reversed(recent_results):
            if r.get('win', False):
                current_streak += 1
            else:
                break
        
        # Calculate value distribution
        results = [r.get('result', 50) for r in recent_results]
        avg_result = statistics.mean(results) if len(results) > 0 else 50
        median_result = statistics.median(results) if len(results) > 0 else 50
        
        # Calculate hot zones (where wins tend to cluster)
        win_results = [r.get('result', 50) for r in recent_results if r.get('win', False)]
        if win_results:
            avg_win_result = statistics.mean(win_results)
        else:
            avg_win_result = 50
        
        # Determine confidence based on patterns
        confidence = 0.5  # Base confidence
        
        # Adjust for win rate (but be conservative)
        if win_rate > 0.55:
            confidence += 0.1 * min((win_rate - 0.55) * 10, 1)  # Up to +10%
        elif win_rate < 0.45:
            confidence -= 0.1 * min((0.45 - win_rate) * 10, 1)  # Up to -10%
        
        # Adjust for streaks
        if current_streak >= 3:
            confidence += 0.05  # Small boost for hot streak
        
        # Clamp confidence
        confidence = max(0.4, min(confidence, 0.6))  # Keep within [0.4, 0.6]
        
        # Determine target based on win zone
        if avg_win_result > 50:
            target = max(45, min(avg_win_result - 5, 60))
            condition = "under"  # Bet under win zone
        else:
            target = max(40, min(avg_win_result + 5, 55))
            condition = "over"   # Bet over win zone
        
        return confidence, target, condition
    
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        history = ctx.get_history(self.lookback)
        
        # Analyze patterns
        confidence, target, condition = self.analyze_patterns(history)
        
        # Calculate bet multiplier based on confidence
        bet_multiplier = self.min_bet_multiplier + (confidence - 0.4) * (self.max_bet_multiplier - self.min_bet_multiplier) / 0.2
        bet_multiplier = max(self.min_bet_multiplier, min(bet_multiplier, self.max_bet_multiplier))
        
        bet_amount = self.base_bet * bet_multiplier
        bet_amount = min(bet_amount, balance, self.max_bet)
        
        # Calculate theoretical odds
        odds = ctx.calculate_odds(target, condition)
        
        ctx.notify(f"Confidence: {confidence:.2f} | Target: {target} {condition} | Odds: {odds['multiplier']:.2f}x")
        
        return BetDecision(
            amount=bet_amount,
            target=target,
            condition=condition
        )
    
    def on_round_complete(self, ctx, result):
        # Track recent wins for confidence calculation
        self.recent_wins.append(result.win)
        if len(self.recent_wins) > self.confidence_window:
            self.recent_wins.pop(0)
        
        # Log result
        win_rate = sum(self.recent_wins) / len(self.recent_wins) if self.recent_wins else 0.5
        ctx.notify(f"Result: {result.result:.2f} | {'WIN' if result.win else 'LOSS'} | Recent win rate: {win_rate:.1%}")
