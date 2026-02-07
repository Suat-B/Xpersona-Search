"use client";

interface StreakIndicatorProps {
  results: { win: boolean }[];
}

export function StreakIndicator({ results }: StreakIndicatorProps) {
  const getStreak = () => {
    if (results.length === 0) return { type: null, count: 0 };
    
    let streak = 0;
    const lastResult = results[results.length - 1].win;
    
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].win === lastResult) {
        streak++;
      } else {
        break;
      }
    }
    
    return { type: lastResult ? "win" : "loss", count: streak };
  };

  const streak = getStreak();
  
  if (streak.type === null) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <span className="uppercase tracking-wider">Streak</span>
        <span className="font-medium">-</span>
      </div>
    );
  }

  const isWinStreak = streak.type === "win";
  
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Streak</span>
      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${
        isWinStreak 
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
          : "bg-red-500/20 text-red-400 border border-red-500/30"
      }`}>
        <span className="text-sm font-bold font-mono">{streak.count}</span>
        <span className="text-[10px] font-medium">{isWinStreak ? "W" : "L"}</span>
        {streak.count > 2 && (
          <svg className="w-3 h-3 ml-0.5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </div>
  );
}

export default StreakIndicator;
