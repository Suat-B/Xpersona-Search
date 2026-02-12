/**
 * Shared Creative dice strategy definitions.
 * Single source for DiceStatisticsPanel and strategy page.
 */

import type { DiceProgressionType } from "./strategies";

export type DiceConfig = { amount: number; target: number; condition: "over" | "under" };

export type CreativeStrategy = {
  id: string;
  name: string;
  desc: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CALCULATED";
  config: DiceConfig & { progressionType?: DiceProgressionType };
  icon: string;
};

export const CREATIVE_DICE_STRATEGIES: CreativeStrategy[] = [
  {
    id: "martingale",
    name: "Martingale",
    desc: "Double bet after each loss, reset on win. High variance.",
    risk: "HIGH",
    config: { amount: 10, target: 50, condition: "over", progressionType: "martingale" },
    icon: "📈",
  },
  {
    id: "paroli",
    name: "Paroli",
    desc: "Triple bet on win, reset after 3 wins. Capitalizes on hot streaks.",
    risk: "LOW",
    config: { amount: 10, target: 50, condition: "over", progressionType: "paroli" },
    icon: "🔥",
  },
  {
    id: "dalembert",
    name: "D'Alembert",
    desc: "Increase bet by 1 on loss, decrease on win. Gentle progression.",
    risk: "MEDIUM",
    config: { amount: 10, target: 50, condition: "over", progressionType: "dalembert" },
    icon: "⚖️",
  },
  {
    id: "fibonacci",
    name: "Fibonacci",
    desc: "Follow Fibonacci sequence. Classic progression system.",
    risk: "MEDIUM",
    config: { amount: 10, target: 50, condition: "over", progressionType: "fibonacci" },
    icon: "🐚",
  },
  {
    id: "labouchere",
    name: "Labouchere",
    desc: "Line-based betting. Cancel numbers on win.",
    risk: "HIGH",
    config: { amount: 10, target: 50, condition: "over", progressionType: "labouchere" },
    icon: "📋",
  },
  {
    id: "oscar",
    name: "Oscar's Grind",
    desc: "Add 1 unit on win only. Very conservative.",
    risk: "LOW",
    config: { amount: 10, target: 50, condition: "over", progressionType: "oscar" },
    icon: "🎯",
  },
  {
    id: "kelly",
    name: "Kelly Criterion",
    desc: "Math-optimal bet sizing. Maximizes long-term growth.",
    risk: "CALCULATED",
    config: { amount: 10, target: 50, condition: "over", progressionType: "kelly" },
    icon: "📐",
  },
  {
    id: "flat",
    name: "Flat / Simple",
    desc: "Constant bet every round. Lowest variance.",
    risk: "LOW",
    config: { amount: 10, target: 50, condition: "over", progressionType: "flat" },
    icon: "📊",
  },
  {
    id: "high-roller",
    name: "High Roller",
    desc: "Big bets on 75% Over. Chase big wins.",
    risk: "HIGH",
    config: { amount: 50, target: 75, condition: "over", progressionType: "flat" },
    icon: "💎",
  },
  {
    id: "conservative",
    name: "Conservative",
    desc: "Small bets, 50 Under. Steady, low-risk play.",
    risk: "LOW",
    config: { amount: 5, target: 50, condition: "under", progressionType: "flat" },
    icon: "🛡️",
  },
  {
    id: "lucky-7",
    name: "Lucky 7",
    desc: "Bet on 7% Under. Long odds, high payout.",
    risk: "HIGH",
    config: { amount: 10, target: 7, condition: "under", progressionType: "flat" },
    icon: "🍀",
  },
  {
    id: "center",
    name: "Center Strike",
    desc: "50% target, balanced Over. RTP-focused.",
    risk: "MEDIUM",
    config: { amount: 20, target: 50, condition: "over", progressionType: "flat" },
    icon: "⭕",
  },
];

export type TargetPreset = { id: string; label: string; target: number; condition: "over" | "under"; category?: string };

export const TARGET_PRESETS: TargetPreset[] = [
  // High Payout (low odds)
  { id: "5-over", label: "5% Over (~20x)", target: 5, condition: "over", category: "High Payout" },
  { id: "10-over", label: "10% Over (~10x)", target: 10, condition: "over", category: "High Payout" },
  { id: "15-over", label: "15% Over (~6x)", target: 15, condition: "over", category: "High Payout" },
  { id: "7-under", label: "7% Under (~15x)", target: 7, condition: "under", category: "High Payout" },
  { id: "3-under", label: "3% Under (~30x)", target: 3, condition: "under", category: "High Payout" },
  { id: "20-over", label: "20% Over (~5x)", target: 20, condition: "over", category: "High Payout" },
  // Balanced
  { id: "25-over", label: "25% Over (~4x)", target: 25, condition: "over", category: "Balanced" },
  { id: "33-over", label: "33% Over (~3x)", target: 33, condition: "over", category: "Balanced" },
  { id: "33-under", label: "33% Under (~3x)", target: 33, condition: "under", category: "Balanced" },
  { id: "50-over", label: "50% Over (~2x)", target: 50, condition: "over", category: "Balanced" },
  { id: "50-under", label: "50% Under (~2x)", target: 50, condition: "under", category: "Balanced" },
  { id: "66-over", label: "66% Over (~1.5x)", target: 66, condition: "over", category: "Balanced" },
  // High Probability (low payout)
  { id: "75-over", label: "75% Over", target: 75, condition: "over", category: "High Probability" },
  { id: "80-over", label: "80% Over", target: 80, condition: "over", category: "High Probability" },
  { id: "90-over", label: "90% Over", target: 90, condition: "over", category: "High Probability" },
  { id: "90-under", label: "90% Under", target: 90, condition: "under", category: "High Probability" },
  { id: "95-over", label: "95% Over", target: 95, condition: "over", category: "High Probability" },
  // Extreme
  { id: "1-over", label: "1% Over (extreme)", target: 1, condition: "over", category: "Extreme" },
  { id: "99-over", label: "99% Over (extreme)", target: 99, condition: "over", category: "Extreme" },
  { id: "2-under", label: "2% Under (extreme)", target: 2, condition: "under", category: "Extreme" },
];

export type PayoutPreset = { id: string; label: string; target: number; condition: "over" | "under" };

export const PAYOUT_PRESETS: PayoutPreset[] = [
  { id: "2x-50-over", label: "~2x (50 Over)", target: 50, condition: "over" },
  { id: "2x-50-under", label: "~2x (50 Under)", target: 50, condition: "under" },
  { id: "3x-33-over", label: "~3x (33 Over)", target: 33, condition: "over" },
  { id: "3x-33-under", label: "~3x (33 Under)", target: 33, condition: "under" },
  { id: "5x-20-over", label: "~5x (20 Over)", target: 20, condition: "over" },
  { id: "10x-10-over", label: "~10x (10 Over)", target: 10, condition: "over" },
  { id: "15x-7-under", label: "~15x (7 Under)", target: 7, condition: "under" },
  { id: "20x-5-over", label: "~20x (5 Over)", target: 5, condition: "over" },
  { id: "30x-3-under", label: "~30x (3 Under)", target: 3, condition: "under" },
];

export type RiskProfile = {
  id: string;
  name: string;
  amount: number;
  maxBet: number;
  progressionType: DiceProgressionType;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
};

export const RISK_PROFILES: RiskProfile[] = [
  { id: "aggressive", name: "Aggressive", amount: 25, maxBet: 5000, progressionType: "martingale", maxConsecutiveLosses: 5, maxConsecutiveWins: 3 },
  { id: "balanced", name: "Balanced", amount: 10, maxBet: 500, progressionType: "paroli", maxConsecutiveLosses: 10, maxConsecutiveWins: 3 },
  { id: "conservative", name: "Conservative", amount: 5, maxBet: 100, progressionType: "flat", maxConsecutiveLosses: 3, maxConsecutiveWins: 2 },
  { id: "yolo", name: "YOLO", amount: 50, maxBet: 10000, progressionType: "martingale", maxConsecutiveLosses: 15, maxConsecutiveWins: 5 },
  { id: "grinder", name: "Grinder", amount: 5, maxBet: 200, progressionType: "oscar", maxConsecutiveLosses: 5, maxConsecutiveWins: 2 },
];
