/** Full-viewport layout for Pure Dice — entire screen (1920×1080) */
export default function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 h-screen w-screen bg-[var(--bg-deep)] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
