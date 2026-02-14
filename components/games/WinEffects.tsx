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
      const timer = setTimeout(() => setShowEffects(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (!showEffects) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Screen flash on big wins */}
      {(isBigWin || isHugeWin) && (
        <div 
          className={`absolute inset-0 animate-flash ${
            isHugeWin ? "bg-yellow-500/20" : "bg-emerald-500/10"
          }`}
        />
      )}

      {/* Floating text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className={`text-6xl md:text-8xl font-black animate-float-text ${
            win 
              ? isHugeWin 
                ? "text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]"
                : isBigWin
                  ? "text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.6)]"
                  : "text-emerald-400"
              : "text-red-400"
          }`}
          style={{
            animation: "floatUp 2s ease-out forwards",
          }}
        >
          {win ? (
            isHugeWin ? "MEGA WIN!" : isBigWin ? "BIG WIN!" : "WIN!"
          ) : (
            "LOSE"
          )}
        </div>
      </div>

      {/* Side streaks for big wins */}
      {(isBigWin || isHugeWin) && (
        <>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-32 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-streak-left" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-32 bg-gradient-to-l from-transparent via-yellow-400 to-transparent animate-streak-right" />
        </>
      )}

      {/* Payout amount */}
      {win && (
        <div 
          className="absolute top-1/3 left-1/2 -translate-x-1/2 text-3xl md:text-5xl font-bold text-white drop-shadow-lg"
          style={{ animation: "fadeInScale 0.5s ease-out forwards" }}
        >
          +{payout.toLocaleString()} credits
        </div>
      )}

      <style jsx>{`
        @keyframes floatUp {
          0% {
            transform: translateY(50px) scale(0.5);
            opacity: 0;
          }
          20% {
            transform: translateY(0) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translateY(-100px) scale(1);
            opacity: 0;
          }
        }
        @keyframes fadeInScale {
          0% {
            transform: translateX(-50%) scale(0.8);
            opacity: 0;
          }
          100% {
            transform: translateX(-50%) scale(1);
            opacity: 1;
          }
        }
        @keyframes streak-left {
          0% {
            transform: translateX(-100%) translateY(-50%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(100vw) translateY(-50%);
            opacity: 0;
          }
        }
        @keyframes streak-right {
          0% {
            transform: translateX(100%) translateY(-50%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(-100vw) translateY(-50%);
            opacity: 0;
          }
        }
        .animate-flash {
          animation: flash 0.3s ease-out;
        }
        @keyframes flash {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        .animate-streak-left {
          animation: streak-left 1s ease-out forwards;
        }
        .animate-streak-right {
          animation: streak-right 1s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
