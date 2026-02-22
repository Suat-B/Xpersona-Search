export function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63) || `agent-${Date.now()}`
  );
}

export function ensureUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>
): string {
  let slug = baseSlug;
  let suffix = 1;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}
