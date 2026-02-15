"use client";

import { useEffect, useState } from "react";

interface WinEffectsProps {
  active: boolean;
  win: boolean;
  payout: number;
  betAmount: number;
}

export function WinEffects({ active, win, payout, betAmount }: WinEffectsProps) {
  const [showEffects, setShowEffects] = useState(false);
  const isBigWin = win && payout >= betAmount * 3;
  const isHugeWin = win && payout >= betAmount * 5;

  useEffect(() => {
    if (active) {
      setShowEffects(true);
      const timer = setTimeout(() => setShowEffects(false), 3200);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (!showEffects) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Screen border glow — thin border flash around viewport */}
      <div
        className={`absolute inset-0 rounded-none ${
          win
            ? "win-effects-border-win"
            : "win-effects-border-lose"
        }`}
      />

      {/* Screen flash on big wins — softer */}
      {(isBigWin || isHugeWin) && (
        <div
          className={`absolute inset-0 ${
            isHugeWin ? "bg-yellow-500/15" : "bg-emerald-500/8"
          }`}
          style={{
            animation: "winFlash 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        />
      )}

      {/* Main result + floating payout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div
          className={`text-6xl md:text-8xl font-black ${
            win
              ? isHugeWin
                ? "text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]"
                : isBigWin
                  ? "text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.6)]"
                  : "text-emerald-400 drop-shadow-[0_0_16px_rgba(52,211,153,0.5)]"
              : "text-red-400 drop-shadow-[0_0_16px_rgba(248,113,113,0.5)]"
          }`}
          style={{
            animation: "winFloatUp 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          {win ? (isHugeWin ? "MEGA WIN!" : isBigWin ? "BIG WIN!" : "WIN!") : "LOSE"}
        </div>
        {/* Payout amount floating up */}
        <div
          className={`text-2xl md:text-3xl font-bold font-mono tabular-nums ${
            win ? "text-emerald-400" : "text-red-400/90"
          }`}
          style={{
            animation: "payoutFloatUp 2s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards",
            opacity: 0,
          }}
        >
          {win ? `+${payout.toFixed(0)} cr` : `-${betAmount.toFixed(0)} cr`}
        </div>
      </div>

      {/* Side streaks for big wins — smoother */}
      {(isBigWin || isHugeWin) && (
        <>
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-32 bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent"
            style={{ animation: "streakLeft 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
          />
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-32 bg-gradient-to-l from-transparent via-yellow-400/60 to-transparent"
            style={{ animation: "streakRight 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
          />
        </>
      )}

      <style jsx>{`
        @keyframes winFlash {
          0% {
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes winFloatUp {
          0% {
            transform: translateY(40px) scale(0.6);
            opacity: 0;
          }
          25% {
            transform: translateY(0) scale(1.05);
            opacity: 1;
          }
          100% {
            transform: translateY(-80px) scale(1);
            opacity: 0;
          }
        }
        @keyframes payoutFloatUp {
          0% {
            transform: translateY(20px);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(-60px);
            opacity: 0;
          }
        }
        @keyframes streakLeft {
          0% {
            transform: translateX(-100%) translateY(-50%);
            opacity: 0;
          }
          40% {
            opacity: 0.8;
          }
          100% {
            transform: translateX(100vw) translateY(-50%);
            opacity: 0;
          }
        }
        @keyframes streakRight {
          0% {
            transform: translateX(100%) translateY(-50%);
            opacity: 0;
          }
          40% {
            opacity: 0.8;
          }
          100% {
            transform: translateX(-100vw) translateY(-50%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
