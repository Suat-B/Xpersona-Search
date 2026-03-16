import { redirect } from "next/navigation";

export default async function LegacyDicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
      continue;
    }
    if (typeof value === "string") query.set(key, value);
  }

  const queryString = query.toString();
  redirect(queryString ? `/dice?${queryString}` : "/dice");
}
