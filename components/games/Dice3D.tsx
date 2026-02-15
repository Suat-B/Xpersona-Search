"use client";

import { useState, useEffect } from "react";
import { ProbabilityRing } from "./ProbabilityRing";

interface Dice3DProps {
  value: number | null;
  isRolling: boolean;
  win: boolean | null;
  /** When set, use this duration (ms) for dice transition to match round speed */
  animationDurationMs?: number;
  /** Win probability (0–100) for the probability ring; when null, ring is hidden */
  winProbability?: number | null;
  /** Compact size for left instrument panel */
  compact?: boolean;
}

export function Dice3D({ value, isRolling, win, animationDurationMs, winProbability, compact }: Dice3DProps) {
  const [rotation, setRotation] = useState({ x: -20, y: 45 });
  const [displayValue, setDisplayValue] = useState<number | null>(null);

  useEffect(() => {
    if (isRolling) {
      // Random rotation during roll
      const interval = setInterval(() => {
        setRotation({
          x: Math.random() * 720 + 360,
          y: Math.random() * 720 + 360,
        });
      }, 100);
      return () => clearInterval(interval);
    } else if (value !== null) {
      // Final position based on value
      const finalRotation = getRotationForValue(value);
      setRotation(finalRotation);
      setDisplayValue(value);
    }
  }, [isRolling, value]);

  const getRotationForValue = (val: number): { x: number; y: number } => {
    // Map 0-99.99 to dice faces (simplified to 1-6 for 3D dice)
    const diceFace = Math.ceil((val / 100) * 6) || 1;
    
    const faceRotations: Record<number, { x: number; y: number }> = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: -90 },
      3: { x: -90, y: 0 },
      4: { x: 90, y: 0 },
      5: { x: 0, y: 90 },
      6: { x: 180, y: 0 },
    };
    
    return faceRotations[diceFace] || { x: 0, y: 0 };
  };

  const getDiceFace = (val: number): number => {
    return Math.ceil((val / 100) * 6) || 1;
  };

  const face = displayValue ? getDiceFace(displayValue) : null;

  const size = compact ? 100 : 120;
  return (
    <div className="relative perspective-1000" style={{ width: size, height: size }}>
      {/* Probability ring */}
      {winProbability != null && (
        <div className="absolute inset-0 overflow-visible">
          <ProbabilityRing winProbability={winProbability} />
        </div>
      )}
      {/* Glow effect — quant colors: blue for win, red for loss */}
      <div 
        className={`absolute inset-0 rounded-full blur-3xl transition-all duration-500 ${
          win === true ? "bg-[#0ea5e9]/40 scale-150" : 
          win === false ? "bg-red-500/40 scale-150" : 
          "bg-[#0ea5e9]/20 scale-100"
        }`}
      />
      
      {/* 3D Dice */}
      <div 
        className="relative w-full h-full transform-style-3d transition-transform ease-out"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transitionDuration: animationDurationMs != null ? `${animationDurationMs}ms` : "1000ms",
        }}
      >
        {/* Front - Face 1 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `translateZ(${size / 2}px)` }}>
          <div className="w-7 h-7 bg-gray-800 rounded-full shadow-inner" />
        </div>
        
        {/* Back - Face 6 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `rotateY(180deg) translateZ(${size / 2}px)` }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
          </div>
        </div>
        
        {/* Right - Face 5 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `rotateY(90deg) translateZ(${size / 2}px)` }}>
          <div className="relative w-full h-full">
            <div className="absolute top-3 left-3 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute top-3 right-3 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute bottom-3 left-3 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute bottom-3 right-3 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
          </div>
        </div>
        
        {/* Left - Face 2 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `rotateY(-90deg) translateZ(${size / 2}px)` }}>
          <div className="flex flex-col gap-7">
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
          </div>
        </div>
        
        {/* Top - Face 3 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `rotateX(90deg) translateZ(${size / 2}px)` }}>
          <div className="relative w-full h-full">
            <div className="absolute top-4 left-4 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
            <div className="absolute bottom-4 right-4 w-5 h-5 bg-gray-800 rounded-full shadow-inner" />
          </div>
        </div>
        
        {/* Bottom - Face 4 */}
        <div className="absolute bg-gradient-to-br from-white to-gray-200 rounded-xl border-[3px] border-gray-300 flex items-center justify-center backface-hidden shadow-2xl"
          style={{ width: size, height: size, transform: `rotateX(-90deg) translateZ(${size / 2}px)` }}>
          <div className="grid grid-cols-2 gap-5">
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
            <div className="w-6 h-6 bg-gray-800 rounded-full shadow-inner" />
          </div>
        </div>
      </div>
      
      {/* Value Display Overlay */}
      {displayValue !== null && !isRolling && (
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className={`text-4xl font-bold font-mono tabular-nums ${
            win === true ? "text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" : 
            win === false ? "text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" : 
            "text-[var(--text-primary)]"
          }`}>
            {displayValue.toFixed(2)}
          </span>
        </div>
      )}
      
      {/* Rolling indicator */}
      {isRolling && (
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
          <span className="text-2xl font-bold font-mono text-[#0ea5e9] animate-pulse">
            Executing...
          </span>
        </div>
      )}
    </div>
  );
}

// CSS for 3D transforms (added to globals.css)
export const diceStyles = `
  .perspective-1000 {
    perspective: 1000px;
  }
  .transform-style-3d {
    transform-style: preserve-3d;
  }
  .backface-hidden {
    backface-visibility: hidden;
  }
`;
