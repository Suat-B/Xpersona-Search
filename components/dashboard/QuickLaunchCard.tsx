"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function QuickLaunchCard() {
  return (
    <Link href="/games/dice" className="block group">
      <div className={cn(
        "relative overflow-hidden rounded-[18px] p-5 h-[140px] flex flex-col justify-between",
        "bg-gradient-to-br from-[#ff2d55]/20 via-[#ff2d55]/10 to-transparent",
        "border border-[#ff2d55]/30",
        "shadow-[0_0_40px_rgba(255,45,85,0.15)]",
        "transition-all duration-500",
        "group-hover:shadow-[0_0_60px_rgba(255,45,85,0.25)] group-hover:scale-[1.02]"
      )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#ff2d55]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff2d55] to-[#ff5e7d] shadow-lg shadow-[#ff2d55]/30 group-hover:shadow-xl group-hover:scale-110 transition-all duration-500"
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            
            <div>
              <div className="text-base font-semibold text-white">
                Play Dice
              </div>
              <p className="text-sm text-white/70 mt-0.5">
                Start playing now
              </p>
            </div>
          </div>
          
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/20 transition-colors"
          >
            <svg className="w-6 h-6 text-white group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </div>
        
        <div className="relative flex items-center gap-3">
          <div className="flex -space-x-1">
            {[...Array(3)].map((_, i) => (
              <div 
                key={i}
                className="w-5 h-5 rounded-full bg-white/20 border border-white/30 flex items-center justify-center"
              >
                <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
