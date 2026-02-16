"use client";

import { useState, useEffect, useMemo } from "react";
import { ProbabilityRing } from "./ProbabilityRing";

interface Dice3DProps {
  value: number | null;
  isRolling: boolean;
  win: boolean | null;
  animationDurationMs?: number;
  winProbability?: number | null;
  compact?: boolean;
  /** Hero mode: larger size with dramatic glow for center stage */
  hero?: boolean;
}

export function Dice3D({ value, isRolling, win, animationDurationMs, winProbability, compact, hero }: Dice3DProps) {
  const [rotation, setRotation] = useState({ x: -20, y: 45 });
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (isRolling) {
      setSettled(false);
      const interval = setInterval(() => {
        setRotation({
          x: Math.random() * 720 + 360,
          y: Math.random() * 720 + 360,
        });
      }, 80);
      return () => clearInterval(interval);
    } else if (value !== null) {
      const finalRotation = getRotationForValue(value);
      setRotation(finalRotation);
      setDisplayValue(value);
      setSettled(true);
    }
  }, [isRolling, value]);

  const getRotationForValue = (val: number): { x: number; y: number } => {
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

  const size = hero ? 160 : compact ? 90 : 110;
  const dotSize = hero ? "w-5 h-5" : compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const smallDotSize = hero ? "w-4 h-4" : compact ? "w-3 h-3" : "w-3.5 h-3.5";

  const glowClass = useMemo(() => {
    if (win === true) return "dice-hero-glow dice-hero-glow-win";
    if (win === false) return "dice-hero-glow dice-hero-glow-loss";
    return "dice-hero-glow dice-hero-glow-neutral";
  }, [win]);

  const faceStyle = (transform: string) => ({
    width: size,
    height: size,
    transform,
  });

  const DiceDot = ({ className = "" }: { className?: string }) => (
    <div className={`${smallDotSize} rounded-full dice-face-dot ${className}`} />
  );

  const LargeDot = () => (
    <div className={`${dotSize} rounded-full dice-face-dot`} />
  );

  return (
    <div className={`relative ${hero ? "center-stage" : ""}`} style={{ width: hero ? 280 : size + 40, height: hero ? 280 : size + 40 }}>
      {/* Hero glow backdrop */}
      {hero && (
        <div
          className={glowClass}
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      )}

      {/* Probability ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`relative ${hero ? "prob-ring-glow" : ""}`} style={{ width: size + 30, height: size + 30 }}>
          {winProbability != null && (
            <ProbabilityRing winProbability={winProbability} hero={hero} />
          )}
        </div>
      </div>

      {/* 3D Dice container */}
      <div className="absolute inset-0 flex items-center justify-center perspective-1000">
        <div
          className={`relative transform-style-3d ease-out ${settled && !isRolling ? "animate-dice-settle" : ""}`}
          style={{
            width: size,
            height: size,
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transitionDuration: isRolling ? "80ms" : animationDurationMs != null ? `${animationDurationMs}ms` : "800ms",
            transitionProperty: "transform",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* Front - Face 1 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`translateZ(${size / 2}px)`)}>
            <LargeDot />
          </div>

          {/* Back - Face 6 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`rotateY(180deg) translateZ(${size / 2}px)`)}>
            <div className="grid grid-cols-2 gap-2.5">
              <DiceDot /><DiceDot />
              <DiceDot /><DiceDot />
              <DiceDot /><DiceDot />
            </div>
          </div>

          {/* Right - Face 5 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`rotateY(90deg) translateZ(${size / 2}px)`)}>
            <div className="relative w-full h-full p-3">
              <div className="absolute top-3 left-3"><DiceDot /></div>
              <div className="absolute top-3 right-3"><DiceDot /></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><DiceDot /></div>
              <div className="absolute bottom-3 left-3"><DiceDot /></div>
              <div className="absolute bottom-3 right-3"><DiceDot /></div>
            </div>
          </div>

          {/* Left - Face 2 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`rotateY(-90deg) translateZ(${size / 2}px)`)}>
            <div className="flex flex-col gap-6">
              <DiceDot />
              <DiceDot />
            </div>
          </div>

          {/* Top - Face 3 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`rotateX(90deg) translateZ(${size / 2}px)`)}>
            <div className="relative w-full h-full p-3.5">
              <div className="absolute top-3.5 left-3.5"><DiceDot /></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><DiceDot /></div>
              <div className="absolute bottom-3.5 right-3.5"><DiceDot /></div>
            </div>
          </div>

          {/* Bottom - Face 4 */}
          <div className="absolute dice-face-glass rounded-xl flex items-center justify-center backface-hidden"
            style={faceStyle(`rotateX(-90deg) translateZ(${size / 2}px)`)}>
            <div className="grid grid-cols-2 gap-4">
              <DiceDot /><DiceDot />
              <DiceDot /><DiceDot />
            </div>
          </div>
        </div>
      </div>

      {/* Result Value Display */}
      {displayValue !== null && !isRolling && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: hero ? -8 : -16 }}>
          <span
            key={displayValue}
            className={`result-reveal font-bold font-mono tabular-nums ${
              hero ? "text-4xl" : "text-2xl"
            } ${
              win === true
                ? "text-[#30d158] drop-shadow-[0_0_20px_rgba(48,209,88,0.5)]"
                : win === false
                  ? "text-[#ff453a] drop-shadow-[0_0_15px_rgba(255,69,58,0.4)]"
                  : "text-[var(--text-primary)]"
            }`}
          >
            {displayValue.toFixed(2)}
          </span>
        </div>
      )}

      {/* Rolling indicator */}
      {isRolling && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: hero ? -4 : -12 }}>
          <span className={`font-bold font-mono text-[#0ea5e9] animate-pulse ${hero ? "text-xl" : "text-base"}`}>
            Executing...
          </span>
        </div>
      )}
    </div>
  );
}
