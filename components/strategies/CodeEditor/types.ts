export interface PythonTemplate {
  id: string;
  name: string;
  description: string;
  risk: 'LOW' | 'MEDIUM' | 'MEDIUM-HIGH' | 'HIGH' | 'CALCULATED';
  category: 'basic' | 'progression' | 'advanced';
  code: string;
}

export const TEMPLATES: Record<string, PythonTemplate> = {
  'martingale': {
    id: 'martingale',
    name: 'Martingale',
    description: 'Double bet after each loss, reset after win.',
    risk: 'HIGH',
    category: 'progression',
    code: `"""
Classic Martingale Strategy
Double bet after each loss, reset on win.
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
        if self.current_bet > balance:
            return BetDecision.stop("insufficient_balance")
        if self.consecutive_losses >= self.max_consecutive_losses:
            return BetDecision.stop(f"max_consecutive_losses ({self.max_consecutive_losses}) reached")
        return BetDecision(amount=self.current_bet, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            self.current_bet = self.base_bet
            self.consecutive_losses = 0
        else:
            self.consecutive_losses += 1
            self.current_bet = min(self.current_bet * 2, self.max_bet, ctx.get_balance())`
  },
  'dalembert': {
    id: 'dalembert',
    name: "D'Alembert",
    description: 'Add base unit to bet on loss, subtract on win.',
    risk: 'MEDIUM',
    category: 'progression',
    code: `"""
D'Alembert Strategy
"""

class Strategy:
    def __init__(self, config):
        self.unit = config.get('unit', 10)
        self.current_bet = self.unit
        self.min_bet = config.get('min_bet', 1)
        self.max_bet = config.get('max_bet', 500)
        
    def on_round_start(self, ctx):
        self.current_bet = min(self.current_bet, ctx.get_balance())
        self.current_bet = max(self.current_bet, self.min_bet)
        self.current_bet = min(self.current_bet, self.max_bet)
        return BetDecision(amount=self.current_bet, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            self.current_bet = max(self.current_bet - self.unit, self.min_bet)
        else:
            self.current_bet = min(self.current_bet + self.unit, self.max_bet)`
  },
  'fibonacci': {
    id: 'fibonacci',
    name: 'Fibonacci',
    description: 'Follow Fibonacci sequence: 1, 1, 2, 3, 5, 8...',
    risk: 'MEDIUM',
    category: 'progression',
    code: `"""
Fibonacci Strategy
"""

class Strategy:
    def __init__(self, config):
        self.unit = config.get('unit', 10)
        self.fib_sequence = [1, 1]
        self.current_index = 0
        self.max_bet = config.get('max_bet', 1000)
        self.max_index = 10
        
    def on_round_start(self, ctx):
        fib_number = self.fib_sequence[self.current_index]
        bet_amount = fib_number * self.unit
        bet_amount = min(bet_amount, ctx.get_balance(), self.max_bet)
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            if self.current_index >= 2:
                self.current_index -= 2
            else:
                self.current_index = 0
        else:
            if self.current_index < self.max_index:
                if self.current_index + 1 >= len(self.fib_sequence):
                    next_num = self.fib_sequence[-1] + self.fib_sequence[-2]
                    self.fib_sequence.append(next_num)
                self.current_index += 1`
  },
  'labouchere': {
    id: 'labouchere',
    name: 'Labouchère',
    description: 'Cancellation system with sequence.',
    risk: 'MEDIUM-HIGH',
    category: 'progression',
    code: `"""
Labouchère Strategy
"""

class Strategy:
    def __init__(self, config):
        initial = config.get('initial_sequence', [1, 2, 3, 4])
        self.unit = config.get('unit', 10)
        self.sequence = [x * self.unit for x in initial]
        self.max_bet = config.get('max_bet', 500)
        self.max_sequence_length = config.get('max_sequence_length', 15)
        
    def on_round_start(self, ctx):
        if len(self.sequence) == 0:
            return BetDecision.stop("sequence_complete")
        bet_amount = self.sequence[0] + self.sequence[-1]
        bet_amount = min(bet_amount, ctx.get_balance(), self.max_bet)
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            removed = [self.sequence.pop(0)]
            if self.sequence:
                removed.append(self.sequence.pop())
        else:
            added = self.sequence[0] + self.sequence[-1]
            self.sequence.append(added)
        if len(self.sequence) > self.max_sequence_length:
            return BetDecision.stop("sequence_too_long")`
  },
  'paroli': {
    id: 'paroli',
    name: 'Paroli',
    description: 'Positive progression: triple bet on win streaks.',
    risk: 'LOW',
    category: 'progression',
    code: `"""
Paroli Strategy
"""

class Strategy:
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.current_bet = self.base_bet
        self.consecutive_wins = 0
        self.max_consecutive_wins = 3
        
    def on_round_start(self, ctx):
        bet_amount = min(self.current_bet, ctx.get_balance())
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            self.consecutive_wins += 1
            if self.consecutive_wins >= self.max_consecutive_wins:
                self.current_bet = self.base_bet
                self.consecutive_wins = 0
            else:
                self.current_bet = min(self.current_bet * 3, ctx.get_balance())
        else:
            self.current_bet = self.base_bet
            self.consecutive_wins = 0`
  },
  'oscar-grind': {
    id: 'oscar-grind',
    name: "Oscar's Grind",
    description: 'Conservative +1 unit aim per session.',
    risk: 'LOW',
    category: 'progression',
    code: `"""
Oscar's Grind Strategy
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
        if self.session_profit >= self.target_profit:
            return BetDecision.stop(f"target_profit_reached")
        if self.session_profit <= self.stop_loss:
            return BetDecision.stop(f"stop_loss_reached")
        bet_amount = min(self.current_bet, ctx.get_balance(), self.max_bet)
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        if result.win:
            self.current_bet = min(self.current_bet + self.unit, self.max_bet)
            self.session_profit += (result.payout - self.current_bet)
        else:
            self.session_profit -= self.current_bet`
  },
  'kelly-criterion': {
    id: 'kelly-criterion',
    name: 'Kelly Criterion',
    description: 'Mathematically optimal bet sizing based on edge.',
    risk: 'CALCULATED',
    category: 'advanced',
    code: `"""
Kelly Criterion Strategy
"""

class Strategy:
    def __init__(self, config):
        self.fraction = config.get('kelly_fraction', 0.25)
        self.min_bet = config.get('min_bet', 1)
        self.max_bet = config.get('max_bet', 500)
        self.house_edge = 0.03
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        win_prob = 0.50
        odds = (1 - self.house_edge) / win_prob
        b = odds - 1
        p = win_prob
        q = 1 - p
        kelly_fraction = (b * p - q) / b if b > 0 else 0
        
        if kelly_fraction <= 0:
            bet_amount = min(self.min_bet, balance)
        else:
            bet_fraction = kelly_fraction * self.fraction
            bet_amount = balance * bet_fraction
        
        bet_amount = max(bet_amount, self.min_bet)
        bet_amount = min(bet_amount, self.max_bet)
        bet_amount = min(bet_amount, balance)
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        pass`
  },
  'adaptive-ai': {
    id: 'adaptive-ai',
    name: 'Adaptive Pattern Detection',
    description: 'Analyze history, detect patterns, adapt bets dynamically.',
    risk: 'MEDIUM',
    category: 'advanced',
    code: `"""
Adaptive Pattern Detection Strategy
"""

import statistics

class Strategy:
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.max_bet = config.get('max_bet', 200)
        self.lookback = config.get('lookback_rounds', 20)
        self.min_bet_multiplier = config.get('min_bet_multiplier', 1.0)
        self.max_bet_multiplier = config.get('max_bet_multiplier', 2.5)
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        history = ctx.get_history(self.lookback)
        
        if not history:
            confidence, target, condition = 0.5, 50, "over"
        else:
            recent_results = history[-self.lookback:] if len(history) > self.lookback else history
            wins = sum(1 for r in recent_results if r.get('win', False))
            total = len(recent_results)
            win_rate = wins / total if total > 0 else 0.5
            
            current_streak = 0
            for r in reversed(recent_results):
                if r.get('win', False):
                    current_streak += 1
                else:
                    break
            
            results = [r.get('result', 50) for r in recent_results]
            avg_result = statistics.mean(results) if len(results) > 0 else 50
            
            confidence = 0.5
            if win_rate > 0.55:
                confidence += 0.1 * min((win_rate - 0.55) * 10, 1)
            elif win_rate < 0.45:
                confidence -= 0.1 * min((0.45 - win_rate) * 10, 1)
            
            if current_streak >= 3:
                confidence += 0.05
            
            confidence = max(0.4, min(confidence, 0.6))
            
            target = max(40, min(avg_result + 5, 55))
            condition = "over"
        
        bet_multiplier = self.min_bet_multiplier + (confidence - 0.4) * (self.max_bet_multiplier - self.min_bet_multiplier) / 0.2
        bet_multiplier = max(self.min_bet_multiplier, min(bet_multiplier, self.max_bet_multiplier))
        
        bet_amount = self.base_bet * bet_multiplier
        bet_amount = min(bet_amount, balance, self.max_bet)
        
        return BetDecision(amount=bet_amount, target=target, condition=condition)
    
    def on_round_complete(self, ctx, result):
        pass`
  },
  'simple-bet': {
    id: 'simple-bet',
    name: 'Simple Fixed Bet',
    description: 'Place same bet every round. Best for beginners.',
    risk: 'LOW',
    category: 'basic',
    code: `"""
Simple Fixed Bet Strategy
"""

class Strategy:
    def __init__(self, config):
        self.bet_amount = config.get('bet_amount', 10)
        self.max_rounds = config.get('max_rounds', 100)
        self.rounds_played = 0
        
    def on_round_start(self, ctx):
        self.rounds_played += 1
        if self.rounds_played > self.max_rounds:
            return BetDecision.stop(f"max_rounds_reached")
        if self.bet_amount > ctx.get_balance():
            return BetDecision.stop("insufficient_balance")
        return BetDecision(amount=self.bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        pass`
  },
  'random-bet': {
    id: 'random-bet',
    name: 'Random Variation',
    description: 'Randomize bet amounts within range.',
    risk: 'LOW',
    category: 'basic',
    code: `"""
Random Variation Strategy
"""

import random

class Strategy:
    def __init__(self, config):
        self.min_bet = config.get('min_bet', 5)
        self.max_bet = config.get('max_bet', 50)
        self.max_rounds = config.get('max_rounds', 100)
        self.rounds_played = 0
        
    def on_round_start(self, ctx):
        self.rounds_played += 1
        if self.rounds_played > self.max_rounds:
            return BetDecision.stop(f"max_rounds_reached")
        bet_amount = random.randint(self.min_bet, self.max_bet)
        bet_amount = min(bet_amount, ctx.get_balance())
        return BetDecision(amount=bet_amount, target=50, condition="over")
    
    def on_round_complete(self, ctx, result):
        pass`
  }
};

export function getTemplatesByCategory(category: string): PythonTemplate[] {
  return Object.values(TEMPLATES).filter(t => t.category === category);
}

export function getTemplateById(id: string): PythonTemplate | undefined {
  return TEMPLATES[id];
}
