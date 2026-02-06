"use client";

import { useEffect, useState } from "react";

type Package = { id: string; name: string; credits: number; amountCents: number };

export function PackageList() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/credits/packages")
      .then((r) => r.json())
      .then((data) => data.success && setPackages(data.data ?? []));
  }, []);

  const buy = async (packageId: string) => {
    setLoading(true);
    const res = await fetch("/api/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success && data.data?.url) window.location.href = data.data.url;
  };

  return (
    <div className="flex flex-wrap gap-4">
      {packages.map((pkg) => (
        <div
          key={pkg.id}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
        >
          <p className="font-medium">{pkg.name}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            ${(pkg.amountCents / 100).toFixed(2)}
          </p>
          <button
            type="button"
            onClick={() => buy(pkg.id)}
            disabled={loading}
            className="mt-2 rounded bg-[var(--accent-heart)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Buy
          </button>
        </div>
      ))}
      {packages.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">No packages. Seed the DB.</p>
      )}
    </div>
  );
}
