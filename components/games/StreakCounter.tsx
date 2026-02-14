"use client";

import { useEffect, useState } from "react";

interface StreakData {
  currentStreak: number;
  bestStreak: number;
  isWinStreak: boolean;
}

export function useStreak(recentResults: { win: boolean }[]) {
  const [streakData, setStreakData] = useState<StreakData>({
    currentStreak: 0,
    bestStreak: 0,
    isWinStreak: false,
  });

  useEffect(() => {
    if (recentResults.length === 0) {
      setStreakData({ currentStreak: 0, bestStreak: 0, isWinStreak: false });
      return;
    }

    // Calculate current streak
    let currentStreak = 0;
    let isWinStreak = false;
    
    // Start from the most recent result
    for (let i = recentResults.length - 1; i >= 0; i--) {
      const result = recentResults[i];
      if (currentStreak === 0) {
        isWinStreak = result.win;
        currentStreak = 1;
      } else if (result.win === isWinStreak) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate best win streak
    let bestStreak = 0;
    let tempStreak = 0;
    
    for (const result of recentResults) {
      if (result.win) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    setStreakData({ currentStreak, bestStreak, isWinStreak });
  }, [recentResults]);

  return streakData;
}

interface StreakDisplayProps {
  currentStreak: number;
  bestStreak: number;
  isWinStreak: boolean;
}

export function StreakDisplay({ currentStreak, bestStreak, isWinStreak }: StreakDisplayProps) {
  if (currentStreak === 0) return null;

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
      <div className="flex items-center gap-2">
        <div className={`text-2xl ${isWinStreak ? "animate-pulse" : ""}`}>
          {isWinStreak ? "🔥" : "❄️"}
        </div>
        <div>
          <div className="text-xs text-[var(--text-secondary)]">
            Current {isWinStreak ? "Win" : "Loss"} Streak
          </div>
          <div className={`text-lg font-bold ${isWinStreak ? "text-emerald-400" : "text-red-400"}`}>
            {currentStreak}
          </div>
        </div>
      </div>
      
      <div className="w-px h-8 bg-[var(--border)]" />
      
      <div className="flex items-center gap-2">
        <div className="text-xl">🏆</div>
        <div>
          <div className="text-xs text-[var(--text-secondary)]">Best Win Streak</div>
          <div className="text-lg font-bold text-[var(--accent-heart)]">
            {bestStreak}
          </div>
        </div>
      </div>
    </div>
  );
}

// Achievements system
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: { rounds: number; wins: number; totalPnl: number; bestStreak: number }) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_win",
    name: "First Win",
    description: "Win your first dice roll",
    icon: "🎲",
    condition: (stats) => stats.wins >= 1,
  },
  {
    id: "high_roller",
    name: "High Roller",
    description: "Win 100+ credits in a single roll",
    icon: "💰",
    condition: (stats) => stats.totalPnl >= 100,
  },
  {
    id: "hot_streak",
    name: "Hot Streak",
    description: "Win 5 times in a row",
    icon: "🔥",
    condition: (stats) => stats.bestStreak >= 5,
  },
  {
    id: "veteran",
    name: "Veteran",
    description: "Play 50 rounds",
    icon: "⚔️",
    condition: (stats) => stats.rounds >= 50,
  },
  {
    id: "profitable",
    name: "In the Green",
    description: "End a session with positive PnL",
    icon: "📈",
    condition: (stats) => stats.totalPnl > 0 && stats.rounds >= 10,
  },
  {
    id: "legendary",
    name: "Legendary",
    description: "Win 10 times in a row",
    icon: "👑",
    condition: (stats) => stats.bestStreak >= 10,
  },
];

interface AchievementsPanelProps {
  rounds: number;
  wins: number;
  totalPnl: number;
  bestStreak: number;
}

export function AchievementsPanel({ rounds, wins, totalPnl, bestStreak }: AchievementsPanelProps) {
  const stats = { rounds, wins, totalPnl, bestStreak };
  
  const unlockedAchievements = ACHIEVEMENTS.filter(a => a.condition(stats));
  const lockedAchievements = ACHIEVEMENTS.filter(a => !a.condition(stats));
  
  const progress = Math.round((unlockedAchievements.length / ACHIEVEMENTS.length) * 100);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <span>🏆</span>
          Achievements
        </h4>
        <span className="text-xs text-[var(--accent-heart)] font-bold">
          {unlockedAchievements.length}/{ACHIEVEMENTS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-[var(--bg-matte)] rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[var(--accent-heart)] to-pink-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Unlocked achievements */}
      {unlockedAchievements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-400 font-medium">Unlocked</p>
          <div className="grid grid-cols-2 gap-2">
            {unlockedAchievements.map((achievement) => (
              <div 
                key={achievement.id}
                className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2"
              >
                <span className="text-lg">{achievement.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-400 truncate">{achievement.name}</p>
                  <p className="text-[10px] text-emerald-400/70 truncate">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked achievements */}
      {lockedAchievements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Locked</p>
          <div className="grid grid-cols-2 gap-2">
            {lockedAchievements.map((achievement) => (
              <div 
                key={achievement.id}
                className="p-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] flex items-center gap-2 opacity-50"
              >
                <span className="text-lg grayscale">{achievement.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-secondary)] truncate">{achievement.name}</p>
                  <p className="text-[10px] text-[var(--text-secondary)]/70 truncate">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
