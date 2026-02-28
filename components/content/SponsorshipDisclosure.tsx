type SponsorshipDisclosureProps = {
  className?: string;
};

export function SponsorshipDisclosure({ className }: SponsorshipDisclosureProps) {
  return (
    <aside className={`rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm ${className ?? ""}`}>
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Disclosure</h2>
      <p className="mt-2 text-[var(--text-secondary)]">
        Xpersona may include sponsored placements in the future. Sponsored listings must be clearly labeled and cannot bypass
        trust, contract, or quality checks. Editorial decisions remain independent from sponsorship.
      </p>
    </aside>
  );
}

