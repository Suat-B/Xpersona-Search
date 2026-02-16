"use client";

import { useEffect, useState } from "react";

interface SparklesProps {
  active: boolean;
  count?: number;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
}

export function Sparkles({ active, count = 20 }: SparklesProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    if (active) {
      const newSparkles: Sparkle[] = Array.from({ length: count }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: Math.random() > 0.5 ? "#10b981" : "#0a84ff",
        size: Math.random() * 6 + 2,
        delay: Math.random() * 0.5,
        duration: Math.random() * 1 + 0.5,
      }));
      setSparkles(newSparkles);

      // Clear sparkles after animation
      const timer = setTimeout(() => {
        setSparkles([]);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [active, count]);

  if (sparkles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute animate-sparkle"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            width: `${sparkle.size}px`,
            height: `${sparkle.size}px`,
            backgroundColor: sparkle.color,
            borderRadius: "50%",
            animationDelay: `${sparkle.delay}s`,
            animationDuration: `${sparkle.duration}s`,
            boxShadow: `0 0 ${sparkle.size * 2}px ${sparkle.color}`,
          }}
        />
      ))}
    </div>
  );
}

export function Confetti({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<Array<{
    id: number;
    x: number;
    delay: number;
    color: string;
    rotation: number;
  }>>([]);

  useEffect(() => {
    if (active) {
      const colors = ["#0a84ff", "#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6"];
      const newPieces = Array.from({ length: 30 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        delay: Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
      }));
      setPieces(newPieces);

      const timer = setTimeout(() => {
        setPieces([]);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [active]);

  if (pieces.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-2 h-3 animate-confetti"
          style={{
            left: `${piece.x}%`,
            top: "-10px",
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
