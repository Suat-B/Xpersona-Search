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

export const TARGET_PRESETS: { id: string; label: string; target: number; condition: "over" | "under" }[] = [
  { id: "50-over", label: "50% Over", target: 50, condition: "over" },
  { id: "50-under", label: "50% Under", target: 50, condition: "under" },
  { id: "75-over", label: "75% Over", target: 75, condition: "over" },
  { id: "7-under", label: "7% Under", target: 7, condition: "under" },
  { id: "25-over", label: "25% Over", target: 25, condition: "over" },
];
